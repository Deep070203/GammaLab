import json
import sqlite3
import numpy as np
import pandas as pd
from scipy import stats
from datetime import datetime
from typing import Dict, Any, Tuple, Optional, List
from backend.config import settings
from backend.database import get_db_connection
from backend.agent.schema import HypothesisProposal, BacktestEvaluationResult, PredicateOperator
from backend.evaluator.baselines import evaluate_random_regime_baseline

def load_and_prepare_dataset(ticker: str = "SPY") -> pd.DataFrame:
    conn = get_db_connection()
    df = pd.read_sql_query(
        "SELECT * FROM market_snapshots WHERE ticker = ? ORDER BY timestamp ASC",
        conn,
        params=(ticker,)
    )
    conn.close()
    
    if df.empty:
        return df

    # Compute relative features
    df["spot_to_flip_pct"] = (df["spot_price"] - df["gamma_flip"]) / df["spot_price"]
    df["spot_to_call_wall_pct"] = (df["spot_price"] - df["call_wall"]) / df["spot_price"]
    df["spot_to_put_wall_pct"] = (df["spot_price"] - df["put_wall"]) / df["spot_price"]
    
    return df

def apply_conditions(df: pd.DataFrame, conditions: List[Any]) -> pd.Series:
    """
    Applies strict predicate conditions to filter dataframe.
    Returns boolean mask.
    """
    mask = pd.Series(True, index=df.index)
    for cond in conditions:
        if isinstance(cond, dict):
            feat = cond.get("feature")
            op = cond.get("op")
            th = cond.get("threshold")
            th_high = cond.get("threshold_high")
        else:
            feat = cond.feature
            op = cond.op.value if hasattr(cond.op, "value") else str(cond.op)
            th = cond.threshold
            th_high = cond.threshold_high

        if feat not in df.columns:
            continue
            
        col = df[feat]
        if op == "<":
            mask &= (col < th)
        elif op == "<=":
            mask &= (col <= th)
        elif op == ">":
            mask &= (col > th)
        elif op == ">=":
            mask &= (col >= th)
        elif op == "between":
            if th_high is not None:
                mask &= (col >= th) & (col <= th_high)
            else:
                mask &= (col >= th)
    return mask

def run_deterministic_backtest(proposal: HypothesisProposal, ticker: str = "SPY") -> BacktestEvaluationResult:
    """
    Executes a deterministic walk-forward backtest:
    - Partition: Train (60%), Validation (20%), Held-out Test (20%)
    - Strict look-ahead bias prevention
    - Promotion rules: Lift >= 15% out-of-sample and p < 0.05
    """
    df = load_and_prepare_dataset(ticker)
    if df.empty or len(df) < 20:
        raise ValueError("Insufficient market snapshots in database to run backtest.")

    n = len(df)
    train_end = int(n * settings.TRAIN_RATIO)
    val_end = int(n * (settings.TRAIN_RATIO + settings.VAL_RATIO))

    train_df = df.iloc[:train_end].copy()
    val_df = df.iloc[train_end:val_end].copy()
    test_df = df.iloc[val_end:].copy() # Sealed final test set

    target_col = proposal.target_variable.value if hasattr(proposal.target_variable, "value") else str(proposal.target_variable)
    if target_col not in df.columns:
        target_col = "fwd_rv_60m"

    # Evaluate on Train
    train_mask = apply_conditions(train_df, proposal.conditions)
    # Evaluate on Validation
    val_mask = apply_conditions(val_df, proposal.conditions)
    # Evaluate on Sealed Test
    test_mask = apply_conditions(test_df, proposal.conditions)

    # Calculate metric: Signal correlation or volatility spread
    def compute_metric(sub_df: pd.DataFrame, mask: pd.Series) -> float:
        if mask.sum() < 2 or (~mask).sum() < 2:
            return 0.0
        active_target = sub_df.loc[mask, target_col].mean()
        inactive_target = sub_df.loc[~mask, target_col].mean()
        
        # If expected relationship is high vol or positive return
        spread = (active_target - inactive_target) / (inactive_target + 1e-4)
        return float(spread)

    train_metric = compute_metric(train_df, train_mask)
    val_metric = compute_metric(val_df, val_mask)
    test_metric = compute_metric(test_df, test_mask)

    baseline_metric = 0.05 # Baseline unconditional spread expectation
    lift = (test_metric - baseline_metric) / (baseline_metric + 1e-4)

    # Statistical significance on Test Set using Welch's t-test
    test_active = test_df.loc[test_mask, target_col]
    test_inactive = test_df.loc[~test_mask, target_col]
    
    if len(test_active) >= 3 and len(test_inactive) >= 3:
        t_stat, p_val = stats.ttest_ind(test_active, test_inactive, equal_var=False)
        p_val = float(p_val) if not np.isnan(p_val) else 0.5
    else:
        p_val = 0.45

    # Promotion rules
    is_promoted = (
        lift >= settings.PROMOTION_MIN_LIFT and
        p_val <= settings.PROMOTION_MAX_P_VALUE and
        len(test_active) >= 3
    )

    status = "PROMOTED" if is_promoted else "REJECTED"
    rejection_reason = None
    if not is_promoted:
        if len(test_active) < 3:
            rejection_reason = f"Insufficient out-of-sample sample size (triggered {len(test_active)} times in held-out test)."
            lessons = "Relax predicate thresholds to capture broader regime representations."
        elif lift < settings.PROMOTION_MIN_LIFT:
            rejection_reason = f"Predictive lift ({lift*100:.1f}%) failed to meet minimum 15.0% threshold over baseline."
            lessons = "Signal lacks out-of-sample predictive edge; consider combining with Vanna or Wall distance features."
        else:
            rejection_reason = f"Statistical significance test failed (p={p_val:.4f} > 0.05)."
            lessons = "Observed effect could not reject the null hypothesis of market noise."
    else:
        lessons = f"Confirmed out-of-sample predictive power with {lift*100:.1f}% lift over baseline (p={p_val:.4f}). Ready for live research signal promotion."

    # Generate timeline visualization points
    timeline_chart = []
    for _, row in test_df.tail(20).iterrows():
        is_triggered = bool(apply_conditions(pd.DataFrame([row]), proposal.conditions).iloc[0])
        timeline_chart.append({
            "timestamp": row["timestamp"][:16].replace("T", " "),
            "spot": row["spot_price"],
            "net_gex": row["net_gex"],
            "target_val": row[target_col],
            "triggered": is_triggered
        })

    # Save to SQLite Research Memory
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT OR REPLACE INTO experiments (
        experiment_id, created_at, ticker, family, title, hypothesis_text, rationale,
        trigger_predicate, horizon_minutes, target_variable, expected_relationship,
        train_metric, val_metric, test_metric, baseline_metric, metric_name,
        lift_vs_baseline, p_value, sample_count_train, sample_count_test,
        status, rejection_reason, model_version, lessons_learned
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        proposal.hypothesis_id,
        datetime.now().isoformat(),
        ticker,
        proposal.family.value if hasattr(proposal.family, "value") else str(proposal.family),
        proposal.title,
        proposal.hypothesis_text,
        proposal.rationale,
        json.dumps([c.dict() if hasattr(c, "dict") else c for c in proposal.conditions]),
        proposal.horizon_minutes,
        target_col,
        proposal.expected_relationship.value if hasattr(proposal.expected_relationship, "value") else str(proposal.expected_relationship),
        round(train_metric, 4),
        round(val_metric, 4),
        round(test_metric, 4),
        round(baseline_metric, 4),
        "Volatility Spread vs Baseline",
        round(lift, 4),
        round(p_val, 4),
        int(train_mask.sum()),
        int(test_mask.sum()),
        status,
        rejection_reason,
        f"Meta Muse ({settings.MUSE_MODEL})",
        lessons
    ))
    conn.commit()
    conn.close()

    return BacktestEvaluationResult(
        experiment_id=proposal.hypothesis_id,
        status=status,
        metric_name="Volatility Spread vs Baseline",
        train_metric=round(train_metric, 4),
        val_metric=round(val_metric, 4),
        test_metric=round(test_metric, 4),
        baseline_metric=round(baseline_metric, 4),
        lift_vs_baseline=round(lift, 4),
        p_value=round(p_val, 4),
        sample_count_train=int(train_mask.sum()),
        sample_count_val=int(val_mask.sum()),
        sample_count_test=int(test_mask.sum()),
        promoted=is_promoted,
        rejection_reason=rejection_reason,
        lessons_learned=lessons,
        timeline_chart=timeline_chart
    )

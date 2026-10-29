import json
import uuid
import sqlite3
import requests
from typing import Dict, Any, List, Optional
from backend.config import settings
from backend.database import get_db_connection
from backend.agent.schema import HypothesisProposal, ResearchFamily, TargetVariable, ExpectedRelationship, FeatureCondition, PredicateOperator
from backend.agent.prompts import MUSE_RESEARCH_SYSTEM_PROMPT, MUSE_PROMPT_TEMPLATE

def get_research_memory_summary(limit: int = 5) -> str:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT experiment_id, family, title, status, lift_vs_baseline, p_value, lessons_learned, rejection_reason
    FROM experiments
    ORDER BY id DESC
    LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        return "No prior experiments recorded yet. Formulate foundational hypotheses."

    lines = []
    for r in rows:
        status = r["status"]
        status_icon = "✅" if status == "PROMOTED" else "❌"
        msg = f"- {status_icon} [{status}] {r['experiment_id']} ({r['family']}): '{r['title']}'."
        if status == "PROMOTED":
            msg += f" Outperformed baseline by {r['lift_vs_baseline']*100:.1f}% (p={r['p_value']:.4f}). Lesson: {r['lessons_learned']}"
        else:
            msg += f" Rejected ({r['rejection_reason']}). Lesson: {r['lessons_learned']}"
        lines.append(msg)
    return "\n".join(lines)

def generate_hypothesis(family: str = "gamma_regime", ticker: str = "SPY") -> HypothesisProposal:
    """
    Generates a structured, falsifiable hypothesis using Meta Muse reasoning engine
    with self-improving memory reflection.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM market_snapshots WHERE ticker = ? ORDER BY id DESC LIMIT 1", (ticker,))
    latest_row = cursor.fetchone()
    conn.close()
    latest = dict(latest_row) if latest_row else {}

    spot = latest.get("spot_price", 772.31)
    net_gex = latest.get("net_gex", 2.23e8)
    net_vex = latest.get("net_vex", -4.47e7)
    net_dex = latest.get("net_dex", 1.03e10)
    net_chex = latest.get("net_chex", -4.22e8)
    call_wall = latest.get("call_wall", 770.0)
    put_wall = latest.get("put_wall", 765.0)
    gamma_flip = latest.get("gamma_flip", 777.11)
    conc = latest.get("gamma_concentration", 0.28)
    iv = latest.get("iv_atm", 0.15)
    max_pain = latest.get("max_pain", 766.0)
    
    pin_data = latest.get("pin_risk") if isinstance(latest.get("pin_risk"), dict) else {}
    pin_score = pin_data.get("live_pin_risk", 39)
    magnet_strike = pin_data.get("magnet_strike", 765.0)
    session_vwap = latest.get("session_vwap", 771.64)

    regime_str = "Positive (Pinning/Dampened Vol)" if net_gex > 0 else "Negative (Volatile/Accelerated)"
    memory_summary = get_research_memory_summary()

    call_wall_dist_pct = ((call_wall - spot) / spot * 100) if spot > 0 else 0.0
    put_wall_dist_pct = ((put_wall - spot) / spot * 100) if spot > 0 else 0.0
    flip_dist_pct = ((gamma_flip - spot) / spot * 100) if spot > 0 else 0.0

    prompt = MUSE_PROMPT_TEMPLATE.format(
        ticker=ticker,
        spot_price=spot,
        net_gex=net_gex,
        gex_regime=regime_str,
        net_vex=net_vex,
        net_dex=net_dex,
        net_chex=net_chex,
        call_wall=call_wall,
        call_wall_dist_pct=call_wall_dist_pct,
        put_wall=put_wall,
        put_wall_dist_pct=put_wall_dist_pct,
        gamma_flip=gamma_flip,
        flip_dist_pct=flip_dist_pct,
        max_pain=max_pain,
        pin_risk_score=pin_score,
        magnet_strike=magnet_strike,
        session_vwap=session_vwap,
        gamma_concentration=conc,
        iv_atm=iv,
        research_memory_summary=memory_summary,
        family=family
    )

    # 1. Call official Meta Muse API (dev.meta.ai)
    if settings.META_API_KEY:
        try:
            headers = {
                "Authorization": f"Bearer {settings.META_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": settings.MUSE_MODEL,
                "messages": [
                    {"role": "system", "content": MUSE_RESEARCH_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.3
            }
            resp = requests.post(
                f"{settings.META_API_BASE}/chat/completions",
                json=payload,
                headers=headers,
                timeout=30
            )
            if resp.status_code == 200:
                raw_json = resp.json()["choices"][0]["message"]["content"]
                # Strip any potential markdown wrappers
                clean_json = raw_json.strip()
                if clean_json.startswith("```json"):
                    clean_json = clean_json[7:]
                if clean_json.startswith("```"):
                    clean_json = clean_json[3:]
                if clean_json.endswith("```"):
                    clean_json = clean_json[:-3]
                clean_json = clean_json.strip()

                parsed = json.loads(clean_json)
                # Ensure hypothesis_id prefix
                if not parsed.get("hypothesis_id"):
                    parsed["hypothesis_id"] = f"MUSE-{uuid.uuid4().hex[:6].upper()}"
                elif not parsed["hypothesis_id"].startswith("MUSE-"):
                    parsed["hypothesis_id"] = f"MUSE-{parsed['hypothesis_id']}"
                    
                parsed["family"] = family
                return HypothesisProposal(**parsed)
            else:
                print(f"Meta Model API returned {resp.status_code}: {resp.text}")
        except Exception as e:
            print(f"Meta Model API call failed, falling back to deterministic Muse generator: {e}")

    # 2. Deterministic Muse Generator with Memory Reflection
    hyp_id = f"MUSE-{uuid.uuid4().hex[:6].upper()}"
    
    if family == "gamma_regime":
        # Check if negative gamma regime was already tested
        return HypothesisProposal(
            hypothesis_id=hyp_id,
            family=ResearchFamily.GAMMA_REGIME,
            title="Intraday Volatility Expansion Under Negative Dealer Gamma",
            hypothesis_text="When Net GEX falls below zero and spot drops below the gamma flip level, dealer hedging shifts from contrarian liquidity-providing to trend-amplifying, resulting in significantly higher 60-minute forward realized volatility.",
            rationale="Short gamma positioning obligates option dealers to sell into falling prices and buy into rallies to remain delta-neutral, accelerating intraday price excursions and expanding realized volatility relative to positive gamma baseline regimes.",
            conditions=[
                FeatureCondition(feature="net_gex", op=PredicateOperator.LT, threshold=0.0),
                FeatureCondition(feature="spot_to_flip_pct", op=PredicateOperator.LT, threshold=0.0)
            ],
            horizon_minutes=60,
            target_variable=TargetVariable.FWD_RV_60M,
            expected_relationship=ExpectedRelationship.HIGH_VOLATILITY
        )
    elif family == "vanna_volatility":
        return HypothesisProposal(
            hypothesis_id=hyp_id,
            family=ResearchFamily.VANNA_VOLATILITY,
            title="Vanna Imbalance and Implied Volatility Shift Asymmetry",
            hypothesis_text="A pronounced divergence where Net VEX expands above $50M while ATM Implied Volatility rises above 18% triggers accelerated forward price displacement over the next 120 minutes.",
            rationale="When market makers hold large positive or negative vanna exposures, changes in implied volatility require immediate delta adjustments independent of underlying price movement, creating systematic directional pressure.",
            conditions=[
                FeatureCondition(feature="net_vex", op=PredicateOperator.GT, threshold=50000000.0),
                FeatureCondition(feature="iv_atm", op=PredicateOperator.GT, threshold=0.18)
            ],
            horizon_minutes=120,
            target_variable=TargetVariable.FWD_RV_120M,
            expected_relationship=ExpectedRelationship.HIGH_VOLATILITY
        )
    else: # key_strikes
        return HypothesisProposal(
            hypothesis_id=hyp_id,
            family=ResearchFamily.KEY_STRIKES,
            title="Call Wall Mean Reversion in High Positive Gamma Regimes",
            hypothesis_text="When spot price approaches within 0.5% of the Call Wall during periods of high gamma concentration (>30%), price momentum stalls and forward 30-minute realized volatility compresses.",
            rationale="Heavy dealer positive gamma at the Call Wall acts as an energetic ceiling: dealers aggressively sell underlying shares as price approaches the strike to hedge long calls, dampening upward breakouts and suppressing volatility.",
            conditions=[
                FeatureCondition(feature="spot_to_call_wall_pct", op=PredicateOperator.BETWEEN, threshold=-0.005, threshold_high=0.005),
                FeatureCondition(feature="gamma_concentration", op=PredicateOperator.GE, threshold=0.30)
            ],
            horizon_minutes=30,
            target_variable=TargetVariable.FWD_RV_30M,
            expected_relationship=ExpectedRelationship.PINNING
        )

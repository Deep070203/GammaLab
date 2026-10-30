import json
import uuid
import requests
from typing import Dict, Any, Optional
from backend.config import settings
from backend.database import get_db_connection
from backend.agent.schema import (
    HypothesisProposal,
    ResearchFamily,
    TargetVariable,
    ExpectedRelationship,
    FeatureCondition,
    PredicateOperator,
    MarketBrief,
    HypothesisCritique,
)
from backend.agent.prompts import (
    MUSE_RESEARCH_SYSTEM_PROMPT,
    MUSE_PROMPT_TEMPLATE,
    MUSE_BRIEF_SYSTEM_PROMPT,
    MUSE_BRIEF_PROMPT_TEMPLATE,
    MUSE_CRITIQUE_SYSTEM_PROMPT,
    MUSE_CRITIQUE_PROMPT_TEMPLATE,
)


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
        status_icon = "OK" if status == "PROMOTED" else "X"
        msg = f"- [{status_icon}] [{status}] {r['experiment_id']} ({r['family']}): '{r['title']}'."
        if status == "PROMOTED":
            msg += f" Outperformed baseline by {r['lift_vs_baseline']*100:.1f}% (p={r['p_value']:.4f}). Lesson: {r['lessons_learned']}"
        else:
            msg += f" Rejected ({r['rejection_reason']}). Lesson: {r['lessons_learned']}"
        lines.append(msg)
    return "\n".join(lines)


def _latest_snapshot(ticker: str) -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM market_snapshots WHERE ticker = ? ORDER BY id DESC LIMIT 1",
        (ticker,),
    )
    latest_row = cursor.fetchone()
    conn.close()
    return dict(latest_row) if latest_row else {}


def _call_muse_json(system_prompt: str, user_prompt: str) -> Optional[Dict[str, Any]]:
    if not settings.META_API_KEY:
        return None
    try:
        headers = {
            "Authorization": f"Bearer {settings.META_API_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": settings.MUSE_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.3,
        }
        resp = requests.post(
            f"{settings.META_API_BASE}/chat/completions",
            json=payload,
            headers=headers,
            timeout=45,
        )
        if resp.status_code != 200:
            print(f"Meta Model API returned {resp.status_code}: {resp.text}")
            return None
        raw_json = resp.json()["choices"][0]["message"]["content"]
        clean_json = raw_json.strip()
        if clean_json.startswith("```json"):
            clean_json = clean_json[7:]
        if clean_json.startswith("```"):
            clean_json = clean_json[3:]
        if clean_json.endswith("```"):
            clean_json = clean_json[:-3]
        return json.loads(clean_json.strip())
    except Exception as e:
        print(f"Meta Model API call failed: {e}")
        return None


def _snapshot_context(ticker: str) -> Dict[str, Any]:
    latest = _latest_snapshot(ticker)
    spot = latest.get("spot_price", 772.31)
    net_gex = latest.get("net_gex", 2.23e8)
    call_wall = latest.get("call_wall", 770.0)
    put_wall = latest.get("put_wall", 765.0)
    gamma_flip = latest.get("gamma_flip", 777.11)
    pin_data = latest.get("pin_risk") if isinstance(latest.get("pin_risk"), dict) else {}
    return {
        "latest": latest,
        "spot": spot,
        "net_gex": net_gex,
        "net_vex": latest.get("net_vex", -4.47e7),
        "net_dex": latest.get("net_dex", 1.03e10),
        "net_chex": latest.get("net_chex", -4.22e8),
        "call_wall": call_wall,
        "put_wall": put_wall,
        "gamma_flip": gamma_flip,
        "conc": latest.get("gamma_concentration", 0.28),
        "iv": latest.get("iv_atm", 0.15),
        "max_pain": latest.get("max_pain", 766.0),
        "pin_score": pin_data.get("live_pin_risk", 39),
        "magnet_strike": pin_data.get("magnet_strike", 765.0),
        "session_vwap": latest.get("session_vwap", 771.64),
        "regime_str": "Positive (Pinning/Dampened Vol)" if net_gex > 0 else "Negative (Volatile/Accelerated)",
        "call_wall_dist_pct": ((call_wall - spot) / spot * 100) if spot else 0.0,
        "put_wall_dist_pct": ((put_wall - spot) / spot * 100) if spot else 0.0,
        "flip_dist_pct": ((gamma_flip - spot) / spot * 100) if spot else 0.0,
    }


def generate_hypothesis(family: str = "gamma_regime", ticker: str = "SPY") -> HypothesisProposal:
    """
    Generates a structured, falsifiable hypothesis using Meta Muse reasoning engine
    with self-improving memory reflection.
    """
    ctx = _snapshot_context(ticker)
    memory_summary = get_research_memory_summary()
    prompt = MUSE_PROMPT_TEMPLATE.format(
        ticker=ticker,
        spot_price=ctx["spot"],
        net_gex=ctx["net_gex"],
        gex_regime=ctx["regime_str"],
        net_vex=ctx["net_vex"],
        net_dex=ctx["net_dex"],
        net_chex=ctx["net_chex"],
        call_wall=ctx["call_wall"],
        call_wall_dist_pct=ctx["call_wall_dist_pct"],
        put_wall=ctx["put_wall"],
        put_wall_dist_pct=ctx["put_wall_dist_pct"],
        gamma_flip=ctx["gamma_flip"],
        flip_dist_pct=ctx["flip_dist_pct"],
        max_pain=ctx["max_pain"],
        pin_risk_score=ctx["pin_score"],
        magnet_strike=ctx["magnet_strike"],
        session_vwap=ctx["session_vwap"],
        gamma_concentration=ctx["conc"],
        iv_atm=ctx["iv"],
        research_memory_summary=memory_summary,
        family=family,
    )

    parsed = _call_muse_json(MUSE_RESEARCH_SYSTEM_PROMPT, prompt)
    if parsed:
        if not parsed.get("hypothesis_id"):
            parsed["hypothesis_id"] = f"MUSE-{uuid.uuid4().hex[:6].upper()}"
        elif not str(parsed["hypothesis_id"]).startswith("MUSE-"):
            parsed["hypothesis_id"] = f"MUSE-{parsed['hypothesis_id']}"
        parsed["family"] = family
        return HypothesisProposal(**parsed)

    return _fallback_hypothesis(family)


def generate_market_brief(ticker: str = "SPY", market_overlay: Optional[Dict[str, Any]] = None) -> MarketBrief:
    ctx = _snapshot_context(ticker)
    overlay = market_overlay or {}
    spot = overlay.get("spot_price", ctx["spot"])
    net_gex = overlay.get("net_gex", ctx["net_gex"])
    swing = overlay.get("swing_setup") or {}
    risk = overlay.get("risk_engine") or {}
    pin = overlay.get("pin_risk") or {}

    prompt = MUSE_BRIEF_PROMPT_TEMPLATE.format(
        ticker=ticker,
        spot_price=spot,
        price_change_pct=overlay.get("price_change_pct", 0.0),
        net_gex=net_gex,
        gex_regime="Positive" if net_gex >= 0 else "Negative",
        net_vex=overlay.get("net_vex", ctx["net_vex"]),
        call_wall=overlay.get("call_wall", ctx["call_wall"]),
        put_wall=overlay.get("put_wall", ctx["put_wall"]),
        gamma_flip=overlay.get("gamma_flip", ctx["gamma_flip"]),
        max_pain=overlay.get("max_pain", ctx["max_pain"]),
        pin_risk_score=pin.get("live_pin_risk", ctx["pin_score"]),
        magnet_strike=pin.get("magnet_strike", ctx["magnet_strike"]),
        session_vwap=overlay.get("session_vwap", ctx["session_vwap"]),
        iv_atm=overlay.get("iv_atm", ctx["iv"]),
        swing_bias=swing.get("bias", "UNKNOWN"),
        size_multiplier=risk.get("size_multiplier", 0.5 if net_gex < 0 else 1.0),
        long_stop=risk.get("long_invalidation_stop", ctx["session_vwap"]),
        short_stop=risk.get("short_invalidation_stop", ctx["gamma_flip"]),
    )

    parsed = _call_muse_json(MUSE_BRIEF_SYSTEM_PROMPT, prompt)
    if parsed:
        parsed["source"] = "muse-spark"
        return MarketBrief(**parsed)

    positive = net_gex >= 0
    flip = overlay.get("gamma_flip", ctx["gamma_flip"])
    put_wall = overlay.get("put_wall", ctx["put_wall"])
    call_wall = overlay.get("call_wall", ctx["call_wall"])
    vwap = overlay.get("session_vwap", ctx["session_vwap"])
    return MarketBrief(
        headline=(
            "Dealers dampen moves above the flip"
            if positive
            else "Dealers amplify moves below the flip"
        ),
        regime_label="Positive Gamma" if positive else "Negative Gamma Cascade",
        plain_english=(
            f"Spot at ${spot:.2f} sits {'above' if spot >= flip else 'below'} the gamma flip (${flip:.2f}) "
            f"with Net GEX {'positive' if positive else 'negative'}. "
            f"{'Expect mean-reversion toward walls and slower tape.' if positive else 'Expect faster tape and cascade risk into the put wall.'}"
        ),
        watch_levels=[
            f"Gamma Flip ${flip:.2f} — regime boundary",
            f"{'Call' if positive else 'Put'} Wall ${call_wall if positive else put_wall:.2f} — primary magnet",
            f"Session VWAP ${vwap:.2f} — structural pivot / invalidation",
        ],
        do_now=[
            "Size from regime multiplier before entry",
            "Define invalidation at VWAP or Flip before clicking",
            "Prefer wall-aware targets over arbitrary % take-profits",
        ],
        avoid_now=[
            "Static option % stop-losses that ignore structure",
            "Fading cascades while Net GEX stays negative",
            "Holding through Flip reclaim without a new plan",
        ],
        confidence=0.62,
        source="deterministic-fallback",
    )


def critique_hypothesis(proposal: HypothesisProposal, ticker: str = "SPY") -> HypothesisCritique:
    ctx = _snapshot_context(ticker)
    memory_summary = get_research_memory_summary()
    prompt = MUSE_CRITIQUE_PROMPT_TEMPLATE.format(
        ticker=ticker,
        hypothesis_json=proposal.model_dump_json(indent=2),
        spot_price=ctx["spot"],
        net_gex=ctx["net_gex"],
        gamma_flip=ctx["gamma_flip"],
        call_wall=ctx["call_wall"],
        put_wall=ctx["put_wall"],
        iv_atm=ctx["iv"],
        research_memory_summary=memory_summary,
    )
    parsed = _call_muse_json(MUSE_CRITIQUE_SYSTEM_PROMPT, prompt)
    if parsed:
        parsed["source"] = "muse-spark"
        return HypothesisCritique(**parsed)

    condition_count = len(proposal.conditions)
    tight = any(
        c.op in (PredicateOperator.BETWEEN, PredicateOperator.LT, PredicateOperator.GT)
        and abs(c.threshold) > 0
        for c in proposal.conditions
    )
    verdict = "ready" if condition_count >= 2 else "revise"
    return HypothesisCritique(
        verdict=verdict,
        score=72 if verdict == "ready" else 48,
        strengths=[
            "Uses restricted microstructure features only",
            "States a falsifiable target and horizon",
            "Leaves grading to the sealed evaluator",
        ],
        risks=[
            "May fire too rarely on held-out data if predicates are tight" if tight else "May be too broad vs baseline",
            "Regime dependence: edge may vanish when Net GEX sign flips",
            "Short horizons can be noise-dominated around OpEx",
        ],
        suggested_revision=(
            ""
            if verdict == "ready"
            else "Add a second structural condition (Flip distance or Wall proximity) to reduce false positives."
        ),
        trader_takeaway="Run the sealed backtest only if the predicate still makes mechanical sense after a Flip/GEX regime change.",
        source="deterministic-fallback",
    )


def _fallback_hypothesis(family: str) -> HypothesisProposal:
    hyp_id = f"MUSE-{uuid.uuid4().hex[:6].upper()}"

    if family == "gamma_regime":
        return HypothesisProposal(
            hypothesis_id=hyp_id,
            family=ResearchFamily.GAMMA_REGIME,
            title="Intraday Volatility Expansion Under Negative Dealer Gamma",
            hypothesis_text="When Net GEX falls below zero and spot drops below the gamma flip level, dealer hedging shifts from contrarian liquidity-providing to trend-amplifying, resulting in significantly higher 60-minute forward realized volatility.",
            rationale="Short gamma positioning obligates option dealers to sell into falling prices and buy into rallies to remain delta-neutral, accelerating intraday price excursions and expanding realized volatility relative to positive gamma baseline regimes.",
            conditions=[
                FeatureCondition(feature="net_gex", op=PredicateOperator.LT, threshold=0.0),
                FeatureCondition(feature="spot_to_flip_pct", op=PredicateOperator.LT, threshold=0.0),
            ],
            horizon_minutes=60,
            target_variable=TargetVariable.FWD_RV_60M,
            expected_relationship=ExpectedRelationship.HIGH_VOLATILITY,
        )
    if family == "vanna_volatility":
        return HypothesisProposal(
            hypothesis_id=hyp_id,
            family=ResearchFamily.VANNA_VOLATILITY,
            title="Vanna Imbalance and Implied Volatility Shift Asymmetry",
            hypothesis_text="A pronounced divergence where Net VEX expands above $50M while ATM Implied Volatility rises above 18% triggers accelerated forward price displacement over the next 120 minutes.",
            rationale="When market makers hold large positive or negative vanna exposures, changes in implied volatility require immediate delta adjustments independent of underlying price movement, creating systematic directional pressure.",
            conditions=[
                FeatureCondition(feature="net_vex", op=PredicateOperator.GT, threshold=50000000.0),
                FeatureCondition(feature="iv_atm", op=PredicateOperator.GT, threshold=0.18),
            ],
            horizon_minutes=120,
            target_variable=TargetVariable.FWD_RV_120M,
            expected_relationship=ExpectedRelationship.HIGH_VOLATILITY,
        )
    if family == "swing_trading":
        return HypothesisProposal(
            hypothesis_id=hyp_id,
            family=ResearchFamily.SWING_TRADING,
            title="Put-Wall Drift After Negative Gamma Confirmation",
            hypothesis_text="When Net GEX is negative and spot trades more than 0.2% below the gamma flip, forward 60-minute returns skew toward the put wall as dealer hedging amplifies downside.",
            rationale="Below the flip in negative GEX, dealers sell into weakness, creating multi-session gravitational pressure toward concentrated put open interest.",
            conditions=[
                FeatureCondition(feature="net_gex", op=PredicateOperator.LT, threshold=0.0),
                FeatureCondition(feature="spot_to_flip_pct", op=PredicateOperator.LT, threshold=-0.002),
            ],
            horizon_minutes=60,
            target_variable=TargetVariable.FWD_RETURN_60M,
            expected_relationship=ExpectedRelationship.NEGATIVE,
        )
    if family == "risk_management":
        return HypothesisProposal(
            hypothesis_id=hyp_id,
            family=ResearchFamily.RISK_MANAGEMENT,
            title="Elevated Drawdown Risk in Negative Gamma Windows",
            hypothesis_text="Intervals where Net GEX is negative coincide with higher 60-minute realized volatility, supporting a 0.50x position-size rule during those regimes.",
            rationale="Negative dealer gamma turns hedging into a volatility amplifier; cutting size is a structural response, not an arbitrary percentage stop.",
            conditions=[
                FeatureCondition(feature="net_gex", op=PredicateOperator.LT, threshold=0.0),
            ],
            horizon_minutes=60,
            target_variable=TargetVariable.FWD_RV_60M,
            expected_relationship=ExpectedRelationship.HIGH_VOLATILITY,
        )

    return HypothesisProposal(
        hypothesis_id=hyp_id,
        family=ResearchFamily.KEY_STRIKES,
        title="Call Wall Mean Reversion in High Positive Gamma Regimes",
        hypothesis_text="When spot price approaches within 0.5% of the Call Wall during periods of high gamma concentration (>30%), price momentum stalls and forward 30-minute realized volatility compresses.",
        rationale="Heavy dealer positive gamma at the Call Wall acts as an energetic ceiling: dealers aggressively sell underlying shares as price approaches the strike to hedge long calls, dampening upward breakouts and suppressing volatility.",
        conditions=[
            FeatureCondition(
                feature="spot_to_call_wall_pct",
                op=PredicateOperator.BETWEEN,
                threshold=-0.005,
                threshold_high=0.005,
            ),
            FeatureCondition(feature="gamma_concentration", op=PredicateOperator.GE, threshold=0.30),
        ],
        horizon_minutes=30,
        target_variable=TargetVariable.FWD_RV_30M,
        expected_relationship=ExpectedRelationship.PINNING,
    )

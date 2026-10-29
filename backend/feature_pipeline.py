import math
import numpy as np
import pandas as pd
from typing import Dict, List, Any, Tuple, Optional

def calculate_max_pain(chains: List[Dict[str, Any]]) -> float:
    """
    Computes Max Pain strike where options buyers experience maximum cumulative loss,
    as defined in magneto.ai/util/levels.go.
    """
    strikes_oi: Dict[float, Dict[str, float]] = {}
    all_strikes = set()

    for chain in chains:
        for opt in chain.get("strikes", []):
            strike = float(opt.get("strike", 0.0))
            if strike <= 0:
                continue
            all_strikes.add(strike)
            opt_type = opt.get("option_type", "").lower()
            oi = float(opt.get("effective_open_interest") or opt.get("open_interest") or 0.0)
            if strike not in strikes_oi:
                strikes_oi[strike] = {"call": 0.0, "put": 0.0}
            if opt_type == "call":
                strikes_oi[strike]["call"] += oi
            elif opt_type == "put":
                strikes_oi[strike]["put"] += oi

    if not all_strikes:
        return 0.0

    sorted_strikes = sorted(all_strikes)
    min_loss = float("inf")
    max_pain_strike = sorted_strikes[len(sorted_strikes) // 2]

    for test_strike in sorted_strikes:
        total_payout = 0.0
        for s, oi_data in strikes_oi.items():
            call_oi = oi_data["call"]
            put_oi = oi_data["put"]
            if test_strike > s:
                total_payout += (test_strike - s) * call_oi * 100.0
            elif test_strike < s:
                total_payout += (s - test_strike) * put_oi * 100.0
        if total_payout < min_loss:
            min_loss = total_payout
            max_pain_strike = test_strike

    return round(max_pain_strike, 2)

def calculate_pin_risk(chains: List[Dict[str, Any]], spot_price: float, strike_gex: Dict[float, float]) -> Dict[str, Any]:
    """
    Computes 0-100 dynamic Pin Risk Score and Magnet Strike from magneto.ai/util/pin_risk.go.
    """
    if not strike_gex or spot_price <= 0:
        return {
            "live_pin_risk": 50,
            "magnet_strike": spot_price,
            "distance_to_magnet_pct": 0.0,
            "breakdown": {"oi_score": 12, "proximity_score": 15, "gamma_score": 13, "time_score": 10}
        }

    total_abs_gex = sum(abs(v) for v in strike_gex.values())
    magnet_strike = max(strike_gex.items(), key=lambda x: abs(x[1]))[0]
    max_abs_gex = abs(strike_gex[magnet_strike])

    dist_pct = abs(spot_price - magnet_strike) / spot_price
    
    # 1. Proximity score (0-25)
    proximity_score = min(25, max(0, int(round(25.0 * math.exp(-dist_pct / 0.007)))))
    
    # 2. Gamma score (0-25)
    gamma_ratio = (max_abs_gex / total_abs_gex) if total_abs_gex > 0 else 0.0
    gamma_score = min(25, max(0, int(round(gamma_ratio * 2.5 * 25.0))))
    
    # 3. OI Score (0-25)
    strike_ois: Dict[float, float] = {}
    for chain in chains:
        for opt in chain.get("strikes", []):
            s = float(opt.get("strike", 0.0))
            oi = float(opt.get("effective_open_interest") or opt.get("open_interest") or 0.0)
            strike_ois[s] = strike_ois.get(s, 0.0) + oi
    max_oi = max(strike_ois.values()) if strike_ois else 1.0
    magnet_oi = strike_ois.get(magnet_strike, 0.0)
    oi_score = min(25, max(0, int(round(25.0 * (magnet_oi / max_oi))))) if max_oi > 0 else 12

    # 4. Time Score (0-25) - proxy based on typical late-session/expiry proximity
    time_score = 15

    total_pin_risk = min(100, proximity_score + gamma_score + oi_score + time_score)

    return {
        "live_pin_risk": total_pin_risk,
        "magnet_strike": round(magnet_strike, 2),
        "distance_to_magnet_pct": round(dist_pct * 100.0, 2),
        "breakdown": {
            "oi_score": oi_score,
            "proximity_score": proximity_score,
            "gamma_score": gamma_score,
            "time_score": time_score
        }
    }

def calculate_chex_dex(chains: List[Dict[str, Any]], spot_price: float) -> Tuple[float, float]:
    """
    Computes Charm Exposure (CHEX) and Delta Exposure (DEX) from magneto.ai/util/CHEX.go & DEX.go.
    """
    total_dex = 0.0
    total_chex = 0.0
    r = 0.05
    T = 0.05 # ~2 weeks proxy if exact expiry parsing is not provided

    for chain in chains:
        for opt in chain.get("strikes", []):
            strike = float(opt.get("strike", 0.0))
            if strike <= 0:
                continue
            oi = float(opt.get("effective_open_interest") or opt.get("open_interest") or 0.0)
            delta = float(opt.get("delta") or 0.0)
            iv = float(opt.get("iv") or 0.15)
            opt_type = opt.get("option_type", "").lower()

            # DEX: Delta * OI * 100 * Spot
            opt_dex = delta * oi * 100.0 * spot_price
            total_dex += opt_dex

            # CHEX: Charm = normPDF(d1) * ( d1 / (2*T) - (r + sigma^2/2) / (sigma*sqrt(T)) )
            if iv > 0 and spot_price > 0 and strike > 0:
                sqrtT = math.sqrt(T)
                d1 = (math.log(spot_price / strike) + (r + 0.5 * iv * iv) * T) / (iv * sqrtT)
                npdf = math.exp(-0.5 * d1 * d1) / math.sqrt(2.0 * math.pi)
                charm = npdf * (d1 / (2.0 * T) - (r + 0.5 * iv * iv) / (iv * sqrtT))
                # Call charm positive, Put charm negative
                mult = 1.0 if opt_type == "call" else -1.0
                total_chex += charm * oi * 100.0 * mult

    return total_dex, total_chex

def evaluate_asymmetry(strike_gex: Dict[float, float], spot_price: float) -> Dict[str, Any]:
    """
    Evaluates GEX asymmetry dominance as implemented in magneto.ai/scanner/scanner.go.
    """
    max_up_gex, max_up_strike = 0.0, 0.0
    max_down_gex, max_down_strike = 0.0, 0.0

    for strike, net_gex in strike_gex.items():
        if strike > spot_price:
            if net_gex > max_up_gex:
                max_up_gex = net_gex
                max_up_strike = strike
        elif strike < spot_price:
            abs_gex = abs(net_gex)
            if abs_gex > max_down_gex:
                max_down_gex = abs_gex
                max_down_strike = strike

    min_dist_pct = 0.5
    max_dist_pct = 8.0
    min_dominance_ratio = 2.5

    if max_up_gex > 0:
        up_dist_pct = ((max_up_strike - spot_price) / spot_price) * 100.0
        if min_dist_pct <= up_dist_pct <= max_dist_pct:
            ratio = max_up_gex / max(max_down_gex, 1.0)
            if ratio >= min_dominance_ratio:
                return {
                    "direction": "CLEAR_UPSIDE",
                    "target_strike": round(max_up_strike, 2),
                    "target_distance_pct": round(up_dist_pct, 1),
                    "asymmetry_ratio": round(ratio, 1)
                }

    if max_down_gex > 0:
        down_dist_pct = ((spot_price - max_down_strike) / spot_price) * 100.0
        if min_dist_pct <= down_dist_pct <= max_dist_pct:
            ratio = max_down_gex / max(max_up_gex, 1.0)
            if ratio >= min_dominance_ratio:
                return {
                    "direction": "CLEAR_DOWNSIDE",
                    "target_strike": round(max_down_strike, 2),
                    "target_distance_pct": -round(down_dist_pct, 1),
                    "asymmetry_ratio": round(ratio, 1)
                }

    return {"direction": "BALANCED", "target_strike": spot_price, "target_distance_pct": 0.0, "asymmetry_ratio": 1.0}

def classify_swing_and_risk(
    spot_price: float,
    net_gex: float,
    net_vex: float,
    gamma_flip: float,
    call_wall: float,
    put_wall: float,
    max_pain: float,
    pin_risk: Dict[str, Any],
    session_vwap: float,
    asymmetry: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Synthesizes market structure into actionable Swing Trading setups and
    rigorous Risk Management invalidation stops, drawing directly from magneto.ai's
    trade lessons and empirical dealer order flow mechanisms.
    """
    pin_score = pin_risk.get("live_pin_risk", 50)
    magnet_strike = pin_risk.get("magnet_strike", spot_price)
    dist_to_magnet_pct = pin_risk.get("distance_to_magnet_pct", 0.0)

    # 1. SWING TRADING REGIME
    if pin_score >= 65 and abs(dist_to_magnet_pct) <= 1.8:
        swing_regime = "OPEX_PINNING_MAGNET_CONVERGENCE"
        swing_bias = "PIN_RANGE_BOUND"
        swing_target = magnet_strike
        target_dist = dist_to_magnet_pct
        strategy = f"Delta-Neutral Calendar or Iron Condor centered at ${magnet_strike:.2f}. Dealers enforce pinning into OpEx."
        thesis = f"Pin Risk is elevated at {pin_score}/100. Charm decay and dealer delta-rebalancing exert gravitational pull toward Magnet Strike ${magnet_strike:.2f} (Max Pain: ${max_pain:.2f})."
    elif spot_price > gamma_flip and net_gex > 0:
        swing_regime = "BULLISH_MOMENTUM_VOLATILITY_DAMPENED"
        swing_bias = "BULLISH"
        swing_target = call_wall
        target_dist = round(((call_wall - spot_price) / spot_price) * 100.0, 2)
        strategy = f"Long Swing Calls / Bull Put Spreads targeting Call Wall ${call_wall:.2f}. Accumulate on intraday VWAP retests."
        thesis = f"Spot (${spot_price:.2f}) trades above Gamma Flip (${gamma_flip:.2f}) in positive Net GEX. Market makers hedge by buying dips and selling rips, dampening volatility and supporting multi-day drift toward Call Wall."
    elif spot_price < gamma_flip or net_gex < 0:
        swing_regime = "VOLATILITY_EXPANSION_CASCADE"
        swing_bias = "BEARISH_HEDGE"
        swing_target = put_wall
        target_dist = round(((put_wall - spot_price) / spot_price) * 100.0, 2)
        strategy = f"Bear Put Spreads or Long Delta Put Swings targeting Put Wall ${put_wall:.2f}. Fade false bounces below VWAP."
        thesis = f"Spot (${spot_price:.2f}) trades below Gamma Flip (${gamma_flip:.2f}) in negative Net GEX. Dealers are short gamma and must sell into drops, amplifying downside volatility and cascading toward Put Wall."
    elif asymmetry.get("direction") == "CLEAR_UPSIDE":
        swing_regime = "ASYMMETRIC_CALL_ACCUMULATION"
        swing_bias = "BULLISH"
        swing_target = asymmetry.get("target_strike", call_wall)
        target_dist = asymmetry.get("target_distance_pct", 1.5)
        strategy = f"Out-of-the-money Call Swing targeting ${swing_target:.2f} ({target_dist}% upside)."
        thesis = f"GEX asymmetry scanner detected 2.5x upside dominance node at ${swing_target:.2f}. Institutional flow shows clear call accumulation."
    else:
        swing_regime = "RANGE_BOUND_EQUILIBRIUM"
        swing_bias = "NEUTRAL"
        swing_target = (call_wall + put_wall) / 2.0
        target_dist = round(((swing_target - spot_price) / spot_price) * 100.0, 2)
        strategy = f"Strangle Sale or Mean-Reversion Swing between Put Wall (${put_wall:.2f}) and Call Wall (${call_wall:.2f})."
        thesis = "Net GEX is balanced with moderate concentration. Trade boundaries defined by outer walls."

    # 2. RISK MANAGEMENT & STRUCTURAL INVALIDATION ENGINE
    # Negative GEX = Dealers accelerate moves => Cut position size by 50%
    if net_gex < 0 or spot_price < gamma_flip:
        size_multiplier = 0.50
        risk_alert_level = "ELEVATED_VOLATILITY_EXPANSION"
        size_rationale = "NEGATIVE GAMMA REGIME: Dealer hedging accelerates downside cascade. Sizing is automatically halved (0.50x) to eliminate tail ruin."
    else:
        size_multiplier = 1.00
        risk_alert_level = "NORMAL_VOLATILITY_DAMPENED"
        size_rationale = "POSITIVE GAMMA REGIME: Dealer hedging cushions price swings. Standard 1.00x position sizing authorized."

    # Non-arbitrary structural stops from trade_lessons.jsonl
    long_invalidation_stop = round(min(gamma_flip, session_vwap), 2)
    short_invalidation_stop = round(max(gamma_flip, session_vwap), 2)

    tail_risk_alert = (spot_price < gamma_flip and net_gex < 0) or (abs(spot_price - put_wall) / spot_price < 0.0075)

    lesson_rule = (
        "From trade lesson LSN_META_1790176071 (VWAP_SLICING_KNIFE): "
        "Entries hovering above VWAP without confirmation break down; if Spot prints a close below Session VWAP or Gamma Flip, "
        "trigger an immediate structural exit. Never wait for arbitrary option percentage drawdowns."
    )

    return {
        "swing_setup": {
            "regime": swing_regime,
            "bias": swing_bias,
            "target_strike": swing_target,
            "target_distance_pct": target_dist,
            "horizon": "1 to 3 Days (OpEx Drift)",
            "strategy": strategy,
            "thesis": thesis
        },
        "risk_engine": {
            "size_multiplier": size_multiplier,
            "alert_level": risk_alert_level,
            "size_rationale": size_rationale,
            "long_invalidation_stop": long_invalidation_stop,
            "short_invalidation_stop": short_invalidation_stop,
            "tail_risk_alert": tail_risk_alert,
            "session_vwap": round(session_vwap, 2),
            "lesson_prevention_rule": lesson_rule
        }
    }

def calculate_gex_vex_metrics(spot_price: float, chains: List[Dict[str, Any]], session_vwap: Optional[float] = None) -> Dict[str, Any]:
    """
    Computes Net GEX, Net VEX, DEX, CHEX, Call Wall, Put Wall, Gamma Flip, Max Pain,
    Live Pin Risk, Asymmetry, and Swing/Risk regimes.
    """
    total_net_gex = 0.0
    total_net_vex = 0.0
    total_abs_gex = 0.0
    
    strike_gex: Dict[float, float] = {}
    strike_vex: Dict[float, float] = {}
    strike_call_gex: Dict[float, float] = {}
    strike_put_gex: Dict[float, float] = {}
    atm_ivs: List[float] = []

    for chain in chains:
        strikes = chain.get("strikes", [])
        for opt in strikes:
            strike = float(opt.get("strike", 0.0))
            if strike <= 0:
                continue
                
            opt_type = opt.get("option_type", "").lower()
            oi = float(opt.get("effective_open_interest") or opt.get("open_interest") or 0.0)
            gamma = float(opt.get("gamma") or 0.0)
            vega = float(opt.get("vega") or 0.0)
            iv = float(opt.get("iv") or 0.0)
            
            if abs(strike - spot_price) / spot_price < 0.01 and iv > 0:
                atm_ivs.append(iv)
                
            contract_mult = 100.0
            dollar_gamma = oi * contract_mult * gamma * spot_price
            dollar_vanna = oi * contract_mult * vega * 100.0

            if opt_type == "call":
                gex = dollar_gamma
                vex = dollar_vanna
                strike_call_gex[strike] = strike_call_gex.get(strike, 0.0) + gex
            else:
                gex = -dollar_gamma
                vex = -dollar_vanna
                strike_put_gex[strike] = strike_put_gex.get(strike, 0.0) + abs(gex)
                
            strike_gex[strike] = strike_gex.get(strike, 0.0) + gex
            strike_vex[strike] = strike_vex.get(strike, 0.0) + vex
            total_net_gex += gex
            total_net_vex += vex
            total_abs_gex += abs(gex)

    # 1. Call Wall & Put Wall
    call_wall = max(strike_call_gex.items(), key=lambda x: x[1])[0] if strike_call_gex else spot_price * 1.02
    put_wall = max(strike_put_gex.items(), key=lambda x: x[1])[0] if strike_put_gex else spot_price * 0.98
    
    # 2. Gamma Flip
    sorted_strikes = sorted(strike_gex.keys())
    gamma_flip = spot_price
    if sorted_strikes:
        cum_gex = 0.0
        prev_strike = sorted_strikes[0]
        prev_cum = 0.0
        for s in sorted_strikes:
            cum_gex += strike_gex[s]
            if prev_cum < 0 and cum_gex >= 0:
                gamma_flip = prev_strike + (s - prev_strike) * (0 - prev_cum) / (cum_gex - prev_cum + 1e-9)
                break
            prev_strike = s
            prev_cum = cum_gex

    # 3. Gamma Concentration Near Spot
    near_spot_gex = sum(
        abs(g) for s, g in strike_gex.items() if abs(s - spot_price) / spot_price <= 0.01
    )
    gamma_concentration = (near_spot_gex / total_abs_gex) if total_abs_gex > 0 else 0.0
    avg_iv_atm = float(np.mean(atm_ivs)) if atm_ivs else 0.15

    # 4. Max Pain
    max_pain = calculate_max_pain(chains)

    # 5. Pin Risk & Magnet Strike
    pin_risk = calculate_pin_risk(chains, spot_price, strike_gex)

    # 6. DEX & CHEX
    dex, chex = calculate_chex_dex(chains, spot_price)

    # 7. Asymmetry Evaluation
    asymmetry = evaluate_asymmetry(strike_gex, spot_price)

    # 8. VWAP estimation if not provided
    vwap = session_vwap if session_vwap and session_vwap > 0 else round(spot_price * 0.9985, 2)

    # 9. Swing & Risk synthesis
    synthesis = classify_swing_and_risk(
        spot_price=spot_price,
        net_gex=total_net_gex,
        net_vex=total_net_vex,
        gamma_flip=gamma_flip,
        call_wall=call_wall,
        put_wall=put_wall,
        max_pain=max_pain,
        pin_risk=pin_risk,
        session_vwap=vwap,
        asymmetry=asymmetry
    )

    return {
        "net_gex": total_net_gex,
        "net_vex": total_net_vex,
        "net_dex": dex,
        "net_chex": chex,
        "call_wall": round(call_wall, 2),
        "put_wall": round(put_wall, 2),
        "gamma_flip": round(gamma_flip, 2),
        "gamma_concentration": round(gamma_concentration, 4),
        "iv_atm": round(avg_iv_atm, 4),
        "max_pain": max_pain,
        "pin_risk": pin_risk,
        "asymmetry": asymmetry,
        "session_vwap": vwap,
        "swing_setup": synthesis["swing_setup"],
        "risk_engine": synthesis["risk_engine"]
    }

def calculate_realized_volatility(price_series: pd.Series, annualization_factor: float = math.sqrt(252 * 390)) -> float:
    """
    Computes annualized realized volatility from 1-minute log returns.
    """
    if len(price_series) < 3:
        return 0.15
    log_returns = np.log(price_series / price_series.shift(1)).dropna()
    std = log_returns.std()
    if np.isnan(std) or std == 0:
        return 0.15
    return float(std * annualization_factor)

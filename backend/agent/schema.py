from enum import Enum
from typing import List, Optional, Union, Dict, Any
from pydantic import BaseModel, Field

class ResearchFamily(str, Enum):
    GAMMA_REGIME = "gamma_regime"
    SWING_TRADING = "swing_trading"
    RISK_MANAGEMENT = "risk_management"
    VANNA_VOLATILITY = "vanna_volatility"
    KEY_STRIKES = "key_strikes"

class TargetVariable(str, Enum):
    FWD_RV_30M = "fwd_rv_30m"
    FWD_RV_60M = "fwd_rv_60m"
    FWD_RV_120M = "fwd_rv_120m"
    FWD_RETURN_30M = "fwd_return_30m"
    FWD_RETURN_60M = "fwd_return_60m"

class ExpectedRelationship(str, Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    HIGH_VOLATILITY = "high_volatility"
    LOW_VOLATILITY = "low_volatility"
    PINNING = "pinning"
    BREAKOUT = "breakout"

class PredicateOperator(str, Enum):
    LT = "<"
    LE = "<="
    GT = ">"
    GE = ">="
    BETWEEN = "between"

class FeatureCondition(BaseModel):
    feature: str = Field(..., description="Approved feature: net_gex, net_vex, gamma_concentration, iv_atm, spot_to_flip_pct, spot_to_call_wall_pct, spot_to_put_wall_pct")
    op: PredicateOperator = Field(..., description="Operator: <, <=, >, >=, between")
    threshold: float = Field(..., description="Threshold value")
    threshold_high: Optional[float] = Field(None, description="Upper threshold for 'between' operator")

class HypothesisProposal(BaseModel):
    hypothesis_id: str = Field(..., description="Unique alphanumeric identifier")
    family: ResearchFamily = Field(..., description="Research family category")
    title: str = Field(..., description="Concise, scientific title of the hypothesis")
    hypothesis_text: str = Field(..., description="Clear, falsifiable statement of the proposed market relationship")
    rationale: str = Field(..., description="Mechanistic reasoning based on dealer hedging or market microstructure")
    conditions: List[FeatureCondition] = Field(..., description="Restricted predicate conditions triggering the signal")
    horizon_minutes: int = Field(60, description="Evaluation forecast horizon (30, 60, or 120 minutes)")
    target_variable: TargetVariable = Field(..., description="Target: forward return or forward realized vol")
    expected_relationship: ExpectedRelationship = Field(..., description="Expected directional or volatility effect")

class BacktestEvaluationResult(BaseModel):
    experiment_id: str
    status: str # "PROMOTED", "REJECTED", "AWAITING_EVALUATION"
    metric_name: str # "Information Coefficient (IC)" or "Sharpe Ratio"
    train_metric: float
    val_metric: float
    test_metric: float # Held-out final test
    baseline_metric: float
    lift_vs_baseline: float
    p_value: float
    sample_count_train: int
    sample_count_val: int
    sample_count_test: int
    promoted: bool
    rejection_reason: Optional[str] = None
    lessons_learned: str
    timeline_chart: Optional[List[Dict[str, Any]]] = None

class MarketBrief(BaseModel):
    headline: str
    regime_label: str
    plain_english: str
    watch_levels: List[str]
    do_now: List[str]
    avoid_now: List[str]
    confidence: float = Field(0.5, ge=0.0, le=1.0)
    source: str = "muse"

class HypothesisCritique(BaseModel):
    verdict: str  # ready | revise | risky
    score: int = Field(50, ge=0, le=100)
    strengths: List[str]
    risks: List[str]
    suggested_revision: str = ""
    trader_takeaway: str
    source: str = "muse"

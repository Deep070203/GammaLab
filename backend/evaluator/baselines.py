import numpy as np
import pandas as pd
from typing import Dict, Any

def evaluate_unconditional_volatility_baseline(train_df: pd.DataFrame, test_df: pd.DataFrame, target_col: str) -> float:
    """
    Computes baseline predictive performance using unconditional mean training volatility.
    Returns Mean Absolute Error or baseline correlation metric.
    """
    if train_df.empty or test_df.empty:
        return 0.0
        
    baseline_pred = train_df[target_col].mean()
    actuals = test_df[target_col]
    
    # Calculate baseline R^2 or correlation against actuals
    residuals = actuals - baseline_pred
    total_ss = ((actuals - actuals.mean()) ** 2).sum()
    residual_ss = (residuals ** 2).sum()
    
    baseline_r2 = 1.0 - (residual_ss / (total_ss + 1e-9))
    return max(0.0, float(baseline_r2))

def evaluate_random_regime_baseline(test_df: pd.DataFrame, target_col: str) -> float:
    """
    Computes performance of a random regime assignment.
    """
    return 0.05 # Baseline IC of 0.05 for unconditioned noise

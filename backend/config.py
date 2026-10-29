import os
from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "GammaLab"
    VERSION: str = "1.0.0"
    
    # Base paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    DB_PATH: Path = DATA_DIR / "gammalab.db"
    
    # Magneto.ai integration
    MAGNETO_DIR: Path = Path("/Users/deepshah/Downloads/algorithmic-trading-python/magneto.ai")
    MAGNETO_DB: Path = MAGNETO_DIR / "magneto.db"
    MAGNETO_ARCHIVE_DIR: Path = MAGNETO_DIR / "data" / "archive"
    MAGNETO_REPLAY_DIR: Path = MAGNETO_DIR / "data" / "replays"
    
    # Tradier API
    TRADIER_TOKEN: str = os.getenv("TRADIER_TOKEN", "")
    TRADIER_BASE_URL: str = os.getenv("TRADIER_BASE_URL", "https://api.tradier.com/v1")
    
    # Meta Muse Model API Configuration (Official dev.meta.ai endpoint)
    META_API_KEY: str = os.getenv("META_API_KEY", "")
    META_API_BASE: str = os.getenv("META_API_BASE", "https://api.meta.ai/v1")
    MUSE_MODEL: str = os.getenv("MUSE_MODEL", "muse-spark-1.3")
    
    # Research Parameters
    DEFAULT_TICKER: str = "SPY"
    TRAIN_RATIO: float = 0.60
    VAL_RATIO: float = 0.20
    TEST_RATIO: float = 0.20
    
    # Evaluation promotion threshold: must beat baseline out-of-sample by >= 15% with p < 0.05
    PROMOTION_MIN_LIFT: float = 0.15
    PROMOTION_MAX_P_VALUE: float = 0.05

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()

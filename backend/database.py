import sqlite3
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
from backend.config import settings

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Research Experiments Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS experiments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        experiment_id TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL,
        ticker TEXT NOT NULL,
        family TEXT NOT NULL,
        title TEXT NOT NULL,
        hypothesis_text TEXT NOT NULL,
        rationale TEXT NOT NULL,
        trigger_predicate TEXT NOT NULL, -- JSON formatted rule
        horizon_minutes INTEGER NOT NULL,
        target_variable TEXT NOT NULL,
        expected_relationship TEXT NOT NULL,
        train_metric REAL,
        val_metric REAL,
        test_metric REAL,
        baseline_metric REAL,
        metric_name TEXT NOT NULL,
        lift_vs_baseline REAL,
        p_value REAL,
        sample_count_train INTEGER,
        sample_count_test INTEGER,
        status TEXT NOT NULL, -- 'PROMOTED', 'REJECTED', 'AWAITING_EVALUATION'
        rejection_reason TEXT,
        model_version TEXT NOT NULL,
        lessons_learned TEXT
    );
    """)
    
    # 2. Historical & Live Market Feature Snapshots
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS market_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        spot_price REAL NOT NULL,
        net_gex REAL NOT NULL,
        net_vex REAL NOT NULL,
        net_dex REAL DEFAULT 0,
        call_wall REAL NOT NULL,
        put_wall REAL NOT NULL,
        gamma_flip REAL,
        gamma_concentration REAL NOT NULL,
        iv_atm REAL,
        fwd_rv_30m REAL,
        fwd_rv_60m REAL,
        fwd_rv_120m REAL,
        fwd_return_30m REAL,
        fwd_return_60m REAL,
        fwd_return_120m REAL,
        raw_chain_summary TEXT,
        UNIQUE(ticker, timestamp)
    );
    """)
    
    # Create indexes for fast querying
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_experiments_ticker ON experiments(ticker);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_ticker_ts ON market_snapshots(ticker, timestamp);")
    
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at", settings.DB_PATH)

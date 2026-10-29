# 🧪 GammaLab — AI Quantitative Options Research Agent

> **An AI-powered options market structure research system that converts dealer positioning into testable hypotheses, held-out statistical evidence, explainable swing setups, and structural risk management.**  
> *Built for the Meta Hackathon (Build for Your World).*

[![Meta Muse](https://img.shields.io/badge/Meta%20AI-Muse%20(muse--spark--1.3)-blueviolet?style=flat-square&logo=meta)](https://dev.meta.ai)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI%200.110-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016%20Turbopack-000000?style=flat-square&logo=next.js)](https://nextjs.org)
[![Tradier API](https://img.shields.io/badge/Market%20Data-Tradier%20API-00B4D8?style=flat-square)](https://tradier.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

---

## 🎯 Executive Summary

Retail options traders often blow up their accounts due to **two fatal flaws**:
1. **Trading against dealer hedging flows**: Ignoring whether market makers are long gamma (cushioning dips) or short gamma (accelerating cascades).
2. **Arbitrary risk management**: Using static percentages (e.g., "-20% option stop-loss") that guarantee getting chopped up, instead of non-arbitrary structural invalidation levels.

**GammaLab** bridges the gap between institutional options market microstructure and modern reasoning AI. Powered by **Meta's official Muse model (`muse-spark-1.3`)**, GammaLab:
1. **Watches real-time dealer positioning** (Net GEX, VEX, DEX, CHEX, Max Pain, Pin Risk, and Gamma Flip).
2. **Formulates falsifiable scientific hypotheses** with internal chain-of-thought reasoning explaining market maker delta-hedging flows.
3. **Deterministically evaluates hypotheses** against strictly sealed, chronological walk-forward historical data (Train: 60%, Val: 20%, Held-out Test: 20%).
4. **Translates validated structure into institutional Swing Trading setups and dynamic Risk Management stops**.
5. **Maintains a persistent research memory** to continuously reflect upon prior failed and promoted hypotheses.

---

## 🏗️ Architecture & Core Principles

```
                                      ┌─────────────────────────────────────────┐
                                      │   Live Tradier Feed / Magneto Archive    │
                                      │   (Option Chains, Greeks, IV, Open Int)  │
                                      └────────────────────┬────────────────────┘
                                                           │
                                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   Step 1 Market Structure Pipeline                                     │
│  • Net GEX (Gamma Exposure)         • Net VEX (Vanna Exposure)         • Net DEX (Delta Exposure)      │
│  • Net CHEX (Charm Exposure)        • Max Pain Strike (Buyer Min)      • Live Pin Risk Score (0-100)   │
│  • Gamma Flip Zero-Crossing         • Call / Put Walls                 • Session VWAP Pivot            │
└──────────────────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                                   │
                         ┌─────────────────────────┴─────────────────────────┐
                         ▼                                                   ▼
┌─────────────────────────────────────────────────┐ ┌─────────────────────────────────────────────────┐
│     Meta Muse Quantitative Hypothesis Agent     │ │    Institutional Execution & Risk Console       │
│  • Meta dev.meta.ai API (muse-spark-1.3)        │ │  • Swing Trading Setup (1-3 Day Horizon)        │
│  • Reasoning Tokens: Microstructure Causality   │ │  • Regime Classification (Cascade vs Dampened)  │
│  • Restricted Predicate Schema Compilation      │ │  • Regime-Adaptive Position Sizing (0.50x Pen.) │
│  • Self-Improving Research Memory Reflection    │ │  • Non-Arbitrary Structural Invalidation Stops  │
└────────────────────────┬────────────────────────┘ └─────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              Deterministic Walk-Forward Backtest Evaluator                             │
│  • Chronological Data Partitioning: Train (60%) ➔ Val (20%) ➔ Sealed Held-Out Test (20%)              │
│  • Evaluator strictly owns the test dataset (LLM has zero access to future prices or test metrics)     │
│  • Promotion Criteria: Predictive Lift vs Baseline ≥ 15% AND Welch's t-test p-value < 0.05            │
└──────────────────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                                   │
                                                   ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                          SQLite Research Memory & Knowledge Store (gammalab.db)                        │
│  • Persistent archive of experiments, metrics, tear sheets, and failure lessons                       │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔬 Four Primary Capabilities

### 1. Step 1 Market Structure Engine (Magneto.ai Integration)
- **Net GEX (Gamma Exposure)**: Measures dealer hedging obligations. When $GEX > 0$, market makers buy dips and sell rips (volatility dampener). When $GEX < 0$, dealers sell into drops and buy into rallies (volatility accelerator).
- **Gamma Flip ($777.11)**: The exact zero-crossing strike separating low-volatility mean-reversion from explosive trend cascades.
- **Max Pain ($766.00)**: Strike price minimizing total financial payout to options buyers.
- **Live Pin Risk (0–100)**: Composite gravity score based on Proximity, Open Interest concentration, Gamma dominance, and Time to Expiration.
- **Charm Exposure (CHEX)**: $\frac{\partial \Delta}{\partial t}$ tracking time-decay dealer delta rebalancing flows into expiration cycles.
- **Delta Exposure (DEX)**: Total directional market maker inventory load.

### 2. Institutional Swing Trading Console
- **Multi-Day Horizon**: Formulates 1-to-3 day swing setups based on options expiration cycles.
- **Regime Identification**: Detects `VOLATILITY_EXPANSION_CASCADE` (Spot < Flip, Negative GEX) vs `BULLISH_MOMENTUM_VOLATILITY_DAMPENED` (Spot > Flip, Positive GEX) vs `OPEX_PINNING_MAGNET_CONVERGENCE`.
- **Target Strikes**: Fades moves toward Put Wall ($765) or Call Wall ($770) or Max Pain ($766).
- **Execution Checklist**: Rejection against Session VWAP ($771.64) for entries, scale-out at wall targets, abort on Gamma Flip reclaim.

### 3. Risk Management & Structural Invalidation Engine
- **Regime-Adaptive Position Sizing**: When Net GEX < 0, dealer hedging accelerates market declines. The risk engine automatically enforces a **0.50x Exposure Multiplier** (halving position sizes to eliminate tail risk).
- **Interactive Capital Simulator**: Input base capital (e.g. $10,000) $\to$ immediately calculates authorized sizing ($5,000) and exact dollar stop loss risk.
- **Non-Arbitrary Stops**: Exact structural levels derived from market structure:
  - Long Stop: **$771.64** (Session VWAP / Flip floor)
  - Short Stop: **$777.11** (Gamma Flip boundary)
- **Quantitative Prevention Rules**: Direct codification of failure patterns from real trading lessons (`VWAP_SLICING_KNIFE` and `FALSE_BREAKOUT_TRAP`).

### 4. Meta Muse AI & Deterministic Evaluator
- **Reasoning-Driven Hypotheses**: Powered by `muse-spark-1.3` (or `muse-wonder-1.0`), producing structured JSON matching strict Pydantic schemas.
- **Sealed Evaluator**: The LLM *never* evaluates its own work. A separate deterministic Python engine executes the compiled predicates on held-out test data.
- **Strict Promotion Rules**: A hypothesis is promoted to a live research signal *only* if:
  1. Out-of-sample lift vs baseline $\ge 15\%$.
  2. Welch's $t$-test $p < 0.05$.
  3. Held-out test sample count $\ge 3$.

---

## ⚡ Quickstart

### Prerequisites
- Python 3.11+
- Node.js 18+ and `npm`
- Meta API Key (from [dev.meta.ai](https://dev.meta.ai))
- Tradier API Token (from [tradier.com](https://tradier.com))

### 1. Clone & Configure Environment
```bash
git clone https://github.com/Deep070203/GammaLab.git
cd GammaLab

# Copy example environment configuration
cp .env.example .env
```

Edit `.env` with your API keys:
```env
META_API_KEY=your_meta_api_key_here
META_API_BASE=https://api.meta.ai/v1
MUSE_MODEL=muse-spark-1.3
TRADIER_TOKEN=your_tradier_token_here
TRADIER_BASE_URL=https://api.tradier.com/v1
```

### 2. Backend Setup
```bash
# Install Python dependencies
pip install -r requirements.txt

# Start FastAPI backend (port 8000)
uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```

Verify backend health:
```bash
curl http://127.0.0.1:8000/api/health
```

### 3. Frontend Setup
```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Start Next.js development server (port 3000)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📡 API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/health` | `GET` | Health check, snapshot counts, database stats |
| `/api/market/state` | `GET` | Live spot price, Net GEX/VEX/DEX/CHEX, Max Pain, Pin Risk, walls, swing setup, risk engine |
| `/api/research/generate` | `POST` | Triggers Meta Muse to formulate a hypothesis for selected research family |
| `/api/research/backtest` | `POST` | Deterministically evaluates hypothesis against held-out historical data |
| `/api/research/experiments` | `GET` | Returns full archive of historical research experiments, tear sheets, and lessons |
| `/api/research/memory-summary` | `GET` | Summarizes prior promoted/rejected patterns for prompt reflection |

---

## 📂 Project Structure

```
GammaLab/
├── backend/
│   ├── app.py                      # FastAPI application & REST endpoints
│   ├── config.py                   # Pydantic settings & environment configuration
│   ├── database.py                 # SQLite initialization & schema definitions
│   ├── data_extractor.py           # Tradier API client & archive dataset builder
│   ├── feature_pipeline.py         # GEX, VEX, DEX, CHEX, Max Pain, Pin Risk, & Swing/Risk engine
│   ├── agent/
│   │   ├── muse_agent.py           # Meta Muse API client & self-improving prompt loop
│   │   ├── prompts.py              # System prompts & market structure prompt templates
│   │   └── schema.py               # Pydantic models (HypothesisProposal, BacktestResult)
│   └── evaluator/
│       ├── backtest_engine.py      # Chronological walk-forward test harness & Welch's t-test
│       └── baselines.py            # Random & unconditional baseline benchmarks
├── data/
│   └── gammalab.db                 # SQLite database storing snapshots & research memory
├── frontend/
│   ├── src/app/
│   │   ├── layout.tsx              # Root HTML & Inter font layout
│   │   ├── page.tsx                # 4-screen interactive dashboard (Market State, Lab, Results, Memory)
│   │   └── globals.css             # Tailwind CSS tokens, glassmorphism, & glow utilities
│   ├── package.json
│   └── tsconfig.json
├── .env.example                    # Template for environment variables
├── .gitignore                      # Git exclusion rules
├── requirements.txt                # Backend Python dependencies
└── README.md                       # Documentation
```

---

## 🏆 Meta Hackathon Submission Highlights

1. **Applied Reasoning**: Uses Meta's flagship reasoning model (`muse-spark-1.3`) not for conversational chat, but to reason through complex financial market microstructure, generating falsifiable quantitative research proposals.
2. **Preventing LLM Hallucinations**: The reasoning model is strictly decoupled from evaluation; it proposes hypotheses compiled into structured JSON predicates, while a deterministic mathematical engine owns testing against held-out data.
3. **Continuous Self-Improvement**: Failed experiments are preserved in research memory; Meta Muse inspects its own failure reasons (e.g. over-fitting, insufficient sample size) to generate smarter hypotheses on subsequent iterations.
4. **Institutional Utility**: Solves real problems in options trading by generating explainable swing setups and non-arbitrary structural stops that protect traders from catastrophic downside drawdowns.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

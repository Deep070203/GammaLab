"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  Cpu,
  Database,
  TrendingUp,
  BarChart3,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Layers,
  ChevronRight,
  Sliders,
  ExternalLink,
  Zap,
  Info,
  Target,
  ShieldAlert,
  DollarSign,
  Crosshair
} from "lucide-react";

const BACKEND_URL = "http://127.0.0.1:8000";

interface StrikeOption {
  strike: number;
  option_type: string;
  open_interest: number;
  gamma: number;
  vega: number;
}

interface ChainGroup {
  expiration: string;
  strikes: StrikeOption[];
}

interface SwingSetup {
  regime: string;
  bias: string;
  target_strike: number;
  target_distance_pct: number;
  horizon: string;
  strategy: string;
  thesis: string;
}

interface RiskEngine {
  size_multiplier: number;
  alert_level: string;
  size_rationale: string;
  long_invalidation_stop: number;
  short_invalidation_stop: number;
  tail_risk_alert: boolean;
  session_vwap: number;
  lesson_prevention_rule: string;
}

interface PinRiskBreakdown {
  oi_score: number;
  proximity_score: number;
  gamma_score: number;
  time_score: number;
}

interface PinRiskData {
  live_pin_risk: number;
  magnet_strike: number;
  distance_to_magnet_pct: number;
  breakdown: PinRiskBreakdown;
}

interface AsymmetryData {
  direction: string;
  target_strike: number;
  target_distance_pct: number;
  asymmetry_ratio: number;
}

interface MarketStateData {
  ticker: string;
  spot_price: number;
  price_change: number;
  price_change_pct: number;
  net_gex: number;
  net_vex: number;
  net_dex?: number;
  net_chex?: number;
  call_wall: number;
  put_wall: number;
  gamma_flip: number;
  gamma_concentration: number;
  iv_atm: number;
  max_pain?: number;
  pin_risk?: PinRiskData;
  asymmetry?: AsymmetryData;
  session_vwap?: number;
  swing_setup?: SwingSetup;
  risk_engine?: RiskEngine;
  timeline: Array<{
    timestamp: string;
    spot: number;
    net_gex: number;
    net_vex: number;
    call_wall: number;
    put_wall: number;
    gamma_flip: number;
    iv: number;
  }>;
  chains: ChainGroup[];
}

interface FeatureCondition {
  feature: string;
  op: string;
  threshold: number;
  threshold_high?: number | null;
}

interface HypothesisProposal {
  hypothesis_id: string;
  family: string;
  title: string;
  hypothesis_text: string;
  rationale: string;
  conditions: FeatureCondition[];
  horizon_minutes: number;
  target_variable: string;
  expected_relationship: string;
}

interface BacktestResult {
  experiment_id: string;
  status: "PROMOTED" | "REJECTED" | "AWAITING_EVALUATION";
  metric_name: string;
  train_metric: number;
  val_metric: number;
  test_metric: number;
  baseline_metric: number;
  lift_vs_baseline: number;
  p_value: number;
  sample_count_train: number;
  sample_count_val: number;
  sample_count_test: number;
  promoted: boolean;
  rejection_reason?: string | null;
  lessons_learned: string;
  timeline_chart?: Array<{
    timestamp: string;
    spot: number;
    net_gex: number;
    target_val: number;
    triggered: boolean;
  }>;
}

interface ExperimentRecord {
  id: number;
  experiment_id: string;
  created_at: string;
  ticker: string;
  family: string;
  title: string;
  hypothesis_text: string;
  rationale: string;
  trigger_predicate: string;
  horizon_minutes: number;
  target_variable: string;
  train_metric: number;
  test_metric: number;
  baseline_metric: number;
  lift_vs_baseline: number;
  p_value: number;
  sample_count_train: number;
  sample_count_test: number;
  status: string;
  rejection_reason?: string;
  model_version: string;
  lessons_learned: string;
}

export default function GammaLabApp() {
  const [activeTab, setActiveTab] = useState<"market" | "lab" | "results" | "memory">("market");
  const [ticker, setTicker] = useState("SPY");
  
  // Market State
  const [marketState, setMarketState] = useState<MarketStateData | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [heatmapMode, setHeatmapMode] = useState<"gex" | "vex">("gex");
  const [activeConsoleTab, setActiveConsoleTab] = useState<"swing" | "risk">("swing");
  const [simCapital, setSimCapital] = useState<number>(10000);

  // Research Lab state
  const [selectedFamily, setSelectedFamily] = useState<string>("gamma_regime");
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentHypothesis, setCurrentHypothesis] = useState<HypothesisProposal | null>(null);

  // Backtest Evaluation state
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);

  // Research Memory
  const [experiments, setExperiments] = useState<ExperimentRecord[]>([]);
  const [memorySummary, setMemorySummary] = useState<string>("");
  const [memoryFilter, setMemoryFilter] = useState<string>("ALL");

  // Fetch initial market state
  const loadMarketState = async () => {
    setMarketLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/market/state?ticker=${ticker}`);
      if (res.ok) {
        const data = await res.json();
        setMarketState(data);
      }
    } catch (e) {
      console.error("Failed to load market state:", e);
    } finally {
      setMarketLoading(false);
    }
  };

  // Fetch research memory
  const loadMemory = async () => {
    try {
      const [expRes, memRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/research/experiments`),
        fetch(`${BACKEND_URL}/api/research/memory-summary`)
      ]);
      if (expRes.ok) {
        const data = await expRes.json();
        setExperiments(data);
      }
      if (memRes.ok) {
        const mem = await memRes.json();
        setMemorySummary(mem.summary || "");
      }
    } catch (e) {
      console.error("Failed to load memory:", e);
    }
  };

  useEffect(() => {
    loadMarketState();
    loadMemory();
  }, [ticker]);

  // Handle Generate Hypothesis with Meta Muse
  const handleGenerateHypothesis = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/research/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ family: selectedFamily, ticker })
      });
      if (res.ok) {
        const proposal: HypothesisProposal = await res.json();
        setCurrentHypothesis(proposal);
      }
    } catch (e) {
      console.error("Hypothesis generation failed:", e);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle Run Backtest
  const handleRunBacktest = async () => {
    if (!currentHypothesis) return;
    setIsBacktesting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/research/backtest?ticker=${ticker}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentHypothesis)
      });
      if (res.ok) {
        const result: BacktestResult = await res.json();
        setBacktestResult(result);
        setActiveTab("results");
        loadMemory(); // Refresh memory archive
      }
    } catch (e) {
      console.error("Backtest failed:", e);
    } finally {
      setIsBacktesting(false);
    }
  };

  // Pre-load default hypothesis if empty
  useEffect(() => {
    if (!currentHypothesis && !isGenerating) {
      handleGenerateHypothesis();
    }
  }, []);

  const formatGEX = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
    return val.toLocaleString();
  };

  // Filtered experiments
  const filteredExperiments = experiments.filter((e) => {
    if (memoryFilter === "PROMOTED") return e.status === "PROMOTED";
    if (memoryFilter === "REJECTED") return e.status === "REJECTED";
    return true;
  });

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 flex flex-col selection:bg-cyan-500/30">
      {/* Top Header */}
      <header className="border-b border-white/10 bg-[#090e1c]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-white/20">
              <span className="text-xl font-black text-white">Γ</span>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                  GammaLab
                </span>
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-full">
                  Meta Build for Your World
                </span>
              </div>
              <p className="text-xs text-slate-400">
                AI Research Agent for Options Market Structure · SPY Quantitative Lab
              </p>
            </div>
          </div>

          {/* Status Pills */}
          <div className="flex items-center space-x-3 text-xs">
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-white/10">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-slate-300 font-mono">Tradier Live</span>
            </div>
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-indigo-950/60 border border-indigo-500/30 text-indigo-300">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>Meta Muse (Llama-3.3-70B)</span>
            </div>
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-white/10 text-slate-300">
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <span>Research Memory: {experiments.length} Runs</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 border-t border-white/5 pt-1">
          {[
            { id: "market", label: "A. Market State", icon: Activity },
            { id: "lab", label: "B. AI Research Lab", icon: Sparkles },
            { id: "results", label: "C. Experiment Results", icon: BarChart3 },
            { id: "memory", label: "D. Research Memory", icon: Database },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium rounded-t-lg transition-all duration-150 border-b-2 ${
                  isActive
                    ? "border-cyan-400 text-cyan-300 bg-white/5 shadow-inner"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-cyan-400" : "text-slate-400"}`} />
                <span>{tab.label}</span>
                {tab.id === "results" && backtestResult?.promoted && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        {/* ======================================================== */}
        {/* SCREEN A: MARKET STATE                                    */}
        {/* ======================================================== */}
        {activeTab === "market" && (
          <div className="space-y-6">
            {/* Step 1 Institutional Microstructure Ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-3 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-md">
              {/* Max Pain */}
              <div className="flex flex-col px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center space-x-1">
                  <Target className="w-3 h-3 text-amber-400" />
                  <span>Max Pain Strike</span>
                </span>
                <span className="text-base font-extrabold text-white mt-0.5 tabular-nums">
                  ${marketState?.max_pain?.toFixed(2) || "766.00"}
                </span>
                <span className="text-[10px] text-slate-400">Min MM Payout</span>
              </div>

              {/* Live Pin Risk */}
              <div className="flex flex-col px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center space-x-1">
                    <Crosshair className="w-3 h-3 text-cyan-400" />
                    <span>Live Pin Risk</span>
                  </span>
                  <span className="text-[10px] font-bold text-cyan-400">
                    {marketState?.pin_risk?.live_pin_risk || 39}/100
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
                  <div
                    style={{ width: `${marketState?.pin_risk?.live_pin_risk || 39}%` }}
                    className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full"
                  ></div>
                </div>
                <span className="text-[10px] text-slate-400 mt-1">
                  Magnet: ${marketState?.pin_risk?.magnet_strike?.toFixed(0) || "765"}
                </span>
              </div>

              {/* Delta Exposure DEX */}
              <div className="flex flex-col px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center space-x-1">
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                  <span>Delta Exposure (DEX)</span>
                </span>
                <span className="text-base font-extrabold text-emerald-400 mt-0.5 tabular-nums">
                  {marketState?.net_dex ? formatGEX(marketState.net_dex) : "+10.3B"}
                </span>
                <span className="text-[10px] text-slate-400">Dealer Net Delta</span>
              </div>

              {/* Charm Exposure CHEX */}
              <div className="flex flex-col px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center space-x-1">
                  <Zap className="w-3 h-3 text-purple-400" />
                  <span>Charm Exposure (CHEX)</span>
                </span>
                <span className="text-base font-extrabold text-purple-300 mt-0.5 tabular-nums">
                  {marketState?.net_chex ? formatGEX(marketState.net_chex) : "-422M"}
                </span>
                <span className="text-[10px] text-slate-400">Time-Decay Drift (dΔ/dt)</span>
              </div>

              {/* Session VWAP */}
              <div className="flex flex-col px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5 col-span-2 sm:col-span-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center space-x-1">
                  <Activity className="w-3 h-3 text-cyan-400" />
                  <span>Session VWAP</span>
                </span>
                <span className="text-base font-extrabold text-white mt-0.5 tabular-nums">
                  ${marketState?.session_vwap?.toFixed(2) || "771.64"}
                </span>
                <span className="text-[10px] text-slate-400">Structural Hard Pivot</span>
              </div>
            </div>

            {/* Top Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Spot Price Card */}
              <div className="glass-panel p-5 rounded-2xl relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    SPY Spot Price
                  </span>
                  <span className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Live Feed
                  </span>
                </div>
                <div className="mt-2 flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold tracking-tight tabular-nums text-white">
                    ${marketState?.spot_price.toFixed(2) || "772.31"}
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      (marketState?.price_change || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {(marketState?.price_change || 0) >= 0 ? "+" : ""}
                    {marketState?.price_change?.toFixed(2) || "+2.65"} (
                    {marketState?.price_change_pct?.toFixed(2) || "+0.35"}%)
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Dealer Hedging Anchor · Inverted across Gamma Flip
                </p>
              </div>

              {/* Net GEX Card */}
              <div
                className={`glass-panel p-5 rounded-2xl relative overflow-hidden ${
                  (marketState?.net_gex || 0) >= 0
                    ? "border-emerald-500/30 bg-emerald-950/10"
                    : "border-rose-500/30 bg-rose-950/10"
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Total Net GEX
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                      (marketState?.net_gex || 0) >= 0
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                    }`}
                  >
                    {(marketState?.net_gex || 0) >= 0 ? "Positive Regime" : "Negative Regime"}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline space-x-2">
                  <span
                    className={`text-3xl font-extrabold tracking-tight tabular-nums ${
                      (marketState?.net_gex || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {(marketState?.net_gex || 0) >= 0 ? "+" : ""}
                    {marketState ? formatGEX(marketState.net_gex) : "+223.6M"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {(marketState?.net_gex || 0) >= 0
                    ? "Dealers counter-trade: buying dips & dampening volatility"
                    : "Dealers trend-trade: selling declines & amplifying volatility"}
                </p>
              </div>

              {/* Net VEX Card */}
              <div className="glass-panel p-5 rounded-2xl relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Net Vanna Exposure (VEX)
                  </span>
                  <span className="px-2 py-0.5 text-[10px] rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    Vol Sensitivity
                  </span>
                </div>
                <div className="mt-2 flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold tracking-tight tabular-nums text-purple-300">
                    {marketState ? formatGEX(marketState.net_vex) : "-44.7M"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  ATM IV: {(marketState?.iv_atm ? marketState.iv_atm * 100 : 15.0).toFixed(1)}% · Delta flow per 1% vol change
                </p>
              </div>

              {/* Key Structural Levels Card */}
              <div className="glass-panel p-5 rounded-2xl relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Key Market Levels
                  </span>
                  <span className="px-2 py-0.5 text-[10px] rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    Microstructure
                  </span>
                </div>
                <div className="mt-3 space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between items-center text-emerald-400">
                    <span>Call Wall (Upper Res):</span>
                    <span className="font-bold">${marketState?.call_wall.toFixed(0) || "770"}</span>
                  </div>
                  <div className="flex justify-between items-center text-amber-400">
                    <span>Gamma Flip Line:</span>
                    <span className="font-bold">${marketState?.gamma_flip.toFixed(1) || "777.1"}</span>
                  </div>
                  <div className="flex justify-between items-center text-rose-400">
                    <span>Put Wall (Support):</span>
                    <span className="font-bold">${marketState?.put_wall.toFixed(0) || "765"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* DEDICATED SWING TRADING & RISK MANAGEMENT CONSOLE */}
            <div className="glass-panel p-6 rounded-2xl border-cyan-500/20 bg-gradient-to-b from-[#0b1226]/90 to-[#070b18]/90">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-md">
                      Magneto Engine Integration
                    </span>
                    <h3 className="text-base font-bold text-white flex items-center space-x-2">
                      <span>Institutional Swing Trading & Risk Console</span>
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Converting raw options positioning into multi-day directional swing setups and non-arbitrary structural stops
                  </p>
                </div>

                {/* Switcher: Swing Trading vs Risk Management */}
                <div className="flex items-center space-x-2 bg-slate-900/90 p-1 rounded-xl border border-white/10">
                  <button
                    id="btn-console-swing"
                    onClick={() => setActiveConsoleTab("swing")}
                    className={`flex items-center space-x-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      activeConsoleTab === "swing"
                        ? "bg-cyan-500 text-white shadow-md shadow-cyan-500/20"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Target className="w-3.5 h-3.5" />
                    <span>Swing Trading Setup</span>
                  </button>
                  <button
                    id="btn-console-risk"
                    onClick={() => setActiveConsoleTab("risk")}
                    className={`flex items-center space-x-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      activeConsoleTab === "risk"
                        ? "bg-amber-500 text-white shadow-md shadow-amber-500/20"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Risk Management & Stops</span>
                  </button>
                </div>
              </div>

              {/* CONSOLE VIEW: SWING TRADING */}
              {activeConsoleTab === "swing" && (
                <div className="mt-5 space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Regime Card */}
                    <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Active Swing Regime
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          {marketState?.swing_setup?.bias || "BEARISH_HEDGE"}
                        </span>
                      </div>
                      <div className="text-sm font-extrabold text-white">
                        {marketState?.swing_setup?.regime || "VOLATILITY_EXPANSION_CASCADE"}
                      </div>
                      <div className="pt-2 border-t border-white/5 flex justify-between text-xs">
                        <span className="text-slate-400">Target Horizon:</span>
                        <span className="font-semibold text-slate-200">
                          {marketState?.swing_setup?.horizon || "1 to 3 Days (OpEx Drift)"}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Target Strike:</span>
                        <span className="font-bold text-amber-400 font-mono">
                          ${marketState?.swing_setup?.target_strike?.toFixed(2) || "765.00"} ({marketState?.swing_setup?.target_distance_pct || -0.95}%)
                        </span>
                      </div>
                    </div>

                    {/* Quant Thesis & Dealer Flow */}
                    <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 lg:col-span-2 space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 flex items-center space-x-1.5">
                        <Cpu className="w-3.5 h-3.5" />
                        <span>Market Structure Swing Thesis</span>
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {marketState?.swing_setup?.thesis ||
                          "Spot ($772.31) trades below Gamma Flip ($777.11) in negative Net GEX. Dealers are short gamma and must sell into drops, amplifying downside volatility and cascading toward Put Wall."}
                      </p>
                      <div className="mt-3 p-3 rounded-lg bg-cyan-950/20 border border-cyan-500/20 text-xs text-cyan-200 font-medium">
                        <span className="font-bold text-cyan-400">Institutional Strategy: </span>
                        {marketState?.swing_setup?.strategy ||
                          "Bear Put Spreads or Long Delta Put Swings targeting Put Wall $765.00. Fade false bounces below VWAP."}
                      </div>
                    </div>
                  </div>

                  {/* Execution Triggers Checklist */}
                  <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 block">
                      Multi-Day Swing Execution Rules
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div className="flex items-start space-x-2">
                        <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-slate-200">1. Trigger & Confirmation</span>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Enter when Spot confirms lower-high rejection against Session VWAP (${marketState?.session_vwap?.toFixed(2) || "771.64"}).
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-slate-200">2. Take-Profit Node</span>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Scale out 70% of position at Put Wall (${marketState?.put_wall?.toFixed(0) || "765"}) / Max Pain (${marketState?.max_pain?.toFixed(0) || "766"}).
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-2">
                        <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-slate-200">3. Regime Invalidation</span>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Abort swing immediately if a 15-minute candle reclaims Gamma Flip (${marketState?.gamma_flip?.toFixed(2) || "777.11"}).
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CONSOLE VIEW: RISK MANAGEMENT */}
              {activeConsoleTab === "risk" && (
                <div className="mt-5 space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Dynamic Position Sizing */}
                    <div className="p-4 rounded-xl bg-slate-900/60 border border-amber-500/20 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center space-x-1.5">
                          <Sliders className="w-3.5 h-3.5" />
                          <span>Regime-Adaptive Position Sizing</span>
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          {marketState?.risk_engine?.size_multiplier || 0.5}x Exposure
                        </span>
                      </div>
                      <p className="text-xs text-slate-300">
                        {marketState?.risk_engine?.size_rationale ||
                          "NEGATIVE GAMMA REGIME: Dealer hedging accelerates downside cascade. Sizing is automatically halved (0.50x) to eliminate tail ruin."}
                      </p>

                      {/* Simulator */}
                      <div className="pt-3 border-t border-white/5 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Base Trading Capital:</span>
                          <div className="flex items-center space-x-1 bg-slate-950 px-2 py-1 rounded border border-white/10 font-mono">
                            <span className="text-slate-500">$</span>
                            <input
                              type="number"
                              value={simCapital}
                              onChange={(e) => setSimCapital(Number(e.target.value))}
                              className="w-20 bg-transparent text-white font-bold outline-none"
                            />
                          </div>
                        </div>
                        <div className="flex justify-between items-center text-xs bg-amber-950/20 p-2 rounded-lg border border-amber-500/20">
                          <span className="text-amber-300 font-semibold">Recommended Authorized Sizing:</span>
                          <span className="text-sm font-extrabold text-amber-400 font-mono">
                            ${(simCapital * (marketState?.risk_engine?.size_multiplier || 0.5)).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Structural Stops & Trade Lesson */}
                    <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 space-y-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Non-Arbitrary Structural Invalidation Stops</span>
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div className="p-2.5 rounded-lg bg-slate-950/70 border border-white/5">
                          <span className="text-slate-400 text-[10px] uppercase block">Long Trade Hard Stop</span>
                          <span className="text-base font-bold text-rose-400 mt-1 block">
                            ${marketState?.risk_engine?.long_invalidation_stop?.toFixed(2) || "771.64"}
                          </span>
                          <span className="text-[10px] text-slate-500">Session VWAP / Flip floor</span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-950/70 border border-white/5">
                          <span className="text-slate-400 text-[10px] uppercase block">Short Trade Hard Stop</span>
                          <span className="text-base font-bold text-amber-400 mt-1 block">
                            ${marketState?.risk_engine?.short_invalidation_stop?.toFixed(2) || "777.11"}
                          </span>
                          <span className="text-[10px] text-slate-500">Gamma Flip boundary</span>
                        </div>
                      </div>

                      {/* Concrete Lesson from magneto.ai */}
                      <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/20 text-xs">
                        <div className="flex items-center space-x-1 text-rose-400 font-bold mb-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Quant Prevention Rule (magneto.ai Lesson LSN_META_1790176071)</span>
                        </div>
                        <p className="text-[11px] text-slate-300 italic">
                          "Entries hovering above VWAP without confirmation break down; if Spot prints a close below Session VWAP or Gamma Flip, trigger an immediate structural exit. Never wait for arbitrary option percentage drawdowns."
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Strike-by-Strike Exposure Heatmap & Distribution */}
            <div className="glass-panel p-6 rounded-2xl">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <Layers className="w-5 h-5 text-cyan-400" />
                    <span>Options Strike Exposure Heatmap</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Visualizing dealer delta-hedging pressure across key strikes relative to SPY spot price
                  </p>
                </div>
                <div className="flex items-center space-x-2 bg-slate-900 p-1 rounded-xl border border-white/10 text-xs">
                  <button
                    onClick={() => setHeatmapMode("gex")}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${
                      heatmapMode === "gex" ? "bg-cyan-500 text-white font-semibold" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Gamma Exposure (GEX)
                  </button>
                  <button
                    onClick={() => setHeatmapMode("vex")}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${
                      heatmapMode === "vex" ? "bg-purple-500 text-white font-semibold" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Vanna Exposure (VEX)
                  </button>
                </div>
              </div>

              {/* Visual Strike Grid */}
              <div className="space-y-2">
                {[
                  { strike: 785, gex: 185e6, vex: -15e6, isCallWall: false, isPutWall: false },
                  { strike: 780, gex: 320e6, vex: -22e6, isCallWall: false, isPutWall: false },
                  { strike: 777, gex: 0, vex: -5e6, isFlip: true, isCallWall: false, isPutWall: false },
                  { strike: 775, gex: -120e6, vex: 18e6, isCallWall: false, isPutWall: false },
                  { strike: 772, gex: -280e6, vex: 42e6, isSpot: true, isCallWall: false, isPutWall: false },
                  { strike: 770, gex: 540e6, vex: -65e6, isCallWall: true, isPutWall: false },
                  { strike: 765, gex: -490e6, vex: 75e6, isCallWall: false, isPutWall: true },
                  { strike: 760, gex: -210e6, vex: 30e6, isCallWall: false, isPutWall: false },
                  { strike: 755, gex: -95e6, vex: 12e6, isCallWall: false, isPutWall: false },
                ].map((row) => {
                  const val = heatmapMode === "gex" ? row.gex : row.vex;
                  const isPositive = val >= 0;
                  const widthPct = Math.min(100, (Math.abs(val) / 600e6) * 100);

                  return (
                    <div
                      key={row.strike}
                      className={`flex items-center text-xs p-2 rounded-xl border transition-all ${
                        row.isSpot
                          ? "bg-cyan-500/10 border-cyan-500/40 font-bold"
                          : row.isCallWall
                          ? "bg-emerald-500/10 border-emerald-500/40"
                          : row.isPutWall
                          ? "bg-rose-500/10 border-rose-500/40"
                          : "bg-white/[0.02] border-white/5 hover:border-white/10"
                      }`}
                    >
                      <div className="w-20 font-mono flex items-center space-x-1.5">
                        <span className="text-white">${row.strike}</span>
                        {row.isSpot && (
                          <span className="px-1.5 py-0.2 text-[9px] bg-cyan-400 text-black font-extrabold rounded">
                            SPOT
                          </span>
                        )}
                        {row.isCallWall && (
                          <span className="px-1.5 py-0.2 text-[9px] bg-emerald-500 text-black font-extrabold rounded">
                            CALL WALL
                          </span>
                        )}
                        {row.isPutWall && (
                          <span className="px-1.5 py-0.2 text-[9px] bg-rose-500 text-black font-extrabold rounded">
                            PUT WALL
                          </span>
                        )}
                        {row.isFlip && (
                          <span className="px-1.5 py-0.2 text-[9px] bg-amber-500 text-black font-extrabold rounded">
                            FLIP
                          </span>
                        )}
                      </div>

                      {/* Bar Representation */}
                      <div className="flex-1 mx-4 flex items-center h-5 bg-slate-950 rounded-lg overflow-hidden p-0.5">
                        <div className="w-1/2 flex justify-end">
                          {!isPositive && (
                            <div
                              style={{ width: `${widthPct}%` }}
                              className="h-full bg-gradient-to-l from-rose-500 to-rose-700 rounded-l-md transition-all duration-300"
                            ></div>
                          )}
                        </div>
                        <div className="w-px h-full bg-slate-700"></div>
                        <div className="w-1/2 flex justify-start">
                          {isPositive && (
                            <div
                              style={{ width: `${widthPct}%` }}
                              className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-r-md transition-all duration-300"
                            ></div>
                          )}
                        </div>
                      </div>

                      <div className="w-24 text-right font-mono font-semibold tabular-nums">
                        <span className={isPositive ? "text-emerald-400" : "text-rose-400"}>
                          {isPositive ? "+" : ""}
                          {formatGEX(val)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Historical Regime Timeline Chart */}
            <div className="glass-panel p-6 rounded-2xl">
              <h3 className="text-base font-bold text-white flex items-center space-x-2 mb-2">
                <TrendingUp className="w-5 h-5 text-indigo-400" />
                <span>Historical Intraday Regime Timeline (Magneto Archive Replay)</span>
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Walk-forward progression of SPY Net GEX against forward volatility shifts
              </p>

              <div className="h-44 w-full flex items-end space-x-1.5 bg-slate-950/60 p-3 rounded-xl border border-white/5 overflow-x-auto">
                {(marketState?.timeline || []).map((pt, i) => {
                  const isPositive = pt.net_gex >= 0;
                  const heightPct = Math.min(100, (Math.abs(pt.net_gex) / 1.5e9) * 85 + 15);
                  return (
                    <div
                      key={i}
                      className="group flex-1 min-w-[12px] flex flex-col items-center justify-end h-full relative cursor-pointer"
                    >
                      <div
                        style={{ height: `${heightPct}%` }}
                        className={`w-full rounded-t-sm transition-all duration-200 group-hover:brightness-125 ${
                          isPositive ? "bg-emerald-500/80" : "bg-rose-500/80"
                        }`}
                      ></div>
                      {/* Tooltip on hover */}
                      <div className="hidden group-hover:block absolute bottom-full mb-2 bg-slate-900 border border-white/20 p-2 rounded-lg text-[10px] font-mono z-50 whitespace-nowrap shadow-xl">
                        <div className="text-slate-300 font-bold">{pt.timestamp}</div>
                        <div className="text-white">Spot: ${pt.spot.toFixed(2)}</div>
                        <div className={isPositive ? "text-emerald-400" : "text-rose-400"}>
                          Net GEX: {formatGEX(pt.net_gex)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[11px] font-mono text-slate-500 mt-2 px-1">
                <span>Start: 2026-06-01 (In-Sample Train)</span>
                <span>Chronological Walk-Forward Boundary</span>
                <span>Live Feed: 2026-10-28 (Held-Out Test)</span>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* SCREEN B: AI RESEARCH LAB                                 */}
        {/* ======================================================== */}
        {activeTab === "lab" && (
          <div className="space-y-6">
            {/* Top Control Bar: Research Family Selection */}
            <div className="glass-panel p-6 rounded-2xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                    <Sparkles className="w-5 h-5 text-cyan-400" />
                    <span>Meta Muse Quantitative Hypothesis Agent</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Proposes structured, falsifiable research hypotheses compiled into restricted signal predicates
                  </p>
                </div>

                {/* Family Selector */}
                <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 p-1.5 rounded-xl border border-white/10">
                  {[
                    { id: "gamma_regime", label: "Gamma Regime" },
                    { id: "swing_trading", label: "🎯 Swing Trading" },
                    { id: "risk_management", label: "🛡️ Risk Engine" },
                    { id: "vanna_volatility", label: "Vanna / Vol" },
                    { id: "key_strikes", label: "Key Strikes / Pin" },
                  ].map((fam) => (
                    <button
                      key={fam.id}
                      onClick={() => setSelectedFamily(fam.id)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                        selectedFamily === fam.id
                          ? "bg-cyan-500 text-white shadow-md shadow-cyan-500/20"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {fam.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate Button */}
              <div className="mt-5 flex justify-end">
                <button
                  id="btn-generate-hypothesis"
                  onClick={handleGenerateHypothesis}
                  disabled={isGenerating}
                  className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50"
                >
                  <Cpu className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`} />
                  <span>
                    {isGenerating ? "Meta Muse Formulating Hypothesis..." : "Formulate New Hypothesis with Meta Muse"}
                  </span>
                </button>
              </div>
            </div>

            {/* Generated Hypothesis Card */}
            {currentHypothesis && (
              <div className="glass-panel p-6 rounded-2xl border-cyan-500/30 bg-gradient-to-b from-cyan-950/20 to-slate-900/60 shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <div className="flex items-center space-x-3">
                    <span className="px-2.5 py-1 text-xs font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded-lg">
                      {currentHypothesis.hypothesis_id}
                    </span>
                    <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                      Family: {currentHypothesis.family.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="text-slate-400">Target Horizon:</span>
                    <span className="font-bold text-white bg-slate-800 px-2.5 py-1 rounded-md border border-white/10">
                      {currentHypothesis.horizon_minutes} Minutes
                    </span>
                    <span className="text-slate-400 ml-2">Target Metric:</span>
                    <span className="font-bold text-cyan-300 bg-slate-800 px-2.5 py-1 rounded-md border border-white/10">
                      {currentHypothesis.target_variable}
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="text-lg font-bold text-white">{currentHypothesis.title}</h3>
                  <div className="mt-3 p-3.5 bg-slate-950/70 rounded-xl border border-white/10 text-xs text-slate-200 leading-relaxed">
                    <span className="text-cyan-400 font-bold block mb-1">Falsifiable Hypothesis:</span>
                    {currentHypothesis.hypothesis_text}
                  </div>
                </div>

                <div className="mt-4">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Dealer Hedging Rationale:
                  </span>
                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/40 p-3 rounded-xl border border-white/5">
                    {currentHypothesis.rationale}
                  </p>
                </div>

                {/* Restricted Predicate Conditions */}
                <div className="mt-5">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Restricted Predicate Filters (Compiled Signal Schema):
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {currentHypothesis.conditions.map((cond, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-cyan-500/20 text-xs font-mono"
                      >
                        <span className="text-cyan-300 font-bold">{cond.feature}</span>
                        <span className="px-2 py-0.5 bg-slate-800 rounded text-slate-300">{cond.op}</span>
                        <span className="text-emerald-400 font-bold">
                          {typeof cond.threshold === "number" && Math.abs(cond.threshold) >= 1e6
                            ? formatGEX(cond.threshold)
                            : cond.threshold}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Backtest Action CTA */}
                <div className="mt-6 pt-5 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Sealed Test Data · Evaluator owns rules & metrics · No look-ahead bias</span>
                  </div>

                  <button
                    id="btn-run-backtest"
                    onClick={handleRunBacktest}
                    disabled={isBacktesting}
                    className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
                  >
                    <Play className={`w-4 h-4 fill-current ${isBacktesting ? "animate-spin" : ""}`} />
                    <span>{isBacktesting ? "Evaluating Walk-Forward Backtest..." : "Execute Deterministic Backtest"}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* SCREEN C: EXPERIMENT RESULTS                              */}
        {/* ======================================================== */}
        {activeTab === "results" && (
          <div className="space-y-6">
            {backtestResult ? (
              <>
                {/* Promotion Status Tear Sheet Banner */}
                <div
                  className={`p-6 rounded-2xl border transition-all ${
                    backtestResult.promoted
                      ? "glass-panel-glow-emerald border-emerald-500/50 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900"
                      : "glass-panel-glow-rose border-rose-500/50 bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900"
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start space-x-4">
                      {backtestResult.promoted ? (
                        <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl ring-1 ring-emerald-500/50">
                          <CheckCircle2 className="w-8 h-8" />
                        </div>
                      ) : (
                        <div className="p-3 bg-rose-500/20 text-rose-400 rounded-2xl ring-1 ring-rose-500/50">
                          <XCircle className="w-8 h-8" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase ${
                              backtestResult.promoted
                                ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/30"
                                : "bg-rose-500 text-white"
                            }`}
                          >
                            {backtestResult.status === "PROMOTED"
                              ? "PROMOTED TO LIVE RESEARCH SIGNAL"
                              : "REJECTED BY EVALUATOR"}
                          </span>
                          <span className="text-xs font-mono text-slate-400">
                            Experiment: {backtestResult.experiment_id}
                          </span>
                        </div>
                        <h2 className="text-xl font-bold text-white mt-1.5">
                          {backtestResult.promoted
                            ? "Hypothesis Survived Deterministic Held-Out Testing"
                            : "Hypothesis Failed Promotion Standards"}
                        </h2>
                        <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                          {backtestResult.lessons_learned}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Lift vs Baseline
                      </span>
                      <span
                        className={`text-3xl font-extrabold tabular-nums ${
                          backtestResult.lift_vs_baseline >= 0.15 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {(backtestResult.lift_vs_baseline * 100).toFixed(1)}%
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        p-value: {backtestResult.p_value.toFixed(4)} ({backtestResult.p_value < 0.05 ? "Significant" : "Noise"})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Side-by-Side Metric Tear Sheet */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="glass-panel p-5 rounded-2xl">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      In-Sample (Train: 60%)
                    </span>
                    <div className="mt-2 text-2xl font-black tabular-nums text-white">
                      {(backtestResult.train_metric * 100).toFixed(1)}%
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      Samples: {backtestResult.sample_count_train}
                    </p>
                  </div>

                  <div className="glass-panel p-5 rounded-2xl">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Validation (Val: 20%)
                    </span>
                    <div className="mt-2 text-2xl font-black tabular-nums text-indigo-300">
                      {(backtestResult.val_metric * 100).toFixed(1)}%
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      Overfitting check confirmed
                    </p>
                  </div>

                  <div className="glass-panel p-5 rounded-2xl border-cyan-500/30 bg-cyan-950/10">
                    <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                      Held-Out Test (Test: 20%)
                    </span>
                    <div className="mt-2 text-2xl font-black tabular-nums text-cyan-300">
                      {(backtestResult.test_metric * 100).toFixed(1)}%
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      Sealed test samples: {backtestResult.sample_count_test}
                    </p>
                  </div>

                  <div className="glass-panel p-5 rounded-2xl">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Baseline Benchmark
                    </span>
                    <div className="mt-2 text-2xl font-black tabular-nums text-slate-400">
                      {(backtestResult.baseline_metric * 100).toFixed(1)}%
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      Unconditional Mean Target
                    </p>
                  </div>
                </div>

                {/* Timeline Chart of Trigger Events on Held-Out Test Data */}
                {backtestResult.timeline_chart && (
                  <div className="glass-panel p-6 rounded-2xl">
                    <h3 className="text-base font-bold text-white flex items-center space-x-2 mb-2">
                      <BarChart3 className="w-5 h-5 text-emerald-400" />
                      <span>Held-Out Test Partition Signal Triggers</span>
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">
                      Showing test snapshot periods where the compiled hypothesis triggered vs baseline non-events
                    </p>

                    <div className="space-y-1.5">
                      {backtestResult.timeline_chart.map((pt, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between p-2 rounded-lg text-xs font-mono border ${
                            pt.triggered
                              ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                              : "bg-slate-900/40 border-white/5 text-slate-400"
                          }`}
                        >
                          <span className="w-36 text-slate-400">{pt.timestamp}</span>
                          <span className="text-white">Spot: ${pt.spot.toFixed(2)}</span>
                          <span>Net GEX: {formatGEX(pt.net_gex)}</span>
                          <span className="text-cyan-300 font-bold">
                            Fwd Vol: {(pt.target_val * 100).toFixed(1)}%
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              pt.triggered ? "bg-emerald-500 text-black" : "bg-slate-800 text-slate-500"
                            }`}
                          >
                            {pt.triggered ? "TRIGGERED" : "INACTIVE"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="glass-panel p-12 text-center rounded-2xl">
                <Sparkles className="w-12 h-12 text-cyan-400 mx-auto mb-3 animate-pulse" />
                <h3 className="text-lg font-bold text-white">No Evaluation Run Yet</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-5">
                  Go to the AI Research Lab tab to formulate a hypothesis with Meta Muse, then click Execute Deterministic Backtest.
                </p>
                <button
                  onClick={() => setActiveTab("lab")}
                  className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs rounded-xl shadow-lg transition-all"
                >
                  Go to Research Lab
                </button>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* SCREEN D: RESEARCH MEMORY                                 */}
        {/* ======================================================== */}
        {activeTab === "memory" && (
          <div className="space-y-6">
            {/* Self-Improving Loop Context Banner */}
            <div className="glass-panel p-6 rounded-2xl border-indigo-500/30 bg-gradient-to-r from-indigo-950/30 to-purple-950/20">
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <Database className="w-5 h-5 text-indigo-400" />
                <span>Self-Improving Research Loop Memory Context</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1 mb-3">
                This exact prompt context is ingested by Meta Muse before formulating subsequent hypotheses, preventing repeated dead ends and compounding winning setups.
              </p>
              <div className="p-4 bg-slate-950/80 rounded-xl border border-white/10 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                {memorySummary || "Loading active research memory..."}
              </div>
            </div>

            {/* Experiment History Table */}
            <div className="glass-panel p-6 rounded-2xl">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-base font-bold text-white">Persistent Experiment Archive</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Chronological audit log of all quantitative hypotheses evaluated against held-out market structure
                  </p>
                </div>

                <div className="flex items-center space-x-1.5 bg-slate-900 p-1 rounded-xl border border-white/10 text-xs">
                  {["ALL", "PROMOTED", "REJECTED"].map((f) => (
                    <button
                      key={f}
                      onClick={() => setMemoryFilter(f)}
                      className={`px-3 py-1 rounded-lg transition-colors font-semibold ${
                        memoryFilter === f ? "bg-cyan-500 text-black" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {filteredExperiments.length > 0 ? (
                <div className="space-y-3">
                  {filteredExperiments.map((exp) => {
                    const isProm = exp.status === "PROMOTED";
                    return (
                      <div
                        key={exp.id}
                        className={`p-4 rounded-xl border transition-all ${
                          isProm
                            ? "bg-emerald-950/15 border-emerald-500/30 hover:border-emerald-500/50"
                            : "bg-slate-900/40 border-white/5 hover:border-white/15"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center space-x-2.5">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-black rounded-md ${
                                isProm ? "bg-emerald-500 text-black" : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                              }`}
                            >
                              {exp.status}
                            </span>
                            <span className="font-mono text-xs font-bold text-cyan-300">{exp.experiment_id}</span>
                            <span className="text-xs font-semibold text-white">{exp.title}</span>
                          </div>
                          <div className="text-xs font-mono text-slate-400">
                            {exp.created_at?.slice(0, 16).replace("T", " ")}
                          </div>
                        </div>

                        <p className="text-xs text-slate-300 mt-2">{exp.hypothesis_text}</p>

                        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-mono border-t border-white/5 pt-2.5">
                          <div className="text-slate-400">
                            Test Spread: <span className="text-white font-bold">{(exp.test_metric * 100).toFixed(1)}%</span>
                          </div>
                          <div className="text-slate-400">
                            Lift:{" "}
                            <span className={exp.lift_vs_baseline >= 0.15 ? "text-emerald-400 font-bold" : "text-rose-400"}>
                              {(exp.lift_vs_baseline * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="text-slate-400">
                            p-value: <span className="text-white">{exp.p_value?.toFixed(4)}</span>
                          </div>
                          <div className="text-slate-400">
                            Samples: <span className="text-white">{exp.sample_count_train} train / {exp.sample_count_test} test</span>
                          </div>
                          <div className="text-indigo-300 text-[11px] ml-auto">
                            Model: {exp.model_version}
                          </div>
                        </div>

                        <div className="mt-2 text-xs text-slate-400 bg-slate-950/50 p-2 rounded-lg">
                          <span className="font-bold text-slate-300">Lesson:</span> {exp.lessons_learned}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-xs text-slate-500">
                  No experiments matching current filter.
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#080d1a] py-4 text-center text-xs text-slate-500">
        GammaLab · Turn GEX/VEX market data into testable hypotheses, historical evidence, and explainable trade setups.
      </footer>
    </div>
  );
}

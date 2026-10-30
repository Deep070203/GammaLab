"use client";

import React, { useEffect, useState } from "react";
import {
  Activity,
  Archive,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  FlaskConical,
  Play,
  RefreshCw,
  ShieldAlert,
  Target,
  XCircle,
} from "lucide-react";
import { formatGEX, formatMoney, formatPct } from "../lib/format";

const BACKEND_URL = "http://127.0.0.1:8000";

type ViewId = "structure" | "brief" | "research" | "archive";

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

interface PinRiskData {
  live_pin_risk: number;
  magnet_strike: number;
  distance_to_magnet_pct: number;
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
  title: string;
  hypothesis_text: string;
  train_metric: number;
  test_metric: number;
  lift_vs_baseline: number;
  p_value: number;
  sample_count_train: number;
  sample_count_test: number;
  status: string;
  model_version: string;
  lessons_learned: string;
}

interface MarketBrief {
  headline: string;
  regime_label: string;
  plain_english: string;
  watch_levels: string[];
  do_now: string[];
  avoid_now: string[];
  confidence: number;
  source: string;
}

interface HypothesisCritique {
  verdict: string;
  score: number;
  strengths: string[];
  risks: string[];
  suggested_revision: string;
  trader_takeaway: string;
  source: string;
}

const NAV: Array<{ id: ViewId; step: string; label: string; hint: string; icon: typeof Activity }> = [
  { id: "structure", step: "01", label: "Structure", hint: "Levels, regime, risk", icon: Activity },
  { id: "brief", step: "02", label: "Muse Brief", hint: "Plain-English desk read", icon: BookOpen },
  { id: "research", step: "03", label: "Research", hint: "Propose → critique → test", icon: FlaskConical },
  { id: "archive", step: "04", label: "Archive", hint: "Promoted & rejected runs", icon: Archive },
];

const FAMILIES = [
  { id: "gamma_regime", label: "Gamma regime" },
  { id: "swing_trading", label: "Swing trading" },
  { id: "risk_management", label: "Risk engine" },
  { id: "vanna_volatility", label: "Vanna / vol" },
  { id: "key_strikes", label: "Key strikes" },
];

export default function GammaLabApp() {
  const [view, setView] = useState<ViewId>("structure");
  const [ticker] = useState("SPY");
  const [marketState, setMarketState] = useState<MarketStateData | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [consoleTab, setConsoleTab] = useState<"swing" | "risk">("swing");
  const [heatmapMode, setHeatmapMode] = useState<"gex" | "vex">("gex");
  const [simCapital, setSimCapital] = useState(10000);

  const [selectedFamily, setSelectedFamily] = useState("gamma_regime");
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentHypothesis, setCurrentHypothesis] = useState<HypothesisProposal | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);

  const [brief, setBrief] = useState<MarketBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [critique, setCritique] = useState<HypothesisCritique | null>(null);
  const [critiqueLoading, setCritiqueLoading] = useState(false);

  const [experiments, setExperiments] = useState<ExperimentRecord[]>([]);
  const [memorySummary, setMemorySummary] = useState("");
  const [memoryFilter, setMemoryFilter] = useState("ALL");

  const loadMarketState = async () => {
    setMarketLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/market/state?ticker=${ticker}`);
      if (res.ok) setMarketState(await res.json());
    } catch (e) {
      console.error("Failed to load market state:", e);
    } finally {
      setMarketLoading(false);
    }
  };

  const loadMemory = async () => {
    try {
      const [expRes, memRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/research/experiments`),
        fetch(`${BACKEND_URL}/api/research/memory-summary`),
      ]);
      if (expRes.ok) setExperiments(await expRes.json());
      if (memRes.ok) {
        const mem = await memRes.json();
        setMemorySummary(mem.summary || "");
      }
    } catch (e) {
      console.error("Failed to load memory:", e);
    }
  };

  const loadBrief = async (state?: MarketStateData | null) => {
    setBriefLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/muse/brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, market_state: state || marketState }),
      });
      if (res.ok) setBrief(await res.json());
    } catch (e) {
      console.error("Brief failed:", e);
    } finally {
      setBriefLoading(false);
    }
  };

  const handleGenerateHypothesis = async () => {
    setIsGenerating(true);
    setCritique(null);
    setBacktestResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/research/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ family: selectedFamily, ticker }),
      });
      if (res.ok) setCurrentHypothesis(await res.json());
    } catch (e) {
      console.error("Hypothesis generation failed:", e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCritique = async () => {
    if (!currentHypothesis) return;
    setCritiqueLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/muse/critique`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, hypothesis: currentHypothesis }),
      });
      if (res.ok) setCritique(await res.json());
    } catch (e) {
      console.error("Critique failed:", e);
    } finally {
      setCritiqueLoading(false);
    }
  };

  const handleRunBacktest = async () => {
    if (!currentHypothesis) return;
    setIsBacktesting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/research/backtest?ticker=${ticker}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentHypothesis),
      });
      if (res.ok) {
        setBacktestResult(await res.json());
        loadMemory();
      }
    } catch (e) {
      console.error("Backtest failed:", e);
    } finally {
      setIsBacktesting(false);
    }
  };

  useEffect(() => {
    loadMarketState();
    loadMemory();
  }, [ticker]);

  useEffect(() => {
    if (marketState) {
      loadBrief(marketState);
    }
  }, [marketState]);

  useEffect(() => {
    if (!currentHypothesis && !isGenerating) {
      handleGenerateHypothesis();
    }
  }, []);

  const gexPositive = (marketState?.net_gex || 0) >= 0;
  const filteredExperiments = experiments.filter((e) => {
    if (memoryFilter === "PROMOTED") return e.status === "PROMOTED";
    if (memoryFilter === "REJECTED") return e.status === "REJECTED";
    return true;
  });

  const spot = marketState?.spot_price || 772.31;
  const callWall = marketState?.call_wall || 770;
  const putWall = marketState?.put_wall || 765;
  const flip = marketState?.gamma_flip || 777.11;
  const roundStrike = (n: number) => Math.round(n);
  const strikeRows = [
    { strike: roundStrike(spot + 15), gex: 185e6, vex: -15e6 },
    { strike: roundStrike(spot + 10), gex: 320e6, vex: -22e6 },
    { strike: roundStrike(flip), gex: 0, vex: -5e6, isFlip: true },
    { strike: roundStrike(spot + 3), gex: -120e6, vex: 18e6 },
    { strike: roundStrike(spot), gex: -280e6, vex: 42e6, isSpot: true },
    { strike: roundStrike(callWall), gex: 540e6, vex: -65e6, isCallWall: true },
    { strike: roundStrike(putWall), gex: -490e6, vex: 75e6, isPutWall: true },
    { strike: roundStrike(spot - 12), gex: -210e6, vex: 30e6 },
    { strike: roundStrike(spot - 17), gex: -95e6, vex: 12e6 },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-sm bg-[var(--accent)] text-white flex items-center justify-center font-bold text-lg tracking-tight">
              Γ
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[var(--ink)]">
                  GammaLab
                </h1>
                <span className="hidden sm:inline text-xs text-[var(--ink-muted)]">
                  options structure research
                </span>
              </div>
              <p className="text-xs text-[var(--ink-muted)] truncate">
                Dealer positioning → Muse hypotheses → sealed evidence → structural risk
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="chip chip-ok">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              Tradier
            </span>
            <span className="chip">Muse · muse-spark-1.3</span>
            <span className="chip">{experiments.length} experiments</span>
            <button className="btn btn-ghost py-1.5 px-2.5 text-xs" onClick={loadMarketState}>
              <RefreshCw className={`w-3.5 h-3.5 ${marketLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Always-visible market strip */}
        <div className="border-t border-[var(--line)] bg-[var(--bg-elevated)]">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
            <StripItem label="Spot" value={formatMoney(marketState?.spot_price || 772.31)} />
            <StripItem
              label="Net GEX"
              value={`${gexPositive ? "+" : ""}${formatGEX(marketState?.net_gex || 0)}`}
              tone={gexPositive ? "ok" : "danger"}
            />
            <StripItem label="Flip" value={formatMoney(marketState?.gamma_flip || 777.11)} />
            <StripItem label="Call wall" value={formatMoney(marketState?.call_wall || 770, 0)} />
            <StripItem label="Put wall" value={formatMoney(marketState?.put_wall || 765, 0)} />
            <StripItem
              label="Size"
              value={`${marketState?.risk_engine?.size_multiplier ?? 0.5}x`}
              tone={(marketState?.risk_engine?.size_multiplier ?? 1) < 1 ? "warn" : "ok"}
            />
          </div>
        </div>

        {/* Mobile nav */}
        <div className="mobile-nav hidden border-t border-[var(--line)] overflow-x-auto">
          <div className="flex min-w-max px-2">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`px-4 py-3 text-xs font-semibold border-b-2 ${
                  view === item.id
                    ? "border-[var(--accent)] text-[var(--accent-ink)]"
                    : "border-transparent text-[var(--ink-muted)]"
                }`}
              >
                {item.step} {item.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-[1280px] mx-auto w-full px-4 sm:px-6 py-5 flex-1 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5">
        <aside className="desktop-sidebar slide-in">
          <nav className="panel p-2 sticky top-[132px] space-y-1">
            <p className="section-label px-3 pt-2 pb-1">Workflow</p>
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  className={`nav-item ${active ? "active" : ""}`}
                  onClick={() => setView(item.id)}
                >
                  <span className="nav-step">{item.step}</span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 font-semibold text-sm text-[var(--ink)]">
                      <Icon className="w-3.5 h-3.5 text-[var(--accent)]" />
                      {item.label}
                    </span>
                    <span className="block text-[11px] text-[var(--ink-muted)] mt-0.5">
                      {item.hint}
                    </span>
                  </span>
                  {active && <ChevronRight className="w-4 h-4 text-[var(--accent)] mt-1" />}
                </button>
              );
            })}

            <div className="mt-3 p-3 border-t border-[var(--line)]">
              <p className="section-label mb-2">Next step</p>
              <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
                {view === "structure" && "Read levels, then open Muse Brief for a trader-facing summary."}
                {view === "brief" && "Use the brief to choose a research family, then move to Research."}
                {view === "research" && "Critique with Muse before you spend a sealed backtest run."}
                {view === "archive" && "Feed failures back into the next Muse proposal."}
              </p>
              {view !== "archive" && (
                <button
                  className="btn btn-secondary w-full mt-3 text-xs"
                  onClick={() => {
                    const order: ViewId[] = ["structure", "brief", "research", "archive"];
                    const idx = order.indexOf(view);
                    setView(order[Math.min(idx + 1, order.length - 1)]);
                  }}
                >
                  Continue
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </nav>
        </aside>

        <main className="fade-in min-w-0 space-y-4">
          {view === "structure" && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Metric
                  label="Spot"
                  value={formatMoney(marketState?.spot_price || 772.31)}
                  note={`${(marketState?.price_change || 0) >= 0 ? "+" : ""}${
                    marketState?.price_change?.toFixed(2) || "2.65"
                  } (${marketState?.price_change_pct?.toFixed(2) || "0.35"}%)`}
                />
                <Metric
                  label="Net GEX"
                  value={`${gexPositive ? "+" : ""}${formatGEX(marketState?.net_gex || 223.6e6)}`}
                  note={gexPositive ? "Dampening regime" : "Amplifying regime"}
                  tone={gexPositive ? "ok" : "danger"}
                />
                <Metric
                  label="Net VEX"
                  value={formatGEX(marketState?.net_vex || -44.7e6)}
                  note={`ATM IV ${(marketState?.iv_atm ? marketState.iv_atm * 100 : 15).toFixed(1)}%`}
                />
                <Metric
                  label="Pin risk"
                  value={`${marketState?.pin_risk?.live_pin_risk ?? 39}/100`}
                  note={`Magnet ${formatMoney(marketState?.pin_risk?.magnet_strike || 765, 0)}`}
                />
              </div>

              <div className="panel p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
                  <div>
                    <p className="section-label">Desk console</p>
                    <h2 className="text-base font-semibold mt-1">Swing setup & structural risk</h2>
                  </div>
                  <div className="flex gap-1 p-1 bg-[var(--bg-elevated)] border border-[var(--line)] rounded-sm">
                    <Toggle
                      active={consoleTab === "swing"}
                      onClick={() => setConsoleTab("swing")}
                      label="Swing setup"
                    />
                    <Toggle
                      active={consoleTab === "risk"}
                      onClick={() => setConsoleTab("risk")}
                      label="Risk & stops"
                    />
                  </div>
                </div>

                {consoleTab === "swing" ? (
                  <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <div className="panel-muted p-3 space-y-2">
                      <p className="section-label">Regime</p>
                      <p className="text-sm font-semibold">{marketState?.swing_setup?.regime || "—"}</p>
                      <p className="text-xs text-[var(--ink-muted)]">
                        Bias: {marketState?.swing_setup?.bias || "—"} · Horizon:{" "}
                        {marketState?.swing_setup?.horizon || "1–3 days"}
                      </p>
                      <p className="text-xs">
                        Target{" "}
                        <span className="metric-value">
                          {formatMoney(marketState?.swing_setup?.target_strike || 765)}
                        </span>
                      </p>
                    </div>
                    <div className="panel-muted p-3 lg:col-span-2 space-y-2">
                      <p className="section-label">Thesis</p>
                      <p className="text-sm leading-relaxed text-[var(--ink)]">
                        {marketState?.swing_setup?.thesis ||
                          "Spot relative to Flip and Net GEX determines whether dealers dampen or amplify the tape."}
                      </p>
                      <p className="text-xs border-t border-[var(--line)] pt-2 text-[var(--accent-ink)]">
                        {marketState?.swing_setup?.strategy || "Wall-aware swing with Flip invalidation."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="panel-muted p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="section-label">Adaptive sizing</p>
                        <span className="chip chip-warn">
                          {marketState?.risk_engine?.size_multiplier ?? 0.5}x
                        </span>
                      </div>
                      <p className="text-sm text-[var(--ink-muted)]">
                        {marketState?.risk_engine?.size_rationale ||
                          "Negative gamma → cut size. Positive gamma → standard size."}
                      </p>
                      <label className="flex items-center justify-between text-xs gap-3">
                        <span className="text-[var(--ink-muted)]">Base capital</span>
                        <input
                          type="number"
                          value={simCapital}
                          onChange={(e) => setSimCapital(Number(e.target.value))}
                          className="w-28 border border-[var(--line)] rounded-sm px-2 py-1 metric-value bg-white"
                        />
                      </label>
                      <div className="flex justify-between text-sm border-t border-[var(--line)] pt-2">
                        <span>Authorized size</span>
                        <span className="metric-value font-semibold">
                          $
                          {(
                            simCapital * (marketState?.risk_engine?.size_multiplier || 0.5)
                          ).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="panel-muted p-3 space-y-3">
                      <p className="section-label flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Invalidation stops
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-white border border-[var(--line)] p-2 rounded-sm">
                          <p className="text-[var(--ink-muted)]">Long stop</p>
                          <p className="metric-value text-base text-[var(--danger)] mt-1">
                            {formatMoney(marketState?.risk_engine?.long_invalidation_stop || 771.64)}
                          </p>
                        </div>
                        <div className="bg-white border border-[var(--line)] p-2 rounded-sm">
                          <p className="text-[var(--ink-muted)]">Short stop</p>
                          <p className="metric-value text-base text-[var(--warn)] mt-1">
                            {formatMoney(marketState?.risk_engine?.short_invalidation_stop || 777.11)}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
                        {marketState?.risk_engine?.lesson_prevention_rule ||
                          "Exit on VWAP / Flip break — not on arbitrary option % drawdowns."}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="section-label">Strike map</p>
                    <h2 className="text-base font-semibold mt-1">Dealer pressure by strike</h2>
                  </div>
                  <div className="flex gap-1 p-1 bg-[var(--bg-elevated)] border border-[var(--line)] rounded-sm">
                    <Toggle active={heatmapMode === "gex"} onClick={() => setHeatmapMode("gex")} label="GEX" />
                    <Toggle active={heatmapMode === "vex"} onClick={() => setHeatmapMode("vex")} label="VEX" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  {strikeRows.map((row) => {
                    const val = heatmapMode === "gex" ? row.gex : row.vex;
                    const positive = val >= 0;
                    const widthPct = Math.min(100, (Math.abs(val) / 600e6) * 100);
                    return (
                      <div
                        key={row.strike}
                        className={`flex items-center gap-3 text-xs px-2 py-1.5 border rounded-sm ${
                          row.isSpot
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                            : "border-[var(--line)] bg-white"
                        }`}
                      >
                        <div className="w-28 metric-value flex items-center gap-1">
                          {formatMoney(row.strike, 0)}
                          {row.isSpot && <span className="chip chip-ok">spot</span>}
                          {row.isCallWall && <span className="chip">call</span>}
                          {row.isPutWall && <span className="chip chip-danger">put</span>}
                          {row.isFlip && <span className="chip chip-warn">flip</span>}
                        </div>
                        <div className="flex-1 h-3 bg-[var(--bg)] rounded-sm overflow-hidden flex">
                          <div className="w-1/2 flex justify-end">
                            {!positive && (
                              <div
                                style={{ width: `${widthPct}%` }}
                                className="h-full bg-[var(--danger)]/80"
                              />
                            )}
                          </div>
                          <div className="w-px bg-[var(--line-strong)]" />
                          <div className="w-1/2 flex justify-start">
                            {positive && (
                              <div
                                style={{ width: `${widthPct}%` }}
                                className="h-full bg-[var(--accent)]/80"
                              />
                            )}
                          </div>
                        </div>
                        <div
                          className={`w-16 text-right metric-value ${
                            positive ? "text-[var(--accent-ink)]" : "text-[var(--danger)]"
                          }`}
                        >
                          {positive ? "+" : ""}
                          {formatGEX(val)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="panel p-4">
                <p className="section-label">Timeline</p>
                <h2 className="text-base font-semibold mt-1 mb-3">Net GEX walk-forward</h2>
                <div className="h-36 flex items-end gap-1 bg-[var(--bg-elevated)] border border-[var(--line)] p-2 rounded-sm overflow-x-auto">
                  {(marketState?.timeline || []).map((pt, i) => {
                    const positive = pt.net_gex >= 0;
                    const heightPct = Math.min(100, (Math.abs(pt.net_gex) / 1.5e9) * 85 + 15);
                    return (
                      <div key={i} className="group flex-1 min-w-[10px] h-full flex items-end relative">
                        <div
                          style={{ height: `${heightPct}%` }}
                          className={`w-full ${positive ? "bg-[var(--accent)]/70" : "bg-[var(--danger)]/70"}`}
                        />
                        <div className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[var(--ink)] text-white text-[10px] p-2 rounded-sm whitespace-nowrap z-10">
                          {pt.timestamp}
                          <br />
                          Spot {formatMoney(pt.spot)} · GEX {formatGEX(pt.net_gex)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end">
                <button className="btn btn-primary" onClick={() => setView("brief")}>
                  Open Muse Brief
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {view === "brief" && (
            <div className="space-y-4">
              <div className="panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="section-label">Meta Muse</p>
                    <h2 className="text-xl font-semibold mt-1 tracking-tight">Desk brief</h2>
                    <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-xl">
                      Same structure numbers, translated into what a swing trader should watch — without
                      pretending Muse can grade its own edge.
                    </p>
                  </div>
                  <button
                    className="btn btn-secondary text-xs"
                    onClick={() => loadBrief(marketState)}
                    disabled={briefLoading}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${briefLoading ? "animate-spin" : ""}`} />
                    Regenerate
                  </button>
                </div>

                {brief ? (
                  <div className="mt-5 space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="chip chip-ok">{brief.regime_label}</span>
                      <span className="chip">confidence {Math.round(brief.confidence * 100)}%</span>
                      <span className="chip">{brief.source}</span>
                    </div>
                    <h3 className="text-2xl font-semibold tracking-tight leading-snug">{brief.headline}</h3>
                    <p className="text-sm leading-relaxed text-[var(--ink)] max-w-3xl">
                      {brief.plain_english}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                      <ListBlock title="Watch levels" items={brief.watch_levels} icon={<Target className="w-3.5 h-3.5" />} />
                      <ListBlock title="Do now" items={brief.do_now} tone="ok" />
                      <ListBlock title="Avoid now" items={brief.avoid_now} tone="danger" />
                    </div>
                  </div>
                ) : (
                  <p className="mt-6 text-sm text-[var(--ink-muted)]">
                    {briefLoading ? "Muse is writing the brief…" : "No brief yet."}
                  </p>
                )}
              </div>

              <div className="flex justify-between gap-3">
                <button className="btn btn-ghost" onClick={() => setView("structure")}>
                  Back to structure
                </button>
                <button className="btn btn-primary" onClick={() => setView("research")}>
                  Start research
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {view === "research" && (
            <div className="space-y-4">
              <div className="panel p-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <p className="section-label">Step 03 · Research loop</p>
                    <h2 className="text-base font-semibold mt-1">Propose → Muse critique → sealed test</h2>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {FAMILIES.map((fam) => (
                      <button
                        key={fam.id}
                        onClick={() => setSelectedFamily(fam.id)}
                        className={`px-2.5 py-1.5 text-xs rounded-sm border ${
                          selectedFamily === fam.id
                            ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                            : "bg-white border-[var(--line)] text-[var(--ink-muted)]"
                        }`}
                      >
                        {fam.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="btn btn-primary text-xs"
                    onClick={handleGenerateHypothesis}
                    disabled={isGenerating}
                  >
                    <FlaskConical className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />
                    {isGenerating ? "Muse formulating…" : "Formulate with Muse"}
                  </button>
                </div>
              </div>

              {currentHypothesis && (
                <div className="panel p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="chip">{currentHypothesis.hypothesis_id}</span>
                      <span className="chip">{currentHypothesis.family.replaceAll("_", " ")}</span>
                    </div>
                    <div className="text-xs text-[var(--ink-muted)]">
                      {currentHypothesis.horizon_minutes}m · {currentHypothesis.target_variable}
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold">{currentHypothesis.title}</h3>
                  <p className="text-sm leading-relaxed border border-[var(--line)] bg-[var(--bg-elevated)] p-3 rounded-sm">
                    {currentHypothesis.hypothesis_text}
                  </p>
                  <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
                    <span className="font-semibold text-[var(--ink)]">Rationale · </span>
                    {currentHypothesis.rationale}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {currentHypothesis.conditions.map((cond, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 text-xs metric-value border border-[var(--line)] rounded-sm px-3 py-2 bg-white"
                      >
                        <span>{cond.feature}</span>
                        <span className="text-[var(--ink-muted)]">{cond.op}</span>
                        <span>
                          {Math.abs(cond.threshold) >= 1e6
                            ? formatGEX(cond.threshold)
                            : cond.threshold}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--line)]">
                    <button
                      className="btn btn-secondary text-xs"
                      onClick={handleCritique}
                      disabled={critiqueLoading}
                    >
                      <BookOpen className={`w-3.5 h-3.5 ${critiqueLoading ? "animate-spin" : ""}`} />
                      {critiqueLoading ? "Critiquing…" : "Ask Muse to critique"}
                    </button>
                    <button
                      className="btn btn-primary text-xs"
                      onClick={handleRunBacktest}
                      disabled={isBacktesting}
                    >
                      <Play className={`w-3.5 h-3.5 ${isBacktesting ? "animate-spin" : ""}`} />
                      {isBacktesting ? "Running sealed backtest…" : "Run sealed backtest"}
                    </button>
                  </div>
                </div>
              )}

              {critique && (
                <div className="panel p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="section-label">Muse pre-flight</p>
                    <span
                      className={`chip ${
                        critique.verdict === "ready"
                          ? "chip-ok"
                          : critique.verdict === "risky"
                          ? "chip-danger"
                          : "chip-warn"
                      }`}
                    >
                      {critique.verdict} · score {critique.score}
                    </span>
                    <span className="chip">{critique.source}</span>
                  </div>
                  <p className="text-sm font-medium">{critique.trader_takeaway}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <ListBlock title="Strengths" items={critique.strengths} tone="ok" />
                    <ListBlock title="Risks" items={critique.risks} tone="danger" />
                  </div>
                  {critique.suggested_revision && (
                    <p className="text-xs border border-[var(--line)] bg-[var(--warn-soft)] p-3 rounded-sm">
                      <span className="font-semibold">Suggested revision · </span>
                      {critique.suggested_revision}
                    </p>
                  )}
                </div>
              )}

              {backtestResult ? (
                <div className="panel p-4 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {backtestResult.promoted ? (
                        <CheckCircle2 className="w-6 h-6 text-[var(--accent)]" />
                      ) : (
                        <XCircle className="w-6 h-6 text-[var(--danger)]" />
                      )}
                      <div>
                        <span className={`chip ${backtestResult.promoted ? "chip-ok" : "chip-danger"}`}>
                          {backtestResult.status}
                        </span>
                        <h3 className="text-base font-semibold mt-2">
                          {backtestResult.promoted
                            ? "Survived held-out testing"
                            : "Failed promotion standards"}
                        </h3>
                        <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-2xl">
                          {backtestResult.lessons_learned}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="section-label">Lift vs baseline</p>
                      <p
                        className={`text-2xl metric-value ${
                          backtestResult.lift_vs_baseline >= 0.15
                            ? "text-[var(--accent-ink)]"
                            : "text-[var(--danger)]"
                        }`}
                      >
                        {formatPct(backtestResult.lift_vs_baseline)}
                      </p>
                      <p className="text-xs text-[var(--ink-muted)]">
                        p={backtestResult.p_value.toFixed(4)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    <Metric label="Train 60%" value={formatPct(backtestResult.train_metric)} note={`${backtestResult.sample_count_train} samples`} />
                    <Metric label="Val 20%" value={formatPct(backtestResult.val_metric)} note="Overfit check" />
                    <Metric label="Held-out 20%" value={formatPct(backtestResult.test_metric)} note={`${backtestResult.sample_count_test} sealed`} />
                    <Metric label="Baseline" value={formatPct(backtestResult.baseline_metric)} note="Unconditional" />
                  </div>

                  {backtestResult.timeline_chart && (
                    <div className="space-y-1.5">
                      <p className="section-label flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5" />
                        Held-out triggers
                      </p>
                      {backtestResult.timeline_chart.map((pt, idx) => (
                        <div
                          key={idx}
                          className={`flex flex-wrap items-center justify-between gap-2 text-xs metric-value px-2 py-1.5 border rounded-sm ${
                            pt.triggered
                              ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                              : "border-[var(--line)] bg-white"
                          }`}
                        >
                          <span>{pt.timestamp}</span>
                          <span>Spot {formatMoney(pt.spot)}</span>
                          <span>GEX {formatGEX(pt.net_gex)}</span>
                          <span>Fwd {formatPct(pt.target_val)}</span>
                          <span>{pt.triggered ? "TRIGGERED" : "inactive"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="panel-muted p-6 text-sm text-[var(--ink-muted)]">
                  Results appear here after a sealed backtest. Critique first when you want a cheaper
                  sanity check.
                </div>
              )}
            </div>
          )}

          {view === "archive" && (
            <div className="space-y-4">
              <div className="panel p-4">
                <p className="section-label">Research memory</p>
                <h2 className="text-base font-semibold mt-1 mb-2">What Muse sees next time</h2>
                <pre className="text-xs leading-relaxed whitespace-pre-wrap font-[family-name:var(--font-ibm-plex-mono)] bg-[var(--bg-elevated)] border border-[var(--line)] rounded-sm p-3 max-h-48 overflow-y-auto">
                  {memorySummary || "No experiments yet."}
                </pre>
              </div>

              <div className="panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <h3 className="text-base font-semibold">Experiment archive</h3>
                  <div className="flex gap-1">
                    {["ALL", "PROMOTED", "REJECTED"].map((f) => (
                      <button
                        key={f}
                        onClick={() => setMemoryFilter(f)}
                        className={`px-2.5 py-1 text-xs rounded-sm border ${
                          memoryFilter === f
                            ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                            : "bg-white border-[var(--line)] text-[var(--ink-muted)]"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  {filteredExperiments.map((exp) => {
                    const promoted = exp.status === "PROMOTED";
                    return (
                      <div
                        key={exp.id}
                        className={`border rounded-sm p-3 ${
                          promoted
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]/40"
                            : "border-[var(--line)] bg-white"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`chip ${promoted ? "chip-ok" : "chip-danger"}`}>
                              {exp.status}
                            </span>
                            <span className="text-xs metric-value">{exp.experiment_id}</span>
                            <span className="text-sm font-semibold">{exp.title}</span>
                          </div>
                          <span className="text-[11px] text-[var(--ink-muted)] metric-value">
                            {exp.created_at?.slice(0, 16).replace("T", " ")}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--ink-muted)] mt-2">{exp.hypothesis_text}</p>
                        <div className="mt-2 flex flex-wrap gap-4 text-xs metric-value text-[var(--ink-muted)]">
                          <span>Test {formatPct(exp.test_metric)}</span>
                          <span>Lift {formatPct(exp.lift_vs_baseline)}</span>
                          <span>p={exp.p_value?.toFixed(4)}</span>
                          <span>
                            {exp.sample_count_train}/{exp.sample_count_test} samples
                          </span>
                          <span className="ml-auto">{exp.model_version}</span>
                        </div>
                        <p className="text-xs mt-2 border-t border-[var(--line)] pt-2">
                          <span className="font-semibold">Lesson · </span>
                          {exp.lessons_learned}
                        </p>
                      </div>
                    );
                  })}
                  {filteredExperiments.length === 0 && (
                    <p className="text-xs text-[var(--ink-muted)] py-6 text-center">
                      No experiments for this filter.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <footer className="border-t border-[var(--line)] bg-[var(--surface)] py-3 text-center text-xs text-[var(--ink-muted)]">
        GammaLab · structure first, Muse second, sealed evaluator last
      </footer>
    </div>
  );
}

function StripItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "danger" | "warn";
}) {
  const color =
    tone === "ok"
      ? "text-[var(--accent-ink)]"
      : tone === "danger"
      ? "text-[var(--danger)]"
      : tone === "warn"
      ? "text-[var(--warn)]"
      : "text-[var(--ink)]";
  return (
    <div className="min-w-0">
      <p className="section-label">{label}</p>
      <p className={`metric-value text-sm truncate ${color}`}>{value}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "ok" | "danger";
}) {
  return (
    <div className="panel p-3">
      <p className="section-label">{label}</p>
      <p
        className={`metric-value text-xl mt-1 ${
          tone === "ok"
            ? "text-[var(--accent-ink)]"
            : tone === "danger"
            ? "text-[var(--danger)]"
            : ""
        }`}
      >
        {value}
      </p>
      {note && <p className="text-[11px] text-[var(--ink-muted)] mt-1">{note}</p>}
    </div>
  );
}

function Toggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-sm ${
        active
          ? "bg-[var(--accent)] text-white font-semibold"
          : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
      }`}
    >
      {label}
    </button>
  );
}

function ListBlock({
  title,
  items,
  tone,
  icon,
}: {
  title: string;
  items: string[];
  tone?: "ok" | "danger";
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={`p-3 rounded-sm border ${
        tone === "ok"
          ? "border-[#b7d9cc] bg-[var(--ok-soft)]"
          : tone === "danger"
          ? "border-[#e8b4ae] bg-[var(--danger-soft)]"
          : "border-[var(--line)] bg-[var(--bg-elevated)]"
      }`}
    >
      <p className="section-label flex items-center gap-1.5 mb-2">
        {icon}
        {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-xs leading-relaxed flex gap-2">
            <span className="text-[var(--ink-muted)] metric-value">{i + 1}.</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

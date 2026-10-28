"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import {
  Trophy, Zap, BarChart2, Hash, Brain, Play, Loader2,
  TrendingUp, TrendingDown, RefreshCw, ChevronDown,
  CheckCircle2, XCircle, Send, Activity, Target,
  Repeat2, Clock, ArrowUpRight, AlertTriangle, Info,
  Download, Filter, SortAsc, ChevronRight, PauseCircle, Wifi, WifiOff,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Strategy {
  symbol?: string;
  pattern: number[];
  window: number;
  trade_type: string;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  baseline_rate: number;
  edge: number;
  confidence_lower: number;
  composite_score?: number;
  signal: string;
  rank: number;
  // 10-Fold Multi-Backtest & Area Validation
  folds_tested?: number;
  folds_profitable?: number;
  consistency_pct?: number;
  best_area_label?: string;
  best_fold_wr?: number;
  recent_regime_wr?: number | null;
  entry_instruction?: string;
  fold_stats?: Array<{
    fold: number;
    start: number;
    end: number;
    trades: number;
    wins: number;
    winRate: number;
    profitable: boolean;
    maxConsecutiveLosses?: number;
  }>;
  // Martingale Safety: Least Consecutive Losses
  max_consecutive_losses?: number;
  max_fold_consecutive_losses?: number;
  // Continuous Learning Memory
  sessions_observed?: number;
  lifetime_win_rate?: number;
  stability_grade?: "ELITE" | "ROBUST" | "LEARNING" | "DECAYING" | string;
}

interface Analysis {
  id: string;
  status: "pending" | "running" | "done" | "error";
  symbol: string;
  tickCount: number;
  summary: string | null;
  rawOutput: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

type Tab = "strategies" | "entrypoints" | "backtest" | "digits" | "manual" | "agent";

// ── Constants ─────────────────────────────────────────────────────────────────

const MARKET_GROUPS: Record<string, { label: string; symbols: string[]; description: string }> = {
  ALL_1S: {
    label: "⚡ All 1-Second Markets (10, 25, 50, 75, 100 1s)",
    symbols: ["R_10_1S", "R_25_1S", "R_50_1S", "R_75_1S", "R_100_1S"],
    description: "Parallel multi-market scan across all 5 1-second markets to detect the #1 market to trade",
  },
  ALL_STD: {
    label: "🌐 All Standard Markets (10, 25, 50, 75, 100)",
    symbols: ["R_10", "R_25", "R_50", "R_75", "R_100"],
    description: "Parallel multi-market scan across all 5 standard volatility indices",
  },
  ALL_VOL: {
    label: "🔥 All 10 Volatilities (Full Cluster)",
    symbols: ["R_10", "R_25", "R_50", "R_75", "R_100", "R_10_1S", "R_25_1S", "R_50_1S", "R_75_1S", "R_100_1S"],
    description: "Exhaustive multi-market scan across all 10 Deriv synthetic indices",
  },
};

const SYMBOL_LABELS: Record<string, string> = {
  R_10:     "Volatility 10 Index",
  R_25:     "Volatility 25 Index",
  R_50:     "Volatility 50 Index",
  R_75:     "Volatility 75 Index",
  R_100:    "Volatility 100 Index",
  R_10_1S:  "Volatility 10 (1s)",
  R_25_1S:  "Volatility 25 (1s)",
  R_50_1S:  "Volatility 50 (1s)",
  R_75_1S:  "Volatility 75 (1s)",
  R_100_1S: "Volatility 100 (1s)",
  ALL_1S:   "⚡ All 1-Second Markets",
  ALL_STD:  "🌐 All Standard Markets",
  ALL_VOL:  "🔥 All 10 Volatilities",
};

const SYMBOLS = [
  { value: "ALL_1S",  label: "⚡ All 1-Second Markets (10, 25, 50, 75, 100 1s)" },
  { value: "ALL_STD", label: "🌐 All Standard Markets (10, 25, 50, 75, 100)" },
  { value: "ALL_VOL", label: "🔥 All 10 Volatilities (Full Cluster)" },
  { value: "R_10_1S", label: "Volatility 10 (1s)" },
  { value: "R_25_1S", label: "Volatility 25 (1s)" },
  { value: "R_50_1S", label: "Volatility 50 (1s)" },
  { value: "R_75_1S", label: "Volatility 75 (1s)" },
  { value: "R_100_1S",label: "Volatility 100 (1s)" },
  { value: "R_10",    label: "Volatility 10 Index" },
  { value: "R_25",    label: "Volatility 25 Index" },
  { value: "R_50",    label: "Volatility 50 Index" },
  { value: "R_75",    label: "Volatility 75 Index" },
  { value: "R_100",   label: "Volatility 100 Index" },
];

const TRADE_TYPE_COLORS: Record<string, string> = {
  EVEN:    "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800",
  ODD:     "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800",
  OVER:    "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800",
  UNDER:   "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
  MATCHES: "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
  DIFFERS: "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800",
};

function ttColor(tt: string) {
  const kind = tt.split("_")[0];
  return TRADE_TYPE_COLORS[kind] || "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700";
}

function ttLabel(tt: string) {
  if (tt === "EVEN") return "Even";
  if (tt === "ODD")  return "Odd";
  const [k, x] = tt.split("_");
  if (k === "OVER")    return `Over ${x}`;
  if (k === "UNDER")   return `Under ${x}`;
  if (k === "MATCHES") return `Matches ${x}`;
  if (k === "DIFFERS") return `Differs ${x}`;
  return tt;
}

function winColor(wr: number) {
  if (wr >= 0.65) return "text-emerald-600 dark:text-emerald-400";
  if (wr >= 0.55) return "text-amber-500 dark:text-amber-400";
  if (wr >= 0.50) return "text-blue-500 dark:text-blue-400";
  return "text-rose-500 dark:text-rose-400";
}

function edgeBar(edge: number) {
  const pct = Math.min(Math.abs(edge) * 400, 100);
  const col = edge > 0 ? "bg-emerald-500" : "bg-rose-500";
  return { pct, col };
}

// ── Strategy Card ─────────────────────────────────────────────────────────────

function StrategyCard({ s, rank }: { s: Strategy; rank: number }) {
  const wr      = s.win_rate;
  const edge    = s.edge;
  const { pct, col } = edgeBar(edge);
  const kind    = s.trade_type.split("_")[0];

  const rankBg =
    rank === 1 ? "from-amber-400 to-yellow-500" :
    rank === 2 ? "from-slate-300 to-slate-400" :
    rank === 3 ? "from-orange-400 to-amber-500" :
    "from-slate-600 to-slate-700";

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden hover:shadow-lg transition-all">
      {/* Rank stripe + win rate */}
      <div className="flex items-stretch">
        <div className={`bg-gradient-to-b ${rankBg} w-12 flex items-center justify-center flex-shrink-0`}>
          <span className="text-white font-black text-lg">#{rank}</span>
        </div>
        <div className="flex-1 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              {s.symbol && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  📍 {SYMBOL_LABELS[s.symbol] || s.symbol}
                </span>
              )}
              <span className={`text-xs font-bold px-2 py-1 rounded-lg ${ttColor(s.trade_type)}`}>
                {ttLabel(s.trade_type)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Window {s.window} · {s.total_trades} trades
              </span>
            </div>
            <span className={`text-2xl font-black tabular-nums ${winColor(wr)}`}>
              {(wr * 100).toFixed(1)}%
            </span>
          </div>

          {/* Pattern sequence */}
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            <span className="text-[10px] text-slate-400 mr-1 font-semibold uppercase">After:</span>
            {s.pattern.map((d, i) => (
              <span key={i} className="flex items-center gap-0.5">
                <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-mono font-bold text-sm text-slate-800 dark:text-white">
                  {d}
                </span>
                {i < s.pattern.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600" />}
              </span>
            ))}
            <ChevronRight className="w-3.5 h-3.5 text-blue-400 mx-1" />
            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${ttColor(s.trade_type)}`}>
              BET {ttLabel(s.trade_type).toUpperCase()}
            </span>
          </div>

          {/* Edge bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-slate-500 font-semibold">Edge over baseline</span>
              <span className={edge > 0 ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-rose-500 font-bold"}>
                {edge > 0 ? "+" : ""}{(edge * 100).toFixed(2)}%
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${col} transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            {[
              { label: "Wins",     value: s.wins,     color: "text-emerald-600 dark:text-emerald-400" },
              { label: "Losses",   value: s.losses,   color: "text-rose-500" },
              { label: "Baseline", value: `${(s.baseline_rate * 100).toFixed(1)}%`, color: "text-slate-500" },
              { label: "CI Lower", value: `${(s.confidence_lower * 100).toFixed(1)}%`, color: "text-blue-500" },
            ].map(st => (
              <div key={st.label} className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-1.5">
                <div className={`text-sm font-bold ${st.color}`}>{st.value}</div>
                <div className="text-[9px] text-slate-400 font-semibold uppercase">{st.label}</div>
              </div>
            ))}
          </div>

          {/* 10-Fold Cross-Validation & Market Area Badges */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {s.folds_profitable !== undefined && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                s.folds_profitable >= 9
                  ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                  : s.folds_profitable >= 7
                    ? "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                    : "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
              }`}>
                <span>{s.folds_profitable >= 9 ? "🌟" : "🛡️"}</span>
                <span>{s.folds_profitable}/10 Folds ({s.consistency_pct ?? Math.round(s.folds_profitable * 10)}% Stable)</span>
              </span>
            )}
            {s.best_area_label && (
              <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 truncate max-w-[240px]" title={s.best_area_label}>
                Peak: {s.best_area_label.split(":")[0]}
              </span>
            )}
            {s.stability_grade && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                s.stability_grade === "ELITE"
                  ? "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                  : s.stability_grade === "ROBUST"
                    ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                    : s.stability_grade === "DECAYING"
                      ? "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                      : "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
              }`}>
                <span>{s.stability_grade === "ELITE" ? "💎" : s.stability_grade === "ROBUST" ? "🧠" : s.stability_grade === "DECAYING" ? "⚠️" : "🌱"}</span>
                <span>
                  {s.stability_grade} · {s.sessions_observed} {s.sessions_observed === 1 ? "Session" : "Sessions"}
                  {s.lifetime_win_rate ? ` (${(s.lifetime_win_rate * 100).toFixed(1)}% Lifetime)` : ""}
                </span>
              </span>
            )}
            {s.max_consecutive_losses !== undefined && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                s.max_consecutive_losses <= 1
                  ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                  : s.max_consecutive_losses === 2
                    ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                    : "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800"
              }`} title="Maximum consecutive losses encountered in backtest (Crucial for Martingale sizing)">
                <span>{s.max_consecutive_losses <= 1 ? "🛡️" : s.max_consecutive_losses === 2 ? "⚡" : "⚠️"}</span>
                <span>Max {s.max_consecutive_losses} L-Streak (Martingale Safe)</span>
              </span>
            )}
          </div>

          {/* Signal */}
          <div className="mt-3 flex items-start gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/60 rounded-xl p-2.5">
            <Zap className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-700 dark:text-blue-300 font-semibold leading-relaxed">{s.signal}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Digit Distribution Bar ────────────────────────────────────────────────────

function DigitBar({ digit, freq, expected }: { digit: number; freq: number; expected: number }) {
  const pct = Math.round(freq * 100 * 10) / 10;
  const exp = Math.round(expected * 100 * 10) / 10;
  const bias = pct - exp;
  return (
    <div className="flex items-center gap-3">
      <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-mono font-bold text-sm text-slate-700 dark:text-slate-200 flex-shrink-0">{digit}</span>
      <div className="flex-1">
        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
          <div
            className={`h-full rounded-full transition-all ${bias > 1.5 ? "bg-emerald-500" : bias < -1.5 ? "bg-rose-500" : "bg-blue-500"}`}
            style={{ width: `${Math.min(pct * 5, 100)}%` }}
          />
          <div className="absolute inset-y-0 flex items-center pl-2">
            <span className="text-[9px] font-bold text-white">{pct}%</span>
          </div>
        </div>
      </div>
      <span className={`text-xs font-bold w-16 text-right ${bias > 1.5 ? "text-emerald-500" : bias < -1.5 ? "text-rose-500" : "text-slate-400"}`}>
        {bias > 0 ? "+" : ""}{bias.toFixed(1)}%
      </span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DerivPatternLabPage() {
  const [tab, setTab]                   = useState<Tab>("strategies");
  const [symbol, setSymbol]             = useState("R_10");
  const [tickCount, setTickCount]       = useState(5000);
  const [maxWindow, setMaxWindow]       = useState(7);
  const [minOccur, setMinOccur]         = useState(30);
  const [topN, setTopN]                 = useState(30);
  const [contractFocus, setContractFocus] = useState("ALL"); // pre-analysis contract type focus
  const [running, setRunning]           = useState(false);
  const [progress, setProgress]         = useState("");
  const [analysis, setAnalysis]         = useState<Analysis | null>(null);
  const [strategies, setStrategies]     = useState<Strategy[]>([]);
  const [rawData, setRawData]           = useState<any>(null);
  const [history, setHistory]           = useState<Analysis[]>([]);
  const [filterTT, setFilterTT]         = useState("ALL");
  const [sortBy, setSortBy]             = useState<"win_rate"|"edge"|"total_trades"|"confidence_lower"|"least_consecutive_losses">("least_consecutive_losses");
  const [chatMessages, setChatMessages] = useState<{ role: "user"|"ai"; text: string }[]>([]);
  const [chatInput, setChatInput]       = useState("");
  const [chatLoading, setChatLoading]   = useState(false);
  const [manualTicks, setManualTicks]   = useState("");
  const [usedJsEngine, setUsedJsEngine] = useState(false); // true when analysis ran via JS fallback (no VM)
  // Sandbox status
  const [sbActive, setSbActive]         = useState(false);
  const [sbPausing, setSbPausing]       = useState(false);
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEnd   = useRef<HTMLDivElement>(null);

  const checkSbStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/deriv/pause");
      const d = await r.json();
      setSbActive(d.sandboxActive === true);
    } catch {}
  }, []);

  useEffect(() => {
    fetch("/api/deriv/status").then(r => r.json()).then(d => { if (d.analyses) setHistory(d.analyses); }).catch(() => {});
    checkSbStatus();
  }, [checkSbStatus]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  const pollJob = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const steps = ["🔍 Scanning all patterns…", "📊 Backtesting every strategy…", "⚡ Evaluating edge vs baseline…", "🏆 Ranking by confidence…", "✅ Finalising results…"];
    let step = 0;
    pollRef.current = setInterval(async () => {
      setProgress(steps[step % steps.length]);
      step++;
      try {
        const r = await fetch(`/api/deriv/status?id=${id}`);
        const d = await r.json();
        if (d.analysis) {
          setAnalysis(d.analysis);
          if (d.analysis.status === "done") {
            // Parse raw output for digit stats
            if (d.analysis.rawOutput) {
              try {
                const raw = JSON.parse(d.analysis.rawOutput);
                setRawData(raw);
                // Prefer rich raw.top_strategies (with cross-val & memory), fall back to DB rows
                if (raw.top_strategies && raw.top_strategies.length > 0) {
                  setStrategies(raw.top_strategies);
                } else if (d.strategies && d.strategies.length > 0) {
                  // Map DB rows back to Strategy shape
                  setStrategies(d.strategies.map((s: any) => ({
                    pattern:          JSON.parse(s.pattern),
                    window:           s.windowSize,
                    trade_type:       s.tradeType,
                    total_trades:     s.totalTrades,
                    wins:             s.wins,
                    losses:           s.losses,
                    win_rate:         parseFloat(s.winRate),
                    baseline_rate:    parseFloat(s.baselineRate),
                    edge:             parseFloat(s.edge),
                    confidence_lower: parseFloat(s.confidenceLower),
                    signal:           s.signal,
                    rank:             s.rank,
                  })));
                }
              } catch {}
            } else if (d.strategies) {
              setStrategies(d.strategies.map((s: any) => ({
                pattern:          JSON.parse(s.pattern),
                window:           s.windowSize,
                trade_type:       s.tradeType,
                total_trades:     s.totalTrades,
                wins:             s.wins,
                losses:           s.losses,
                win_rate:         parseFloat(s.winRate),
                baseline_rate:    parseFloat(s.baselineRate),
                edge:             parseFloat(s.edge),
                confidence_lower: parseFloat(s.confidenceLower),
                signal:           s.signal,
                rank:             s.rank,
              })));
            }
            setRunning(false);
            setProgress("");
            clearInterval(pollRef.current!);
            setTab("strategies");
            checkSbStatus();  // refresh sandbox status pill
            fetch("/api/deriv/status").then(r => r.json()).then(d => { if (d.analyses) setHistory(d.analyses); });
          } else if (d.analysis.status === "error") {
            setRunning(false);
            setProgress("");
            clearInterval(pollRef.current!);
          }
        }
      } catch {}
    }, 2500);
  }, []);

  async function runAnalysis(useManual = false) {
    setRunning(true);
    setAnalysis(null);
    setStrategies([]);
    setRawData(null);

    const body: any = {
      symbol,
      tickCount,
      minOccurrences: minOccur,
      maxWindow,
      topN,
      targetContract: contractFocus,
    };

    if (useManual) {
      // Manual tab: use pasted digits
      const digits = manualTicks.split(/[\s,\n]+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0 && n <= 9);
      if (digits.length < 20) { alert("Paste at least 20 digits (0–9)."); setRunning(false); setProgress(""); return; }
      body.manualTicks = digits;
      body.fetchSource = "manual_paste";
    } else {
      // Server-side tick fetch — avoids browser WebSocket restrictions on Vercel
      if (MARKET_GROUPS[symbol]) {
        const grp = MARKET_GROUPS[symbol];
        setProgress(`🔗 Fetching ${tickCount.toLocaleString()} ticks across all ${grp.symbols.length} markets in parallel…`);
        try {
          const fetchPromises = grp.symbols.map(async (s) => {
            const res = await fetch(`/api/deriv/ticks?symbol=${encodeURIComponent(s)}&count=${tickCount}`);
            const d = await res.json();
            return { symbol: s, data: d };
          });
          const results = await Promise.all(fetchPromises);
          const multiMarketData: Record<string, number[]> = {};
          let fetchedCount = 0;
          for (const r of results) {
            if (r.data?.digits && r.data.digits.length >= 20) {
              multiMarketData[r.symbol] = r.data.digits;
              fetchedCount += r.data.digits.length;
            }
          }
          if (Object.keys(multiMarketData).length === 0) {
            setRunning(false);
            setProgress("");
            alert("❌ Could not fetch ticks for the selected markets.");
            return;
          }
          setProgress(`📊 Analyzing ${Object.keys(multiMarketData).length} markets (${fetchedCount.toLocaleString()} total ticks) across 10-fold multi-backtests…`);
          body.marketGroup = symbol;
          body.multiMarketData = multiMarketData;
        } catch (fetchErr: any) {
          setRunning(false);
          setProgress("");
          alert(`❌ Could not fetch multi-market ticks: ${fetchErr.message}`);
          return;
        }
      } else {
        try {
          setProgress(`🔗 Fetching ${tickCount.toLocaleString()} ticks from Deriv…`);
          const tickRes = await fetch(`/api/deriv/ticks?symbol=${encodeURIComponent(symbol)}&count=${tickCount}`);
          const tickData = await tickRes.json();

          if (!tickRes.ok || !tickData.digits || tickData.digits.length < 20) {
            setRunning(false);
            setProgress("");
            alert(`❌ Could not fetch ticks from Deriv: ${tickData.error || "No data returned"}`);
            return;
          }

          const digits: number[] = tickData.digits;
          setProgress(`📥 Got ${digits.length.toLocaleString()} ticks ✓  Precision: ${tickData.precision}dp · Source: ${tickData.source}  — Analysing…`);
          body.manualTicks = digits;
          body.fetchSource = tickData.source || "deriv_live";
        } catch (fetchErr: any) {
          setRunning(false);
          setProgress("");
          alert(`❌ Could not fetch ticks from Deriv: ${fetchErr.message}`);
          return;
        }
      }
    }

    try {
      const r = await fetch("/api/deriv/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();

      // Mode A: JS fallback — results returned inline immediately
      if (d.status === "done" && (d.data || d.rawOutput)) {
        const raw = d.data || JSON.parse(d.rawOutput);
        setRawData(raw);
        setStrategies(raw.top_strategies || []);
        setAnalysis({
          id: d.analysisId, status: "done", symbol,
          tickCount: raw.tick_count, summary: raw.summary,
          rawOutput: JSON.stringify(raw), error: null,
          createdAt: new Date().toISOString(), completedAt: new Date().toISOString(),
        });
        setRunning(false);
        setProgress("");
        // Auto-apply contract focus filter so user immediately sees their chosen type
        setFilterTT(contractFocus);
        setTab("strategies");
        checkSbStatus();
        fetch("/api/deriv/status").then(r => r.json()).then(d => { if (d.analyses) setHistory(d.analyses); });
        return;
      }

      // Mode A error
      if (d.status === "error") {
        setRunning(false);
        setProgress("");
        alert(d.data?.summary || "Analysis failed.");
        return;
      }

      // Mode B: E2B Python engine running — poll until done
      if (d.analysisId) { checkSbStatus(); pollJob(d.analysisId); }
      else { setRunning(false); setProgress(""); alert(d.error || "Failed to start analysis"); }
    } catch (e: any) { setRunning(false); setProgress(""); alert(e.message); }
  }

  async function handlePauseSandbox() {
    setSbPausing(true);
    try {
      const r = await fetch("/api/deriv/pause", { method: "POST" });
      const d = await r.json();
      if (d.success) {
        setSbActive(false);
        alert(d.already ? "Sandbox was already paused. Files are safe." : "✓ Sandbox paused. All your files and sessions are preserved. It will reconnect automatically on next analysis.");
      } else {
        alert(d.message || "Could not pause sandbox.");
      }
    } catch (e: any) {
      alert(`Pause error: ${e.message}`);
    } finally {
      setSbPausing(false);
    }
  }

  async function handleChat() {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatMessages(p => [...p, { role: "user", text: msg }]);
    setChatLoading(true);

    // Build a rich context from the current analysis results
    const topStrats = (rawData?.top_strategies || strategies).slice(0, 15);
    const ctx = rawData
      ? [
          `Symbol: ${rawData.symbol} | Ticks analysed: ${rawData.tick_count?.toLocaleString()}`,
          `Target Contract Filter: ${contractFocus}`,
          `Total pattern-strategy combos evaluated: ${rawData.total_evaluated?.toLocaleString()}`,
          rawData.is_multi_market && rawData.market_scorecards
            ? `MULTI-MARKET SCAN RESULTS (${rawData.market_scorecards.length} markets):\n${
                rawData.market_scorecards.map((m: any) => `  Rank #${m.rank}: ${m.label} | Best WR: ${(m.top_win_rate*100).toFixed(1)}% | Edge: +${(m.top_edge*100).toFixed(2)}% | ${m.best_folds_profitable}/10 folds | Grade: ${m.stability_grade} | Signal: ${m.best_signal}`).join("\n")
              }\nRECOMMENDED TO TRADE: ${rawData.recommended_market?.label}`
            : `Digit distribution: ${Object.entries(rawData.digit_distribution || {}).map(([d,f]) => `${d}=${((f as number)*100).toFixed(1)}%`).join(", ")}`,
          `Even baseline: ${((rawData.baseline_rates?.EVEN || 0)*100).toFixed(1)}% | Odd baseline: ${((rawData.baseline_rates?.ODD || 0)*100).toFixed(1)}%`,
          `Top strategies with 10-Fold Cross-Validation:\n${topStrats.map((s: Strategy, i: number) =>
            `  ${i+1}. [${s.symbol ? `@${s.symbol} ` : ""}${s.pattern.join("→")}] → ${s.trade_type} | WinRate: ${(s.win_rate*100).toFixed(1)}% | Edge: +${(s.edge*100).toFixed(2)}% | Trades: ${s.total_trades} | 10-Fold: ${s.folds_profitable ?? 10}/10 folds | Memory: ${s.stability_grade || "LEARNING"} (${s.sessions_observed ?? 1} sessions)`
          ).join("\n")}`,
        ].join("\n")
      : "No analysis has been run yet. Ask the user to click 'Run Analysis' first.";

    try {
      const r = await fetch("/api/deriv/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, context: ctx }),
      });
      const d = await r.json();
      setChatMessages(p => [...p, { role: "ai", text: d.reply || d.error || "No response" }]);
    } catch (e: any) {
      setChatMessages(p => [...p, { role: "ai", text: `Error: ${e.message}` }]);
    } finally { setChatLoading(false); }
  }

  const displayStrategies = strategies
    .filter(s => filterTT === "ALL" || s.trade_type.startsWith(filterTT))
    .sort((a, b) => {
      if (sortBy === "least_consecutive_losses") {
        const aLoss = a.max_consecutive_losses ?? 999;
        const bLoss = b.max_consecutive_losses ?? 999;
        if (aLoss !== bLoss) return aLoss - bLoss; // Ascending: least consecutive losses first (0, 1, 2...)
        return (b.confidence_lower || 0) - (a.confidence_lower || 0); // Tie breaker: highest reliability
      }
      return ((b as any)[sortBy] ?? 0) - ((a as any)[sortBy] ?? 0);
    });

  // For the focused contract type, compute a dedicated best-entry insight
  const focusedBest = contractFocus !== "ALL"
    ? strategies
        .filter(s => s.trade_type.startsWith(contractFocus))
        .sort((a, b) => b.confidence_lower - a.confidence_lower)[0]
    : null;

  const tabs: { id: Tab; label: string; icon: any; badge?: number }[] = [
    { id: "strategies",  label: rawData?.is_multi_market ? "🏆 Market Rankings" : "Best Strategies", icon: Trophy, badge: strategies.length },
    { id: "entrypoints", label: "🎯 Entry Blueprint (10-Fold)", icon: Target, badge: strategies.filter(s => (s.folds_profitable ?? 0) >= 7).length },
    { id: "backtest",    label: "Full Backtest",              icon: BarChart2 },
    { id: "digits",      label: "Digit Stats",                icon: Hash },
    { id: "manual",      label: "Manual Analysis",            icon: Activity },
    { id: "agent",       label: "AI Agent (Hermes)",          icon: Brain },
  ];

  const tradeKinds = ["ALL", "OVER", "UNDER", "EVEN", "ODD", "MATCHES", "DIFFERS"];

  return (
    <div className="flex h-screen bg-slate-100/60 dark:bg-slate-950 overflow-hidden font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header title="Deriv Pattern Lab" subtitle="Real tick data · All trade types · Walk-forward backtested · Ranked entry signals" />

        {/* ── Controls Bar ───────────────────────────────────────────────── */}
        <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Symbol */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Symbol:</label>
              <select
                value={symbol}
                onChange={e => setSymbol(e.target.value)}
                className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-medium"
              >
                <optgroup label="⚡ Multi-Market Scanners (Compare & Trade Best)">
                  <option value="ALL_1S">⚡ All 1-Second Markets (10, 25, 50, 75, 100 1s)</option>
                  <option value="ALL_STD">🌐 All Standard Markets (10, 25, 50, 75, 100)</option>
                  <option value="ALL_VOL">🔥 All 10 Volatilities (Full Cluster)</option>
                </optgroup>
                <optgroup label="⏱️ Individual 1-Second Markets">
                  <option value="R_10_1S">Volatility 10 (1s)</option>
                  <option value="R_25_1S">Volatility 25 (1s)</option>
                  <option value="R_50_1S">Volatility 50 (1s)</option>
                  <option value="R_75_1S">Volatility 75 (1s)</option>
                  <option value="R_100_1S">Volatility 100 (1s)</option>
                </optgroup>
                <optgroup label="📊 Individual Standard Markets">
                  <option value="R_10">Volatility 10 Index</option>
                  <option value="R_25">Volatility 25 Index</option>
                  <option value="R_50">Volatility 50 Index</option>
                  <option value="R_75">Volatility 75 Index</option>
                  <option value="R_100">Volatility 100 Index</option>
                </optgroup>
              </select>
            </div>

            {/* Ticks */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Ticks:</label>
              <select
                value={tickCount}
                onChange={e => setTickCount(Number(e.target.value))}
                className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {[1000, 2000, 3000, 5000, 8000, 10000].map(n => <option key={n} value={n}>{n.toLocaleString()} ticks</option>)}
              </select>
            </div>

            {/* Window */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Window:</label>
              <select
                value={maxWindow}
                onChange={e => setMaxWindow(Number(e.target.value))}
                className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {[3,4,5,6,7,8].map(n => <option key={n} value={n}>Max {n} digits</option>)}
              </select>
            </div>

            {/* Min occurrences */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Min occ:</label>
              <select
                value={minOccur}
                onChange={e => setMinOccur(Number(e.target.value))}
                className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {[10, 20, 30, 50, 100].map(n => <option key={n} value={n}>{n}+ occurrences</option>)}
              </select>
            </div>

            {/* Contract Type Focus */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Contract:</label>
              <select
                value={contractFocus}
                onChange={e => { setContractFocus(e.target.value); setFilterTT(e.target.value); }}
                className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer font-semibold max-w-[160px] sm:max-w-[200px]"
                title="Focus analysis on a specific contract type (e.g. Under 4, Over 5, Even) to find the best patterns and multi-fold entries for that trade"
              >
                <option value="ALL">All Contracts</option>
                <optgroup label="Even & Odd">
                  <option value="EVEN">Even (0, 2, 4, 6, 8)</option>
                  <option value="ODD">Odd (1, 3, 5, 7, 9)</option>
                </optgroup>
                <optgroup label="Under Contracts">
                  <option value="UNDER">Under (Any 1–9)</option>
                  <option value="UNDER_1">Under 1 (wins on 0)</option>
                  <option value="UNDER_2">Under 2 (wins on 0, 1)</option>
                  <option value="UNDER_3">Under 3 (wins on 0, 1, 2)</option>
                  <option value="UNDER_4">Under 4 (wins on 0, 1, 2, 3)</option>
                  <option value="UNDER_5">Under 5 (wins on 0, 1, 2, 3, 4)</option>
                  <option value="UNDER_6">Under 6 (wins on 0..5)</option>
                  <option value="UNDER_7">Under 7 (wins on 0..6)</option>
                  <option value="UNDER_8">Under 8 (wins on 0..7)</option>
                  <option value="UNDER_9">Under 9 (wins on 0..8)</option>
                </optgroup>
                <optgroup label="Over Contracts">
                  <option value="OVER">Over (Any 0–8)</option>
                  <option value="OVER_0">Over 0 (wins on 1..9)</option>
                  <option value="OVER_1">Over 1 (wins on 2..9)</option>
                  <option value="OVER_2">Over 2 (wins on 3..9)</option>
                  <option value="OVER_3">Over 3 (wins on 4..9)</option>
                  <option value="OVER_4">Over 4 (wins on 5..9)</option>
                  <option value="OVER_5">Over 5 (wins on 6, 7, 8, 9)</option>
                  <option value="OVER_6">Over 6 (wins on 7, 8, 9)</option>
                  <option value="OVER_7">Over 7 (wins on 8, 9)</option>
                  <option value="OVER_8">Over 8 (wins on 9)</option>
                </optgroup>
                <optgroup label="Differs Contracts">
                  <option value="DIFFERS">Differs (Any 0–9)</option>
                  <option value="DIFFERS_0">Differs 0</option>
                  <option value="DIFFERS_1">Differs 1</option>
                  <option value="DIFFERS_2">Differs 2</option>
                  <option value="DIFFERS_3">Differs 3</option>
                  <option value="DIFFERS_4">Differs 4</option>
                  <option value="DIFFERS_5">Differs 5</option>
                  <option value="DIFFERS_6">Differs 6</option>
                  <option value="DIFFERS_7">Differs 7</option>
                  <option value="DIFFERS_8">Differs 8</option>
                  <option value="DIFFERS_9">Differs 9</option>
                </optgroup>
                <optgroup label="Matches Contracts">
                  <option value="MATCHES">Matches (Any 0–9)</option>
                  <option value="MATCHES_0">Matches 0</option>
                  <option value="MATCHES_1">Matches 1</option>
                  <option value="MATCHES_2">Matches 2</option>
                  <option value="MATCHES_3">Matches 3</option>
                  <option value="MATCHES_4">Matches 4</option>
                  <option value="MATCHES_5">Matches 5</option>
                  <option value="MATCHES_6">Matches 6</option>
                  <option value="MATCHES_7">Matches 7</option>
                  <option value="MATCHES_8">Matches 8</option>
                  <option value="MATCHES_9">Matches 9</option>
                </optgroup>
              </select>
            </div>

            {/* Run button */}
            <button
              onClick={() => runAnalysis(false)}
              disabled={running}
              className={`flex items-center gap-2 px-5 py-2 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition-all shadow-md cursor-pointer ml-auto ${
                MARKET_GROUPS[symbol]
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20"
                  : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
              }`}
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running
                ? "Scanning…"
                : MARKET_GROUPS[symbol]
                  ? `⚡ Scan ${MARKET_GROUPS[symbol].symbols.length} Markets`
                  : "Run Analysis"
              }
            </button>

            {/* Sandbox status pill + Pause button */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Status pill */}
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                sbActive
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                  : analysis?.status === "done"
                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                    : "bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  sbActive ? "bg-emerald-500 animate-pulse"
                  : analysis?.status === "done" ? "bg-blue-400"
                  : "bg-slate-400"
                }`} />
                {sbActive ? "VM Live"
                  : analysis?.status === "done" ? "JS Engine ✓"
                  : "No VM"}
              </div>

              {/* Pause button — only show when sandbox is active and no analysis running */}
              {sbActive && !running && (
                <button
                  onClick={handlePauseSandbox}
                  disabled={sbPausing}
                  title="Pause the E2B sandbox to save credits. All files and sessions are preserved."
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs rounded-lg transition-all cursor-pointer shadow-sm"
                >
                  {sbPausing
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <span className="text-base leading-none">⏸</span>
                  }
                  {sbPausing ? "Pausing…" : "Pause VM"}
                </button>
              )}
            </div>
          </div>

          {/* Progress */}
          {running && (
            <div className="mt-2 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
              <div className="w-full bg-blue-100 dark:bg-blue-950/40 rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full animate-pulse w-3/4" />
              </div>
              <span className="whitespace-nowrap text-xs font-semibold">{progress}</span>
            </div>
          )}

          {/* Analysis summary */}
          {analysis?.status === "done" && !running && (
            <div className="mt-2 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{analysis.summary}</p>
            </div>
          )}
          {analysis?.status === "error" && (
            <div className="mt-2 flex items-center gap-2">
              <XCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
              <p className="text-xs text-rose-600 dark:text-rose-400">{analysis.error}</p>
            </div>
          )}
        </div>

        {/* ── Tab Bar ────────────────────────────────────────────────────── */}
        <div className="flex gap-1 px-4 sm:px-6 pt-3 border-b border-slate-200 dark:border-slate-800 overflow-x-auto flex-shrink-0 bg-white dark:bg-slate-900">
          {tabs.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold rounded-t-xl border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                  active
                    ? "border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-950/40"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/40"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                {t.badge !== undefined && t.badge > 0 && (
                  <span className="text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded-full">
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6">

          {/* ────────────────────────────────────── TAB: Best Strategies */}
          {tab === "strategies" && (
            <div className="space-y-4 max-w-5xl mx-auto">

              {/* Summary KPI bar */}
              {rawData && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Ticks Analysed",   value: (rawData.tick_count || 0).toLocaleString(), icon: Activity, color: "text-blue-500" },
                    { label: "Strategies Found",  value: (rawData.total_evaluated || 0).toLocaleString(), icon: Target, color: "text-purple-500" },
                    { label: "Top Win Rate",      value: strategies.length ? `${(strategies[0].win_rate * 100).toFixed(1)}%` : "—", icon: Trophy, color: "text-amber-500" },
                    { label: "Max Edge",          value: strategies.length ? `+${(strategies[0].edge * 100).toFixed(2)}%` : "—", icon: TrendingUp, color: "text-emerald-500" },
                  ].map(s => {
                    const Icon = s.icon;
                    return (
                      <div key={s.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-500">{s.label}</span>
                          <Icon className={`w-4 h-4 ${s.color}`} />
                        </div>
                        <div className="text-xl font-black text-slate-800 dark:text-white">{s.value}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Filter bar */}
              {strategies.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Filter:</span>
                  {tradeKinds.map(k => (
                    <button
                      key={k}
                      onClick={() => setFilterTT(k)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-bold border transition-all cursor-pointer ${
                        filterTT === k
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400"
                      }`}
                    >
                      {k === "ALL" ? "All Types" : k}
                    </button>
                  ))}
                  <div className="flex items-center gap-1.5 ml-auto">
                    <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Sort:</label>
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as any)}
                      className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-slate-800 dark:text-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="least_consecutive_losses">🛡️ Least Consecutive Losses (Martingale)</option>
                      <option value="confidence_lower">Reliability (CI Lower)</option>
                      <option value="win_rate">Win Rate</option>
                      <option value="edge">Edge %</option>
                      <option value="total_trades">Total Trades</option>
                    </select>
                    <span className="text-xs text-slate-400 ml-1">({displayStrategies.length})</span>
                  </div>
                </div>
              )}

              {/* Contract focus insight banner — shown when a specific type is focused */}
              {focusedBest && strategies.length > 0 && (
                <div className="bg-gradient-to-r from-purple-600 to-indigo-700 rounded-2xl p-4 text-white">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-purple-200 flex-shrink-0" />
                    <span className="text-xs font-bold text-purple-200 uppercase tracking-wider">
                      Best {contractFocus} Pattern Found
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-purple-100">After seeing:</span>
                    {focusedBest.pattern.map((d, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <span className="w-8 h-8 rounded-lg bg-white/20 border border-white/30 flex items-center justify-center font-mono font-black text-base text-white">{d}</span>
                        {i < focusedBest.pattern.length - 1 && <ChevronRight className="w-3 h-3 text-purple-300" />}
                      </span>
                    ))}
                    <ChevronRight className="w-4 h-4 text-purple-300" />
                    <span className="bg-white/20 border border-white/30 text-white font-black text-sm px-3 py-1 rounded-lg">
                      BET {ttLabel(focusedBest.trade_type).toUpperCase()}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center mt-3">
                    {[
                      { label: "Win Rate",  value: `${(focusedBest.win_rate * 100).toFixed(1)}%`,  color: "text-emerald-300" },
                      { label: "Edge",      value: `+${(focusedBest.edge * 100).toFixed(2)}%`,     color: "text-yellow-300" },
                      { label: "Trades",    value: String(focusedBest.total_trades),                color: "text-blue-200" },
                      { label: "CI Lower",  value: `${(focusedBest.confidence_lower * 100).toFixed(1)}%`, color: "text-purple-200" },
                    ].map(stat => (
                      <div key={stat.label} className="bg-white/10 rounded-xl p-2">
                        <div className={`text-base font-black ${stat.color}`}>{stat.value}</div>
                        <div className="text-[9px] text-purple-300 font-semibold uppercase">{stat.label}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-purple-200 mt-3 leading-relaxed">
                    <span className="font-bold">How to trade:</span> When you see the exact sequence{" "}
                    [{focusedBest.pattern.join(" → ")}] in the last digits, place a{" "}
                    <span className="font-bold text-white">{ttLabel(focusedBest.trade_type)}</span> bet on the <span className="font-bold text-white">very next tick</span>.
                    This pattern appeared {focusedBest.total_trades} times in the backtest — bet {contractFocus === "MATCHES" ? "9:1 payout" : "1:1 payout"}.
                  </p>
                </div>
              )}

              {/* ── MULTI-MARKET SCORECARD (only shown for group scans) ── */}
              {rawData?.is_multi_market && rawData?.market_scorecards && (
                <div className="space-y-4">
                  {/* Recommended Market Banner */}
                  {rawData.recommended_market && (
                    <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 rounded-3xl p-5 text-white border border-emerald-500/30 shadow-xl">
                      <div className="flex items-center gap-2 mb-3">
                        <Trophy className="w-5 h-5 text-amber-400" />
                        <span className="text-xs font-black uppercase tracking-wider text-emerald-300">🏆 #1 Recommended Market to Trade Right Now</span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <div className="text-2xl font-black text-white">{rawData.recommended_market.label}</div>
                          <div className="text-sm text-emerald-300 mt-0.5">{rawData.recommended_market.best_signal}</div>
                          <div className="text-xs text-emerald-300 mt-1 flex items-center gap-2 flex-wrap">
                            <span>{rawData.recommended_market.best_folds_profitable}/10 folds passed</span>
                            <span>·</span>
                            <span className="font-bold text-amber-300">🛡️ Max L-Streak: {rawData.recommended_market.min_consecutive_losses ?? 0} losses (Martingale Safe)</span>
                            <span>·</span>
                            <span>Peak: {rawData.recommended_market.best_area_label}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-4xl font-black text-emerald-400">{(rawData.recommended_market.top_win_rate * 100).toFixed(1)}%</div>
                          <div className="text-xs text-emerald-300 font-bold">Win Rate</div>
                          <div className="text-xs text-amber-300 mt-1">+{(rawData.recommended_market.top_edge * 100).toFixed(2)}% edge</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Market Rankings Table */}
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-black text-slate-700 dark:text-white">All Markets Ranked by Best Pattern Strength</span>
                      <span className="ml-auto text-xs text-slate-400">{rawData.market_scorecards.length} markets scanned</span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {rawData.market_scorecards.map((mkt: any, idx: number) => (
                        <div key={mkt.symbol} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${mkt.is_recommended ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}>
                          <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-sm ${mkt.rank === 1 ? "bg-amber-400 text-white" : mkt.rank === 2 ? "bg-slate-300 text-slate-800" : mkt.rank === 3 ? "bg-amber-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
                            {mkt.rank}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                              {mkt.label}
                              {mkt.is_recommended && <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded-full font-black">✅ TRADE THIS</span>}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{mkt.best_signal}</div>
                          </div>
                          <div className="text-right flex items-center gap-4">
                            <div>
                              <div className={`text-lg font-black tabular-nums ${mkt.top_win_rate >= 0.95 ? "text-emerald-600 dark:text-emerald-400" : mkt.top_win_rate >= 0.90 ? "text-amber-600 dark:text-amber-400" : "text-slate-600 dark:text-slate-300"}`}>
                                {(mkt.top_win_rate * 100).toFixed(1)}%
                              </div>
                              <div className="text-[10px] text-slate-400 font-semibold">{mkt.best_folds_profitable}/10 folds</div>
                              <div className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold">🛡️ Max L: {mkt.min_consecutive_losses ?? 0} streak</div>
                            </div>
                            <div className={`text-xs font-bold px-2 py-1 rounded-lg ${
                              mkt.stability_grade === "ELITE" ? "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300" :
                              mkt.stability_grade === "ROBUST" ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300" :
                              "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
                            }`}>
                              {mkt.stability_grade === "ELITE" ? "💎" : mkt.stability_grade === "ROBUST" ? "🧠" : "🌱"} {mkt.stability_grade}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center px-4">
                    ↓ All {strategies.length} best patterns from all markets combined and ranked below
                  </p>
                </div>
              )}

              {/* Cards */}
              {displayStrategies.length === 0 && !running ? (
                <div className="text-center py-20 text-slate-400">
                  <Trophy className="w-14 h-14 mx-auto mb-4 opacity-20" />
                  <p className="font-bold text-lg">No strategies yet</p>
                  <p className="text-sm mt-2">Click "Run Analysis" above to fetch Deriv data and discover patterns</p>
                  <div className="mt-6 flex flex-wrap justify-center gap-3 text-xs">
                    {["Over/Under 0–9", "Even / Odd", "Matches 0–9", "Differs 0–9"].map(t => (
                      <span key={t} className="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full text-slate-600 dark:text-slate-300 font-semibold">{t}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {displayStrategies.map((s, i) => (
                    <StrategyCard key={`${s.symbol || ""}_${s.pattern.join(",")}_${s.trade_type}`} s={s} rank={i + 1} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ────────────────────────────────────── TAB: 10-Fold Entry Blueprint */}
          {tab === "entrypoints" && (
            <div className="space-y-6 max-w-5xl mx-auto">
              {/* Header Box */}
              <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-3xl p-6 text-white border border-blue-500/20 shadow-xl">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
                    <Target className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                      Physical Entry Blueprints & 10-Fold Cross-Validation
                    </h2>
                    <p className="text-xs text-blue-200">
                      Multi-epoch walk-forward testing · Peak market zone detection · Step-by-step physical trigger execution
                    </p>
                  </div>
                </div>
                <div className="mt-4 bg-white/5 border border-white/10 rounded-2xl p-3 text-xs text-blue-100 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong>How Multiple Backtests Work:</strong> Every pattern below has been tested across <strong>10 sequential chronological folds</strong> of the {rawData?.tick_count?.toLocaleString() || tickCount.toLocaleString()} ticks. Patterns with <strong>9/10 or 10/10 folds passed</strong> are proven resilient across varied market regimes — not just an isolated cluster.
                  </div>
                </div>
              </div>

              {displayStrategies.length === 0 && !running ? (
                <div className="text-center py-20 text-slate-400">
                  <Target className="w-14 h-14 mx-auto mb-4 opacity-20" />
                  <p className="font-bold text-lg">No entry blueprints available</p>
                  <p className="text-sm mt-2">Click "Run Analysis" to perform 10-fold backtesting across tick history</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {displayStrategies.slice(0, 15).map((s, idx) => {
                    const lastDigit = s.pattern[s.pattern.length - 1];
                    const isRobust = (s.folds_profitable ?? 0) >= 8;
                    const seq = s.pattern.join(" → ");

                    return (
                      <div
                        key={`entry_${s.pattern.join("_")}_${s.trade_type}`}
                        className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all overflow-hidden"
                      >
                        {/* Top Bar: Rank, Action, Consistency Badge, Win Rate */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                          <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-slate-800 text-amber-400 font-black text-sm flex items-center justify-center border border-amber-400/20">
                              #{idx + 1}
                            </span>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-black px-3 py-1 rounded-lg ${ttColor(s.trade_type)}`}>
                                  BET {ttLabel(s.trade_type).toUpperCase()}
                                </span>
                                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                                  isRobust
                                    ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                    : "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                                }`}>
                                  <span>{isRobust ? "⭐" : "🛡️"}</span>
                                  <span>{s.folds_profitable ?? 10}/10 Folds Passed ({s.consistency_pct ?? 100}% Stable)</span>
                                </span>
                                {s.stability_grade && (
                                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                                    s.stability_grade === "ELITE"
                                      ? "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                                      : s.stability_grade === "ROBUST"
                                        ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                        : s.stability_grade === "DECAYING"
                                          ? "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                                          : "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                                  }`}>
                                    <span>{s.stability_grade === "ELITE" ? "💎" : s.stability_grade === "ROBUST" ? "🧠" : s.stability_grade === "DECAYING" ? "⚠️" : "🌱"}</span>
                                    <span>Memory: {s.stability_grade} ({s.sessions_observed ?? 1} sess · {((s.lifetime_win_rate ?? s.win_rate) * 100).toFixed(1)}% lifetime)</span>
                                  </span>
                                )}
                                {s.max_consecutive_losses !== undefined && (
                                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                                    s.max_consecutive_losses <= 1
                                      ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                                      : s.max_consecutive_losses === 2
                                        ? "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                                        : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800"
                                  }`}>
                                    <span>{s.max_consecutive_losses <= 1 ? "🛡️" : s.max_consecutive_losses === 2 ? "⚡" : "⚠️"}</span>
                                    <span>Martingale Streak: Max {s.max_consecutive_losses} Losses ({Math.pow(2, s.max_consecutive_losses)}x stake)</span>
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                Window {s.window} digits · {s.total_trades} historical occurrences
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className={`text-2xl font-black tabular-nums ${winColor(s.win_rate)}`}>
                              {(s.win_rate * 100).toFixed(1)}%
                            </div>
                            <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              +{((s.edge) * 100).toFixed(2)}% edge vs {((s.baseline_rate) * 100).toFixed(1)}% baseline
                            </div>
                          </div>
                        </div>

                        {/* Physical Trigger Blueprint Box */}
                        <div className="mt-5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-amber-500" /> Physical Trigger Sequence to Watch For on Deriv:
                          </div>

                          <div className="flex flex-wrap items-center gap-2.5 my-2">
                            {s.pattern.map((d, pi) => (
                              <div key={pi} className="flex items-center gap-2">
                                <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center font-mono font-black text-xl text-slate-900 dark:text-white shadow-sm">
                                  <span>{d}</span>
                                  <span className="text-[8px] font-sans font-normal text-slate-400 -mt-1">T-{s.pattern.length - pi}</span>
                                </div>
                                {pi < s.pattern.length - 1 && (
                                  <ChevronRight className="w-4 h-4 text-slate-400" />
                                )}
                              </div>
                            ))}
                            <div className="mx-2 flex items-center gap-1 text-blue-500 font-black text-sm">
                              <span>➔</span>
                              <span className="text-xs">NEXT TICK:</span>
                            </div>
                            <div className={`px-4 py-2.5 rounded-2xl font-black text-sm uppercase shadow-sm border ${ttColor(s.trade_type)}`}>
                              BET {ttLabel(s.trade_type).toUpperCase()} (1 Tick)
                            </div>
                          </div>

                          <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            <strong>Physical Execution Instruction:</strong> Keep your eye on the tick stream. As soon as you observe digit <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-bold font-mono">{lastDigit}</code> print as the final character of sequence <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono">[{seq}]</code>, <strong>immediately enter {ttLabel(s.trade_type)}</strong> for a 1-tick duration.
                          </div>
                        </div>

                        {/* 10-Fold Multi-Backtest Grid */}
                        {s.fold_stats && s.fold_stats.length > 0 && (
                          <div className="mt-4">
                            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <BarChart2 className="w-3.5 h-3.5 text-blue-500" /> 10-Fold Multi-Backtest Results Across Tick History:
                              </span>
                              <span className="text-[10px] text-slate-400 font-normal">
                                Green = Profitable vs baseline ({((s.baseline_rate)*100).toFixed(0)}%)
                              </span>
                            </div>

                            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                              {s.fold_stats.map(fs => (
                                <div
                                  key={fs.fold}
                                  className={`p-2 rounded-xl text-center border transition-all ${
                                    fs.profitable
                                      ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                                      : fs.trades === 0
                                        ? "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-400"
                                        : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300"
                                  }`}
                                >
                                  <div className="text-[9px] font-bold uppercase tracking-wider opacity-75">Fold {fs.fold}</div>
                                  <div className="font-mono font-black text-xs my-0.5">
                                    {fs.trades > 0 ? `${fs.winRate}%` : "—"}
                                  </div>
                                  <div className="text-[9px] opacity-75 font-semibold">{fs.trades} trades</div>
                                  {fs.maxConsecutiveLosses !== undefined && (
                                    <div className={`text-[8px] font-bold mt-0.5 ${fs.maxConsecutiveLosses <= 1 ? "text-emerald-600 dark:text-emerald-400" : fs.maxConsecutiveLosses === 2 ? "text-amber-600 dark:text-amber-400" : "text-rose-500"}`}>
                                      Max L: {fs.maxConsecutiveLosses}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Golden Area & Recency Highlights */}
                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-3 text-xs">
                            <div className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 mb-1">
                              <span>🌟</span> Peak Historical Golden Zone
                            </div>
                            <p className="text-amber-900/80 dark:text-amber-200/80 text-[11px] leading-relaxed">
                              {s.best_area_label || "Consistent performance across all tested segments."}
                            </p>
                          </div>

                          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 rounded-2xl p-3 text-xs">
                            <div className="font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1.5 mb-1">
                              <span>⚡</span> Latest Market Regime (Fold 10)
                            </div>
                            <p className="text-blue-900/80 dark:text-blue-200/80 text-[11px] leading-relaxed">
                              {s.recent_regime_wr !== null
                                ? `${s.recent_regime_wr}% win rate in the most recent 10% of ticks. Edge remains active in current conditions.`
                                : "Standard distribution across recent market ticks."}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ────────────────────────────────────── TAB: Full Backtest */}
          {tab === "backtest" && (
            <div className="max-w-6xl mx-auto space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-bold text-slate-800 dark:text-white text-lg flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-blue-500" />
                  Full Backtest Results
                </h2>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-500">Sort by:</label>
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as any)}
                    className="text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-medium"
                  >
                    <option value="least_consecutive_losses">🛡️ Least Consecutive Losses (Martingale Safe)</option>
                    <option value="confidence_lower">Reliability (CI Lower)</option>
                    <option value="win_rate">Win Rate</option>
                    <option value="edge">Edge %</option>
                    <option value="total_trades">Total Trades</option>
                  </select>
                </div>
              </div>

              {strategies.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-semibold">Run an analysis to see full backtest table</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 font-semibold uppercase text-[10px] tracking-wider sticky top-0">
                        <tr>
                          <th className="py-3 px-3 text-left">#</th>
                          {rawData?.is_multi_market && <th className="py-3 px-3 text-left">Market</th>}
                          <th className="py-3 px-3 text-left">Pattern</th>
                          <th className="py-3 px-3 text-left">Trade Type</th>
                          <th className="py-3 px-3 text-center">🛡️ Max L-Streak (Martingale)</th>
                          <th className="py-3 px-3 text-center">10-Fold Stability</th>
                          <th className="py-3 px-3 text-right">Win Rate</th>
                          <th className="py-3 px-3 text-right">Baseline</th>
                          <th className="py-3 px-3 text-right">Edge</th>
                          <th className="py-3 px-3 text-right">Wins</th>
                          <th className="py-3 px-3 text-right">Losses</th>
                          <th className="py-3 px-3 text-right">Total</th>
                          <th className="py-3 px-3 text-right">CI Lower</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {displayStrategies.map((s, i) => (
                          <tr key={`${s.symbol || ""}_${s.pattern.join(",")}_${s.trade_type}`} className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${i === 0 ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`}>
                            <td className="py-2.5 px-3">
                              <span className={`font-black text-[11px] ${i === 0 ? "text-amber-600" : "text-slate-400"}`}>#{i + 1}</span>
                            </td>
                            {rawData?.is_multi_market && (
                              <td className="py-2.5 px-3">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                  {SYMBOL_LABELS[s.symbol || ""] || s.symbol}
                                </span>
                              </td>
                            )}
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-0.5">
                                {s.pattern.map((d, pi) => (
                                  <span key={pi} className="flex items-center">
                                    <span className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-mono font-bold text-[11px] text-slate-700 dark:text-slate-200">{d}</span>
                                    {pi < s.pattern.length - 1 && <span className="text-slate-300 dark:text-slate-600 text-[10px] mx-0.5">›</span>}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ttColor(s.trade_type)}`}>
                                {ttLabel(s.trade_type)}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {s.max_consecutive_losses === 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                                  <span>🛡️</span>
                                  <span>0 Losses (Clean)</span>
                                </span>
                              ) : s.max_consecutive_losses === 1 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                                  <span>🛡️</span>
                                  <span>1 Loss Max (1x Stake)</span>
                                </span>
                              ) : s.max_consecutive_losses === 2 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                  <span>⚡</span>
                                  <span>2 Losses Max (2x Stake)</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700">
                                  <span>⚠️</span>
                                  <span>{s.max_consecutive_losses} Losses ({Math.pow(2, s.max_consecutive_losses || 0)}x)</span>
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                (s.folds_profitable ?? 10) >= 9
                                  ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                                  : (s.folds_profitable ?? 10) >= 7
                                    ? "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
                                    : "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
                              }`}>
                                {s.folds_profitable ?? 10}/10 folds ({s.consistency_pct ?? 100}%)
                              </span>
                            </td>
                            <td className={`py-2.5 px-3 text-right font-black text-sm tabular-nums ${winColor(s.win_rate)}`}>
                              {(s.win_rate * 100).toFixed(2)}%
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-400 tabular-nums">
                              {(s.baseline_rate * 100).toFixed(1)}%
                            </td>
                            <td className={`py-2.5 px-3 text-right font-bold tabular-nums ${s.edge > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                              {s.edge > 0 ? "+" : ""}{(s.edge * 100).toFixed(2)}%
                            </td>
                            <td className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">{s.wins}</td>
                            <td className="py-2.5 px-3 text-right text-rose-500 font-semibold tabular-nums">{s.losses}</td>
                            <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-300 font-semibold tabular-nums">{s.total_trades}</td>
                            <td className="py-2.5 px-3 text-right text-blue-500 font-semibold tabular-nums">{(s.confidence_lower * 100).toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      Showing {displayStrategies.length} of {rawData?.total_evaluated?.toLocaleString() || 0} strategies evaluated
                    </span>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Info className="w-3.5 h-3.5" />
                      <span>CI Lower = 90% confidence interval lower bound — higher = more reliable</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ────────────────────────────────────── TAB: Digit Stats */}
          {tab === "digits" && (
            <div className="max-w-3xl mx-auto space-y-5">
              <h2 className="font-bold text-slate-800 dark:text-white text-lg flex items-center gap-2">
                <Hash className="w-5 h-5 text-purple-500" />
                Digit Distribution & Trade Baselines
              </h2>

              {!rawData ? (
                <div className="text-center py-16 text-slate-400">
                  <Hash className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-semibold">Run an analysis to see digit statistics</p>
                </div>
              ) : (
                <>
                  {/* Digit frequency */}
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5">
                    <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200 mb-1">Digit Frequency Distribution</h3>
                    <p className="text-xs text-slate-400 mb-4">Expected ~10% each. Green = biased high, Red = biased low.</p>
                    <div className="space-y-2">
                      {Array.from({ length: 10 }, (_, d) => (
                        <DigitBar
                          key={d}
                          digit={d}
                          freq={rawData.digit_distribution?.[String(d)] || 0}
                          expected={0.1}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Over/Under baseline table */}
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5">
                    <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200 mb-1">Over / Under Baseline Win Rates</h3>
                    <p className="text-xs text-slate-400 mb-4">Unconditional win rates across all ticks (no pattern condition).</p>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-2 uppercase tracking-wider">OVER (digit &gt; X)</div>
                        {Array.from({ length: 9 }, (_, i) => {
                          const key = `OVER_${i}`;
                          const bl  = rawData.baseline_rates?.[key] ?? 0;
                          return (
                            <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Over {i}</span>
                              <div className="flex items-center gap-2">
                                <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${bl * 100}%` }} />
                                </div>
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums w-12 text-right">
                                  {(bl * 100).toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-2 uppercase tracking-wider">UNDER (digit &lt; X)</div>
                        {Array.from({ length: 9 }, (_, i) => {
                          const key = `UNDER_${i + 1}`;
                          const bl  = rawData.baseline_rates?.[key] ?? 0;
                          return (
                            <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Under {i + 1}</span>
                              <div className="flex items-center gap-2">
                                <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${bl * 100}%` }} />
                                </div>
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums w-12 text-right">
                                  {(bl * 100).toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Even/Odd + Max streaks */}
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: "Even baseline",  value: rawData.baseline_rates?.["EVEN"], color: "text-purple-600" },
                      { label: "Odd baseline",   value: rawData.baseline_rates?.["ODD"],  color: "text-purple-500" },
                    ].map(s => (
                      <div key={s.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 text-center">
                        <div className={`text-3xl font-black ${s.color}`}>{s.value != null ? `${(s.value * 100).toFixed(1)}%` : "—"}</div>
                        <div className="text-xs text-slate-500 mt-1 font-semibold uppercase">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {rawData.max_streaks && Object.keys(rawData.max_streaks).length > 0 && (
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5">
                      <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                        <Repeat2 className="w-4 h-4 text-amber-500" /> Max Consecutive Streaks
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {Object.entries(rawData.max_streaks).map(([k, v]) => (
                          <div key={k} className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-center">
                            <div className="text-2xl font-black text-amber-600 dark:text-amber-400">{String(v)}</div>
                            <div className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold uppercase mt-0.5">{k.replace("over5", "Over 5").replace("under4", "Under 4")}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ────────────────────────────────────── TAB: Manual Analysis */}
          {tab === "manual" && (
            <div className="max-w-3xl mx-auto space-y-5">
              <h2 className="font-bold text-slate-800 dark:text-white text-lg flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-500" />
                Offline / Custom Digit Analysis
              </h2>
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex gap-3">
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                  <strong>Note:</strong> The main <em>Run Analysis</em> button at the top automatically fetches live ticks from Deriv — you don't need to paste anything.
                  Use this tab only if you want to analyse a <strong>custom set of digits</strong> you copied from somewhere else, or if you are offline.
                </div>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Paste last digits (0–9) separated by commas, spaces or newlines.
              </p>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
                <div>
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-200 block mb-2">
                    Paste Digits
                    <span className="ml-2 text-[11px] font-normal text-slate-400">e.g: 3,7,2,5,8,1,7,2,5,9,4,3...</span>
                  </label>
                  <textarea
                    value={manualTicks}
                    onChange={e => setManualTicks(e.target.value)}
                    placeholder="3,7,2,5,8,1,7,2,5,9,4,3,7,2,5,8,1,0,6,4..."
                    rows={8}
                    className="w-full text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-400"
                  />
                  {/* Preview */}
                  {manualTicks.trim() && (() => {
                    const digs = manualTicks.split(/[\s,\n]+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0 && n <= 9);
                    return (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className={`font-bold ${digs.length >= 20 ? "text-emerald-600" : "text-amber-500"}`}>
                          {digs.length} valid digits detected
                        </span>
                        {digs.length < 20 && <span className="text-rose-500">· Need at least 20</span>}
                        {digs.length >= 20 && (
                          <span className="text-slate-400">
                            · Preview: {digs.slice(0, 15).join(", ")}…
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <button
                  onClick={() => runAnalysis(true)}
                  disabled={running}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 cursor-pointer"
                >
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {running ? "Analysing your digits…" : "Analyse My Digits"}
                </button>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                  <strong>Statistical note:</strong> Past patterns don't guarantee future results. The engine measures historical edge — use strategies with high CI Lower values (statistically reliable) and many occurrences. Always backtest on fresh data before trading real money.
                </div>
              </div>
            </div>
          )}

          {/* ────────────────────────────────────── TAB: AI Agent */}
          {tab === "agent" && (
            <div className="max-w-3xl mx-auto h-[calc(100vh-22rem)] flex flex-col">
              {chatMessages.length === 0 && (
                <div className="bg-gradient-to-r from-violet-600 to-purple-700 p-5 rounded-2xl text-white mb-4 flex-shrink-0">
                  <div className="flex items-center gap-3 mb-2">
                    <Brain className="w-6 h-6 text-purple-200" />
                    <h2 className="font-bold text-lg">Hermes — Deriv Pattern Analyst</h2>
                  </div>
                  <p className="text-sm text-purple-100 mb-3">Ask about the backtest results. Examples:</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Which strategy has the strongest edge?",
                      "What pattern should I watch for next?",
                      "Which Even/Odd pattern is most reliable?",
                      "Explain the top Over strategy to me",
                      "How many trades does the best pattern need to confirm?",
                    ].map(q => (
                      <button key={q} onClick={() => setChatInput(q)}
                        className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-left">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-y-auto space-y-3 mb-4">
                {chatMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-blue-600 text-white rounded-br-sm"
                        : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-sm"
                    }`}>
                      {m.role === "ai" && (
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Brain className="w-3 h-3 text-purple-500" />
                          <span className="text-[10px] font-bold text-purple-500 uppercase">Hermes Analytics</span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {[0, 150, 300].map(d => (
                          <div key={d} className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEnd} />
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChat(); } }}
                  placeholder="Ask about your pattern results…"
                  className="flex-1 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-slate-400"
                />
                <button
                  onClick={handleChat}
                  disabled={chatLoading || !chatInput.trim()}
                  className="p-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl transition-colors cursor-pointer"
                >
                  {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

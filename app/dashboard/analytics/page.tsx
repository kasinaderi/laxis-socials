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
  signal: string;
  rank: number;
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

type Tab = "strategies" | "backtest" | "digits" | "manual" | "agent";

// ── Constants ─────────────────────────────────────────────────────────────────

const SYMBOLS = [
  { value: "R_10",    label: "Volatility 10 Index" },
  { value: "R_25",    label: "Volatility 25 Index" },
  { value: "R_50",    label: "Volatility 50 Index" },
  { value: "R_75",    label: "Volatility 75 Index" },
  { value: "R_100",   label: "Volatility 100 Index" },
  { value: "R_10_1S", label: "Volatility 10 (1s)" },
  { value: "R_25_1S", label: "Volatility 25 (1s)" },
  { value: "R_50_1S", label: "Volatility 50 (1s)" },
  { value: "R_75_1S", label: "Volatility 75 (1s)" },
  { value: "R_100_1S",label: "Volatility 100 (1s)" },
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
  const [running, setRunning]           = useState(false);
  const [progress, setProgress]         = useState("");
  const [analysis, setAnalysis]         = useState<Analysis | null>(null);
  const [strategies, setStrategies]     = useState<Strategy[]>([]);
  const [rawData, setRawData]           = useState<any>(null);
  const [history, setHistory]           = useState<Analysis[]>([]);
  const [filterTT, setFilterTT]         = useState("ALL");
  const [sortBy, setSortBy]             = useState<"win_rate"|"edge"|"total_trades"|"confidence_lower">("confidence_lower");
  const [chatMessages, setChatMessages] = useState<{ role: "user"|"ai"; text: string }[]>([]);
  const [chatInput, setChatInput]       = useState("");
  const [chatLoading, setChatLoading]   = useState(false);
  const [manualTicks, setManualTicks]   = useState("");
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
                // Prefer strategies from DB rows, fall back to rawOutput
                if (d.strategies && d.strategies.length > 0) {
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
                } else {
                  setStrategies(raw.top_strategies || []);
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

    const body: any = { symbol, tickCount, minOccurrences: minOccur, maxWindow, topN };

    if (useManual) {
      // Manual tab: use pasted digits
      const digits = manualTicks.split(/[\s,\n]+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0 && n <= 9);
      if (digits.length < 20) { alert("Paste at least 20 digits (0–9)."); setRunning(false); setProgress(""); return; }
      body.manualTicks = digits;
      body.fetchSource = "manual_paste";
    } else {
      // Server-side tick fetch — avoids browser WebSocket restrictions on Vercel
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

    try {
      const r = await fetch("/api/deriv/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();

      // Mode A: JS fallback — results returned inline immediately
      if (d.status === "done" && d.data) {
        const raw = d.data;
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
        setTab("strategies");
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

    const ctx = rawData
      ? `Symbol: ${rawData.symbol}. Ticks: ${rawData.tick_count}. Evaluated ${rawData.total_evaluated?.toLocaleString()} strategies. ` +
        `Top strategies: ${(rawData.top_strategies || []).slice(0, 5).map((s: Strategy) => `${s.signal} (win: ${(s.win_rate*100).toFixed(1)}%, edge: +${(s.edge*100).toFixed(2)}%)`).join("; ")}.`
      : "No analysis loaded yet.";

    try {
      const r = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `[Deriv Pattern Lab]\n${ctx}\n\nUser: ${msg}`, agentId: "analytics" }),
      });
      const d = await r.json();
      setChatMessages(p => [...p, { role: "ai", text: d.reply || d.response || "No response" }]);
    } catch (e: any) {
      setChatMessages(p => [...p, { role: "ai", text: `Error: ${e.message}` }]);
    } finally { setChatLoading(false); }
  }

  const displayStrategies = strategies
    .filter(s => filterTT === "ALL" || s.trade_type.startsWith(filterTT))
    .sort((a, b) => b[sortBy] - a[sortBy]);

  const tabs: { id: Tab; label: string; icon: any; badge?: number }[] = [
    { id: "strategies", label: "Best Strategies", icon: Trophy, badge: strategies.length },
    { id: "backtest",   label: "Full Backtest",   icon: BarChart2 },
    { id: "digits",     label: "Digit Stats",     icon: Hash },
    { id: "manual",     label: "Manual Analysis", icon: Activity },
    { id: "agent",      label: "AI Agent",        icon: Brain },
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
                className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {SYMBOLS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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

            {/* Run button */}
            <button
              onClick={() => runAnalysis(false)}
              disabled={running}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 cursor-pointer ml-auto"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? "Analysing…" : "Run Analysis"}
            </button>

            {/* Sandbox status pill + Pause button */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Status pill */}
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                sbActive
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                  : "bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sbActive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                {sbActive ? "VM Live" : "VM Paused"}
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
                  <span className="ml-auto text-xs text-slate-400">{displayStrategies.length} shown</span>
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
                    <StrategyCard key={`${s.pattern.join(",")}_${s.trade_type}`} s={s} rank={i + 1} />
                  ))}
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
                    className="text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
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
                          <th className="py-3 px-3 text-left">Pattern</th>
                          <th className="py-3 px-3 text-left">Trade Type</th>
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
                          <tr key={`${s.pattern.join(",")}_${s.trade_type}`} className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${i === 0 ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`}>
                            <td className="py-2.5 px-3">
                              <span className={`font-black text-[11px] ${i === 0 ? "text-amber-600" : "text-slate-400"}`}>#{i + 1}</span>
                            </td>
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

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import {
  FlaskConical,
  Zap,
  Brain,
  History,
  Play,
  Loader2,
  TrendingUp,
  TrendingDown,
  Repeat2,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  XCircle,
  BarChart2,
  MessageCircle,
  Send,
  Clock,
  Activity,
  Target,
  Layers,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Pattern {
  id: string;
  analysisId: string;
  patternId: string;
  type: string;
  sequence: string;       // JSON array string
  locations: string;      // JSON array string
  occurrenceCount: number;
  intervalAvg: string | null;
  intervalStddev: string | null;
  nextPredictedTick: number | null;
  confidence: string | null;
  walkForwardHitRate: string | null;
  baselineRate: string | null;
  summary: string | null;
  createdAt: string;
}

interface Analysis {
  id: string;
  status: "pending" | "running" | "done" | "error";
  inputTicks: string;
  tickCount: number;
  windowSize: number;
  similarityThreshold: string;
  maxPatterns: number;
  summary: string | null;
  rawOutput: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

type Tab = "lab" | "signals" | "agent" | "history";

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseArr(s: string): number[] {
  try { return JSON.parse(s); } catch { return []; }
}

function confColor(conf: number) {
  if (conf >= 0.75) return "text-emerald-600 dark:text-emerald-400";
  if (conf >= 0.5)  return "text-amber-500 dark:text-amber-400";
  return "text-rose-500 dark:text-rose-400";
}

function confBg(conf: number) {
  if (conf >= 0.75) return "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800";
  if (conf >= 0.5)  return "bg-amber-50  dark:bg-amber-950/60  border-amber-200  dark:border-amber-800";
  return "bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800";
}

// Mini inline bar chart for tick sequence
function TickBar({ values }: { values: number[] }) {
  if (!values.length) return null;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const range = mx - mn || 1;
  return (
    <div className="flex items-end gap-0.5 h-8 mt-1">
      {values.map((v, i) => {
        const h = Math.round(((v - mn) / range) * 28) + 4;
        return (
          <div
            key={i}
            style={{ height: h }}
            className="w-2 rounded-sm bg-blue-500/70 flex-shrink-0"
            title={String(v)}
          />
        );
      })}
    </div>
  );
}

// ── Pattern Signal Card ────────────────────────────────────────────────────────

function PatternCard({ p }: { p: Pattern }) {
  const seq   = parseArr(p.sequence);
  const locs  = parseArr(p.locations);
  const conf  = parseFloat(p.confidence || "0");
  const hitR  = parseFloat(p.walkForwardHitRate || "0");
  const baseR = parseFloat(p.baselineRate || "0");
  const edge  = hitR && baseR ? ((hitR - baseR) * 100).toFixed(1) : null;

  return (
    <div className={`rounded-2xl border p-4 ${confBg(conf)} transition-all hover:shadow-md`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {p.patternId}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 font-semibold capitalize">
            {p.type}
          </span>
        </div>
        <span className={`text-sm font-bold ${confColor(conf)}`}>
          {(conf * 100).toFixed(1)}% conf
        </span>
      </div>

      {/* Sequence visualisation */}
      <div className="flex items-center gap-1 flex-wrap mb-1">
        {seq.map((v, i) => (
          <span key={i} className="flex items-center">
            <span className="text-sm font-mono font-bold text-slate-800 dark:text-white bg-white/60 dark:bg-slate-800/60 px-1.5 py-0.5 rounded">
              {v}
            </span>
            {i < seq.length - 1 && <ChevronRight className="w-3 h-3 text-slate-400 mx-0.5" />}
          </span>
        ))}
      </div>
      <TickBar values={seq} />

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-lg p-2">
          <Repeat2 className="w-3.5 h-3.5 mx-auto text-blue-500 mb-0.5" />
          <div className="text-sm font-bold text-slate-800 dark:text-white">{p.occurrenceCount}×</div>
          <div className="text-[10px] text-slate-500">Occurrences</div>
        </div>
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-lg p-2">
          <Clock className="w-3.5 h-3.5 mx-auto text-purple-500 mb-0.5" />
          <div className="text-sm font-bold text-slate-800 dark:text-white">
            {p.intervalAvg ? `${p.intervalAvg}t` : "—"}
          </div>
          <div className="text-[10px] text-slate-500">Avg Interval</div>
        </div>
        <div className="bg-white/50 dark:bg-slate-800/50 rounded-lg p-2">
          <Target className="w-3.5 h-3.5 mx-auto text-emerald-500 mb-0.5" />
          <div className="text-sm font-bold text-slate-800 dark:text-white">
            {p.nextPredictedTick != null ? `t${p.nextPredictedTick}` : "—"}
          </div>
          <div className="text-[10px] text-slate-500">Next Pred.</div>
        </div>
      </div>

      {/* Walk-forward vs baseline */}
      {hitR > 0 && baseR > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <Activity className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span className="text-slate-500">Hit rate:</span>
          <span className={`font-bold ${hitR > baseR ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
            {(hitR * 100).toFixed(1)}%
          </span>
          <span className="text-slate-400">vs</span>
          <span className="text-slate-500">{(baseR * 100).toFixed(1)}% baseline</span>
          {edge && (
            <span className={`ml-auto font-bold text-[11px] px-1.5 py-0.5 rounded ${parseFloat(edge) > 0 ? "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300" : "bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300"}`}>
              {parseFloat(edge) > 0 ? "+" : ""}{edge}% edge
            </span>
          )}
        </div>
      )}

      {/* Occurrence locations */}
      <div className="mt-2">
        <div className="text-[10px] text-slate-500 mb-1">Locations (tick index):</div>
        <div className="flex flex-wrap gap-1">
          {locs.slice(0, 12).map((l) => (
            <span key={l} className="text-[10px] font-mono bg-white/70 dark:bg-slate-700/60 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300">
              t{l}
            </span>
          ))}
          {locs.length > 12 && (
            <span className="text-[10px] text-slate-400">+{locs.length - 12} more</span>
          )}
        </div>
      </div>

      {/* Summary */}
      {p.summary && (
        <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed border-t border-black/5 dark:border-white/5 pt-2">
          {p.summary}
        </p>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function DerivPatternLabPage() {
  const [tab, setTab]                     = useState<Tab>("lab");
  const [tickInput, setTickInput]         = useState("");
  const [windowSize, setWindowSize]       = useState(5);
  const [simThreshold, setSimThreshold]   = useState(0.82);
  const [maxPatterns, setMaxPatterns]     = useState(10);
  const [running, setRunning]             = useState(false);
  const [currentId, setCurrentId]         = useState<string | null>(null);
  const [analysis, setAnalysis]           = useState<Analysis | null>(null);
  const [patterns, setPatterns]           = useState<Pattern[]>([]);
  const [history, setHistory]             = useState<Analysis[]>([]);
  const [chatMessages, setChatMessages]   = useState<{role:"user"|"ai"; text:string}[]>([]);
  const [chatInput, setChatInput]         = useState("");
  const [chatLoading, setChatLoading]     = useState(false);
  const [regimes, setRegimes]             = useState<number[]>([]);
  const [periodPeak, setPeriodPeak]       = useState<number | null>(null);
  const pollRef                           = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef                        = useRef<HTMLDivElement>(null);

  // Load history on mount
  useEffect(() => {
    fetch("/api/deriv/status")
      .then(r => r.json())
      .then(d => { if (d.analyses) setHistory(d.analyses); })
      .catch(() => {});
  }, []);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Poll for job completion
  const startPolling = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/deriv/status?id=${id}`);
        const d = await r.json();
        if (d.analysis) {
          setAnalysis(d.analysis);
          if (d.analysis.status === "done") {
            setPatterns(d.patterns || []);
            if (d.analysis.rawOutput) {
              try {
                const raw = JSON.parse(d.analysis.rawOutput);
                setRegimes(raw.regime_changes || []);
                setPeriodPeak(raw.autocorrelation_peak ?? null);
              } catch {}
            }
            setRunning(false);
            if (pollRef.current) clearInterval(pollRef.current);
            setTab("signals");
            // Refresh history
            fetch("/api/deriv/status").then(r => r.json()).then(d => { if (d.analyses) setHistory(d.analyses); });
          } else if (d.analysis.status === "error") {
            setRunning(false);
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      } catch {}
    }, 2000);
  }, []);

  async function handleRunAnalysis() {
    const raw = tickInput.trim();
    if (!raw) return;

    const ticks = raw
      .split(/[\s,\n]+/)
      .map(s => parseFloat(s.trim()))
      .filter(n => !isNaN(n));

    if (ticks.length < 10) {
      alert("Paste at least 10 tick values separated by commas or newlines.");
      return;
    }

    setRunning(true);
    setAnalysis(null);
    setPatterns([]);
    setRegimes([]);
    setPeriodPeak(null);

    try {
      const r = await fetch("/api/deriv/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticks, windowSize, similarityThreshold: simThreshold, maxPatterns }),
      });
      const d = await r.json();
      if (d.analysisId) {
        setCurrentId(d.analysisId);
        startPolling(d.analysisId);
      } else {
        setRunning(false);
        alert(d.error || "Failed to start analysis");
      }
    } catch (e: any) {
      setRunning(false);
      alert(e.message);
    }
  }

  async function loadHistoryItem(a: Analysis) {
    setAnalysis(a);
    setCurrentId(a.id);
    if (a.status === "done") {
      const r = await fetch(`/api/deriv/status?id=${a.id}`);
      const d = await r.json();
      setPatterns(d.patterns || []);
      if (a.rawOutput) {
        try {
          const raw = JSON.parse(a.rawOutput);
          setRegimes(raw.regime_changes || []);
          setPeriodPeak(raw.autocorrelation_peak ?? null);
        } catch {}
      }
      setTab("signals");
    }
  }

  async function handleChat() {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setChatLoading(true);

    // Build context from current patterns
    const context = patterns.length
      ? `Current analysis: ${analysis?.summary || ""}. Patterns found: ${patterns.map(p => `${p.patternId} seq=${p.sequence} conf=${p.confidence} hitRate=${p.walkForwardHitRate}`).join("; ")}.`
      : "No analysis results loaded yet.";

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `[Deriv Pattern Lab Context]\n${context}\n\nUser question: ${userMsg}`,
          agentId: "analytics",
        }),
      });
      const d = await r.json();
      setChatMessages(prev => [...prev, { role: "ai", text: d.reply || d.response || "No response" }]);
    } catch (e: any) {
      setChatMessages(prev => [...prev, { role: "ai", text: `Error: ${e.message}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  // ── Tick input preview ──────────────────────────────────────────────────────
  const previewTicks = tickInput
    .split(/[\s,\n]+/)
    .map(s => parseFloat(s.trim()))
    .filter(n => !isNaN(n))
    .slice(0, 60);

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "lab",     label: "Pattern Lab",   icon: FlaskConical },
    { id: "signals", label: "Signal Feed",   icon: Zap },
    { id: "agent",   label: "AI Agent",      icon: Brain },
    { id: "history", label: "Experiments",   icon: History },
  ];

  return (
    <div className="flex h-screen bg-slate-100/60 dark:bg-slate-950 overflow-hidden font-sans transition-colors">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          title="Deriv Pattern Lab"
          subtitle="Tick-by-tick mathematical pattern discovery · STUMPY · SciPy · ruptures · Walk-forward validation"
        />

        {/* Tab bar */}
        <div className="flex gap-1 px-4 sm:px-6 pt-4 pb-0 border-b border-slate-200 dark:border-slate-800 overflow-x-auto flex-shrink-0">
          {tabs.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-xl border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                  active
                    ? "border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-950/40"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/40"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
                {t.id === "signals" && patterns.length > 0 && (
                  <span className="text-[10px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded-full ml-1">
                    {patterns.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6">

          {/* ── TAB: Pattern Lab ──────────────────────────────────────────── */}
          {tab === "lab" && (
            <div className="space-y-5 max-w-4xl mx-auto">

              {/* Header card */}
              <div className="bg-gradient-to-r from-blue-700 to-indigo-700 p-5 rounded-2xl text-white">
                <div className="flex items-center gap-3 mb-2">
                  <FlaskConical className="w-6 h-6 text-blue-200" />
                  <h2 className="font-bold text-lg">Deriv Tick Pattern Discovery</h2>
                </div>
                <p className="text-sm text-blue-100 leading-relaxed">
                  Paste tick data from Deriv (digits 0–9 or decimal prices). The analytics agent's
                  Python engine will find every recurring sequence, measure exactly where and when
                  they occur, and validate whether each pattern has a statistical trading edge.
                </p>
              </div>

              {/* Tick input */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-200 block mb-2">
                  Tick Data
                  <span className="ml-2 text-[11px] font-normal text-slate-400">
                    comma, space, or newline separated — e.g. 3,7,2,5,8,1,7,2,5...
                  </span>
                </label>
                <textarea
                  value={tickInput}
                  onChange={e => setTickInput(e.target.value)}
                  placeholder="Paste your Deriv ticks here, e.g:&#10;3,7,2,5,8,1,7,2,5,9,4,3,7,2,5,8,1..."
                  rows={7}
                  className="w-full text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-400"
                />

                {/* Preview bar */}
                {previewTicks.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[11px] text-slate-500 mb-1">
                      Preview — {previewTicks.length} tick{previewTicks.length > 1 ? "s" : ""} detected:
                    </div>
                    <div className="flex items-end gap-0.5 h-10 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 overflow-hidden">
                      {previewTicks.map((v, i) => {
                        const mn = Math.min(...previewTicks);
                        const mx = Math.max(...previewTicks);
                        const h = Math.round(((v - mn) / (mx - mn || 1)) * 28) + 4;
                        return (
                          <div
                            key={i}
                            style={{ height: h }}
                            className="w-1.5 rounded-sm bg-blue-500/70 flex-shrink-0"
                            title={String(v)}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Settings */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5">
                <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-500" />
                  Analysis Settings
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1.5">
                      Pattern Window Size
                      <span className="ml-1 text-[10px] text-slate-400">(3–20 ticks)</span>
                    </label>
                    <input
                      type="number"
                      min={3} max={20} value={windowSize}
                      onChange={e => setWindowSize(Number(e.target.value))}
                      className="w-full text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">How many ticks form one pattern</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1.5">
                      Similarity Threshold
                      <span className="ml-1 text-[10px] text-slate-400">(0.5–0.99)</span>
                    </label>
                    <input
                      type="number"
                      step={0.01} min={0.5} max={0.99} value={simThreshold}
                      onChange={e => setSimThreshold(Number(e.target.value))}
                      className="w-full text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Higher = stricter match required</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1.5">
                      Max Patterns
                    </label>
                    <input
                      type="number"
                      min={1} max={50} value={maxPatterns}
                      onChange={e => setMaxPatterns(Number(e.target.value))}
                      className="w-full text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Top N patterns to return</p>
                  </div>
                </div>
              </div>

              {/* Run button + status */}
              <div className="flex items-center gap-4">
                <button
                  onClick={handleRunAnalysis}
                  disabled={running || !tickInput.trim()}
                  className="flex items-center gap-2.5 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 cursor-pointer"
                >
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {running ? "Running Analysis…" : "Run Pattern Analysis"}
                </button>

                {running && (
                  <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 animate-pulse">
                    <Activity className="w-4 h-4" />
                    Python engine running inside analytics VM…
                  </div>
                )}
              </div>

              {/* Status card */}
              {analysis && (
                <div className={`rounded-2xl border p-4 ${analysis.status === "done" ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800" : analysis.status === "error" ? "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800" : "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {analysis.status === "done" ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : analysis.status === "error" ? <XCircle className="w-4 h-4 text-rose-500" /> : <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                    <span className="text-sm font-bold text-slate-800 dark:text-white capitalize">{analysis.status}</span>
                    <span className="text-xs text-slate-500">· {analysis.tickCount} ticks · window {analysis.windowSize}</span>
                  </div>
                  {analysis.summary && <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{analysis.summary}</p>}
                  {analysis.error && <p className="text-xs text-rose-600 dark:text-rose-400">{analysis.error}</p>}
                  {analysis.status === "done" && (
                    <button onClick={() => setTab("signals")} className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer">
                      View Signal Feed <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}

              {/* Engine info */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5">
                <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-indigo-500" />
                  What the Engine Discovers
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "STUMPY", desc: "Repeated subsequences + exact tick positions", color: "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300" },
                    { label: "SciPy FFT", desc: "Dominant periods + autocorrelation cycles", color: "bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300" },
                    { label: "ruptures", desc: "Regime change-points — where behavior shifts", color: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300" },
                    { label: "Walk-Forward", desc: "Predictive edge vs baseline — real validation", color: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300" },
                  ].map(e => (
                    <div key={e.label} className={`rounded-xl p-3 ${e.color}`}>
                      <div className="text-xs font-bold mb-1">{e.label}</div>
                      <div className="text-[11px] opacity-80 leading-snug">{e.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── TAB: Signal Feed ──────────────────────────────────────────── */}
          {tab === "signals" && (
            <div className="space-y-5 max-w-5xl mx-auto">

              {/* Summary bar */}
              {analysis?.status === "done" && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "Patterns Found", value: String(patterns.length), icon: Repeat2, color: "text-blue-500" },
                    { label: "Regime Changes", value: String(regimes.length), icon: AlertTriangle, color: "text-amber-500" },
                    { label: "Dominant Period", value: periodPeak ? `${periodPeak} ticks` : "—", icon: Activity, color: "text-purple-500" },
                    {
                      label: "Best Confidence",
                      value: patterns.length ? `${(Math.max(...patterns.map(p => parseFloat(p.confidence || "0"))) * 100).toFixed(1)}%` : "—",
                      icon: Target,
                      color: "text-emerald-500",
                    },
                  ].map(s => {
                    const Icon = s.icon;
                    return (
                      <div key={s.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4">
                        <div className="flex items-center justify-between text-slate-500 mb-1.5">
                          <span className="text-xs font-semibold">{s.label}</span>
                          <Icon className={`w-4 h-4 ${s.color}`} />
                        </div>
                        <div className="text-xl font-bold text-slate-800 dark:text-white">{s.value}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Analysis summary */}
              {analysis?.summary && (
                <div className="bg-gradient-to-r from-indigo-600 to-blue-700 p-4 rounded-2xl text-white">
                  <div className="flex items-center gap-2 mb-1">
                    <Brain className="w-4 h-4 text-indigo-200" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-200">Engine Report</span>
                  </div>
                  <p className="text-sm leading-relaxed">{analysis.summary}</p>
                </div>
              )}

              {/* Regime changes */}
              {regimes.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-amber-200 dark:border-amber-800/60 p-4">
                  <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Regime Change-Points
                  </h3>
                  <p className="text-xs text-slate-500 mb-2">Tick positions where the data's statistical behavior shifts (ruptures algorithm):</p>
                  <div className="flex flex-wrap gap-2">
                    {regimes.map(r => (
                      <span key={r} className="font-mono text-xs bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 px-2.5 py-1 rounded-lg font-semibold">
                        t{r}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Pattern cards */}
              {patterns.length === 0 && !running ? (
                <div className="text-center py-16 text-slate-400">
                  <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-semibold">No patterns yet</p>
                  <p className="text-sm mt-1">Run an analysis in the Pattern Lab tab</p>
                  <button
                    onClick={() => setTab("lab")}
                    className="mt-4 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Go to Pattern Lab →
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {patterns
                    .sort((a, b) => parseFloat(b.confidence || "0") - parseFloat(a.confidence || "0"))
                    .map(p => <PatternCard key={p.id} p={p} />)
                  }
                </div>
              )}
            </div>
          )}

          {/* ── TAB: AI Agent ──────────────────────────────────────────────── */}
          {tab === "agent" && (
            <div className="max-w-3xl mx-auto h-[calc(100vh-16rem)] flex flex-col">
              {/* Intro */}
              {chatMessages.length === 0 && (
                <div className="bg-gradient-to-r from-violet-600 to-purple-700 p-5 rounded-2xl text-white mb-4 flex-shrink-0">
                  <div className="flex items-center gap-3 mb-2">
                    <Brain className="w-6 h-6 text-purple-200" />
                    <h2 className="font-bold text-lg">Hermes — Pattern Analysis Agent</h2>
                  </div>
                  <p className="text-sm text-purple-100 leading-relaxed">
                    Ask about your discovered patterns. Examples:
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      "Which pattern has the strongest edge?",
                      "When is P1 next predicted to occur?",
                      "Is there a dominant cycle in the data?",
                      "Which patterns to watch most closely?",
                    ].map(q => (
                      <button
                        key={q}
                        onClick={() => { setChatInput(q); }}
                        className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto space-y-3 mb-4">
                {chatMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-blue-600 text-white rounded-br-sm"
                        : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-sm"
                    }`}>
                      {m.role === "ai" && (
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Brain className="w-3.5 h-3.5 text-purple-500" />
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
                        <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="flex gap-2 flex-shrink-0">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChat(); } }}
                  placeholder="Ask about your patterns…"
                  className="flex-1 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-slate-400"
                />
                <button
                  onClick={handleChat}
                  disabled={chatLoading || !chatInput.trim()}
                  className="p-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors cursor-pointer"
                >
                  {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* ── TAB: Experiment History ────────────────────────────────────── */}
          {tab === "history" && (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-800 dark:text-white">Experiment Log</h2>
                <button
                  onClick={() => fetch("/api/deriv/status").then(r => r.json()).then(d => { if (d.analyses) setHistory(d.analyses); })}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
              </div>

              {history.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-semibold">No experiments yet</p>
                  <p className="text-sm mt-1">Run your first analysis in the Pattern Lab</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="py-2.5 px-4 text-left">Time</th>
                        <th className="py-2.5 px-4 text-left">Ticks</th>
                        <th className="py-2.5 px-4 text-left">Window</th>
                        <th className="py-2.5 px-4 text-left">Status</th>
                        <th className="py-2.5 px-4 text-left">Summary</th>
                        <th className="py-2.5 px-4"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {history.map(a => (
                        <tr key={a.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                            {new Date(a.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-slate-700 dark:text-slate-300">{a.tickCount}</td>
                          <td className="py-3 px-4 font-mono text-slate-500">{a.windowSize}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                              a.status === "done"    ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400" :
                              a.status === "error"   ? "bg-rose-50 dark:bg-rose-950/60 text-rose-500"                                :
                              a.status === "running" ? "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400"             :
                              "bg-slate-100 dark:bg-slate-800 text-slate-500"
                            }`}>
                              ● {a.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-500 max-w-[300px] truncate">{a.summary || a.error || "—"}</td>
                          <td className="py-3 px-4">
                            {a.status === "done" && (
                              <button
                                onClick={() => loadHistoryItem(a)}
                                className="text-blue-600 dark:text-blue-400 hover:underline text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                Load <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

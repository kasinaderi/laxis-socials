import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { derivAnalyses, derivStrategies, appConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Sandbox } from "@e2b/desktop";
import { installDerivEngineInSandbox } from "@/lib/deriv-engine";
import { installHermesInSandbox } from "@/lib/hermes";

const apiKey = process.env.E2B_API_KEY || "";

// ── Shared in-process sandbox cache (survives across requests in same runtime) ─
const activeSandboxes: Map<string, any> =
  (global as any).__activeSandboxes ?? ((global as any).__activeSandboxes = new Map());

// ── Job registry: analysisId → result file path on the VM ────────────────────
const runningJobs: Map<string, string> =
  (global as any).__derivRunningJobs ?? ((global as any).__derivRunningJobs = new Map());

// ── Config keys ───────────────────────────────────────────────────────────────
const PAUSED_ID_KEY = "analytics_deriv_paused_sandbox_id";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getPausedSandboxId(): Promise<string | null> {
  try {
    const row = await db.select().from(appConfig).where(eq(appConfig.key, PAUSED_ID_KEY)).get();
    return row?.value || null;
  } catch { return null; }
}

async function setPausedSandboxId(id: string | null) {
  const now = new Date().toISOString();
  try {
    if (id) {
      await db.insert(appConfig).values({ key: PAUSED_ID_KEY, value: id, updatedAt: now })
        .onConflictDoUpdate({ target: appConfig.key, set: { value: id, updatedAt: now } }).run();
    } else {
      await db.delete(appConfig).where(eq(appConfig.key, PAUSED_ID_KEY)).run();
    }
  } catch { /* non-fatal */ }
}

/**
 * Get the analytics E2B sandbox.
 * Priority:
 *   1. Already running in this process (activeSandboxes)
 *   2. Previously paused — reconnect via Sandbox.connect(sandboxId)
 *   3. NO auto-create — user must start sandbox from the AI Agent page.
 * NEVER destroys a sandbox. NEVER creates one without user authorization.
 */
async function getAnalyticsSandbox(): Promise<any> {
  // 1. Live in-process sandbox
  for (const [key, sb] of activeSandboxes.entries()) {
    if (key.includes("analytics") || key.includes("deriv")) {
      try { if (await sb.isRunning()) return sb; } catch {}
    }
  }

  if (!apiKey?.startsWith("e2b_")) return null;

  // 2. Try reconnecting to a paused sandbox via Sandbox.connect(sandboxId)
  const pausedId = await getPausedSandboxId();
  if (pausedId) {
    try {
      console.log(`[DerivLab] Reconnecting to paused sandbox ${pausedId}…`);
      const sb = await (Sandbox as any).connect(pausedId, { apiKey, timeoutMs: 3_600_000 });
      activeSandboxes.set("deriv_analytics", sb);
      await setPausedSandboxId(null); // clear — it's live again
      console.log(`[DerivLab] Sandbox reconnected ✓`);
      return sb;
    } catch (e: any) {
      // Reconnect failed — do NOT auto-create. User must restart from AI Agent page.
      console.warn(`[DerivLab] Reconnect failed: ${e.message}. User must restart sandbox from AI Agent page.`);
      await setPausedSandboxId(null); // clear stale ID
      return null;
    }
  }

  // 3. No sandbox found — return null. JS fallback will run instead.
  // User must start the analytics sandbox from the AI Agent page to use live Deriv data.
  return null;
}

// ── POST /api/deriv/analyze ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      symbol         = "R_10",
      tickCount      = 5000,
      minOccurrences = 30,
      maxWindow      = 7,
      topN           = 30,
      manualTicks,
    } = body;

    const now        = new Date().toISOString();
    const analysisId = `da_${Date.now()}`;

    // ── MODE A: No E2B — run JS fallback synchronously ────────────────────────
    const sb = await getAnalyticsSandbox().catch(() => null);

    if (!sb) {
      const digits = manualTicks && manualTicks.length > 0 ? manualTicks : [];
      const data   = runStatFallback(digits, maxWindow, minOccurrences, topN, symbol);

      await db.insert(derivAnalyses).values({
        id:                  analysisId,
        status:              data.tick_count > 0 ? "done" : "error",
        symbol,
        inputTicks:          digits.join(","),
        tickCount:           data.tick_count,
        windowSize:          maxWindow,
        similarityThreshold: String(minOccurrences),
        maxPatterns:         topN,
        summary:             data.summary,
        rawOutput:           JSON.stringify(data),
        error:               data.tick_count === 0
          ? "No digits provided — paste digits in Manual Analysis tab or connect E2B sandbox to fetch live data"
          : null,
        startedAt:   now,
        completedAt: new Date().toISOString(),
        createdAt:   now,
      }).run();

      await persistStrategies(analysisId, data.top_strategies || []);

      return NextResponse.json({
        analysisId,
        status: data.tick_count > 0 ? "done" : "error",
        data,
      });
    }

    // ── MODE B: E2B available — fire Python as daemon; sandbox stays alive ───
    await db.insert(derivAnalyses).values({
      id:                  analysisId,
      status:              "running",
      symbol,
      inputTicks:          manualTicks ? manualTicks.join(",") : "",
      tickCount:           manualTicks?.length || tickCount,
      windowSize:          maxWindow,
      similarityThreshold: String(minOccurrences),
      maxPatterns:         topN,
      startedAt:           now,
      createdAt:           now,
    }).run();

    await installDerivEngineInSandbox(sb).catch(() => {});

    const envStr = [
      `DERIV_SYMBOL="${symbol}"`,
      `TICK_COUNT="${tickCount}"`,
      `MIN_OCCURRENCES="${minOccurrences}"`,
      `MAX_WINDOW="${maxWindow}"`,
      `TOP_N="${topN}"`,
    ].join(" ");

    if (manualTicks && manualTicks.length > 0) {
      // Digits from deriv-fetcher are already clean 0-9 integers in
      // chronological order (oldest→newest). Validate and write to JSON file.
      const safeDigits = manualTicks
        .slice(0, 10_000)
        .filter((d: any) => Number.isInteger(d) && d >= 0 && d <= 9);
      const digitsJson = JSON.stringify(safeDigits);
      // Use printf to avoid shell echo mangling of special chars in large arrays
      await sb.commands.run(
        `printf '%s' '${digitsJson.replace(/'/g, "'\\''")}' > /tmp/manual_ticks_${analysisId}.json`
      ).catch(() => {});
    }

    const resultFile = `/tmp/deriv_result_${analysisId}.json`;
    const pidFile    = `/tmp/deriv_pid_${analysisId}.txt`;
    const doneFlag   = `/tmp/deriv_done_${analysisId}.flag`;  // written by script on completion

    // MANUAL_TICKS_FILE: Python engine reads this first, skips WebSocket fetch entirely.
    // Digits in that file are already extracted 0-9 integers with correct precision.
    const launchCmd = manualTicks && manualTicks.length > 0
      ? `nohup bash -c 'MANUAL_TICKS_FILE=/tmp/manual_ticks_${analysisId}.json ${envStr} python3 /home/user/deriv_analyze.py > ${resultFile} 2>/tmp/deriv_err_${analysisId}.log && touch ${doneFlag}' & echo $! > ${pidFile}`
      : `nohup bash -c '${envStr} python3 /home/user/deriv_analyze.py > ${resultFile} 2>/tmp/deriv_err_${analysisId}.log && touch ${doneFlag}' & echo $! > ${pidFile}`;

    await sb.commands.run(launchCmd, { timeout: 10_000 }).catch(() => {});

    runningJobs.set(analysisId, resultFile);

    return NextResponse.json({ analysisId, status: "running" });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── Persist strategies to DB ──────────────────────────────────────────────────
async function persistStrategies(analysisId: string, strategies: any[]) {
  const now = new Date().toISOString();
  for (let i = 0; i < strategies.length; i++) {
    const s = strategies[i];
    await db.insert(derivStrategies).values({
      id:              `ds_${Date.now()}_${i}`,
      analysisId,
      pattern:         JSON.stringify(s.pattern),
      windowSize:      s.window,
      tradeType:       s.trade_type,
      totalTrades:     s.total_trades,
      wins:            s.wins,
      losses:          s.losses,
      winRate:         String(s.win_rate),
      baselineRate:    String(s.baseline_rate),
      edge:            String(s.edge),
      confidenceLower: String(s.confidence_lower),
      signal:          s.signal,
      rank:            i + 1,
      createdAt:       now,
    }).run().catch(() => {});
  }
}

// ── In-process JS stat fallback (no E2B) ─────────────────────────────────────
function runStatFallback(
  inputDigits: number[],
  maxWindow: number,
  minOccurrences: number,
  topN: number,
  symbol: string
): any {
  // Digits arriving here are already extracted 0-9 integers from deriv-fetcher.ts
  // (which uses the correct per-symbol decimal precision). Do NOT re-extract —
  // just validate they are clean integers in range [0,9].
  const digits = inputDigits
    .map(v => (typeof v === "number" ? v : parseInt(String(v), 10)))
    .filter(d => Number.isInteger(d) && d >= 0 && d <= 9);

  const N = digits.length;

  if (N < 20) return {
    symbol, tick_count: 0, digits_sample: [], digit_distribution: {},
    baseline_rates: {}, top_strategies: [], total_evaluated: 0,
    summary: "Not enough digits. Need at least 20.",
    fetch_source: "manual", api_error: null, max_streaks: {}
  };

  const outcomeFor = (d: number): Record<string, number> => {
    const o: Record<string, number> = {};
    for (let x = 0; x < 9; x++)   o[`OVER_${x}`]    = d > x ? 1 : 0;
    for (let x = 1; x < 10; x++)  o[`UNDER_${x}`]   = d < x ? 1 : 0;
    o["EVEN"] = d % 2 === 0 ? 1 : 0;
    o["ODD"]  = d % 2 === 1 ? 1 : 0;
    for (let x = 0; x < 10; x++)  o[`MATCHES_${x}`] = d === x ? 1 : 0;
    for (let x = 0; x < 10; x++)  o[`DIFFERS_${x}`] = d !== x ? 1 : 0;
    return o;
  };

  const allOutcomes = digits.map(d => outcomeFor(d));
  const tradeTypes  = Object.keys(allOutcomes[0]);

  const baseline: Record<string, number> = {};
  for (const tt of tradeTypes)
    baseline[tt] = allOutcomes.reduce((a, o) => a + o[tt], 0) / N;

  const wilsonLower = (wins: number, n: number, z = 1.645) => {
    if (n === 0) return 0;
    const p = wins / n;
    return (p + z*z/(2*n) - z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n))) / (1 + z*z/n);
  };

  const strategies: any[] = [];

  for (let w = 2; w <= Math.min(maxWindow, 7); w++) {
    const patMap: Record<string, Record<string, { wins: number; total: number }>> = {};

    for (let i = 0; i < N - w; i++) {
      const key = digits.slice(i, i + w).join(",");
      const nxt = allOutcomes[i + w];
      if (!patMap[key]) patMap[key] = {};
      for (const tt of tradeTypes) {
        if (!patMap[key][tt]) patMap[key][tt] = { wins: 0, total: 0 };
        patMap[key][tt].total++;
        patMap[key][tt].wins += nxt[tt];
      }
    }

    for (const [patKey, ttMap] of Object.entries(patMap)) {
      for (const [tt, { wins, total }] of Object.entries(ttMap)) {
        if (total < minOccurrences) continue;
        const wr   = wins / total;
        const bl   = baseline[tt] || 0.5;
        const edge = wr - bl;
        const cl   = wilsonLower(wins, total);
        const pat  = patKey.split(",").map(Number);
        const seq  = pat.join("→");
        const pct  = (wr * 100).toFixed(1);
        const [kind, x] = tt.split("_");
        const sigMap: Record<string, string> = {
          EVEN:    `After [${seq}] → BET EVEN (${pct}% on ${total} trades)`,
          ODD:     `After [${seq}] → BET ODD (${pct}% on ${total} trades)`,
          OVER:    `After [${seq}] → BET OVER ${x} (${pct}% on ${total} trades)`,
          UNDER:   `After [${seq}] → BET UNDER ${x} (${pct}% on ${total} trades)`,
          MATCHES: `After [${seq}] → BET MATCHES ${x} (${pct}% on ${total} trades)`,
          DIFFERS: `After [${seq}] → BET DIFFERS ${x} (${pct}% on ${total} trades)`,
        };
        strategies.push({
          pattern: pat, window: w, trade_type: tt,
          total_trades: total, wins, losses: total - wins,
          win_rate:         Math.round(wr   * 10000) / 10000,
          baseline_rate:    Math.round(bl   * 10000) / 10000,
          edge:             Math.round(edge * 10000) / 10000,
          confidence_lower: Math.round(cl   * 10000) / 10000,
          signal: sigMap[kind] ?? `After [${seq}] → ${tt} (${pct}% on ${total} trades)`,
        });
      }
    }
  }

  strategies.sort((a, b) => b.confidence_lower - a.confidence_lower);
  const top = strategies.slice(0, topN).map((s, i) => ({ ...s, rank: i + 1 }));

  const freq: Record<string, number> = {};
  for (let d = 0; d < 10; d++)
    freq[String(d)] = Math.round(digits.filter(x => x === d).length / N * 10000) / 10000;

  const streakKeys = ["even", "odd", "over5", "under4"];
  const maxStr: Record<string, number> = { even: 0, odd: 0, over5: 0, under4: 0 };
  const cur:    Record<string, number> = { even: 0, odd: 0, over5: 0, under4: 0 };
  for (const d of digits) {
    const checks: Record<string, boolean> = { even: d%2===0, odd: d%2===1, over5: d>5, under4: d<4 };
    for (const k of streakKeys) {
      cur[k]    = checks[k] ? (cur[k] || 0) + 1 : 0;
      maxStr[k] = Math.max(maxStr[k] || 0, cur[k]);
    }
  }

  const top1 = top[0];
  return {
    symbol,
    fetch_source: "manual_js_fallback",
    api_error: null,
    tick_count: N,
    digits_sample: digits.slice(0, 30),
    digit_distribution: freq,
    baseline_rates: Object.fromEntries(
      Object.entries(baseline).map(([k, v]) => [k, Math.round(v * 10000) / 10000])
    ),
    max_streaks: maxStr,
    top_strategies: top,
    total_evaluated: strategies.length,
    summary: top1
      ? `Analysed ${N} digits (JS engine). Evaluated ${strategies.length.toLocaleString()} pattern-strategy combos. ` +
        `Best: ${top1.signal} (edge +${(top1.edge * 100).toFixed(1)}% over baseline).`
      : `Analysed ${N} digits. No patterns met the minimum ${minOccurrences} occurrence threshold.`,
  };
}

// ── Exports for status route ───────────────────────────────────────────────────
export { runningJobs, setPausedSandboxId, activeSandboxes };

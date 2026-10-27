import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { derivAnalyses, derivStrategies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Sandbox } from "@e2b/desktop";
import { installDerivEngineInSandbox } from "@/lib/deriv-engine";
import { installHermesInSandbox } from "@/lib/hermes";

const apiKey = process.env.E2B_API_KEY || "";
const activeSandboxes: Map<string, any> = (global as any).__activeSandboxes || new Map();

// Track which analysisId is running in which sandbox
const runningJobs: Map<string, string> = (global as any).__derivRunningJobs
  ?? ((global as any).__derivRunningJobs = new Map());

async function getAnalyticsSandbox(): Promise<any> {
  for (const [key, sb] of activeSandboxes.entries()) {
    if (key.includes("analytics")) {
      try { if (await sb.isRunning()) return sb; } catch {}
    }
  }
  if (apiKey?.startsWith("e2b_")) {
    try {
      const sb = await Sandbox.create({ apiKey, timeoutMs: 3600000 });
      activeSandboxes.set("deriv_analytics", sb);
      await installHermesInSandbox(sb, "analytics");
      await installDerivEngineInSandbox(sb);
      return sb;
    } catch (e: any) {
      console.warn("[DerivLab] Sandbox create error:", e.message);
    }
  }
  return null;
}

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

    // ── MODE A: No E2B — run JS fallback synchronously right now ─────────────
    // This is Vercel-safe: everything happens before we return the response.
    const sb = await getAnalyticsSandbox().catch(() => null);

    if (!sb) {
      const digits = manualTicks && manualTicks.length > 0
        ? manualTicks
        : [];                             // no VM, no API → need manual digits

      const data = runStatFallback(digits, maxWindow, minOccurrences, topN, symbol);

      // Save and return in one shot — no background process needed
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
        error:               data.tick_count === 0 ? "No digits provided — paste digits in Manual Analysis tab or connect E2B sandbox to fetch live data" : null,
        startedAt:           now,
        completedAt:         new Date().toISOString(),
        createdAt:           now,
      }).run();

      await persistStrategies(analysisId, data.top_strategies || []);

      return NextResponse.json({
        analysisId,
        status: data.tick_count > 0 ? "done" : "error",
        data,                             // return inline so UI can show results immediately
      });
    }

    // ── MODE B: E2B available — fire Python as daemon on the VM ──────────────
    // Vercel-safe: we launch the script with nohup (non-blocking), record the
    // job ID in the DB as "running", and return immediately.
    // The VM keeps computing independently. The status endpoint reads the
    // result file from the VM on each poll.

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

    // Ensure script is deployed
    await installDerivEngineInSandbox(sb).catch(() => {});

    // Build env vars
    const envStr = [
      `DERIV_SYMBOL="${symbol}"`,
      `TICK_COUNT="${tickCount}"`,
      `MIN_OCCURRENCES="${minOccurrences}"`,
      `MAX_WINDOW="${maxWindow}"`,
      `TOP_N="${topN}"`,
    ].join(" ");

    // If manual ticks provided, inject via a temp file
    if (manualTicks && manualTicks.length > 0) {
      const ticksJson = JSON.stringify(manualTicks.slice(0, 10000));
      await sb.commands.run(
        `echo '${ticksJson}' > /tmp/manual_ticks_${analysisId}.json`
      ).catch(() => {});
    }

    const resultFile = `/tmp/deriv_result_${analysisId}.json`;
    const pidFile    = `/tmp/deriv_pid_${analysisId}.txt`;

    // Launch as background daemon — nohup ensures it survives after this
    // Vercel function connection closes
    const launchCmd = manualTicks && manualTicks.length > 0
      ? `nohup bash -c 'MANUAL_TICKS_FILE=/tmp/manual_ticks_${analysisId}.json ${envStr} python3 /home/user/deriv_analyze.py > ${resultFile} 2>/tmp/deriv_err_${analysisId}.log' & echo $! > ${pidFile}`
      : `nohup bash -c '${envStr} python3 /home/user/deriv_analyze.py > ${resultFile} 2>/tmp/deriv_err_${analysisId}.log' & echo $! > ${pidFile}`;

    await sb.commands.run(launchCmd, { timeout: 10_000 }).catch(() => {});

    // Track this job so the status endpoint knows which VM + file to check
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
  const digits = inputDigits
    .map(v => {
      const n = typeof v === "number" ? v : parseInt(String(v));
      if (n >= 0 && n <= 9) return n;
      // treat as price — extract last digit
      const s = Math.abs(v).toFixed(2);
      return parseInt(s[s.length - 1]);
    })
    .filter(d => d >= 0 && d <= 9);

  const N = digits.length;

  if (N < 20) return {
    symbol, tick_count: 0, digits_sample: [], digit_distribution: {},
    baseline_rates: {}, top_strategies: [], total_evaluated: 0,
    summary: "Not enough digits. Need at least 20.",
    fetch_source: "manual", api_error: null, max_streaks: {}
  };

  // Build outcome function
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

  // Baseline rates
  const baseline: Record<string, number> = {};
  for (const tt of tradeTypes) {
    baseline[tt] = allOutcomes.reduce((a, o) => a + o[tt], 0) / N;
  }

  // Wilson CI lower bound
  const wilsonLower = (wins: number, n: number, z = 1.645) => {
    if (n === 0) return 0;
    const p = wins / n;
    return (p + z*z/(2*n) - z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n))) / (1 + z*z/n);
  };

  // Pattern discovery + backtest
  const strategies: any[] = [];

  for (let w = 2; w <= Math.min(maxWindow, 7); w++) {
    const patMap: Record<string, Record<string, { wins: number; total: number }>> = {};

    for (let i = 0; i < N - w; i++) {
      const key   = digits.slice(i, i + w).join(",");
      const nxt   = allOutcomes[i + w];
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

  // Digit frequency
  const freq: Record<string, number> = {};
  for (let d = 0; d < 10; d++) {
    freq[String(d)] = Math.round(digits.filter(x => x === d).length / N * 10000) / 10000;
  }

  // Max streaks
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

// ── Export runningJobs so status route can access it ─────────────────────────
export { runningJobs };

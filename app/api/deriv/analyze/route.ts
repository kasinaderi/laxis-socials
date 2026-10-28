import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { derivAnalyses, derivStrategies, derivPatternMemory, appConfig } from "@/db/schema";
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
      targetContract = "ALL",
      manualTicks,
    } = body;

    const now        = new Date().toISOString();
    const analysisId = `da_${Date.now()}`;

    // ── MODE A: No E2B — run JS fallback synchronously ────────────────────────
    const sb = await getAnalyticsSandbox().catch(() => null);

    if (!sb) {
      const digits = manualTicks && manualTicks.length > 0 ? manualTicks : [];
      const data   = runStatFallback(digits, maxWindow, minOccurrences, topN, symbol, targetContract);

      // Continuous Learning Memory: Update cumulative historical pattern performance
      const enrichedStrategies = await updatePatternLearningMemory(symbol, data.top_strategies || []);
      data.top_strategies = enrichedStrategies;

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

      await persistStrategies(analysisId, enrichedStrategies);

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

// ── Continuous Learning: Cumulative Pattern Memory ────────────────────────────
async function updatePatternLearningMemory(symbol: string, strategies: any[]): Promise<any[]> {
  const now = new Date().toISOString();
  const enriched: any[] = [];

  for (const s of strategies) {
    const memoryId = `${symbol}:${s.pattern.join(",")}:${s.trade_type}`;
    try {
      const existing = await db
        .select()
        .from(derivPatternMemory)
        .where(eq(derivPatternMemory.id, memoryId))
        .get();

      if (existing) {
        const newSessions = existing.sessionsObserved + 1;
        const newTrades = existing.lifetimeTrades + s.total_trades;
        const newWins = existing.lifetimeWins + s.wins;
        const newLifetimeWr = Math.round((newWins / Math.max(1, newTrades)) * 10000) / 10000;

        let grade = "ROBUST";
        if (newSessions >= 3 && newLifetimeWr >= s.baseline_rate + 0.05 && (s.consistency_pct ?? 0) >= 80) {
          grade = "ELITE";
        } else if (s.win_rate < s.baseline_rate) {
          grade = "DECAYING";
        }

        await db
          .update(derivPatternMemory)
          .set({
            sessionsObserved: newSessions,
            lifetimeTrades: newTrades,
            lifetimeWins: newWins,
            lifetimeWinRate: String(newLifetimeWr),
            lastSeenWinRate: String(s.win_rate),
            lastSeenEdge: String(s.edge),
            stabilityGrade: grade,
            bestMarketArea: s.best_area_label || existing.bestMarketArea,
            lastSeenAt: now,
          })
          .where(eq(derivPatternMemory.id, memoryId))
          .run();

        enriched.push({
          ...s,
          sessions_observed: newSessions,
          lifetime_win_rate: newLifetimeWr,
          stability_grade: grade,
        });
      } else {
        const initialGrade = (s.consistency_pct ?? 0) >= 80 ? "ROBUST" : "LEARNING";
        await db
          .insert(derivPatternMemory)
          .values({
            id: memoryId,
            symbol,
            pattern: JSON.stringify(s.pattern),
            tradeType: s.trade_type,
            sessionsObserved: 1,
            lifetimeTrades: s.total_trades,
            lifetimeWins: s.wins,
            lifetimeWinRate: String(s.win_rate),
            lastSeenWinRate: String(s.win_rate),
            lastSeenEdge: String(s.edge),
            stabilityGrade: initialGrade,
            bestMarketArea: s.best_area_label || null,
            lastSeenAt: now,
            createdAt: now,
          })
          .run();

        enriched.push({
          ...s,
          sessions_observed: 1,
          lifetime_win_rate: s.win_rate,
          stability_grade: initialGrade,
        });
      }
    } catch {
      enriched.push(s);
    }
  }

  return enriched;
}

// ── In-process JS stat fallback (no E2B) ─────────────────────────────────────
function runStatFallback(
  inputDigits: number[],
  maxWindow: number,
  minOccurrences: number,
  topN: number,
  symbol: string,
  targetContract = "ALL"
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
    fetch_source: "manual", api_error: null, max_streaks: {},
    target_contract: targetContract,
    folds_count: 10,
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
  let tradeTypes    = Object.keys(allOutcomes[0]);

  // Target Contract Filter:
  // Allows user to isolate specifically e.g. "UNDER_4", "OVER_5", "EVEN", "ODD", "DIFFERS_4", etc.
  if (targetContract && targetContract !== "ALL") {
    const norm = targetContract.trim().toUpperCase();
    if (norm === "EVEN" || norm === "ODD") {
      tradeTypes = [norm];
    } else if (norm.includes("_")) {
      tradeTypes = tradeTypes.filter(tt => tt === norm);
    } else {
      tradeTypes = tradeTypes.filter(tt => tt.startsWith(norm + "_"));
    }
    // Fallback if no exact match
    if (tradeTypes.length === 0) tradeTypes = Object.keys(allOutcomes[0]);
  }

  const baseline: Record<string, number> = {};
  for (const tt of Object.keys(allOutcomes[0]))
    baseline[tt] = allOutcomes.reduce((a, o) => a + o[tt], 0) / N;

  const wilsonLower = (wins: number, n: number, z = 1.645) => {
    if (n === 0) return 0;
    const p = wins / n;
    return (p + z*z/(2*n) - z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n))) / (1 + z*z/n);
  };

  // 10-Fold Setup: Split market ticks into 10 sequential chronological zones
  const numFolds = 10;
  const foldSize = Math.max(1, Math.floor(N / numFolds));
  const foldRanges = Array.from({ length: numFolds }, (_, f) => ({
    fold: f + 1,
    start: f * foldSize,
    end: Math.min(N, (f + 1) * foldSize),
  }));

  // Adaptive occurrence threshold: if filtering to a single specific contract,
  // allow slightly lower threshold so the user always sees top reliable patterns
  const effectiveMinOccur = (targetContract !== "ALL" && !["OVER", "UNDER", "DIFFERS", "MATCHES"].includes(targetContract))
    ? Math.max(8, Math.min(minOccurrences, Math.floor(N * 0.003)))
    : minOccurrences;

  const strategies: any[] = [];

  for (let w = 2; w <= Math.min(maxWindow, 7); w++) {
    // Map pattern key -> trade_type -> stats with 10-fold breakdown
    const patMap: Record<string, Record<string, {
      wins: number;
      total: number;
      foldWins: number[];
      foldTotals: number[];
    }>> = {};

    for (let i = 0; i < N - w; i++) {
      const key = digits.slice(i, i + w).join(",");
      const nxt = allOutcomes[i + w];
      const foldIdx = Math.min(numFolds - 1, Math.floor(i / foldSize));

      if (!patMap[key]) patMap[key] = {};
      for (const tt of tradeTypes) {
        if (!patMap[key][tt]) {
          patMap[key][tt] = {
            wins: 0,
            total: 0,
            foldWins: new Array(numFolds).fill(0),
            foldTotals: new Array(numFolds).fill(0),
          };
        }
        patMap[key][tt].total++;
        patMap[key][tt].wins += nxt[tt];
        patMap[key][tt].foldTotals[foldIdx]++;
        patMap[key][tt].foldWins[foldIdx] += nxt[tt];
      }
    }

    for (const [patKey, ttMap] of Object.entries(patMap)) {
      for (const [tt, stats] of Object.entries(ttMap)) {
        const { total, wins, foldWins, foldTotals } = stats;
        if (total < effectiveMinOccur) continue;

        const wr   = wins / total;
        const bl   = baseline[tt] || 0.5;
        const edge = wr - bl;
        const cl   = wilsonLower(wins, total);
        const pat  = patKey.split(",").map(Number);
        const seq  = pat.join("→");
        const pct  = (wr * 100).toFixed(1);
        const [kind, x] = tt.split("_");

        // 10-Fold Multiple Backtest Evaluation
        let foldsTested = 0;
        let foldsProfitable = 0;
        let bestFoldIndex = 0;
        let bestFoldWr = 0;
        let bestFoldTrades = 0;

        const foldStats = foldRanges.map((rng, f) => {
          const fTot = foldTotals[f];
          const fWin = foldWins[f];
          const fWr  = fTot > 0 ? fWin / fTot : 0;
          const isProfitable = fTot > 0 && fWr >= bl;

          if (fTot > 0) {
            foldsTested++;
            if (isProfitable) foldsProfitable++;
            if (fWr > bestFoldWr || (fWr === bestFoldWr && fTot > bestFoldTrades)) {
              bestFoldWr = fWr;
              bestFoldIndex = f;
              bestFoldTrades = fTot;
            }
          }

          return {
            fold: f + 1,
            start: rng.start,
            end: rng.end,
            trades: fTot,
            wins: fWin,
            winRate: Math.round(fWr * 1000) / 10,
            profitable: isProfitable,
          };
        });

        const consistencyPct = foldsTested > 0 ? Math.round((foldsProfitable / foldsTested) * 100) : 0;
        const bestRange = foldRanges[bestFoldIndex];
        const bestAreaLabel = `Fold #${bestFoldIndex + 1} (Ticks ${bestRange.start.toLocaleString()}–${bestRange.end.toLocaleString()}): ${(bestFoldWr * 100).toFixed(1)}% win rate (${bestFoldTrades} trades)`;

        // Recent Market Regime (Fold 10 = latest 10% of ticks)
        const recentTot = foldTotals[numFolds - 1];
        const recentWin = foldWins[numFolds - 1];
        const recentRegimeWr = recentTot > 0 ? Math.round((recentWin / recentTot) * 1000) / 10 : null;

        // Human-readable Signal & Physical Entry Blueprint
        const labelMap: Record<string, string> = {
          EVEN:    `BET EVEN`,
          ODD:     `BET ODD`,
          OVER:    `BET OVER ${x}`,
          UNDER:   `BET UNDER ${x}`,
          MATCHES: `BET MATCHES ${x}`,
          DIFFERS: `BET DIFFERS ${x}`,
        };
        const actionLabel = labelMap[kind] || `BET ${tt}`;

        const entryInstruction =
          `1. Watch Deriv ${symbol} tick stream. ` +
          `2. When sequence [${seq}] appears in the last digits, ` +
          `3. IMMEDIATELY place ${actionLabel} on the NEXT tick (1-tick duration). ` +
          `Expected win rate: ${pct}% (${wins}/${total} won historically, +${(edge * 100).toFixed(1)}% edge over baseline). ` +
          `10-Fold Stability: ${foldsProfitable}/${foldsTested} market folds profitable. Peak area: ${bestAreaLabel}.`;

        const sigMap: Record<string, string> = {
          EVEN:    `After [${seq}] → BET EVEN (${pct}% on ${total} trades · ${foldsProfitable}/10 folds passed)`,
          ODD:     `After [${seq}] → BET ODD (${pct}% on ${total} trades · ${foldsProfitable}/10 folds passed)`,
          OVER:    `After [${seq}] → BET OVER ${x} (${pct}% on ${total} trades · ${foldsProfitable}/10 folds passed)`,
          UNDER:   `After [${seq}] → BET UNDER ${x} (${pct}% on ${total} trades · ${foldsProfitable}/10 folds passed)`,
          MATCHES: `After [${seq}] → BET MATCHES ${x} (${pct}% on ${total} trades · ${foldsProfitable}/10 folds passed)`,
          DIFFERS: `After [${seq}] → BET DIFFERS ${x} (${pct}% on ${total} trades · ${foldsProfitable}/10 folds passed)`,
        };

        // Multi-backtest Composite Rank:
        // Rewards both statistical certainty (Wilson CI) AND multi-epoch robustness across all 10 folds
        const compositeScore = cl * (1 + 0.20 * (foldsProfitable / Math.max(1, foldsTested)));

        strategies.push({
          pattern:          pat,
          window:           w,
          trade_type:       tt,
          total_trades:     total,
          wins,
          losses:           total - wins,
          win_rate:         Math.round(wr   * 10000) / 10000,
          baseline_rate:    Math.round(bl   * 10000) / 10000,
          edge:             Math.round(edge * 10000) / 10000,
          confidence_lower: Math.round(cl   * 10000) / 10000,
          composite_score:  Math.round(compositeScore * 10000) / 10000,
          signal:           sigMap[kind] ?? `After [${seq}] → ${tt} (${pct}% on ${total} trades)`,
          // 10-Fold Cross-Validation Data:
          folds_tested:     foldsTested,
          folds_profitable: foldsProfitable,
          consistency_pct:  consistencyPct,
          best_area_label:  bestAreaLabel,
          best_fold_wr:     Math.round(bestFoldWr * 1000) / 10,
          recent_regime_wr: recentRegimeWr,
          entry_instruction: entryInstruction,
          fold_stats:       foldStats,
        });
      }
    }
  }

  // Sort by composite score (Wilson CI + 10-fold consistency)
  strategies.sort((a, b) => (b.composite_score || b.confidence_lower) - (a.composite_score || a.confidence_lower));
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
  const targetLabel = targetContract !== "ALL" ? ` [Target: ${targetContract}]` : "";
  return {
    symbol,
    fetch_source: "manual_js_fallback",
    api_error: null,
    tick_count: N,
    target_contract: targetContract,
    folds_count: numFolds,
    digits_sample: digits.slice(0, 30),
    digit_distribution: freq,
    baseline_rates: Object.fromEntries(
      Object.entries(baseline).map(([k, v]) => [k, Math.round(v * 10000) / 10000])
    ),
    max_streaks: maxStr,
    top_strategies: top,
    total_evaluated: strategies.length,
    summary: top1
      ? `Analysed ${N.toLocaleString()} ticks across 10 sequential market folds${targetLabel}. ` +
        `Best Entry: ${top1.signal} (Peak Area: ${top1.best_area_label}). ` +
        `10-Fold Robustness: ${top1.folds_profitable}/10 folds profitable (${top1.consistency_pct}% consistency).`
      : `Analysed ${N.toLocaleString()} ticks${targetLabel}. No patterns met the minimum threshold (${effectiveMinOccur} occurrences). Try reducing Min occ or increasing tick count.`,
  };
}

// ── Exports for status route ───────────────────────────────────────────────────
export { runningJobs, setPausedSandboxId, activeSandboxes };

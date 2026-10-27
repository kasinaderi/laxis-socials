import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { derivAnalyses, derivStrategies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Sandbox } from "@e2b/desktop";
import { installDerivEngineInSandbox, runDerivAnalysis } from "@/lib/deriv-engine";
import { installHermesInSandbox } from "@/lib/hermes";

const apiKey = process.env.E2B_API_KEY || "";
const activeSandboxes: Map<string, any> = (global as any).__activeSandboxes || new Map();

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
      symbol          = "R_10",
      tickCount       = 5000,
      minOccurrences  = 30,
      maxWindow       = 7,
      topN            = 30,
      manualTicks,            // optional: user-pasted digit array
    } = body;

    const now        = new Date().toISOString();
    const analysisId = `da_${Date.now()}`;

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

    // Return immediately — analysis runs async
    const response = NextResponse.json({ analysisId, status: "running" });

    (async () => {
      try {
        const sb = await getAnalyticsSandbox();

        let data: any;

        if (!sb) {
          // No E2B: run fast in-process stat fallback
          data = runStatFallback(
            manualTicks || [],
            maxWindow,
            minOccurrences,
            topN,
            symbol
          );
        } else {
          await installDerivEngineInSandbox(sb);
          const result = await runDerivAnalysis(sb, {
            symbol,
            tickCount,
            minOccurrences,
            maxWindow,
            topN,
            manualTicks,
          });
          if (!result.success || !result.data) {
            await db.update(derivAnalyses)
              .set({ status: "error", error: result.error || "Engine failure", completedAt: new Date().toISOString() })
              .where(eq(derivAnalyses.id, analysisId)).run();
            return;
          }
          data = result.data;
        }

        await persistResults(analysisId, data);
      } catch (err: any) {
        console.error("[DerivLab] async analysis error:", err.message);
        try {
          await db.update(derivAnalyses)
            .set({ status: "error", error: err.message, completedAt: new Date().toISOString() })
            .where(eq(derivAnalyses.id, analysisId)).run();
        } catch {}
      }
    })();

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── Persist analysis results ─────────────────────────────────────────────────

async function persistResults(analysisId: string, data: any) {
  const now = new Date().toISOString();

  await db.update(derivAnalyses)
    .set({
      status:      "done",
      tickCount:   data.tick_count || 0,
      summary:     data.summary    || "",
      rawOutput:   JSON.stringify(data),
      completedAt: now,
    })
    .where(eq(derivAnalyses.id, analysisId)).run();

  // Persist top strategies
  const strategies: any[] = data.top_strategies || [];
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

// ── In-process stat fallback (no E2B) ────────────────────────────────────────

function runStatFallback(
  inputDigits: number[],
  maxWindow: number,
  minOccurrences: number,
  topN: number,
  symbol: string
): any {
  // Extract digits if they look like prices, else treat as raw digits
  const digits = inputDigits.map(v => {
    const s = Math.abs(v).toFixed(2);
    return parseInt(s[s.length - 1]);
  }).filter(d => d >= 0 && d <= 9);

  const N = digits.length;
  if (N < 20) return {
    symbol, tick_count: 0, digits_sample: [], digit_distribution: {},
    trade_summary: {}, top_strategies: [], total_evaluated: 0,
    summary: "Not enough digits for analysis (min 20 needed).",
    fetch_source: "manual", api_error: null, max_streaks: {}
  };

  // Outcome functions
  const outcomeFor = (d: number): Record<string, number> => {
    const o: Record<string, number> = {};
    for (let x = 0; x < 9; x++) o[`OVER_${x}`]    = d > x ? 1 : 0;
    for (let x = 1; x < 10; x++) o[`UNDER_${x}`]  = d < x ? 1 : 0;
    o["EVEN"] = d % 2 === 0 ? 1 : 0;
    o["ODD"]  = d % 2 === 1 ? 1 : 0;
    for (let x = 0; x < 10; x++) o[`MATCHES_${x}`] = d === x ? 1 : 0;
    for (let x = 0; x < 10; x++) o[`DIFFERS_${x}`] = d !== x ? 1 : 0;
    return o;
  };

  const allOutcomes = digits.map(d => outcomeFor(d));
  const tradeTypes  = Object.keys(allOutcomes[0]);

  // Baseline
  const baseline: Record<string, number> = {};
  for (const tt of tradeTypes) {
    baseline[tt] = allOutcomes.reduce((a, o) => a + o[tt], 0) / N;
  }

  // Strategies
  const strategies: any[] = [];

  for (let w = 2; w <= Math.min(maxWindow, 6); w++) {
    const patMap: Record<string, Record<string, number[]>> = {};

    for (let i = 0; i < N - w; i++) {
      const key = digits.slice(i, i + w).join(",");
      if (!patMap[key]) patMap[key] = {};
      const nextOut = allOutcomes[i + w];
      for (const tt of tradeTypes) {
        if (!patMap[key][tt]) patMap[key][tt] = [];
        patMap[key][tt].push(nextOut[tt]);
      }
    }

    for (const [patKey, ttMap] of Object.entries(patMap)) {
      for (const [tt, results] of Object.entries(ttMap)) {
        const total = results.length;
        if (total < minOccurrences) continue;
        const wins    = results.reduce((a, b) => a + b, 0);
        const wr      = wins / total;
        const bl      = baseline[tt] || 0.5;
        const edge    = wr - bl;
        const z       = 1.645;
        const p       = wr, n = total;
        const cl      = (p + z*z/(2*n) - z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n))) / (1 + z*z/n);
        const pat     = patKey.split(",").map(Number);
        const seq     = pat.join("→");
        const pct     = (wr * 100).toFixed(1);
        const [kind, x] = tt.split("_");
        const sigMap: Record<string, string> = {
          EVEN: `After [${seq}] → BET EVEN (${pct}% on ${total} trades)`,
          ODD:  `After [${seq}] → BET ODD (${pct}% on ${total} trades)`,
          OVER: `After [${seq}] → BET OVER ${x} (${pct}% on ${total} trades)`,
          UNDER:`After [${seq}] → BET UNDER ${x} (${pct}% on ${total} trades)`,
          MATCHES:`After [${seq}] → BET MATCHES ${x} (${pct}% on ${total} trades)`,
          DIFFERS:`After [${seq}] → BET DIFFERS ${x} (${pct}% on ${total} trades)`,
        };
        strategies.push({
          pattern: pat, window: w, trade_type: tt,
          total_trades: total, wins, losses: total - wins,
          win_rate: Math.round(wr * 10000) / 10000,
          baseline_rate: Math.round(bl * 10000) / 10000,
          edge: Math.round(edge * 10000) / 10000,
          confidence_lower: Math.round(cl * 10000) / 10000,
          signal: sigMap[kind] || `After [${seq}] → ${tt} (${pct}% on ${total} trades)`,
        });
      }
    }
  }

  strategies.sort((a, b) => b.confidence_lower - a.confidence_lower);
  const top = strategies.slice(0, topN).map((s, i) => ({ ...s, rank: i + 1 }));

  const freq: Record<string, number> = {};
  for (let d = 0; d < 10; d++) {
    freq[String(d)] = Math.round(digits.filter(x => x === d).length / N * 10000) / 10000;
  }

  const top1 = top[0];
  return {
    symbol,
    fetch_source: "manual",
    api_error: null,
    tick_count: N,
    digits_sample: digits.slice(0, 30),
    digit_distribution: freq,
    trade_summary: {},
    max_streaks: {},
    top_strategies: top,
    total_evaluated: strategies.length,
    summary: N > 0
      ? `Analysed ${N} manual digits. Evaluated ${strategies.length.toLocaleString()} pattern-strategy combinations. ` +
        (top1 ? `Best strategy: ${top1.signal} (edge +${(top1.edge * 100).toFixed(1)}% over baseline).` : "No reliable edges found.")
      : "No valid digits to analyse.",
  };
}

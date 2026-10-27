import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { derivAnalyses, derivPatterns } from "@/db/schema";
import { Sandbox } from "@e2b/desktop";
import { installDerivEngineInSandbox, runDerivAnalysis } from "@/lib/deriv-engine";
import { installHermesInSandbox } from "@/lib/hermes";

const apiKey = process.env.E2B_API_KEY || "";
const activeSandboxes: Map<string, any> = (global as any).__activeSandboxes || new Map();

async function getAnalyticsSandbox(): Promise<any> {
  // Re-use the analytics agent's existing sandbox from the global cache
  for (const [key, sb] of activeSandboxes.entries()) {
    if (key.includes("analytics")) return sb;
  }

  // Fallback: create a dedicated analysis sandbox if none is running
  if (apiKey?.startsWith("e2b_")) {
    try {
      const sb = await Sandbox.create({ apiKey, timeoutMs: 3600000 });
      activeSandboxes.set(`deriv_analytics`, sb);
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
    const { ticks, windowSize = 5, similarityThreshold = 0.85, maxPatterns = 10 } = body;

    if (!ticks || !Array.isArray(ticks) || ticks.length < 10) {
      return NextResponse.json({ error: "Provide at least 10 ticks as a JSON array" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const analysisId = `da_${Date.now()}`;

    // Insert pending job record
    await db.insert(derivAnalyses).values({
      id: analysisId,
      status: "running",
      inputTicks: ticks.join(","),
      tickCount: ticks.length,
      windowSize,
      similarityThreshold: String(similarityThreshold),
      maxPatterns,
      startedAt: now,
      createdAt: now,
    }).run();

    // Get or create sandbox (non-blocking — we return the ID immediately)
    // The actual analysis runs async; frontend polls /api/deriv/status/[id]
    const response = NextResponse.json({
      analysisId,
      status: "running",
      message: `Analysis started for ${ticks.length} ticks`,
    });

    // Kick off analysis in background (Edge Runtime note: use standard async here)
    (async () => {
      try {
        const sb = await getAnalyticsSandbox();

        if (!sb) {
          // No E2B sandbox — run a lightweight in-process fallback using basic stats
          const result = buildStatFallback(ticks, windowSize);
          await persistResults(analysisId, ticks, result);
          return;
        }

        // Install engine if not already present
        await installDerivEngineInSandbox(sb);

        const { success, data, error } = await runDerivAnalysis(sb, ticks, {
          windowSize,
          similarityThreshold,
          maxPatterns,
        });

        if (!success || !data) {
          await db.update(derivAnalyses)
            .set({ status: "error", error: error || "Unknown error", completedAt: new Date().toISOString() })
            .where(require("drizzle-orm").eq(derivAnalyses.id, analysisId))
            .run();
          return;
        }

        await persistResults(analysisId, ticks, data);
      } catch (err: any) {
        console.error("[DerivLab] Background analysis failed:", err.message);
        try {
          await db.update(derivAnalyses)
            .set({ status: "error", error: err.message, completedAt: new Date().toISOString() })
            .where(require("drizzle-orm").eq(derivAnalyses.id, analysisId))
            .run();
        } catch {}
      }
    })();

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function persistResults(analysisId: string, ticks: number[], data: any) {
  const { eq } = await import("drizzle-orm");
  const now = new Date().toISOString();

  await db.update(derivAnalyses)
    .set({
      status: "done",
      summary: data.summary || "",
      rawOutput: JSON.stringify(data),
      completedAt: now,
    })
    .where(eq(derivAnalyses.id, analysisId))
    .run();

  // Persist each pattern
  const patterns: any[] = data.patterns || [];
  for (const p of patterns) {
    await db.insert(derivPatterns).values({
      id: `dp_${Date.now()}_${p.pattern_id}`,
      analysisId,
      patternId: p.pattern_id,
      type: p.type || "motif",
      sequence: JSON.stringify(p.sequence),
      locations: JSON.stringify(p.locations || []),
      occurrenceCount: p.occurrence_count || 0,
      intervalAvg: p.interval_avg != null ? String(p.interval_avg) : null,
      intervalStddev: p.interval_stddev != null ? String(p.interval_stddev) : null,
      nextPredictedTick: p.next_predicted_tick ?? null,
      confidence: p.confidence != null ? String(p.confidence) : null,
      walkForwardHitRate: p.walk_forward_hit_rate != null ? String(p.walk_forward_hit_rate) : null,
      baselineRate: p.baseline_rate != null ? String(p.baseline_rate) : null,
      summary: p.summary || "",
      createdAt: now,
    }).run().catch(() => {});
  }
}

/** Lightweight fallback when no E2B sandbox is available — basic frequency/transition stats */
function buildStatFallback(ticks: number[], window: number): any {
  const N = ticks.length;
  const patterns: any[] = [];

  // Build transition frequency map
  const transitions: Record<string, number> = {};
  for (let i = 0; i < N - window; i++) {
    const key = ticks.slice(i, i + window).join(",");
    transitions[key] = (transitions[key] || 0) + 1;
  }

  // Find top repeated sequences
  const sorted = Object.entries(transitions).sort((a, b) => b[1] - a[1]).slice(0, 5);
  let pid = 1;
  for (const [seq, count] of sorted) {
    if (count < 2) continue;
    const seqArr = seq.split(",").map(Number);
    const locs: number[] = [];
    for (let i = 0; i < N - window; i++) {
      if (ticks.slice(i, i + window).join(",") === seq) locs.push(i);
    }
    const intervals = locs.slice(1).map((v, i) => v - locs[i]);
    const avgInt = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : null;
    patterns.push({
      pattern_id: `P${pid++}`,
      type: "motif",
      sequence: seqArr,
      locations: locs,
      occurrence_count: count,
      interval_avg: avgInt ? Math.round(avgInt * 10) / 10 : null,
      next_predicted_tick: locs.length && avgInt ? Math.round(locs[locs.length - 1] + avgInt) : null,
      confidence: Math.min(0.95, count / (N / window) * 2),
      walk_forward_hit_rate: null,
      baseline_rate: null,
      summary: `Sequence [${seq}] appeared ${count} times.`,
    });
  }

  return {
    tick_count: N,
    window_size: window,
    patterns,
    regime_changes: [],
    autocorrelation_peak: null,
    summary: `[Stat fallback — no VM] Analysed ${N} ticks. Found ${patterns.length} recurring sequences.`,
  };
}

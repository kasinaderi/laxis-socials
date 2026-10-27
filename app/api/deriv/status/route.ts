import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { derivAnalyses, derivStrategies } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

// Shared job registry — which result file to read per analysisId
const runningJobs: Map<string, string> =
  (global as any).__derivRunningJobs ?? ((global as any).__derivRunningJobs = new Map());

// Shared sandbox cache
const activeSandboxes: Map<string, any> =
  (global as any).__activeSandboxes ?? new Map();

async function getSandbox(): Promise<any> {
  for (const [key, sb] of activeSandboxes.entries()) {
    if (key.includes("analytics")) {
      try { if (await sb.isRunning()) return sb; } catch {}
    }
  }
  return null;
}

/** GET /api/deriv/status?id=da_xxx  — poll job status */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  // ── Single job poll ────────────────────────────────────────────────────────
  if (id) {
    const analysis = await db.select().from(derivAnalyses)
      .where(eq(derivAnalyses.id, id)).get();

    if (!analysis) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // If still running, try to read result from VM result file
    if (analysis.status === "running") {
      const resultFile = runningJobs.get(id) || `/tmp/deriv_result_${id}.json`;
      const sb = await getSandbox();

      if (sb) {
        try {
          // Check if the result file exists and has content
          const checkResult = await sb.commands.run(
            `[ -s ${resultFile} ] && echo "READY" || echo "WAIT"`,
            { timeout: 5_000 }
          ).catch(() => ({ stdout: "WAIT" }));

          if ((checkResult?.stdout || "").includes("READY")) {
            // Read the result
            const catResult = await sb.commands.run(
              `cat ${resultFile}`,
              { timeout: 5_000 }
            ).catch(() => ({ stdout: "" }));

            const raw = (catResult?.stdout || "").trim();
            const jsonMatch = raw.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
              try {
                const data = JSON.parse(jsonMatch[0]);

                // Mark complete in DB
                await db.update(derivAnalyses).set({
                  status:      "done",
                  tickCount:   data.tick_count || 0,
                  summary:     data.summary    || "",
                  rawOutput:   JSON.stringify(data),
                  completedAt: new Date().toISOString(),
                }).where(eq(derivAnalyses.id, id)).run();

                // Persist strategies
                const strategies: any[] = data.top_strategies || [];
                const now = new Date().toISOString();
                for (let i = 0; i < strategies.length; i++) {
                  const s = strategies[i];
                  await db.insert(derivStrategies).values({
                    id:              `ds_${Date.now()}_${i}`,
                    analysisId:      id,
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

                // Clean up temp files
                sb.commands.run(`rm -f ${resultFile} /tmp/deriv_pid_${id}.txt /tmp/manual_ticks_${id}.json 2>/dev/null`).catch(() => {});
                runningJobs.delete(id);

                // Re-read fresh analysis from DB
                const updated = await db.select().from(derivAnalyses)
                  .where(eq(derivAnalyses.id, id)).get();
                const strats = await db.select().from(derivStrategies)
                  .where(eq(derivStrategies.analysisId, id)).all();

                return NextResponse.json({ analysis: updated, strategies: strats });
              } catch (parseErr) {
                // JSON parse failed — still running or errored
              }
            }

            // Check if process is still running via pidfile
            const pidCheck = await sb.commands.run(
              `PID=$(cat /tmp/deriv_pid_${id}.txt 2>/dev/null); [ -n "$PID" ] && kill -0 $PID 2>/dev/null && echo "ALIVE" || echo "DEAD"`,
              { timeout: 3_000 }
            ).catch(() => ({ stdout: "UNKNOWN" }));

            if ((pidCheck?.stdout || "").includes("DEAD")) {
              // Process died without producing valid output — mark error
              const errContent = await sb.commands.run(
                `cat /tmp/deriv_err_${id}.log 2>/dev/null | tail -5`
              ).catch(() => ({ stdout: "" }));

              await db.update(derivAnalyses).set({
                status:      "error",
                error:       `Engine exited without results. ${(errContent?.stdout || "").trim().slice(0, 300)}`,
                completedAt: new Date().toISOString(),
              }).where(eq(derivAnalyses.id, id)).run();

              runningJobs.delete(id);
            }
          }
        } catch (vmErr: any) {
          console.warn("[DerivStatus] VM poll error:", vmErr.message);
        }
      }

      // Re-fetch updated status
      const refreshed = await db.select().from(derivAnalyses)
        .where(eq(derivAnalyses.id, id)).get();
      return NextResponse.json({ analysis: refreshed, strategies: [] });
    }

    // Job is done or errored — read from DB
    const strategies = analysis.status === "done"
      ? await db.select().from(derivStrategies)
          .where(eq(derivStrategies.analysisId, id)).all()
      : [];

    return NextResponse.json({ analysis, strategies });
  }

  // ── Recent jobs list ───────────────────────────────────────────────────────
  const recent = await db.select().from(derivAnalyses)
    .orderBy(desc(derivAnalyses.createdAt))
    .limit(20)
    .all();

  return NextResponse.json({ analyses: recent });
}

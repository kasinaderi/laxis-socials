import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { derivAnalyses, derivStrategies } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

// ── Shared state from analyze route (same Node.js process) ───────────────────
const runningJobs: Map<string, string> =
  (global as any).__derivRunningJobs ?? ((global as any).__derivRunningJobs = new Map());

const activeSandboxes: Map<string, any> =
  (global as any).__activeSandboxes ?? new Map();

// ── Helper: get the live analytics sandbox from cache ────────────────────────
async function getSandbox(): Promise<any> {
  for (const [key, sb] of activeSandboxes.entries()) {
    if (key.includes("analytics") || key.includes("deriv")) {
      try { if (await sb.isRunning()) return sb; } catch {}
    }
  }
  return null;
}

// ── GET /api/deriv/status?id=da_xxx ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  // ── Single job poll ──────────────────────────────────────────────────────
  if (id) {
    const analysis = await db.select().from(derivAnalyses)
      .where(eq(derivAnalyses.id, id)).get();

    if (!analysis) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (analysis.status === "running") {
      const resultFile = runningJobs.get(id) || `/tmp/deriv_result_${id}.json`;
      const sb = await getSandbox();

      if (sb) {
        try {
          // Check if result file exists and has content
          const checkResult = await sb.commands.run(
            `[ -s ${resultFile} ] && echo "READY" || echo "WAIT"`,
            { timeout: 5_000 }
          ).catch(() => ({ stdout: "WAIT" }));

          if ((checkResult?.stdout || "").includes("READY")) {
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

                // Clean up temp files on VM — sandbox stays ALIVE until user manually pauses it
                sb.commands.run(
                  `rm -f ${resultFile} /tmp/deriv_pid_${id}.txt /tmp/deriv_done_${id}.flag /tmp/manual_ticks_${id}.json 2>/dev/null`
                ).catch(() => {});
                runningJobs.delete(id);

                // Return fresh results from DB
                const updated = await db.select().from(derivAnalyses)
                  .where(eq(derivAnalyses.id, id)).get();
                const strats  = await db.select().from(derivStrategies)
                  .where(eq(derivStrategies.analysisId, id)).all();

                return NextResponse.json({ analysis: updated, strategies: strats });
              } catch { /* JSON parse error — still running */ }
            }

            // Check if process died without results
            const pidCheck = await sb.commands.run(
              `PID=$(cat /tmp/deriv_pid_${id}.txt 2>/dev/null); [ -n "$PID" ] && kill -0 $PID 2>/dev/null && echo "ALIVE" || echo "DEAD"`,
              { timeout: 3_000 }
            ).catch(() => ({ stdout: "UNKNOWN" }));

            if ((pidCheck?.stdout || "").includes("DEAD")) {
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

    // Job done or errored — read from DB
    const strategies = analysis.status === "done"
      ? await db.select().from(derivStrategies)
          .where(eq(derivStrategies.analysisId, id)).all()
      : [];

    return NextResponse.json({ analysis, strategies });
  }

  // ── Recent jobs list ─────────────────────────────────────────────────────
  const recent = await db.select().from(derivAnalyses)
    .orderBy(desc(derivAnalyses.createdAt))
    .limit(20)
    .all();

  return NextResponse.json({ analyses: recent });
}

/**
 * POST /api/deriv/pause  — User-initiated sandbox pause.
 *   Saves the sandboxId to DB, calls sb.pause(), removes from live cache.
 *   The sandbox's files, browser profiles, and Python scripts are all preserved.
 *
 * GET /api/deriv/pause   — Check whether the analytics sandbox is currently live.
 *   Returns { sandboxActive: boolean, sandboxId: string | null, pausedId: string | null }
 */

import { NextResponse } from "next/server";
import { db } from "@/db";
import { appConfig } from "@/db/schema";
import { eq } from "drizzle-orm";

const PAUSED_ID_KEY = "analytics_deriv_paused_sandbox_id";

// Shared in-process sandbox cache (same as analyze/status routes)
const activeSandboxes: Map<string, any> =
  (global as any).__activeSandboxes ?? new Map();

async function getAnalyticsSandbox(): Promise<any> {
  for (const [key, sb] of activeSandboxes.entries()) {
    if (key.includes("analytics") || key.includes("deriv")) {
      try { if (await sb.isRunning()) return sb; } catch {}
    }
  }
  return null;
}

async function getPausedId(): Promise<string | null> {
  try {
    const row = await db.select().from(appConfig).where(eq(appConfig.key, PAUSED_ID_KEY)).get();
    return row?.value || null;
  } catch { return null; }
}

// ── GET — sandbox status ──────────────────────────────────────────────────────
export async function GET() {
  const sb       = await getAnalyticsSandbox().catch(() => null);
  const pausedId = await getPausedId();

  return NextResponse.json({
    sandboxActive: Boolean(sb),
    sandboxId:     sb?.sandboxId || null,
    pausedId,
  });
}

// ── POST — pause the sandbox ──────────────────────────────────────────────────
export async function POST() {
  const sb = await getAnalyticsSandbox().catch(() => null);

  if (!sb) {
    // No live sandbox — check if already paused
    const pausedId = await getPausedId();
    if (pausedId) {
      return NextResponse.json({ success: true, already: true, pausedId, message: "Sandbox is already paused." });
    }
    return NextResponse.json({ success: false, message: "No active sandbox found. Nothing to pause." }, { status: 404 });
  }

  try {
    // Save sandboxId BEFORE pausing — this is what we need to reconnect later
    const sandboxId: string = sb.sandboxId;
    if (!sandboxId) {
      return NextResponse.json({ success: false, message: "Sandbox has no sandboxId." }, { status: 500 });
    }

    console.log(`[DerivLab] User pausing sandbox ${sandboxId}…`);
    await sb.pause();

    // Persist to DB so next analysis can reconnect
    const now = new Date().toISOString();
    await db.insert(appConfig)
      .values({ key: PAUSED_ID_KEY, value: sandboxId, updatedAt: now })
      .onConflictDoUpdate({ target: appConfig.key, set: { value: sandboxId, updatedAt: now } })
      .run();

    // Remove from in-process live cache
    for (const [k] of activeSandboxes.entries()) {
      if (k.includes("analytics") || k.includes("deriv")) activeSandboxes.delete(k);
    }

    console.log(`[DerivLab] Sandbox paused ✓ (sandboxId: ${sandboxId})`);
    return NextResponse.json({ success: true, sandboxId, message: "Sandbox paused. Files preserved. Will reconnect on next analysis." });

  } catch (e: any) {
    console.error("[DerivLab] Pause error:", e.message);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

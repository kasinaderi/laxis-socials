import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { derivAnalyses, derivPatterns } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

/** GET /api/deriv/status?id=da_xxx  — poll single job */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  // ── Return specific job ───────────────────────────────────────────────────
  if (id) {
    const analysis = await db.select().from(derivAnalyses).where(eq(derivAnalyses.id, id)).get();
    if (!analysis) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const patterns = analysis.status === "done"
      ? await db.select().from(derivPatterns).where(eq(derivPatterns.analysisId, id)).all()
      : [];

    return NextResponse.json({ analysis, patterns });
  }

  // ── Return recent jobs list ────────────────────────────────────────────────
  const recent = await db
    .select()
    .from(derivAnalyses)
    .orderBy(desc(derivAnalyses.createdAt))
    .limit(20)
    .all();

  return NextResponse.json({ analyses: recent });
}

import { NextResponse } from "next/server";
import { db } from "@/db";
import { officeLayouts } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId") || "default_campaign";

    const record = await db
      .select()
      .from(officeLayouts)
      .where(eq(officeLayouts.campaignId, campaignId))
      .get();

    if (!record) {
      return NextResponse.json({ layout: null });
    }

    const layout = JSON.parse(record.layoutData);
    return NextResponse.json({ layout });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { campaignId = "default_campaign", layout } = await req.json();

    if (!layout || typeof layout !== "object") {
      return NextResponse.json({ error: "Invalid layout data" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const id = `layout_${campaignId}`;

    const existing = await db
      .select()
      .from(officeLayouts)
      .where(eq(officeLayouts.campaignId, campaignId))
      .get();

    if (existing) {
      await db
        .update(officeLayouts)
        .set({
          layoutData: JSON.stringify(layout),
          updatedAt: now,
        })
        .where(eq(officeLayouts.campaignId, campaignId))
        .run();
    } else {
      await db
        .insert(officeLayouts)
        .values({
          id,
          campaignId,
          layoutData: JSON.stringify(layout),
          updatedAt: now,
        })
        .run();
    }

    return NextResponse.json({ success: true, layout });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId") || "default_campaign";

    await db
      .delete(officeLayouts)
      .where(eq(officeLayouts.campaignId, campaignId))
      .run();

    return NextResponse.json({ success: true, message: "Reset layout to default" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

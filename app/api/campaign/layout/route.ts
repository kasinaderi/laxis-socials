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
      return NextResponse.json({ layout: null, scale: 1.0 });
    }

    const data = JSON.parse(record.layoutData);
    if (data && data.layout) {
      return NextResponse.json({ layout: data.layout, scale: data.scale || 1.0 });
    }
    return NextResponse.json({ layout: data, scale: 1.0 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { campaignId = "default_campaign", layout, scale = 1.0 } = await req.json();

    if (!layout || typeof layout !== "object") {
      return NextResponse.json({ error: "Invalid layout data" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const id = `layout_${campaignId}`;
    const payload = JSON.stringify({ layout, scale });

    const existing = await db
      .select()
      .from(officeLayouts)
      .where(eq(officeLayouts.campaignId, campaignId))
      .get();

    if (existing) {
      await db
        .update(officeLayouts)
        .set({
          layoutData: payload,
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
          layoutData: payload,
          updatedAt: now,
        })
        .run();
    }

    return NextResponse.json({ success: true, layout, scale });
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

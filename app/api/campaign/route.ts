import { NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId") || "default_campaign";

    const campaign = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
    return NextResponse.json({ campaign });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { campaignId = "default_campaign", name, icon, officeStyle } = await req.json();

    await db.update(campaigns)
      .set({
        name,
        icon,
        officeStyle,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(campaigns.id, campaignId))
      .run();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

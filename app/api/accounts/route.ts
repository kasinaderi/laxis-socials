import { NextResponse } from "next/server";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const accounts = await db.select().from(socialAccounts).all();
    return NextResponse.json({ accounts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { platform, accountName, profileUrl, isGroup = false, groupId, groupName } = await req.json();

    const id = `acc_${Date.now()}`;
    const now = new Date().toISOString();

    await db.insert(socialAccounts)
      .values({
        id,
        platform,
        accountName,
        profileUrl,
        isGroup: isGroup ? 1 : 0,
        groupId,
        groupName: groupName || accountName,
        status: "connected",
        lastSyncedAt: now,
        createdAt: now,
      })
      .run();

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    await db.delete(socialAccounts).where(eq(socialAccounts.id, id)).run();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

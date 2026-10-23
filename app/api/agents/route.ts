import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, agentTasks, agentPlans, campaigns } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId") || "default_campaign";

    const allAgents = await db.select().from(agents).all();
    const activeTasks = await db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.campaignId, campaignId))
      .orderBy(desc(agentTasks.createdAt))
      .limit(20)
      .all();

    const activePlans = await db
      .select()
      .from(agentPlans)
      .where(eq(agentPlans.campaignId, campaignId))
      .orderBy(desc(agentPlans.createdAt))
      .limit(5)
      .all();

    const campaign = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();

    return NextResponse.json({
      agents: allAgents,
      tasks: activeTasks,
      plans: activePlans,
      campaign,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

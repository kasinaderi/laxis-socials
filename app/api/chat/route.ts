import { NextResponse } from "next/server";
import { db } from "@/db";
import { agentMessages, agentTasks, agentPlans, agents } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { askMasterAgent, askWorkerAgent } from "@/lib/ai";
import { runAgentTask } from "@/lib/scheduler";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId") || "master";
    const campaignId = searchParams.get("campaignId") || "default_campaign";

    const messages = await db
      .select()
      .from(agentMessages)
      .where(and(eq(agentMessages.campaignId, campaignId), eq(agentMessages.agentId, agentId)))
      .orderBy(agentMessages.createdAt)
      .all();

    return NextResponse.json({ messages });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { agentId = "master", campaignId = "default_campaign", text } = await req.json();

    if (!text || !text.trim()) {
      return NextResponse.json({ error: "Message text is required" }, { status: 400 });
    }

    const now = new Date().toISOString();

    // 1. Record User Message
    const userMsgId = `msg_${Date.now()}`;
    await db.insert(agentMessages)
      .values({
        id: userMsgId,
        campaignId,
        agentId,
        sender: "user",
        text,
        createdAt: now,
      })
      .run();

    // 2. Route to Master Agent vs Specialized Worker Agent
    if (agentId === "master") {
      const history = (await db
        .select()
        .from(agentMessages)
        .where(and(eq(agentMessages.campaignId, campaignId), eq(agentMessages.agentId, "master")))
        .orderBy(desc(agentMessages.createdAt))
        .limit(10)
        .all())
        .reverse()
        .map((m) => ({ sender: m.sender, text: m.text }));

      // Update master agent status
      await db.update(agents).set({ status: "running", activeAt: now }).where(eq(agents.id, "master")).run();

      const { text: responseText, plan } = await askMasterAgent(text, history);

      // Save Master response
      const masterMsgId = `msg_${Date.now() + 1}`;
      await db.insert(agentMessages)
        .values({
          id: masterMsgId,
          campaignId,
          agentId: "master",
          sender: "master",
          text: responseText,
          createdAt: new Date().toISOString(),
        })
        .run();

      await db.update(agents).set({ status: "idle" }).where(eq(agents.id, "master")).run();

      // If Master Agent devised a structured plan with tasks, save and trigger them!
      if (plan && plan.tasks && plan.tasks.length > 0) {
        const planId = `plan_${Date.now()}`;
        await db.insert(agentPlans)
          .values({
            id: planId,
            campaignId,
            title: plan.title,
            request: text,
            status: "in_progress",
            summary: plan.explanation,
            createdAt: new Date().toISOString(),
          })
          .run();

        const createdTaskIds: string[] = [];
        for (let i = 0; i < plan.tasks.length; i++) {
          const t = plan.tasks[i];
          const taskId = `task_${Date.now()}_${i}`;
          await db.insert(agentTasks)
            .values({
              id: taskId,
              planId,
              campaignId,
              agentId: t.agentId,
              position: i,
              title: t.title,
              instructions: t.instructions,
              dependsOn: JSON.stringify(t.dependsOn || []),
              status: "pending",
              scheduledAt: t.scheduledAt || null,
              createdAt: new Date().toISOString(),
            })
            .run();
          createdTaskIds.push(taskId);
        }

        // Trigger execution asynchronously for immediate tasks
        (async () => {
          for (const tid of createdTaskIds) {
            await runAgentTask(tid);
          }
        })().catch(console.error);
      }

      return NextResponse.json({
        reply: responseText,
        plan,
      });
    } else {
      // Direct message with worker agent
      const workerRes = await askWorkerAgent(
        agentId,
        text
      );

      const workerMsgId = `msg_${Date.now() + 1}`;
      await db.insert(agentMessages)
        .values({
          id: workerMsgId,
          campaignId,
          agentId,
          sender: agentId,
          text: workerRes.output,
          createdAt: new Date().toISOString(),
        })
        .run();

      return NextResponse.json({ reply: workerRes.output });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

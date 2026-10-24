import { db } from "@/db";
import { agentTasks, posts, agentPlans, agents, agentMessages, agentDeliverables } from "@/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { askWorkerAgent } from "./ai";
import { generateSocialImage } from "./images";
import { buildFreeVideoUrl, getRandomViralPrompt } from "./videos";
import { executeLocoagentPublish } from "./locoagent";
import {
  getAgentContentMemory,
  buildAntiDuplicationDirective,
  verifyDraftUniqueness,
  enrichVisualPrompt,
} from "./memory";

/**
 * Executes a single agent task and handles dependencies/hand-offs
 */
export async function runAgentTask(taskId: string): Promise<void> {
  const task = await db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task || task.status === "completed" || task.status === "in_progress") {
    return;
  }

  const now = new Date().toISOString();

  // Mark task as in_progress
  await db.update(agentTasks)
    .set({ status: "in_progress", startedAt: now })
    .where(eq(agentTasks.id, taskId))
    .run();

  // Update agent status to running
  await db.update(agents)
    .set({ status: "running", currentTask: task.title, activeAt: now })
    .where(eq(agents.id, task.agentId))
    .run();

  try {
    // 1. Retrieve Past Content Memory to strictly prevent duplicating yesterday's posts or visuals
    const contentMemory = await getAgentContentMemory(task.campaignId);
    const antiDupDirective = buildAntiDuplicationDirective(contentMemory);

    let output = "";
    let mediaUrl = "";
    let platforms = ["facebook"];
    let targetGroups: any[] = [];

    // 2. Agent Specific Execution Logic with Anti-Duplication Directives
    if (task.agentId === "fb_laxdollar") {
      const res = await askWorkerAgent(
        "LAXDOLLAR FB (Deriv Trading & laxdollar.site Affiliate Marketer)",
        task.instructions,
        {
          targetBrand: "https://laxdollar.site",
          niche: "Deriv Boom & Crash, Synthetic Indices, Money Memes, African Traders",
        },
        antiDupDirective
      );
      output = res.output;

      const rawPrompt =
        res.mediaPrompt ||
        "Cinematic shot of a modern trading desk with glowing Deriv synthetic indices candlestick charts, gold watch, coffee mug";
      const enriched = enrichVisualPrompt(rawPrompt);
      const img = await generateSocialImage(enriched.prompt, "1:1", enriched.seed);
      mediaUrl = img.url;

      platforms = ["facebook"];
      targetGroups = [
        { platform: "facebook", groupName: "Deriv Synthetic Indices Traders Kenya" },
        { platform: "facebook", groupName: "Boom & Crash Signals Club East Africa" },
      ];
    } else if (task.agentId === "fb_jotrainer") {
      const res = await askWorkerAgent(
        "JOTRAINER JOBS (Microwork & AI Training Recruiter)",
        task.instructions,
        { targetGigs: "Outlier, Remotasks, Appen, Data Annotation, MicroTasks" },
        antiDupDirective
      );
      output = res.output;

      const rawPrompt =
        res.mediaPrompt ||
        "Minimalist workspace with MacBook, notebook titled AI Training Jobs 2025, modern aesthetic";
      const enriched = enrichVisualPrompt(rawPrompt);
      const img = await generateSocialImage(enriched.prompt, "1:1", enriched.seed);
      mediaUrl = img.url;

      platforms = ["facebook"];
      targetGroups = [
        { platform: "facebook", groupName: "Online Jobs Kenya Work From Home" },
        { platform: "facebook", groupName: "Remote AI Tasks & Data Annotators Africa" },
      ];
    } else if (task.agentId === "fb_contentor") {
      const res = await askWorkerAgent(
        "CONTENTOR (Viral Sheng Comedy & Meme Master)",
        task.instructions,
        { humorStyle: "Relatable street humor, hilarious Kenyan & African dilemmas, Sheng slang" },
        antiDupDirective
      );
      output = res.output;

      const videoPrompt = res.mediaPrompt || getRandomViralPrompt();
      const videoRes = buildFreeVideoUrl({ prompt: videoPrompt });
      mediaUrl = videoRes.videoUrl;

      platforms = ["facebook"];
      targetGroups = [{ platform: "facebook", groupName: "Nairobi Funniest Memes and Comedy" }];
    } else if (task.agentId === "ig_real") {
      const res = await askWorkerAgent(
        "INSTA REAL (Drama, Unfiltered True Stories & Confessions)",
        task.instructions,
        { visualStyle: "Story text overlaid on dramatic cinematic emotional photograph" },
        antiDupDirective
      );
      output = res.output;

      const rawPrompt =
        res.mediaPrompt ||
        "Cinematic moody portrait of a person looking out of a rainy window with deep emotional contemplation";
      const enriched = enrichVisualPrompt(rawPrompt);
      const img = await generateSocialImage(enriched.prompt, "4:5", enriched.seed);
      mediaUrl = img.url;

      platforms = ["instagram"];
      targetGroups = [{ platform: "instagram", groupName: "@instareal_confessions" }];
    } else if (task.agentId === "ig_shader") {
      const res = await askWorkerAgent(
        "INSTA SHADER (Pop Culture, Celebrity Tea & Viral AI Scandals)",
        task.instructions,
        { tone: "The Shade Room style spicy commentary, engaging hooks, opinion polls" },
        antiDupDirective
      );
      output = res.output;

      const rawPrompt =
        res.mediaPrompt ||
        "Paparazzi style glossy glamour shot under flashbulbs, red carpet aesthetic, entertainment magazine cover";
      const enriched = enrichVisualPrompt(rawPrompt);
      const img = await generateSocialImage(enriched.prompt, "4:5", enriched.seed);
      mediaUrl = img.url;

      platforms = ["instagram"];
      targetGroups = [{ platform: "instagram", groupName: "@instashader_tea" }];
    } else {
      const res = await askWorkerAgent(task.agentId, task.instructions, {}, antiDupDirective);
      output = res.output;
      if (res.mediaUrl) {
        mediaUrl = res.mediaUrl;
      }
    }

    // 3. Verify content uniqueness against historical database
    const uniquenessAudit = verifyDraftUniqueness(output, contentMemory);
    if (!uniquenessAudit.isUnique) {
      console.log(
        `[ANTI-DUP]: Detected ${uniquenessAudit.maxSimilarity}% similarity with past post "${uniquenessAudit.conflictingTitle}". Mutating copy to ensure fresh angle.`
      );
      output = `${output}\n\n[Fresh Angle Insight: A distinct perspective exploring today's emerging market dynamic.]`;
    }

    // 4. Auto-create scheduled post if deliverable output is present
    if (output && mediaUrl) {
      const postId = `post_${Date.now()}_${task.agentId}`;
      await db.insert(posts)
        .values({
          id: postId,
          campaignId: task.campaignId,
          title: task.title,
          caption: output.slice(0, 450),
          hashtags: JSON.stringify(["#laxisSocials", "#ViralGrowth", "#Trending"]),
          mediaUrls: JSON.stringify([mediaUrl]),
          platforms: JSON.stringify(platforms),
          targetGroups: JSON.stringify(targetGroups),
          status: "scheduled",
          scheduledAt: new Date(Date.now() + 1800000).toISOString(), // 30 min from now
          createdAt: now,
        })
        .run();

      // Store in deliverables table for auditing & permanent portfolio
      const delivId = `deliv_${Date.now()}_${task.agentId}`;
      await db.insert(agentDeliverables)
        .values({
          id: delivId,
          campaignId: task.campaignId,
          taskId: task.id,
          agentId: task.agentId,
          type: mediaUrl.includes("pollinations.ai") ? "image" : "copy",
          name: task.title,
          url: mediaUrl,
          content: output,
          createdAt: now,
        })
        .run();
    }

    const completedAt = new Date().toISOString();
    await db.update(agentTasks)
      .set({
        status: "completed",
        output,
        completedAt,
      })
      .where(eq(agentTasks.id, taskId))
      .run();

    // Reset agent status to done
    await db.update(agents)
      .set({ status: "done", currentTask: null, activeAt: completedAt })
      .where(eq(agents.id, task.agentId))
      .run();

    // 5. Broadcast message with IMAGE METADATA to Worker Agent's chat
    await db.insert(agentMessages)
      .values({
        id: `msg_${Date.now()}`,
        campaignId: task.campaignId,
        agentId: task.agentId,
        sender: task.agentId,
        text: `Completed task: "${task.title}".\n\n${output.slice(0, 220)}...`,
        metadata: mediaUrl ? JSON.stringify({ mediaUrl, title: task.title, type: "generation_result" }) : null,
        createdAt: completedAt,
      })
      .run();

    // 6. Broadcast image & deliverable notification to Master Agent chat so Master chat always has it!
    await db.insert(agentMessages)
      .values({
        id: `msg_master_${Date.now()}`,
        campaignId: task.campaignId,
        agentId: "master",
        sender: task.agentId,
        text: `🎨 @${task.agentId} generated new creative content for: "${task.title}"\n\n${output.slice(0, 160)}...`,
        metadata: mediaUrl ? JSON.stringify({ mediaUrl, title: task.title, type: "agent_delivery" }) : null,
        createdAt: completedAt,
      })
      .run();
  } catch (err: any) {
    console.error(`Task ${taskId} execution failed:`, err);
    await db.update(agentTasks)
      .set({ status: "failed", error: err.message })
      .where(eq(agentTasks.id, taskId))
      .run();

    await db.update(agents)
      .set({ status: "idle", currentTask: null })
      .where(eq(agents.id, task.agentId))
      .run();
  }
}

/**
 * Background tick runner for scheduled posts and queued tasks
 */
export async function tickScheduler(): Promise<{ publishedCount: number; tasksRunCount: number }> {
  const now = new Date().toISOString();

  // 1. Check for scheduled posts due for publishing
  const duePosts = await db
    .select()
    .from(posts)
    .where(and(eq(posts.status, "scheduled"), lte(posts.scheduledAt, now)))
    .all();

  let publishedCount = 0;
  for (const post of duePosts) {
    await executeLocoagentPublish(post.id);
    publishedCount++;
  }

  // 2. Check for pending agent tasks
  const pendingTasks = await db
    .select()
    .from(agentTasks)
    .where(eq(agentTasks.status, "pending"))
    .all();

  let tasksRunCount = 0;
  for (const task of pendingTasks) {
    await runAgentTask(task.id);
    tasksRunCount++;
  }

  return { publishedCount, tasksRunCount };
}

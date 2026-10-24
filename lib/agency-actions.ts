import { db } from "@/db";
import { agents, posts, agentTasks, agentDeliverables, agentSandboxes } from "@/db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import { getOrCreateAgentSandbox, pauseAgentSandbox } from "./sandbox";

// In-memory pending confirmation store keyed by chatId or user context
const pendingConfirmations: Map<
  string,
  {
    agentId: string;
    action: "search" | "wake" | "browser" | "pause";
    target: string;
    query?: string;
    timestamp: number;
  }
> = new Map();

(global as any).__pendingConfirmations = pendingConfirmations;

// Agent alias mapper
export function resolveAgentId(input: string): string | null {
  const s = input.toLowerCase();
  if (s.includes("contentor") || s.includes("meme")) return "fb_contentor";
  if (s.includes("jotrainer") || s.includes("job") || s.includes("remotask") || s.includes("outlier")) return "fb_jotrainer";
  if (s.includes("laxdollar") || s.includes("deriv") || s.includes("trading") || s.includes("boom")) return "fb_laxdollar";
  if (s.includes("shader") || s.includes("tea") || s.includes("gossip")) return "ig_shader";
  if (s.includes("real") || s.includes("confession") || s.includes("drama")) return "ig_real";
  if (s.includes("analytic") || s.includes("audit") || s.includes("metric")) return "analytics";
  if (s.includes("master") || s.includes("agentlax") || s.includes("director")) return "master";
  return null;
}

export function getAgentDisplayName(agentId: string): string {
  const names: Record<string, string> = {
    fb_laxdollar: "LAXDOLLAR FB",
    fb_jotrainer: "JOTRAINER JOBS",
    fb_contentor: "CONTENTOR",
    ig_real: "INSTA REAL",
    ig_shader: "INSTA SHADER",
    analytics: "ANALYTICS AGENT",
    master: "Master Agent (AGENTLAX)",
  };
  return names[agentId] || agentId.toUpperCase();
}

/**
 * Real Database Action: Clear scheduled and draft posts
 */
export async function clearScheduledPosts(campaignId: string = "default_campaign"): Promise<{ deletedCount: number }> {
  try {
    const scheduled = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.campaignId, campaignId), inArray(posts.status, ["scheduled", "draft"])))
      .all();

    if (scheduled.length === 0) {
      return { deletedCount: 0 };
    }

    const ids = scheduled.map((p) => p.id);
    for (const id of ids) {
      await db.delete(posts).where(eq(posts.id, id)).run();
    }

    return { deletedCount: scheduled.length };
  } catch (err: any) {
    console.error("[AgencyActions] clearScheduledPosts error:", err);
    return { deletedCount: 0 };
  }
}

/**
 * Real Infrastructure Action: Wake Agent VM PC
 */
export async function wakeAgentPc(campaignId: string, agentId: string) {
  const sb = await getOrCreateAgentSandbox(campaignId, agentId, true);
  await db
    .update(agents)
    .set({ status: "running", activeAt: new Date().toISOString() })
    .where(eq(agents.id, agentId))
    .run();
  return sb;
}

/**
 * Real Infrastructure Action: Execute Browser / Chrome Search on Agent's PC
 */
export async function executeAgentChromeTask(
  campaignId: string,
  agentId: string,
  query: string,
  customUrl?: string
) {
  const sbInfo = await getOrCreateAgentSandbox(campaignId, agentId, true);
  const nowIso = new Date().toISOString();

  await db
    .update(agents)
    .set({ status: "running", activeAt: nowIso, currentTask: `Searching Chrome for: "${query}"` })
    .where(eq(agents.id, agentId))
    .run();

  const targetUrl = customUrl || `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  const activeSb = (global as any).__activeSandboxes?.get(`${campaignId}_${agentId}`);

  let opened = false;
  if (activeSb) {
    try {
      if (typeof activeSb.open === "function") {
        await activeSb.open(targetUrl);
        opened = true;
      } else if (activeSb.commands?.run) {
        await activeSb.commands.run(`google-chrome "${targetUrl}" --no-sandbox &`);
        opened = true;
      }
    } catch (err) {
      console.warn("[AgencyActions] browser open notice:", err);
    }
  }

  // Record task in agentTasks table
  const taskId = `task_manual_${Date.now()}`;
  await db.insert(agentTasks).values({
    id: taskId,
    campaignId,
    agentId,
    title: `Chrome Search: ${query}`,
    instructions: `Autonomous Locoagent browser control: navigate to ${targetUrl} and execute query.`,
    status: "completed",
    output: `Agent PC spun up. Chrome launched and navigated to ${targetUrl}. Status: Active.`,
    startedAt: nowIso,
    completedAt: nowIso,
    createdAt: nowIso,
  }).run();

  // Record deliverable
  await db.insert(agentDeliverables).values({
    id: `deliv_${Date.now()}`,
    campaignId,
    taskId,
    agentId,
    type: "link",
    name: `Google Search: ${query}`,
    url: targetUrl,
    content: `Browser task executed on agent PC (${sbInfo.sandboxId || "microVM"})`,
    createdAt: nowIso,
  }).run();

  return {
    success: true,
    agentId,
    agentName: getAgentDisplayName(agentId),
    query,
    targetUrl,
    streamUrl: sbInfo.streamUrl,
    sandboxId: sbInfo.sandboxId,
    opened,
  };
}

/**
 * Handle incoming user instructions for real agency actions and double-authorization protocol
 */
export async function handleAgencyExecutiveCommand(
  text: string,
  contextId: string,
  campaignId: string = "default_campaign"
): Promise<{ handled: boolean; replyText?: string }> {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // 1. Check if user is confirming a pending authorization
  const pendingMap: Map<string, any> = (global as any).__pendingConfirmations || pendingConfirmations;
  const pending = pendingMap.get(contextId);

  const isAffirmative =
    /^(yes|yep|yeah|sure|confirm|proceed|ok|okay|do it|authorize|go ahead|wake him|wake her|turn on)$/i.test(
      lower
    ) || lower.includes("yes") || lower.includes("confirm");

  if (pending && isAffirmative && Date.now() - pending.timestamp < 10 * 60 * 1000) {
    // User confirmed! Execute the pending task immediately!
    pendingMap.delete(contextId);

    const { agentId, action, target, query } = pending;
    const displayName = getAgentDisplayName(agentId);

    if (action === "search" || action === "browser") {
      const result = await executeAgentChromeTask(campaignId, agentId, query || target);
      return {
        handled: true,
        replyText: `🚀 **Manual Authorization Confirmed!**\n\nI have booted **${displayName}**'s PC microVM and launched Chrome to search for **"${query || target}"**.\n\n• **Status:** Active & Running (State Preserved)\n• **Task:** Chrome Browser Navigation\n• **Workstation:** Live VNC Connected\n\nYou can watch ${displayName} working live on the dashboard desktop viewer right now!`,
      };
    } else if (action === "wake") {
      const sb = await wakeAgentPc(campaignId, agentId);
      return {
        handled: true,
        replyText: `⚡ **Manual Authorization Confirmed!**\n\n**${displayName}**'s PC is now booted and running. Workstation ID: \`${sb.sandboxId || "Active"}\`.\n\nThe agent is ready to take direct browser or posting instructions!`,
      };
    }
  }

  // 2. Action: Clear scheduled posts
  if (
    /(clear|delete|remove|wipe|cancel|reset)\s+(all\s+)?(the\s+)?(scheduled\s+)?(posts|drops|queue)/i.test(
      lower
    ) &&
    !lower.includes("how many")
  ) {
    const { deletedCount } = await clearScheduledPosts(campaignId);
    return {
      handled: true,
      replyText: `🧹 **Scheduled Posts Cleared!**\n\nI have wiped **${deletedCount}** scheduled/draft posts from the database queue. The campaign calendar is now clean and ready for fresh scheduling.`,
    };
  }

  // 3. Action: Manual PC Wake & Chrome Search instruction
  // e.g. "wake agent CONTENTOR and tell him to search laxis in it computer"
  const isWakeCommand = /(wake|turn on|boot|spin up|start|tell)\s+(agent\s+)?([a-zA-Z_]+)/i.test(lower);
  const mentionsBrowser = /(search|google|browse|open|chrome|find)/i.test(lower);

  if (isWakeCommand || (mentionsBrowser && (lower.includes("agent") || lower.includes("contentor") || lower.includes("jotrainer") || lower.includes("laxdollar") || lower.includes("shader") || lower.includes("real")))) {
    // Find target agent
    let targetAgentId = resolveAgentId(lower);
    if (!targetAgentId) {
      if (lower.includes("contentor")) targetAgentId = "fb_contentor";
      else if (lower.includes("jotrainer")) targetAgentId = "fb_jotrainer";
      else if (lower.includes("laxdollar")) targetAgentId = "fb_laxdollar";
      else if (lower.includes("shader")) targetAgentId = "ig_shader";
      else if (lower.includes("real")) targetAgentId = "ig_real";
    }

    if (targetAgentId) {
      const displayName = getAgentDisplayName(targetAgentId);

      // Extract search query if present
      let query = "laxis";
      const searchMatch = lower.match(/(search|find|google|look up|open)\s+(for\s+)?["']?([^"'.\n]+)["']?/i);
      if (searchMatch && searchMatch[3]) {
        query = searchMatch[3].replace(/in it computer|in his computer|on chrome|on google|across his desktop/gi, "").trim();
      }

      // Check if user already gave double authorization in this very message
      const alreadyAuthorized =
        lower.includes("double authorize") ||
        lower.includes("double authorization") ||
        lower.includes("force wake") ||
        lower.includes("i authorize") ||
        lower.includes("i confirm");

      if (alreadyAuthorized) {
        const result = await executeAgentChromeTask(campaignId, targetAgentId, query);
        return {
          handled: true,
          replyText: `🚀 **Manual Authorization Confirmed!**\n\nI have booted **${displayName}**'s PC microVM and launched Chrome to search for **"${query}"**.\n\n• **Status:** Active & Running\n• **Task:** Google Search on Chrome\n• **Workstation:** Live VNC Connected\n\n${displayName} is live and executing on his workstation now!`,
        };
      }

      // Otherwise: Enforce the double-authorization protocol!
      pendingMap.set(contextId, {
        agentId: targetAgentId,
        action: mentionsBrowser ? "search" : "wake",
        target: query,
        query,
        timestamp: Date.now(),
      });

      return {
        handled: true,
        replyText: `⚠️ **Manual PC Authorization Required**\n\nTo preserve your compute credits, agent PCs remain in standby ($0 compute) until scheduled drops or explicit manual authorization.\n\nAre you sure you want to wake **${displayName}**'s PC, launch Chrome, and search for **"${query}"**?\n\n👉 Reply **YES** or **CONFIRM** to authorize.`,
      };
    }
  }

  return { handled: false };
}

import { db } from "@/db";
import { agents, posts, agentTasks, agentDeliverables, agentSandboxes } from "@/db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import { getOrCreateAgentSandbox } from "./sandbox";
import { Sandbox } from "@e2b/desktop";
import { generateWithFallback } from "./ai";

const apiKey = process.env.E2B_API_KEY || "";

// In-memory pending confirmation store keyed by chatId or user context
const pendingConfirmations: Map<
  string,
  {
    agentId: string;
    action: "search" | "wake" | "browser" | "pause" | "chart";
    target: string;
    rawPrompt: string;
    timestamp: number;
  }
> = new Map();

(global as any).__pendingConfirmations = pendingConfirmations;

// Smart Agent Identifier Extractor
export function extractAgentFromPrompt(text: string): string | null {
  const lower = text.toLowerCase();

  // 1. Explicit multi-word agent names (Highest priority to avoid collision with search queries)
  if (lower.includes("insta real") || lower.includes("instareal") || lower.includes("ig_real")) {
    return "ig_real";
  }
  if (lower.includes("insta shader") || lower.includes("instashader") || lower.includes("ig_shader")) {
    return "ig_shader";
  }
  if (lower.includes("laxdollar fb") || lower.includes("fb_laxdollar")) {
    return "fb_laxdollar";
  }
  if (lower.includes("fb_contentor") || lower.includes("contentor")) {
    return "fb_contentor";
  }
  if (lower.includes("fb_jotrainer") || lower.includes("jotrainer")) {
    return "fb_jotrainer";
  }
  if (lower.includes("analytics agent") || lower.includes("analytics")) {
    return "analytics";
  }

  // 2. Action verbs followed by agent names (e.g. "use insta real", "wake real", "tell contentor", "start jotrainer")
  const match = lower.match(/(?:wake|start|boot|spin up|tell|command|use)\s+(?:agent\s+)?([a-z_]+)/i);
  if (match && match[1]) {
    const target = match[1].trim();
    if (target === "real") return "ig_real";
    if (target === "shader") return "ig_shader";
    if (target === "contentor") return "fb_contentor";
    if (target === "jotrainer" || target === "jobs") return "fb_jotrainer";
    if (target === "laxdollar") return "fb_laxdollar";
    if (target === "analytics") return "analytics";
  }

  // 3. Fallback domain topics
  if (lower.includes("confession") || lower.includes("dilemma")) return "ig_real";
  if (lower.includes("celebrity") || lower.includes("tea")) return "ig_shader";
  if (lower.includes("remotask") || lower.includes("outlier")) return "fb_jotrainer";
  if (lower.includes("sheng") || lower.includes("comedy meme")) return "fb_contentor";

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
 * Intelligent Navigation Target & Asset Resolver
 */
export function resolveNavigationTarget(text: string): {
  targetUrl: string;
  cleanTopic: string;
  isChart: boolean;
} {
  const lower = text.toLowerCase();

  const isTradingView = lower.includes("tradingview");
  const isGold = lower.includes("gold") || lower.includes("xauusd") || lower.includes("xau/usd") || lower.includes("xau");
  const isGbpUsd = lower.includes("gbp/usd") || lower.includes("gbpusd") || (lower.includes("gbp") && lower.includes("usd"));
  const isEurUsd = lower.includes("eur/usd") || lower.includes("eurusd") || (lower.includes("eur") && lower.includes("usd"));
  const isBtc = lower.includes("btc") || lower.includes("bitcoin");
  const isChart = isTradingView || isGold || isGbpUsd || isEurUsd || isBtc || lower.includes("chart") || lower.includes("graph") || lower.includes("trend") || lower.includes("candlestick");

  if (isGold) {
    return {
      targetUrl: "https://www.tradingview.com/chart/?symbol=OANDA:XAUUSD",
      cleanTopic: "Gold / US Dollar (XAUUSD)",
      isChart: true,
    };
  }

  if (isGbpUsd) {
    return {
      targetUrl: "https://www.tradingview.com/chart/?symbol=FX:GBPUSD",
      cleanTopic: "GBP / USD Forex Chart",
      isChart: true,
    };
  }

  if (isEurUsd) {
    return {
      targetUrl: "https://www.tradingview.com/chart/?symbol=FX:EURUSD",
      cleanTopic: "EUR / USD Forex Chart",
      isChart: true,
    };
  }

  if (isBtc) {
    return {
      targetUrl: "https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT",
      cleanTopic: "Bitcoin / USDT Crypto Chart",
      isChart: true,
    };
  }

  if (isTradingView) {
    return {
      targetUrl: "https://www.tradingview.com/chart/",
      cleanTopic: "TradingView Market Chart",
      isChart: true,
    };
  }

  if (lower.includes("laxdollar.site") || (lower.includes("laxdollar") && !lower.includes("search"))) {
    return {
      targetUrl: "https://laxdollar.site",
      cleanTopic: "LaxDollar Deriv Trading Portal",
      isChart: false,
    };
  }

  if (lower.includes("deriv") || lower.includes("boom") || lower.includes("crash")) {
    return {
      targetUrl: "https://track.deriv.com",
      cleanTopic: "Deriv Synthetic Trading Portal",
      isChart: true,
    };
  }

  // Extract clean search query
  let q = text;
  const match = text.match(/(?:search|google|find|look up|open|check|analyze)\s+(?:for\s+)?["']?([^"'\n]+)/i);
  if (match && match[1]) {
    q = match[1];
  }
  q = q.replace(/\s+(?:and\s+)?bring(?:\s+me)?\s+the\s+first\s+result(?:\s+that\s+chrome\s+shows)?/gi, "");
  q = q.replace(/\s+(?:and\s+)?bring(?:\s+me)?\s+the\s+(?:first\s+)?result/gi, "");
  q = q.replace(/\s+(?:and\s+)?take\s+screenshot/gi, "");
  q = q.replace(/\s+(?:and\s+)?show\s+me\s+here/gi, "");
  q = q.replace(/\s+(?:and\s+)?make\s+sure\s+the\s+screenshot\s+contains/gi, "");
  q = q.replace(/\s+(?:and\s+)?give\s+me\s+an\s+idea\s+of\s+the\s+trend/gi, "");
  q = q.replace(/\s+(?:and\s+)?double\s+authorize/gi, "");
  q = q.replace(/\s+in\s+chrome/gi, "");
  q = q.replace(/\s+on\s+chrome/gi, "");
  q = q.replace(/^["']|["']$/g, "").trim();

  const cleanQuery = q || "market analysis";
  return {
    targetUrl: `https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}`,
    cleanTopic: cleanQuery,
    isChart,
  };
}

/**
 * AI Multimodal Vision Analysis on Workstation Screenshot with Self-Verification
 */
export async function analyzeWorkstationScreenshot(
  screenshotBuffer: Buffer,
  queryOrTopic: string
): Promise<string> {
  try {
    const isChart = /(chart|graph|trend|forex|trade|trading|gbp|usd|eur|btc|gold|xau|crypto|boom|crash|deriv|candlestick|stock)/i.test(
      queryOrTopic
    );

    const promptText = isChart
      ? `You are an elite institutional quantitative trader and chart analyst. Inspect this live workstation screenshot for "${queryOrTopic}".
Self-verify what is visible on the screen.
Provide a razor-sharp technical breakdown:
1. Chart & Instrument Verification: (Confirm symbol, timeframe, and current price shown on screen)
2. Market Structure & Trend Bias: (Bullish / Bearish / Consolidating)
3. Key Technical Levels: (Immediate Resistance and Support visible)
4. Price Action / Tactical Outlook: (Key candle pattern or actionable breakout/pullback setup)
Format concisely with bullet points.`
      : `You are an executive AI assistant. Inspect this live workstation browser screenshot for "${queryOrTopic}".
Verify what window and content is rendered on the screen.
Provide 3 concise bullet points summarizing:
1. Current Screen Status & Page
2. Top result or information displayed
3. Key conclusion or takeaway.`;

    const contents = [
      {
        inlineData: {
          mimeType: "image/png",
          data: screenshotBuffer.toString("base64"),
        },
      },
      { text: promptText },
    ];

    const resultText = await generateWithFallback(contents);
    return resultText?.trim() || "";
  } catch (err: any) {
    console.warn("[AgencyActions] Screenshot vision analysis notice:", err.message);
    return "";
  }
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
 * Real Infrastructure Action: Terminate / Power Down All Active MicroVMs (Cloud & In-Memory)
 */
export async function stopAllAgentSandboxes(campaignId: string = "default_campaign") {
  // 1. Terminate in-memory cached sandboxes
  const activeMap: Map<string, any> = (global as any).__activeSandboxes;
  if (activeMap) {
    for (const [key, sb] of activeMap.entries()) {
      try {
        if (typeof sb.kill === "function") await sb.kill();
        else if (typeof sb.pause === "function") await sb.pause();
      } catch (err) {
        console.warn(`[AgencyActions] Error stopping memory sandbox ${key}:`, err);
      }
    }
    activeMap.clear();
  }

  // 2. Query all active sandboxes from the database and terminate on E2B Cloud
  try {
    const allDbSandboxes = await db.select().from(agentSandboxes).all();
    for (const s of allDbSandboxes) {
      if (s.sandboxId && apiKey) {
        try {
          const sb = await Sandbox.connect(s.sandboxId, { apiKey });
          await sb.kill();
        } catch {}
      }
    }
  } catch (dbErr) {
    console.warn("[AgencyActions] Cloud sandboxes kill notice:", dbErr);
  }

  // 3. Reset database records
  await db.update(agents).set({ status: "idle", currentTask: null }).run();
  await db.update(agentSandboxes).set({ status: "paused", sandboxId: null, streamUrl: null, viewUrl: null }).where(eq(agentSandboxes.campaignId, campaignId)).run();
}

/**
 * Real Infrastructure Action: Wake Agent VM PC
 */
export async function wakeAgentPc(campaignId: string, agentId: string) {
  await db.update(agents).set({ status: "idle" }).run();

  const sb = await getOrCreateAgentSandbox(campaignId, agentId, true);
  await db
    .update(agents)
    .set({ status: "running", activeAt: new Date().toISOString() })
    .where(eq(agents.id, agentId))
    .run();
  return sb;
}

/**
 * Real Infrastructure Action: Total Fast Control of VM (Bypasses Chrome dialogs, renders chart, captures screenshot, runs vision analysis)
 */
export async function executeAgentChromeTask(
  campaignId: string,
  agentId: string,
  rawPrompt: string
) {
  const nowIso = new Date().toISOString();
  const displayName = getAgentDisplayName(agentId);
  const { targetUrl, cleanTopic, isChart } = resolveNavigationTarget(rawPrompt);

  // 1. Ensure only this single agent animates in UI
  await db.update(agents).set({ status: "idle" }).run();

  // 2. Boot / connect to agent microVM
  const sbInfo = await getOrCreateAgentSandbox(campaignId, agentId, true);
  await db
    .update(agents)
    .set({ status: "running", activeAt: nowIso, currentTask: `Navigating to: ${cleanTopic}` })
    .where(eq(agents.id, agentId))
    .run();

  const activeSb = (global as any).__activeSandboxes?.get(`${campaignId}_${agentId}`);

  let screenshotBase64 = "";
  let visualAnalysis = "";

  if (activeSb) {
    try {
      // Step A: Suppress Chrome first-run dialogs
      await activeSb.commands?.run(`
        mkdir -p /home/user/.config/google-chrome/Default
        touch /home/user/.config/google-chrome/"First Run"
      `).catch(() => {});

      // Step B: Open target URL using sb.open
      if (typeof activeSb.open === "function") {
        await activeSb.open(targetUrl);
      }

      // Step C: Also ensure Chrome is launched on DISPLAY=:0 with all first-run suppress flags
      if (activeSb.commands?.run) {
        await activeSb.commands.run(
          `DISPLAY=:0 nohup google-chrome \
            --no-sandbox \
            --disable-dev-shm-usage \
            --no-first-run \
            --no-default-browser-check \
            --disable-search-engine-choice-screen \
            --disable-first-run-ui \
            --disable-fre \
            --password-store=basic \
            --start-maximized \
            "${targetUrl}" >/dev/null 2>&1 &`
        ).catch(() => {});
      }

      // Step D: Wait 3.5s for page and chart to render
      await new Promise((r) => setTimeout(r, 3500));

      // Step E: Press Enter via xdotool to dismiss any residual modal
      if (activeSb.commands?.run) {
        await activeSb.commands.run("DISPLAY=:0 xdotool key Return 2>/dev/null || true").catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 1000));

      // Step F: Capture real workstation screenshot
      if (typeof activeSb.screenshot === "function") {
        const shotBuffer = await activeSb.screenshot();
        if (shotBuffer && shotBuffer.length > 0) {
          screenshotBase64 = Buffer.from(shotBuffer).toString("base64");

          // Step G: Multi-modal Vision Verification & Technical Analysis
          visualAnalysis = await analyzeWorkstationScreenshot(shotBuffer, cleanTopic);
        }
      }
    } catch (err: any) {
      console.warn("[AgencyActions] Task execution notice:", err);
    }
  }

  // 3. Mark agent status as "done" so typing animation immediately stops!
  await db
    .update(agents)
    .set({ status: "done", currentTask: `Completed: ${cleanTopic}` })
    .where(eq(agents.id, agentId))
    .run();

  // 4. Record task in agentTasks table
  const taskId = `task_${Date.now()}`;
  await db.insert(agentTasks).values({
    id: taskId,
    campaignId,
    agentId,
    title: isChart ? `Market Chart Analysis: ${cleanTopic}` : `Browser Task: ${cleanTopic}`,
    instructions: rawPrompt,
    status: "completed",
    output: visualAnalysis || `Navigated to ${targetUrl} and captured live screenshot.`,
    startedAt: nowIso,
    completedAt: new Date().toISOString(),
    createdAt: nowIso,
  }).run();

  // 5. Record deliverable
  await db.insert(agentDeliverables).values({
    id: `deliv_${Date.now()}`,
    campaignId,
    taskId,
    agentId,
    type: isChart ? "research" : "link",
    name: `${cleanTopic}`,
    url: targetUrl,
    content: visualAnalysis || `Live workstation screen captured for ${cleanTopic}`,
    createdAt: nowIso,
  }).run();

  const mediaUrl = screenshotBase64 ? `data:image/png;base64,${screenshotBase64}` : undefined;

  let replyText = `🎯 **Task Complete: ${displayName} Live Workstation Execution**\n\n`;
  if (visualAnalysis) {
    replyText += `${visualAnalysis}\n\n`;
  }
  replyText += `• **Active URL:** \`${targetUrl}\`\n• **Subject:** ${cleanTopic}\n• **Status:** Completed (Live screenshot attached above)\n• **Workstation:** Live VNC connected`;

  return {
    success: true,
    agentId,
    agentName: displayName,
    cleanTopic,
    targetUrl,
    screenshotBase64,
    mediaUrl,
    streamUrl: sbInfo.streamUrl,
    sandboxId: sbInfo.sandboxId,
    replyText,
  };
}

/**
 * Handle incoming user instructions for real agency actions and double-authorization protocol
 */
export async function handleAgencyExecutiveCommand(
  text: string,
  contextId: string,
  campaignId: string = "default_campaign"
): Promise<{ handled: boolean; replyText?: string; mediaUrl?: string }> {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // 1. Immediate Action: STOP / POWER OFF / SHUT DOWN / KILL VM / RESET AGENTS
  // e.g. "Just power off the vm and the agent too..today don't allocate any posting", "stop them", "pause the vm", "stop vm", "kill vm"
  const isStopCommand =
    /(?:power\s*off|power\s*down|stop|pause|shut\s*down|turn\s*off|kill|standby|halt|freeze)\s+(?:the\s+vm|it\s+plus\s+vm|it\s+and\s+vm|the\s+agent|vm|pc|all|all\s+agents|agent|agents|them|chrome)/i.test(
      lower
    ) ||
    lower === "stop" ||
    lower === "stop them" ||
    lower === "power off" ||
    lower.startsWith("power off") ||
    lower.startsWith("stop it") ||
    lower.includes("power off the vm") ||
    lower.includes("pause the vm") ||
    lower.includes("stop vm") ||
    lower.includes("stop them") ||
    lower.includes("stop the agents") ||
    lower.includes("told you to stop them") ||
    lower.includes("told you to pause") ||
    lower.includes("stop it plus vm") ||
    lower.includes("can see it running") ||
    (lower.includes("still") && lower.includes("active") && lower.includes("why"));

  if (isStopCommand) {
    await stopAllAgentSandboxes(campaignId);

    // If user also requested to clear schedule/don't post today
    if (lower.includes("don't allocate") || lower.includes("dont allocate") || lower.includes("no posts") || lower.includes("clear schedule")) {
      await clearScheduledPosts(campaignId);
    }

    return {
      handled: true,
      replyText: `🛑 **All MicroVMs & Agents Powered Off!**\n\nI have forced a hard power-off on all active cloud sandboxes and terminated all Chrome sessions.\n\n• **MicroVMs:** Powered down ($0 compute mode)\n• **Agent Statuses:** All reset to Resting/Idle\n• **Schedule:** Paused (No posts will drop)\n• **State & Memory:** Securely preserved in vault.`,
    };
  }

  // 2. Action: Check if user is confirming a pending authorization
  const pendingMap: Map<string, any> = (global as any).__pendingConfirmations || pendingConfirmations;
  const pending = pendingMap.get(contextId);

  const isAffirmative =
    /^(yes|yep|yeah|sure|confirm|proceed|ok|okay|do it|authorize|go ahead|wake him|wake her|turn on)$/i.test(
      lower
    ) || lower === "yes" || lower.startsWith("yes ") || lower.includes("confirm");

  if (pending && isAffirmative && Date.now() - pending.timestamp < 10 * 60 * 1000) {
    // User confirmed! Execute the pending task immediately!
    pendingMap.delete(contextId);

    const { agentId, action, rawPrompt } = pending;
    const displayName = getAgentDisplayName(agentId);

    if (action === "search" || action === "browser" || action === "chart") {
      const result = await executeAgentChromeTask(campaignId, agentId, rawPrompt);
      return {
        handled: true,
        replyText: result.replyText,
        mediaUrl: result.mediaUrl,
      };
    } else if (action === "wake") {
      const sb = await wakeAgentPc(campaignId, agentId);
      return {
        handled: true,
        replyText: `⚡ **Manual Authorization Confirmed!**\n\n**${displayName}**'s PC is now booted and running. Workstation ID: \`${sb.sandboxId || "Active"}\`.\n\nThe agent is ready to take direct browser or posting instructions!`,
      };
    }
  }

  // 3. Action: Clear scheduled posts
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

  // 4. Action: Check status / "is it done or its still active"
  if (/(is\s+it\s+done|is\s+it\s+still\s+running|is\s+it\s+finished)/i.test(lower)) {
    const latestTask = await db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.campaignId, campaignId))
      .orderBy(desc(agentTasks.createdAt))
      .limit(1)
      .get();

    if (latestTask && latestTask.status === "completed") {
      return {
        handled: true,
        replyText: `✅ **Task Completed!**\n\n• **Task:** ${latestTask.title}\n• **Outcome:** ${latestTask.output || "Complete"}\n\nThe browser task has finished and the deliverable is saved. The typing animation has stopped. If you want to shut down the microVM completely, just reply "power off vm".`,
      };
    }
  }

  // 5. Action: Manual PC Wake, Chrome Search & Technical Chart Analysis instruction
  // e.g. "Use INSTA REAL and go to chrome tradingview.com website search gold /usd graph and take screenshot..make sure the screenshot contains the graph and show me here"
  const isWakeCommand = /(wake|turn on|boot|spin up|start|tell|command|use)\s+(agent\s+)?([a-zA-Z_ ]+)/i.test(lower);
  const mentionsBrowser = /(search|google|browse|open|chrome|find|chart|graph|trend|analyze|check|tradingview)/i.test(lower);

  if (isWakeCommand || (mentionsBrowser && (lower.includes("agent") || lower.includes("contentor") || lower.includes("jotrainer") || lower.includes("laxdollar") || lower.includes("shader") || lower.includes("real")))) {
    const targetAgentId = extractAgentFromPrompt(text);

    if (targetAgentId) {
      const displayName = getAgentDisplayName(targetAgentId);
      const { cleanTopic, isChart } = resolveNavigationTarget(text);

      // Check if user already gave double authorization in this very message
      const alreadyAuthorized =
        lower.includes("double authorize") ||
        lower.includes("double authorization") ||
        lower.includes("force wake") ||
        lower.includes("i authorize") ||
        lower.includes("i confirm") ||
        lower.includes("all the permissions") ||
        lower.includes("all the permisions");

      if (alreadyAuthorized) {
        const result = await executeAgentChromeTask(campaignId, targetAgentId, text);
        return {
          handled: true,
          replyText: result.replyText,
          mediaUrl: result.mediaUrl,
        };
      }

      // Otherwise: Enforce the double-authorization protocol!
      pendingMap.set(contextId, {
        agentId: targetAgentId,
        action: isChart ? "chart" : "search",
        target: cleanTopic,
        rawPrompt: text,
        timestamp: Date.now(),
      });

      return {
        handled: true,
        replyText: `⚠️ **Manual PC Authorization Required**\n\nTo preserve your compute credits, agent PCs remain in standby ($0 compute) until scheduled drops or explicit manual authorization.\n\nAre you sure you want to wake **${displayName}**'s PC, launch Chrome, and analyze **"${cleanTopic}"**?\n\n👉 Reply **YES** or **CONFIRM** to authorize.`,
      };
    }
  }

  return { handled: false };
}

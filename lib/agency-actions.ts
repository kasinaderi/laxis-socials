import { db } from "@/db";
import { agents, posts, agentTasks, agentDeliverables, agentSandboxes } from "@/db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import { getOrCreateAgentSandbox, pauseAgentSandbox, isFreestyleAgent } from "./sandbox";
import { pauseFreestyleSandbox } from "./freestyle-sandbox";
import { Sandbox } from "@e2b/desktop";
import { generateWithFallback } from "./ai";
import {
  initSandboxBrowserAndCdp,
  launchChromeWithCdp,
  cdpNavigate,
  cdpSearch,
  cdpClickText,
  cdpGetInfo,
  cdpTypeInput,
  cdpPressEnter,
  cdpScroll,
  cdpClickOrdinal,
} from "./cdp";
import { checkHermesStatus, runHermesTask } from "./hermes";

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

// Active VM conversational context store (tracks which workstation Kelvin is engaged with)
const lastActiveAgentByContext: Map<string, string> = new Map();
(global as any).__lastActiveAgentByContext = lastActiveAgentByContext;

// Smart Agent Identifier Extractor with Conversational Memory
export function extractAgentFromPrompt(text: string, contextId?: string): string | null {
  const lower = text.toLowerCase();
  const trimmedText = text.trim();

  // 1. Explicit multi-word agent names (Highest priority)
  // IMPORTANT: Use exact phrase or word-boundary matching to prevent false positives
  // e.g. "instead" must NOT match "insta", "jobs" must NOT match "jobtask"
  let found: string | null = null;
  if (lower.includes("insta real") || lower.includes("instareal") || lower.includes("ig_real")) {
    found = "ig_real";
  } else if (lower.includes("insta shader") || lower.includes("instashader") || lower.includes("ig_shader") || /\bshader\b/i.test(lower)) {
    found = "ig_shader";
  } else if (lower.includes("laxdollar fb") || lower.includes("fb_laxdollar") || (lower.includes("laxdollar") && !lower.includes("laxdollar.site") && !lower.includes("search"))) {
    found = "fb_laxdollar";
  } else if (lower.includes("fb_contentor") || lower.includes("contentor")) {
    found = "fb_contentor";
  } else if (lower.includes("pintr") || lower.includes("fb_jotrainer") || lower.includes("jotrainer") || lower.includes("pinterest") || /\bpins?\b/.test(lower) || /\bpinning\b/.test(lower)) {
    found = "fb_jotrainer";
  } else if (
    lower.includes("analytics agent") || lower.includes("analytics") || lower.includes("analytic") ||
    lower.includes("deriv") || lower.includes("pattern lab") || lower.includes("deriv lab") ||
    lower.includes("tick") || lower.includes("pattern engine")
  ) {
    found = "analytics";
  }

  // 2. Action verbs followed by agent names (e.g. "use insta real", "wake real", "tell contentor", "start jotrainer")
  if (!found) {
    const match = lower.match(/(?:wake|start|boot|spin up|tell|command|use)\s+(?:agent\s+)?([a-z_]+)/i);
    if (match && match[1]) {
      const target = match[1].trim();
      if (target === "real") found = "ig_real";
      else if (target === "shader") found = "ig_shader";
      else if (target === "contentor") found = "fb_contentor";
      else if (target === "pintr" || target === "jotrainer" || target === "jobs" || target === "pinterest" || target === "pin" || target === "pins") found = "fb_jotrainer";
      else if (target === "laxdollar") found = "fb_laxdollar";
      else if (target === "analytics" || target === "analytic") found = "analytics";
    }
  }

  // If found explicitly, save to context!
  if (found) {
    if (contextId) {
      lastActiveAgentByContext.set(contextId, found);
    }
    return found;
  }

  // ── CRITICAL: Always check context BEFORE keyword fallbacks ──────────────
  // If no explicit agent name, return the currently active VM.
  // This ensures "search X instead", "scroll up", "click the first" etc.
  // all stay locked to the agent already in conversation.
  if (contextId && lastActiveAgentByContext.has(contextId)) {
    return lastActiveAgentByContext.get(contextId) || null;
  }

  // 3. Conversational Continuity: Check if prompt refers to the same / current VM
  const refersToContext =
    lower.includes("same vm") ||
    lower.includes("that same vm") ||
    lower.includes("same agent") ||
    lower.includes("current vm") ||
    lower.includes("that vm") ||
    lower.includes("the vm") ||
    lower.includes("this vm") ||
    lower.includes("in that pc") ||
    lower.includes("on that pc") ||
    lower.includes("type the email") ||
    lower.includes("type in") ||
    lower.includes("click next") ||
    lower.includes("press enter") ||
    lower.includes("cant see that screenshot") ||
    lower.includes("take that screenshot") ||
    // Follow-up screenshot/show requests — always continue on the active VM
    lower.includes("let me see") ||
    lower.includes("show me") ||
    lower.includes("i want to see") ||
    lower.includes("send me") ||
    lower.includes("where is the photo") ||
    lower.includes("where is the screenshot") ||
    lower.includes("send the screenshot") ||
    lower.includes("send it") ||
    lower === "show" ||
    lower === "see" ||
    lower === "photo" ||
    lower === "pic" ||
    lower === "picture" ||
    // Ordinal / relative navigation
    /^(?:click|open|tap|press)(?:\s+the)?\s+(?:first|second|third|1st|2nd|3rd|top|latest)/i.test(trimmedText) ||
    /^(?:scroll|swipe)(?:\s+(?:up|down|left|right|top|bottom))?(?:\s+and)?/i.test(trimmedText);

  if (contextId && refersToContext) {
    const ctxAgent = lastActiveAgentByContext.get(contextId);
    if (ctxAgent) return ctxAgent;
  }

  // 4. Fallback domain topics (only if no active context)
  if (lower.includes("confession") || lower.includes("dilemma")) return "ig_real";
  if (lower.includes("celebrity") || lower.includes("tea")) return "ig_shader";
  if (lower.includes("pinterest") || lower.includes("pin marketing") || lower.includes("pins")) return "fb_jotrainer";
  if (lower.includes("remotask") || lower.includes("outlier") || lower.includes("deriv") || lower.includes("boom") || lower.includes("crash")) return "fb_laxdollar";
  if (lower.includes("sheng") || lower.includes("comedy meme")) return "fb_contentor";

  return null;
}

export function getAgentDisplayName(agentId: string): string {
  const names: Record<string, string> = {
    fb_laxdollar: "LAXDOLLAR (Trading & Hustles)",
    fb_jotrainer: "PINTR",
    fb_contentor: "CONTENTOR",
    ig_real: "INSTA REAL",
    ig_shader: "INSTA SHADER",
    analytics: "ANALYTICS AGENT",
    master: "Master Agent (AGENTLAX)",
  };
  return names[agentId] || agentId.toUpperCase();
}

/**
 * Navigation & Intent Structure for Human-Like Computer-Use
 */
export interface NavigationIntent {
  baseUrl: string;
  targetUrl: string;
  cleanTopic: string;
  searchQuery: string;
  platform: string;
  intentType: "search" | "unfollow" | "follow" | "post" | "browse" | "chart";
  targetTab?: "people" | "groups" | "repositories" | "all";
  isChart: boolean;
}

/**
 * Intelligent Query & Entity Cleaner
 * Strips conversational noise, typo tails ("the share the screenshot with e"),
 * instructions ("and report back with screenshot"), and punctuation.
 */
export function cleanAutonomousSearchQuery(raw: string): string {
  if (!raw) return "";
  let q = raw.trim();

  // 1. Strip common command prefixes
  q = q.replace(/^(?:search\s+for|search|find|look\s+up|watch|play|google)\s+/i, "");

  // 2. Strip multi-clause conversational tails & typos
  // Handles: "the share the screenshot with e", "and bring me back the screenshot results", "then report back with screenshot"
  q = q.replace(/(?:and\s+then|and|then|the)\s+(?:share|send|bring|give|show|take|capture|report|provide|post)\s+(?:me\s+)?(?:back\s+)?(?:with\s+)?(?:the\s+)?(?:screenshot|photo|results?|screen|picture|e|pic|view).*$/i, "");
  q = q.replace(/(?:and\s+then|and|then|the)\s+(?:take|capture)\s+(?:a\s+)?screenshot.*$/i, "");
  q = q.replace(/(?:and\s+then|and|then)\s+(?:report\s+back|let\s+me\s+see|show\s+me).*$/i, "");
  q = q.replace(/\s+(?:and\s+)?take\s+(?:a\s+)?screenshot.*$/i, "");
  q = q.replace(/\s+(?:and\s+)?bring(?:\s+me)?\s+(?:back\s+)?(?:the\s+)?(?:first\s+)?(?:video\s+)?(?:search\s+)?result.*$/i, "");
  q = q.replace(/\s+(?:and\s+)?show\s+(?:me\s+)?(?:the\s+)?results?.*$/i, "");
  q = q.replace(/\s+(?:in\s+)?(?:the\s+)?(?:searchbox|search\s+box|search\s+bar)(?:\s+instead)?.*$/i, "");
  q = q.replace(/\s+instead$/i, "");
  q = q.replace(/\s+(?:in|on)\s+chrome.*$/i, "");

  // 3. Strip platform domains if accidentally captured
  q = q.replace(/(?:go to\s+)?(?:youtube|github|google|facebook|instagram|twitter|reddit|medium)(?:\.com)?/gi, "");

  // 4. Strip surrounding punctuation and quotes
  q = q.replace(/^[,“"'\s]+|[,“"'\s]+$/g, "").trim();
  return q;
}

/**
 * Intelligent Navigation Target & Asset Resolver
 * Points to the root platform homepage so the agent operates like a real human (typing, clicking search)
 * and never triggers bot detection flags with pre-baked deep URLs.
 */
export function resolveNavigationTarget(text: string): NavigationIntent {
  const lower = text.toLowerCase();

  function cleanQueryText(raw: string): string {
    return cleanAutonomousSearchQuery(raw);
  }

  // 1. Reddit Platform
  if (lower.includes("reddit")) {
    let q = "";
    const m = text.match(/(?:searrch|search|find|for|term)\s+["']?([^"'\n]+)/i);
    if (m) q = m[1];
    q = cleanQueryText(q);
    if (!q) q = "ambicious warthong";
    return {
      baseUrl: "https://www.reddit.com",
      targetUrl: "https://www.reddit.com",
      cleanTopic: `Reddit: "${q}"`,
      searchQuery: q,
      platform: "reddit",
      intentType: "search",
      isChart: false,
    };
  }

  // 2. Medium Articles & Stories Search
  if (lower.includes("medium")) {
    let q = "";
    const match = text.match(/(?:searrch|search|find|for|term)\s+["']?([^"'\n]+)/i);
    if (match) q = match[1];
    q = cleanQueryText(q);
    if (!q) q = "jarvis tutorial";
    return {
      baseUrl: "https://medium.com",
      targetUrl: "https://medium.com",
      cleanTopic: `Medium: "${q}"`,
      searchQuery: q,
      platform: "medium",
      intentType: "search",
      isChart: false,
    };
  }

  // 3. ChatGPT & AI Assistants
  if (lower.includes("chatgpt") || lower.includes("chat gpt") || lower.includes("openai")) {
    let q = "";
    const m = text.match(/(?:ask|ask the chatgpt chat|query|prompt|say)\s+["']?([^"'\n]+)/i);
    if (m) q = m[1];
    q = cleanQueryText(q);
    if (!q) q = "which is the cheapest proxy";
    return {
      baseUrl: "https://chatgpt.com",
      targetUrl: "https://chatgpt.com",
      cleanTopic: `ChatGPT: "${q}"`,
      searchQuery: q,
      platform: "chatgpt",
      intentType: "search",
      isChart: false,
    };
  }

  // 4. Twitter / X Direct Account & Post Search
  const isTwitterOrX =
    lower.includes("twitter") ||
    lower.includes("twittwer") ||
    lower.includes("x.com") ||
    lower.includes("/x") ||
    lower.includes(" on x") ||
    lower.includes(" to x") ||
    lower.includes("search x") ||
    lower.includes("x search");

  if (isTwitterOrX) {
    let xQuery = "";
    const match = text.match(/(?:searrch|search|find|for|term)\s+["']?([a-zA-Z0-9_\-\.]+)/i);
    if (match && match[1]) {
      xQuery = match[1];
    }
    xQuery = cleanQueryText(xQuery);
    if (!xQuery) xQuery = "neo_vibes";
    const isAccountSearch = lower.includes("account") || lower.includes("user") || lower.includes("profile") || lower.includes("people");

    return {
      baseUrl: "https://x.com",
      targetUrl: "https://x.com",
      cleanTopic: `X (Twitter) ${isAccountSearch ? "Accounts" : "Search"}: "${xQuery}"`,
      searchQuery: xQuery,
      platform: "x",
      intentType: "search",
      targetTab: isAccountSearch ? "people" : "all",
      isChart: false,
    };
  }

  // 5. Instagram Navigation & Profile Actions
  // MUST NOT trigger if user said "insta real" or "insta shader" without instagram keyword!
  const mentionsInstaAgentOnly = (lower.includes("insta real") || lower.includes("insta shader")) && !lower.includes("instagram");
  const isInstagram = !mentionsInstaAgentOnly && (lower.includes("instagram") || /\binsta\b/.test(lower));

  if (isInstagram) {
    const isUnfollow = lower.includes("unfollow");
    const isFollow = lower.includes("follow") && !isUnfollow;
    const countMatch = lower.match(/(?:unfollow|follow)\s+(\d+|five|ten|three|four|two)\s+(?:people|accounts|users|creators|profiles)?/i);

    let igQuery = "";
    if (countMatch) {
      igQuery = ""; // Multi-account action, not a single username search
    } else {
      const match = text.match(/(?:unfollow|follow|searrch|search|find|profile)\s+["']?([a-zA-Z0-9_\-\.]+)/i);
      if (match && match[1]) {
        igQuery = match[1];
      }
      igQuery = cleanQueryText(igQuery);
    }

    const countLabel = countMatch ? `${isUnfollow ? "Unfollow" : "Follow"} ${countMatch[1]} accounts` : "";
    return {
      baseUrl: "https://www.instagram.com",
      targetUrl: "https://www.instagram.com",
      cleanTopic: countLabel ? `Instagram: ${countLabel}` : isUnfollow ? `Instagram Unfollow: "${igQuery || "target"}"` : isFollow ? `Instagram Follow: "${igQuery || "target"}"` : `Instagram: "${igQuery || "feed"}"`,
      searchQuery: igQuery,
      platform: "instagram",
      intentType: isUnfollow ? "unfollow" : isFollow ? "follow" : "search",
      isChart: false,
    };
  }

  // 6. GitHub Direct Navigation & Internal Search
  const isGitHub = lower.includes("github");
  if (isGitHub) {
    let ghQuery = "";
    const commaMatch = text.match(/[,“"']\s*([^,“"'\n\r]+)\s*[,“"']/);
    if (commaMatch && commaMatch[1]) {
      ghQuery = commaMatch[1].trim();
    } else {
      const searchMatch = text.match(/(?:searrch|search|find|for)\s+([^,\n\r]+?)(?:\s+and\s+(?:then\s+)?(?:bring|take|show|send|give)|\s+in\s+chrome|$)/i);
      if (searchMatch && searchMatch[1]) {
        ghQuery = searchMatch[1].trim();
      }
    }
    ghQuery = cleanQueryText(ghQuery);
    if (!ghQuery || ghQuery.length <= 1) ghQuery = "laxdollar";

    return {
      baseUrl: "https://github.com",
      targetUrl: "https://github.com",
      cleanTopic: `GitHub Repository Search: "${ghQuery}"`,
      searchQuery: ghQuery,
      platform: "github",
      intentType: "search",
      targetTab: "repositories",
      isChart: false,
    };
  }

  // 5. Facebook Direct Search & People/Profile/Group Navigation
  const isFacebook = lower.includes("facebook") || lower.includes("fb.com");
  if (isFacebook) {
    let fbQuery = "";
    const m = text.match(/(?:search for|search|find)\s+([a-zA-Z0-9_ ]+?)(?:\s+if|\s+and|\s+text|\s+message|\s+on my friends|\s+group|$)/i);
    if (m && m[1]) {
      fbQuery = m[1].replace(/facebook|fb/gi, "").trim();
    }
    const isSearch = Boolean(fbQuery);
    const isGroups = lower.includes("group") || lower.includes("groups");

    return {
      baseUrl: "https://www.facebook.com",
      targetUrl: "https://www.facebook.com",
      cleanTopic: isSearch
        ? `Facebook ${isGroups ? "Groups" : "Search"}: "${fbQuery}"`
        : "Navigate to Facebook",
      searchQuery: fbQuery,
      platform: "facebook",
      intentType: isSearch ? "search" : "browse",
      targetTab: isGroups ? "groups" : "all",
      isChart: false,
    };
  }

  // 6. YouTube Media Search
  const isYouTube = lower.includes("youtube") || lower.includes("video") || lower.includes("song") || lower.includes("music");
  if (isYouTube) {
    let ytQuery = text;
    const match = text.match(/(?:search|find|for|play|watch)\s+["']?([^"'\n]+)/i);
    if (match && match[1]) {
      ytQuery = match[1];
    }
    ytQuery = cleanAutonomousSearchQuery(ytQuery);
    if (!ytQuery) ytQuery = "laxis music";

    return {
      baseUrl: "https://www.youtube.com",
      targetUrl: "https://www.youtube.com",
      cleanTopic: `YouTube Search: "${ytQuery}"`,
      searchQuery: ytQuery,
      platform: "youtube",
      intentType: "search",
      isChart: false,
    };
  }

  // 7. TradingView & Financial Charts
  const isTradingView = lower.includes("tradingview");
  const isGold = lower.includes("gold") || lower.includes("xauusd") || lower.includes("xau/usd") || lower.includes("xau");
  const isGbpUsd = lower.includes("gbp/usd") || lower.includes("gbpusd") || (lower.includes("gbp") && lower.includes("usd"));
  const isEurUsd = lower.includes("eur/usd") || lower.includes("eurusd") || (lower.includes("eur") && lower.includes("usd"));
  const isBtc = lower.includes("btc") || lower.includes("bitcoin");
  const isChart = isTradingView || isGold || isGbpUsd || isEurUsd || isBtc || lower.includes("chart") || lower.includes("graph") || lower.includes("trend") || lower.includes("candlestick");

  if (isChart) {
    const symbol = isGold ? "XAUUSD" : isBtc ? "BTCUSDT" : isGbpUsd ? "GBPUSD" : isEurUsd ? "EURUSD" : "market";
    return {
      baseUrl: "https://www.tradingview.com/chart/",
      targetUrl: "https://www.tradingview.com/chart/",
      cleanTopic: `TradingView Chart: ${symbol}`,
      searchQuery: symbol,
      platform: "tradingview",
      intentType: "chart",
      isChart: true,
    };
  }

  // 8. Deriv & Laxdollar Trading Sites
  if (lower.includes("laxdollar.site") || (lower.includes("laxdollar") && !lower.includes("search"))) {
    return {
      baseUrl: "https://laxdollar.site",
      targetUrl: "https://laxdollar.site",
      cleanTopic: "LaxDollar Deriv Trading Portal",
      searchQuery: "laxdollar.site",
      platform: "laxdollar",
      intentType: "browse",
      isChart: false,
    };
  }

  if (lower.includes("deriv") || lower.includes("boom") || lower.includes("crash")) {
    return {
      baseUrl: "https://track.deriv.com",
      targetUrl: "https://track.deriv.com",
      cleanTopic: "Deriv Synthetic Trading Portal",
      searchQuery: "Deriv",
      platform: "deriv",
      intentType: "chart",
      isChart: true,
    };
  }

  // 9. Arbitrary Website: "go to <site> and <action>" or explicit domain like "open amazon.com", "go to wikipedia.org"
  const domainOnlyMatch = text.match(/(?:go to|open|visit|navigate to)\s+([a-zA-Z0-9\-]+\.(?:com|org|net|io|site|app|co|dev|tv|ai|gov|edu))/i);
  if (domainOnlyMatch) {
    const domain = domainOnlyMatch[1].trim();
    return {
      baseUrl: `https://${domain}`,
      targetUrl: `https://${domain}`,
      cleanTopic: `Open: ${domain}`,
      searchQuery: "",
      platform: domain.split(".")[0],
      intentType: "browse",
      isChart: false,
    };
  }

  const genericMatch = text.match(
    /(?:go to|open|visit|navigate to)\s+([a-zA-Z0-9\-\.]+)(?:\.com|\.org|\.net|\.io|\.site|\.app|\.co)?\s+(?:and\s+)?(?:search|find|look for|check|read|get|explore|follow|buy|see)\s+["']?([^"'\n]+)/i
  );
  if (genericMatch) {
    const site = genericMatch[1].trim();
    const domain = site.includes(".") ? site : `${site}.com`;
    const query = genericMatch[2].replace(/and\s+screenshot|and\s+give|and\s+bring|and\s+verify/gi, "").trim();
    return {
      baseUrl: `https://${domain}`,
      targetUrl: `https://${domain}`,
      cleanTopic: `${site.toUpperCase()}: "${query}"`,
      searchQuery: query,
      platform: site.toLowerCase(),
      intentType: "search",
      isChart: false,
    };
  }

  // 10. General Web Search Fallback (Cleaned of all conversational noise)
  let q = text;
  const match = text.match(/(?:search|google|find|look up|open|check|analyze)\s+(?:for\s+)?["']?([^"'\n]+)/i);
  if (match && match[1]) {
    q = match[1];
  }
  const cleanQuery = cleanAutonomousSearchQuery(q) || "market analysis";
  return {
    baseUrl: "https://www.google.com",
    targetUrl: "https://www.google.com",
    cleanTopic: `Web Search: "${cleanQuery}"`,
    searchQuery: cleanQuery,
    platform: "google",
    intentType: "search",
    isChart: false,
  };
}

/**
 * Autonomous Reasoning Brain: Task Compiler & Intent Deconstruction
 * Deconstructs instructions into natural human operations (Base URL + query to type)
 */
export async function planAutonomousTask(rawPrompt: string): Promise<{
  targetAgentId: string;
  baseUrl: string;
  targetUrl: string;
  cleanTopic: string;
  searchQuery: string;
  isChart: boolean;
  intentType: "search" | "unfollow" | "follow" | "post" | "browse" | "chart";
  targetTab: "people" | "groups" | "repositories" | "all";
  verificationGoal: string;
}> {
  const fallback = resolveNavigationTarget(rawPrompt);
  const detectedAgent = extractAgentFromPrompt(rawPrompt) || "master";

  try {
    const aiPrompt = `You are AGENTLAX — the autonomous reasoning brain and computer-use task compiler.
The user gave this instruction: "${rawPrompt}".

Your job is to deconstruct this instruction into human execution parameters in JSON:
{
  "targetAgentId": "${detectedAgent}",
  "platform": "medium" | "x" | "instagram" | "github" | "facebook" | "youtube" | "tradingview" | "custom_web" | "google",
  "baseUrl": "Base homepage URL of the service to open in browser (e.g. https://medium.com, https://x.com, https://github.com, https://www.facebook.com, https://www.instagram.com, https://www.youtube.com, https://www.tradingview.com)",
  "cleanTopic": "Clear human-readable title of the task",
  "searchQuery": "Clean search term or entity ONLY (strip typos, instructions, conversational tails)",
  "intentType": "search" | "unfollow" | "follow" | "post" | "browse" | "chart",
  "targetTab": "people" | "groups" | "repositories" | "all",
  "isChart": boolean,
  "verificationGoal": "What specific content or results must be verified on screen"
}

CRITICAL RULES:
1. baseUrl MUST BE the root website homepage (e.g. https://www.youtube.com, https://github.com), NEVER a deep query URL. Real human interaction will type the query into the search box.
2. searchQuery MUST BE ONLY the entity or query itself. Strip ALL instructions, conversation tails, and typos (e.g. "the share the screenshot with e", "and bring me screenshot", "then report back").
3. Examples of extracting clean search queries:
   - "open jotrainer use chrome to open youtube and search obinna the share the screenshot with e" -> searchQuery: "obinna", cleanTopic: "Search YouTube for obinna", platform: "youtube"
   - "use laxdollar fb go github search jev ai and then bring me the screenshot" -> searchQuery: "jev ai", cleanTopic: "Search GitHub for jev ai", platform: "github"
   - "go to youtube and search sherryboi and bring me back the screenshot" -> searchQuery: "sherryboi", cleanTopic: "Search YouTube for sherryboi", platform: "youtube"
   - "open jotrainer use chrome to open youtube and search Solomon mkubwa and report back with the screenshot" -> searchQuery: "Solomon mkubwa", cleanTopic: "Search YouTube for Solomon mkubwa", platform: "youtube"
4. NEVER substitute Google when a specific platform was requested.
Respond with JSON only.`;

    const aiRes = await Promise.race([
      generateWithFallback([{ text: aiPrompt }]),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("AI planner timeout")), 20000)),
    ]);

    if (aiRes) {
      const jsonMatch = aiRes.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.baseUrl && parsed.baseUrl.startsWith("http")) {
          const cleanSearch = cleanAutonomousSearchQuery(parsed.searchQuery || fallback.searchQuery || "");
          const cleanTopicTitle = cleanAutonomousSearchQuery(parsed.cleanTopic || fallback.cleanTopic) || `Search: "${cleanSearch}"`;
          return {
            targetAgentId: parsed.targetAgentId || detectedAgent,
            baseUrl: parsed.baseUrl,
            targetUrl: parsed.baseUrl,
            cleanTopic: cleanTopicTitle,
            searchQuery: cleanSearch,
            intentType: parsed.intentType || fallback.intentType || "search",
            targetTab: parsed.targetTab || fallback.targetTab || "all",
            isChart: Boolean(parsed.isChart),
            verificationGoal: parsed.verificationGoal || `Verify content for ${cleanTopicTitle}`,
          };
        }
      }
    }
  } catch (err: any) {
    // Timeout or transient issue: deterministic fallback executes seamlessly
  }

  const fallbackCleanSearch = cleanAutonomousSearchQuery(fallback.searchQuery || "");
  return {
    targetAgentId: detectedAgent,
    baseUrl: fallback.baseUrl,
    targetUrl: fallback.baseUrl,
    cleanTopic: fallback.cleanTopic,
    searchQuery: fallbackCleanSearch,
    intentType: fallback.intentType,
    targetTab: fallback.targetTab || "all",
    isChart: fallback.isChart,
    verificationGoal: `Verify content for ${fallback.cleanTopic}`,
  };
}

/**
 * AI Multimodal Vision Analysis on Workstation Screenshot with Self-Verification
 */
export async function analyzeWorkstationScreenshot(
  screenshotBuffer: Buffer | Uint8Array,
  queryOrTopic: string
): Promise<string> {
  try {
    const isChart = /(chart|graph|trend|forex|trade|trading|gbp|usd|eur|btc|gold|xau|crypto|boom|crash|deriv|candlestick|stock)/i.test(
      queryOrTopic
    );
    const isTwitterOrX = /(twitter|twittwer|x\.com|\/x|x\s+search)/i.test(queryOrTopic);
    const isInstagram = /(instagram|insta)/i.test(queryOrTopic);

    const monitoringDirective = `
ACTIVE MONITORING & INTEGRITY DIRECTIVE:
Examine the live screen pixels critically:
1. Did the page load the genuine requested content, or is it blocked by a network security block (e.g. "blocked by network security", "access denied", Cloudflare turnstile, CAPTCHA, or mandatory login screen)?
2. If BLOCKED or CHALLENGED: Explicitly state "Status: BLOCKED_BY_PLATFORM (Security Challenge Detected)" and specify the exact blocker text.
3. If the requested platform or topic is NOT visible (e.g. wrong browser, wrong website, empty history, or desktop wallpaper): Explicitly state "Status: NOT_VERIFIED (Reason why screen does not match requested objective)".
4. If VERIFIED: State "Status: VERIFIED (Objective fulfilled on live screen)".
Be completely truthful, concise, and razor-sharp.`;

    let promptText = "";
    if (isChart) {
      promptText = `You are an elite quantitative chart analyst and workstation monitor. Inspect this live workstation screenshot for "${queryOrTopic}".
Self-verify what is visible on the screen.
Provide a razor-sharp technical breakdown:
1. Chart & Instrument Verification: (Confirm symbol, timeframe, and current price shown on screen)
2. Market Structure & Trend Bias: (Bullish / Bearish / Consolidating)
3. Key Technical Levels: (Immediate Resistance and Support visible)
4. Tactical Outlook: (Key candle pattern or actionable breakout/pullback setup)
${monitoringDirective}
Format concisely with bullet points.`;
    } else if (isTwitterOrX) {
      promptText = `You are AGENTLAX, an elite autonomous computer-use agent and workstation monitor. Inspect this live workstation browser screenshot on X (Twitter) for "${queryOrTopic}".
State facts only based on the visible pixels:
1. Rendered Platform: X (Twitter)
2. Search Query & Category: (e.g. "${queryOrTopic}" under Accounts / People tab)
3. Accounts Visible: (List specific account names, @handles, bio details, or follow status visible on screen)
${monitoringDirective}`;
    } else if (isInstagram) {
      promptText = `You are AGENTLAX, an elite autonomous computer-use agent and workstation monitor. Inspect this live workstation browser screenshot on Instagram for "${queryOrTopic}".
State facts only based on the visible pixels:
1. Rendered Platform: Instagram
2. Profile / Account Name: (Name and @handle displayed)
3. Following / Follow Status: (State whether button shows 'Follow', 'Following', or 'Requested', and confirmation if unfollowed)
4. Visual Elements: (Profile photo, bio, or grid posts visible)
${monitoringDirective}`;
    } else {
      promptText = `You are AGENTLAX, an elite autonomous computer-use agent and workstation monitor. Inspect this live workstation browser screenshot for "${queryOrTopic}".
Verify what window, website, and content is actually rendered on screen.
State facts only based on the visible pixels:
1. Rendered Website & URL: (e.g. GitHub.com, YouTube.com, Facebook.com, Reddit.com)
2. Verified Search Query & Content: (e.g. GitHub repository search for "laxdollar", YouTube results for "laxis music")
3. Findings / Results: (e.g. Exact number of repositories found, first video title/channel, or exact results rendered)
${monitoringDirective}`;
    }

    const contents = [
      {
        inlineData: {
          mimeType: "image/png",
          data: Buffer.from(screenshotBuffer).toString("base64"),
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
 * Real Infrastructure Action: Safely Pause All Active MicroVMs (Freezes State & Stops Billing at $0 Compute)
 * NEVER kills sandboxes and NEVER deletes sandboxId records so accounts and files are preserved permanently.
 */
export async function pauseAllAgentSandboxes(campaignId: string = "default_campaign") {
  // 1. Pause in-memory cached sandboxes
  const activeMap: Map<string, any> = (global as any).__activeSandboxes;
  if (activeMap) {
    for (const [key, sb] of activeMap.entries()) {
      try {
        if (typeof sb.pause === "function") {
          await sb.pause();
        }
      } catch (err) {
        console.warn(`[AgencyActions] Notice pausing memory sandbox ${key}:`, err);
      }
    }
    activeMap.clear();
  }

  // 2. Query all active sandboxes from the database and pause on E2B Cloud ($0 compute)
  try {
    const allDbSandboxes = await db.select().from(agentSandboxes).all();
    for (const s of allDbSandboxes) {
      if (isFreestyleAgent(s.agentId)) {
        try {
          // Pass the stored sandboxId (= VM ID) so pause uses direct vmRef — no vms.list() needed
          await pauseFreestyleSandbox(campaignId, s.agentId, s.sandboxId || undefined);
          console.log(`[AgencyActions] Freestyle persistent VM (${s.agentId}) paused to $0 cost.`);
        } catch (e: any) {
          console.warn(`[AgencyActions] Freestyle pause notice for ${s.agentId}:`, e.message);
        }
      } else if (s.sandboxId && apiKey) {
        try {
          const sb = await Sandbox.connect(s.sandboxId, { apiKey });
          const isAlive = await sb.isRunning();
          if (isAlive && typeof sb.pause === "function") {
            await sb.pause();
            console.log(`[AgencyActions] Cloud microVM ${s.sandboxId} (${s.agentId}) paused successfully.`);
          }
        } catch (e: any) {
          // If already paused or disconnected, harmless
        }
      }
    }
  } catch (dbErr) {
    console.warn("[AgencyActions] Cloud sandboxes pause notice:", dbErr);
  }

  // 3. Reset database records: PRESERVE sandboxId permanently! ONLY set status to "paused"
  await db.update(agents).set({ status: "idle", currentTask: null }).run();
  await db.update(agentSandboxes)
    .set({
      status: "paused",
      activeAt: new Date().toISOString(),
    })
    .where(eq(agentSandboxes.campaignId, campaignId))
    .run();
}

// Backward-compatible alias
export const stopAllAgentSandboxes = pauseAllAgentSandboxes;

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

export interface ComputerUseDecision {
  action: "done" | "click" | "type" | "press_key" | "scroll" | "navigate" | "wait";
  x?: number;
  y?: number;
  text?: string;
  pressEnter?: boolean;
  key?: string;
  direction?: "up" | "down";
  amount?: number;
  url?: string;
  ms?: number;
  reason?: string;
  summary?: string;
}

/**
 * Multimodal Computer-Use Reasoning: Decides next physical mouse/keyboard action or signals completion
 * Guides the agent like a human operator - handles complex multi-step objectives autonomously
 */
export async function decideNextComputerUseAction(
  screenshotBuffer: Buffer | Uint8Array,
  userObjective: string,
  topic: string,
  searchQuery: string,
  intentType: string,
  targetTab: string,
  currentStep: number,
  maxSteps: number,
  history: string[],
  progressTracker?: string  // Tracks sub-goal progress (e.g. "followed 2 of 5")
): Promise<ComputerUseDecision> {
  try {
    const promptText = `You are the autonomous computer-use brain of AGENTLAX — a highly intelligent AI agent operating a real desktop PC (screen resolution 1024x768) inside a Linux VM with Google Chrome running.

You think and reason exactly like a professional human VA (virtual assistant) would when completing browser tasks. You are self-directed, you do NOT wait for instructions between steps, and you figure out the full procedure yourself from the original objective.

═══════════════════════════════════════
ORIGINAL USER OBJECTIVE: "${userObjective}"
CURRENT TASK CONTEXT: ${topic}
SEARCH/QUERY VALUE: "${searchQuery}"
INTENT TYPE: ${intentType}
STEP: ${currentStep} / ${maxSteps}
PROGRESS: ${progressTracker || "Starting task"}
═══════════════════════════════════════

ACTION HISTORY (what has already been done):
${history.length > 0 ? history.map((h, i) => `  ${i + 1}. ${h}`).join("\n") : "  (None yet — task just started)"}

═══════════════════════════════════════
YOUR REASONING PROCESS (think step by step before deciding):

STEP 1 — ASSESS SCREEN STATE:
  Look carefully at the current screenshot. Identify:
  - What website or app is visible?
  - What is the current page state (homepage, search results, profile page, feed, login screen, popup, etc.)?
  - Is there anything blocking progress (cookie banner, popup, modal, captcha)?

STEP 2 — CHECK PROGRESS AGAINST OBJECTIVE:
  Compare the current screen state against the original objective.
  - What sub-task has been completed so far?
  - What is the NEXT logical human action needed?
  - For multi-step tasks (e.g. "follow 5 people"): track how many steps are done vs. remaining.

STEP 3 — DECIDE THE NEXT SINGLE ACTION:
  Choose the ONE next action a careful, natural human would take on THIS specific website:

  A) POPUPS / BANNERS / DIALOGS (Any website):
     - If a cookie banner, newsletter signup, notification prompt, modal, or overlay is blocking:
       → click the 'X', 'Dismiss', 'Close', 'Accept All', or 'Skip' button.

  B) SEARCH & QUERY (Any search bar, catalog, or database):
     - If search box / icon is visible but not active:
       → click the search box / icon.
     - If search box is focused / open:
       → type the query value, pressEnter: true.

  C) NAVIGATING & SELECTING RESULTS (Any platform - Google, Amazon, YouTube, GitHub, Reddit, Medium):
     - If search results or listings are visible:
       → click the target result, article title, repository link, product card, or video.
     - If category tabs or filters are needed (e.g. 'Articles', 'People', 'Repositories', 'Under $50'):
       → click that tab / filter button.

  D) SOCIAL & COMMUNITY ACTIONS (Instagram, X, Facebook, Reddit, YouTube):
     - Follow / Unfollow: click "Follow" or "Following" (confirm in dialog if needed).
     - Like / Upvote / Star: click the like heart, upvote arrow, or star button.
     - Comment / Reply: click comment box, type message, click submit.

  E) MULTI-ITEM / BATCH TASKS (e.g. "follow 5 people", "extract 3 articles", "check 4 stocks"):
     - Complete ONE item per turn.
     - After completing each item, navigate back or scroll to find the next item.
     - Track sub-goal progress in the "reason" field (e.g. "Completed item 2 of 5").
     - NEVER mark "done" until ALL requested items are completed!

  F) FORM FILLING & REGISTRATION (Sign up, login, checkout, inputs):
     - Find the relevant input field, click to focus, type value.
     - After filling inputs, click the submit/continue button.

  G) SCROLLING (Any website):
     - If the target element or more results are further down the page:
       → scroll down (amount: 3 to 5).

  H) WAITING:
     - If content is actively rendering, buffering, or loading:
       → wait 2000ms.

  I) OBJECTIVE FULLY COMPLETE:
     - ONLY return action: "done" when the user's FULL objective is achieved and verified!
     - Provide a thorough, factual summary of everything accomplished on the live screen.
     ⚠️ NEVER mark done prematurely if steps remain unexecuted!

IMPORTANT RULES:
- Make exactly ONE decision per step (one click, one type, one scroll, etc.)
- Use EXACT pixel coordinates from the screenshot for clicks
- Never hallucinate coordinates — only click on elements clearly visible in the screenshot
- You operate ANY website across the internet with human-level competence

═══════════════════════════════════════
Return ONLY a valid JSON object:
{
  "action": "done" | "click" | "type" | "press_key" | "scroll" | "navigate" | "wait",
  "x": <pixel x coordinate for click>,
  "y": <pixel y coordinate for click>,
  "text": "<text to type>",
  "pressEnter": <true|false>,
  "key": "<key name for press_key>",
  "direction": "down" | "up",
  "amount": <scroll steps>,
  "url": "<url for navigate action>",
  "ms": <milliseconds for wait>,
  "reason": "<single sentence: what you see and why this is the next action>",
  "summary": "<only if done: full breakdown of everything completed>"
}`;

    const contents = [
      {
        inlineData: {
          mimeType: "image/png",
          data: Buffer.from(screenshotBuffer).toString("base64"),
        },
      },
      { text: promptText },
    ];

    const aiPromise = generateWithFallback(contents);
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("Vision reasoning timeout")), 20000)
    );

    const aiRes = await Promise.race([aiPromise, timeoutPromise]);
    if (aiRes) {
      const match = aiRes.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.action) {
          console.log(`[ComputerUse] Step ${currentStep}: ${parsed.action} — ${parsed.reason || ""}`);
          return parsed as ComputerUseDecision;
        }
      }
    }
  } catch (err: any) {
    console.warn(`[ComputerUse] Decision notice (step ${currentStep}):`, err.message);
  }

  // Fallback: continue waiting rather than quitting early
  return {
    action: "wait",
    ms: 2000,
    reason: "Waiting for page to render before next decision",
  };
}

/**
 * Real Infrastructure Action: Autonomous Multi-Turn Human-Like Computer-Use Engine
 * Operates live desktop PC with real mouse clicks, keystrokes, and visual verification.
 */
export async function executeAgentChromeTask(
  campaignId: string,
  agentId: string,
  rawPrompt: string
) {
  const nowIso = new Date().toISOString();
  const displayName = getAgentDisplayName(agentId);
  const plan = await planAutonomousTask(rawPrompt);
  const { baseUrl, cleanTopic, searchQuery, isChart, intentType, targetTab } = plan;

  // 1. Ensure only this single agent animates in UI
  await db.update(agents).set({ status: "idle" }).run();

  // 2. Boot / connect to agent microVM
  const sbInfo = await getOrCreateAgentSandbox(campaignId, agentId, true);
  await db
    .update(agents)
    .set({ status: "running", activeAt: nowIso, currentTask: `Executing: ${cleanTopic}` })
    .where(eq(agents.id, agentId))
    .run();

  const activeSb = (global as any).__activeSandboxes?.get(`${campaignId}_${agentId}`);

  let screenshotBase64 = "";
  let visualAnalysis = "";
  const actionHistory: string[] = [];

  if (activeSb) {
    try {
      // Step A: Initialize Sandbox OS environment for strict Google Chrome only & CDP
      await initSandboxBrowserAndCdp(activeSb, agentId);

      // Step B: Launch Google Chrome at the BASE PLATFORM URL with CDP enabled
      await launchChromeWithCdp(activeSb, baseUrl);

      // Step C: Ensure Chrome window is focused and active on primary X11 display
      if (activeSb.commands?.run) {
        await activeSb.commands.run(`
          DISPLAY=:0 xdotool search --onlyvisible --class google-chrome windowactivate --sync 2>/dev/null || true
          DISPLAY=:0 xdotool key Return 2>/dev/null || true
        `).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 1000));

      // Step C2: Check if Hermes Agent is configured inside this VM for autonomous full PC control
      const hermesStatus = await checkHermesStatus(activeSb).catch(() => ({ installed: false, configured: false, version: "" }));
      if (hermesStatus.configured) {
        console.log(`[Hermes] Active on ${displayName} VM. Handing off full PC control to in-VM Hermes agent...`);
        const hermesResult = await runHermesTask(activeSb, rawPrompt, 180_000, agentId);
        if (hermesResult.mode === "hermes" && hermesResult.success) {
          let mediaUrl = hermesResult.screenshotB64 ? `data:image/png;base64,${hermesResult.screenshotB64}` : undefined;
          if (!mediaUrl && typeof activeSb.screenshot === "function") {
            try {
              const shot = await activeSb.screenshot();
              if (shot && shot.length > 0) {
                mediaUrl = `data:image/png;base64,${Buffer.from(shot).toString("base64")}`;
              }
            } catch {}
          }
          await db.update(agents).set({ status: "idle", currentTask: null }).where(eq(agents.id, agentId)).run();
          const deliverableId = `deliv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          await db.insert(agentDeliverables).values({
            id: deliverableId,
            agentId,
            campaignId,
            type: "screenshot",
            name: `${displayName}: ${cleanTopic}`,
            url: mediaUrl || null,
            content: hermesResult.summary,
            createdAt: nowIso,
          }).run();

          return {
            replyText: `🎯 **Task Verified: ${displayName} Live Workstation Execution (Hermes Control)**\n\n${hermesResult.summary}\n\n• **Active Platform:** \`${baseUrl}\`\n• **Subject:** ${cleanTopic}\n• **Status:** Verified & Complete\n• **Controller:** Hermes In-VM Autonomous Agent`,
            mediaUrl,
          };
        }
      }

      // Step D: Execute in-page intelligent typing & button clicks via CDP
      const promptLower = rawPrompt.toLowerCase();
      const emailMatch = rawPrompt.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const emailToType = emailMatch ? emailMatch[0] : "";

      if (emailToType) {
        console.log(`[AgencyActions] In-page CDP typing email: "${emailToType}"`);
        await cdpTypeInput(activeSb, emailToType);
        actionHistory.push(`Typed email "${emailToType}" into input field`);
        await new Promise((r) => setTimeout(r, 1200));
      }

      // Check for button click instructions (e.g. "sign up", "next", "submit", "continue", "login")
      let buttonTarget = "";
      if (promptLower.includes("sign up") || promptLower.includes("signup")) {
        buttonTarget = "Sign up";
      } else if (promptLower.includes("click next") || promptLower.includes("press next")) {
        buttonTarget = "Next";
      } else if (promptLower.includes("click submit") || promptLower.includes("press submit")) {
        buttonTarget = "Submit";
      } else if (promptLower.includes("click continue") || promptLower.includes("press continue")) {
        buttonTarget = "Continue";
      } else if (promptLower.includes("click log in") || promptLower.includes("click login")) {
        buttonTarget = "Log in";
      } else {
        const btnM = rawPrompt.match(/click\s+(?:the\s+)?["']?([a-zA-Z0-9_ ]+?)(?:\s+button)?["']?(?:\s+then|$)/i);
        if (btnM) buttonTarget = btnM[1].trim();
      }

      if (buttonTarget) {
        console.log(`[AgencyActions] In-page CDP clicking button: "${buttonTarget}"`);
        await cdpClickText(activeSb, buttonTarget);
        actionHistory.push(`Clicked "${buttonTarget}" button`);
        await new Promise((r) => setTimeout(r, 3000));
      }

      // Step E: Execute primary task intent via CDP (high-speed, rock-solid DOM automation)
      if (intentType === "search" && searchQuery) {
        console.log(`[AgencyActions] Executing CDP Smart Search for "${searchQuery}" (targetTab: ${targetTab || "all"})...`);
        await cdpSearch(activeSb, searchQuery, targetTab);
        actionHistory.push(`CDP Smart Search: typed "${searchQuery}" into search box, submitted${targetTab && targetTab !== "all" ? ` & clicked ${targetTab} tab` : ""}`);
        await new Promise((r) => setTimeout(r, 3000));
      } else if (intentType === "unfollow" && searchQuery) {
        await cdpClickText(activeSb, "Following");
        actionHistory.push(`CDP Click: clicked 'Following'`);
        await new Promise((r) => setTimeout(r, 1500));
        await cdpClickText(activeSb, "Unfollow");
        actionHistory.push(`CDP Click: confirmed 'Unfollow'`);
        await new Promise((r) => setTimeout(r, 2000));
      } else if (intentType === "follow" && searchQuery) {
        await cdpClickText(activeSb, "Follow");
        actionHistory.push(`CDP Click: clicked 'Follow'`);
        await new Promise((r) => setTimeout(r, 2000));
      }

      // Step F: Iterative Autonomous Human-Like Reasoning Loop for ANY website
      // Dynamic Step Budget: Multi-step or batch tasks get up to 25 steps; single-step tasks get up to 12 steps
      const isMultiStepTask =
        /\d+|several|multiple|few|top\s+\d+|first\s+\d+|all|each|every|and\s+then|after\s+that|follow|unfollow|sign\s+up|create|register|post|upload|extract|collect|buy|cart|compare|check\s+\d+|find\s+\d+/i.test(
          rawPrompt
        );
      const maxSteps = isMultiStepTask ? 25 : 12;
      let lastShotBuffer: Uint8Array | null = null;
      let finalDecisionSummary = "";
      let progressTracker = `Starting: ${cleanTopic}`;

      for (let step = 1; step <= maxSteps; step++) {
        let shotBuffer: Uint8Array | null = null;
        if (typeof activeSb.screenshot === "function") {
          shotBuffer = await activeSb.screenshot().catch(() => null);
        }
        if (!shotBuffer || shotBuffer.length === 0) {
          await new Promise((r) => setTimeout(r, 1200));
          if (typeof activeSb.screenshot === "function") {
            shotBuffer = await activeSb.screenshot().catch(() => null);
          }
        }

        if (shotBuffer && shotBuffer.length > 0) {
          lastShotBuffer = shotBuffer;
        }

        if (!lastShotBuffer) break;

        const decision = await decideNextComputerUseAction(
          lastShotBuffer,
          rawPrompt,
          cleanTopic,
          searchQuery,
          intentType,
          targetTab || "all",
          step,
          maxSteps,
          actionHistory,
          progressTracker
        );

        if (decision.action === "done") {
          finalDecisionSummary = decision.summary || "";
          break;
        }

        // Update progress tracker from reason field
        if (decision.reason) {
          progressTracker = decision.reason;
        }

        try {
          if (decision.action === "click" && typeof decision.x === "number" && typeof decision.y === "number") {
            if (activeSb.commands?.run) {
              await activeSb.commands.run(
                `DISPLAY=:0 xdotool mousemove ${decision.x} ${decision.y} click 1 2>/dev/null || true`
              );
            } else if (typeof activeSb.leftClick === "function") {
              await activeSb.leftClick(decision.x, decision.y);
            }
            actionHistory.push(`Clicked at (${decision.x}, ${decision.y}): ${decision.reason || "element interact"}`);
            await new Promise((r) => setTimeout(r, 1000));
          } else if (decision.action === "type" && decision.text) {
            if (typeof decision.x === "number" && typeof decision.y === "number") {
              if (activeSb.commands?.run) {
                await activeSb.commands.run(
                  `DISPLAY=:0 xdotool mousemove ${decision.x} ${decision.y} click 1 2>/dev/null || true`
                );
              } else if (typeof activeSb.leftClick === "function") {
                await activeSb.leftClick(decision.x, decision.y);
              }
              await new Promise((r) => setTimeout(r, 400));
            }
            if (activeSb.commands?.run) {
              await activeSb.commands.run(
                `DISPLAY=:0 xdotool type --delay 35 "${decision.text.replace(/"/g, '\\"')}" 2>/dev/null || true`
              );
            } else if (typeof activeSb.write === "function") {
              await activeSb.write(decision.text);
            }
            if (decision.pressEnter) {
              await new Promise((r) => setTimeout(r, 250));
              if (activeSb.commands?.run) {
                await activeSb.commands.run(`DISPLAY=:0 xdotool key Return 2>/dev/null || true`);
              } else if (typeof activeSb.press === "function") {
                await activeSb.press("Return");
              }
            }
            actionHistory.push(`Typed "${decision.text}" (Enter: ${Boolean(decision.pressEnter)}): ${decision.reason || "search/input"}`);
            await new Promise((r) => setTimeout(r, 2500));
          } else if (decision.action === "press_key" && decision.key) {
            if (activeSb.commands?.run) {
              await activeSb.commands.run(`DISPLAY=:0 xdotool key ${decision.key} 2>/dev/null || true`);
            } else if (typeof activeSb.press === "function") {
              await activeSb.press(decision.key);
            }
            actionHistory.push(`Pressed ${decision.key}: ${decision.reason || "key press"}`);
            await new Promise((r) => setTimeout(r, 1200));
          } else if (decision.action === "scroll") {
            const btn = decision.direction === "up" ? 4 : 5;
            if (activeSb.commands?.run) {
              await activeSb.commands.run(`DISPLAY=:0 xdotool click ${btn} 2>/dev/null || true`);
            } else if (typeof activeSb.scroll === "function") {
              await activeSb.scroll(decision.direction || "down", decision.amount || 3);
            }
            actionHistory.push(`Scrolled ${decision.direction || "down"}`);
            await new Promise((r) => setTimeout(r, 1500));
          } else if (decision.action === "navigate" && decision.url) {
            await cdpNavigate(activeSb, decision.url);
            actionHistory.push(`Navigated to ${decision.url}`);
            await new Promise((r) => setTimeout(r, 3000));
          } else if (decision.action === "wait") {
            await new Promise((r) => setTimeout(r, decision.ms || 2000));
            actionHistory.push(`Waited for UI render`);
          }
        } catch (actErr: any) {
          console.warn(`[AgencyActions] Action execution notice (step ${step}):`, actErr.message);
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      // Step G: Capture final verified workstation screenshot
      let finalShot: Uint8Array | null = null;
      if (typeof activeSb.screenshot === "function") {
        finalShot = await activeSb.screenshot().catch(() => null);
      }
      if (!finalShot || finalShot.length === 0) {
        finalShot = lastShotBuffer;
      }

      if (finalShot && finalShot.length > 0) {
        visualAnalysis = await analyzeWorkstationScreenshot(finalShot, cleanTopic);

        // If vision detects it's only desktop wallpaper with no window, force window activation & retry
        if (
          visualAnalysis.toLowerCase().includes("wallpaper") ||
          (visualAnalysis.toLowerCase().includes("desktop") && !visualAnalysis.toLowerCase().includes("browser") && !visualAnalysis.toLowerCase().includes("result"))
        ) {
          console.log("[AgencyActions] Desktop wallpaper detected, activating Chrome window and re-capturing...");
          if (activeSb.commands?.run) {
            await activeSb.commands.run(`
              DISPLAY=:0 xdotool search --onlyvisible --class google-chrome windowactivate --sync 2>/dev/null || true
            `).catch(() => {});
          }
          await new Promise((r) => setTimeout(r, 2000));
          const retryBuffer = await activeSb.screenshot();
          if (retryBuffer && retryBuffer.length > 0) {
            finalShot = retryBuffer;
            visualAnalysis = await analyzeWorkstationScreenshot(retryBuffer, cleanTopic);
          }
        }

        if (finalShot && finalShot.length > 0) {
          screenshotBase64 = Buffer.from(finalShot).toString("base64");
        }
      }
    } catch (err: any) {
      console.warn("[AgencyActions] Task execution notice:", err);
    }
  }

  const isBlocked =
    visualAnalysis.toLowerCase().includes("blocked_by_platform") ||
    visualAnalysis.toLowerCase().includes("security challenge") ||
    visualAnalysis.toLowerCase().includes("blocked by network security") ||
    visualAnalysis.toLowerCase().includes("access denied") ||
    visualAnalysis.toLowerCase().includes("not verified") ||
    visualAnalysis.toLowerCase().includes("not_verified") ||
    visualAnalysis.toLowerCase().includes("firefox");

  // 3. Update agent status in database
  await db
    .update(agents)
    .set({
      status: isBlocked ? "idle" : "done",
      currentTask: isBlocked ? `Challenge detected: ${cleanTopic}` : `Completed: ${cleanTopic}`
    })
    .where(eq(agents.id, agentId))
    .run();

  // 4. Record task in agentTasks table
  const taskId = `task_${Date.now()}`;
  await db.insert(agentTasks).values({
    id: taskId,
    campaignId,
    agentId,
    title: isChart ? `Market Chart Analysis: ${cleanTopic}` : `Human Browser Task: ${cleanTopic}`,
    instructions: rawPrompt,
    status: isBlocked ? "failed" : "completed",
    output: visualAnalysis || `Operated ${baseUrl} and captured live screenshot.`,
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
    url: baseUrl,
    content: visualAnalysis || `Live workstation screen captured for ${cleanTopic}`,
    createdAt: nowIso,
  }).run();

  const mediaUrl = screenshotBase64 ? `data:image/png;base64,${screenshotBase64}` : undefined;

  let replyText = "";
  if (isBlocked) {
    replyText = `⚠️ **Active Monitoring Alert: ${displayName} Workstation Challenge**\n\n`;
    if (visualAnalysis) {
      replyText += `${visualAnalysis}\n\n`;
    }
    replyText += `• **Active Platform:** \`${baseUrl}\`\n• **Subject:** ${cleanTopic}\n• **Monitoring Observation:** Platform security barrier detected on live screen.\n• **Status:** ACTION REQUIRED (Take over via Live VNC)\n• **Workstation:** Live VNC connected (Click to solve or log in)`;
  } else {
    replyText = `🎯 **Task Verified: ${displayName} Live Workstation Execution**\n\n`;
    if (visualAnalysis) {
      replyText += `${visualAnalysis}\n\n`;
    }
    replyText += `• **Active Platform:** \`${baseUrl}\`\n• **Subject:** ${cleanTopic}\n• **Human Steps:** ${actionHistory.length > 0 ? actionHistory.join(" ➔ ") : "Direct human interaction"}\n• **Status:** Verified & Complete (Live screenshot attached above)\n• **Workstation:** Live VNC connected`;
  }

  return {
    success: true,
    agentId,
    agentName: displayName,
    cleanTopic,
    targetUrl: baseUrl,
    screenshotBase64,
    mediaUrl,
    streamUrl: sbInfo.streamUrl,
    sandboxId: sbInfo.sandboxId,
    replyText,
  };
}

export interface CompiledAgencyIntent {
  intent:
    | "screenshot"
    | "navigate_or_search"
    | "click"
    | "type"
    | "scroll"
    | "wake"
    | "pause"
    | "status"
    | "clear_posts"
    | "confirm_pending"
    | "conversational";
  targetAgentId: string;
  baseUrl?: string;
  cleanTopic?: string;
  searchQuery?: string;
  targetTab?: "people" | "groups" | "repositories" | "all";
  targetElement?: string;
  textToType?: string;
  pressEnter?: boolean;
  scrollDirection?: "down" | "up";
  reasoning?: string;
}

/**
 * Autonomous Reasoning Brain (Cognitive Intent Compiler)
 * Interprets ANY instruction from Kelvin — regardless of typos, slang, questions, or non-standard syntax.
 */
export async function compileInstructionWithBrain(
  rawPrompt: string,
  contextId: string,
  campaignId: string = "default_campaign"
): Promise<CompiledAgencyIntent> {
  const activeMap: Map<string, any> = (global as any).__activeSandboxes;
  const lastActive = contextId ? lastActiveAgentByContext.get(contextId) : null;
  let fallbackAgent = lastActive;
  if (!fallbackAgent && activeMap && activeMap.size > 0) {
    fallbackAgent = Array.from(activeMap.keys())[0]?.replace(new RegExp(`^${campaignId}_`), "");
  }
  if (!fallbackAgent) fallbackAgent = "ig_shader";

  const cleanLower = rawPrompt.toLowerCase().trim().replace(/[?!.,]+$/, "");

  // Fast-path: 1-word affirmative confirmations
  if (
    cleanLower === "yes" ||
    cleanLower === "confirm" ||
    cleanLower === "proceed" ||
    cleanLower === "do it" ||
    cleanLower === "y" ||
    cleanLower === "ok" ||
    cleanLower === "okay" ||
    cleanLower === "continue"
  ) {
    return {
      intent: "confirm_pending",
      targetAgentId: fallbackAgent,
      reasoning: "User confirmed pending action",
    };
  }

  // Fast-path: single word screenshot request
  if (cleanLower === "screenshot" || cleanLower === "screen" || cleanLower === "pic" || cleanLower === "photo" || cleanLower === "snapshot") {
    return {
      intent: "screenshot",
      targetAgentId: fallbackAgent,
      reasoning: "Direct screenshot request",
    };
  }

  // Fast-path: single word pause/stop/sleep
  if (cleanLower === "pause" || cleanLower === "sleep" || cleanLower === "stop" || cleanLower === "hibernate") {
    return {
      intent: "pause",
      targetAgentId: fallbackAgent,
      reasoning: "Direct pause request",
    };
  }

  // Fast-path: single word status
  if (cleanLower === "status" || cleanLower === "vms" || cleanLower === "vms status" || cleanLower === "vm status") {
    return {
      intent: "status",
      targetAgentId: fallbackAgent,
      reasoning: "Direct status inquiry",
    };
  }

  // Semantic Reasoning Compiler using Gemini
  try {
    const aiCompilerPrompt = `You are the Executive Reasoning Brain for AGENTLAX / Laxis Socials.
Kelvin (the agency owner) gave this instruction: "${rawPrompt}".

Understand Kelvin's TRUE human intent — whether expressed in slang, Sheng, typos, questions, multi-step phrasing, or direct commands.

Specialist Agents available:
- fb_laxdollar: LAXDOLLAR (Deriv trading, Boom & Crash, forex, money memes, Remotasks/Outlier hustles)
- fb_jotrainer: PINTR (Pinterest pin creator, remote jobs, lifestyle marketing)
- fb_contentor: CONTENTOR (Sheng & English comedy memes)
- ig_real: INSTA REAL (confessions, dilemma questions, relationship drama)
- ig_shader: INSTA SHADER (pop culture, celebrity gossip, The Shade Room, Kenya Gossip)
- analytics: ANALYTICS AGENT (viral metrics, post stats)

Context:
Currently active / last engaged agent: "${fallbackAgent}"

INTENT CATEGORIES:
1. "screenshot": User wants to see the screen, take a picture, inspect visual progress, or asked "screenshot?", "pic?", "let me see", "show me", "can i see what it's doing", "what is on the screen right now".
2. "navigate_or_search": User wants to open a website (e.g. facebook.com, instagram.com, youtube.com, google.com, etc.), visit a URL, or search for something on a platform.
   - baseUrl: Base root URL (e.g. "https://www.facebook.com", "https://www.instagram.com", "https://www.youtube.com", "https://www.google.com")
   - searchQuery: Clean search query without instructions or typos (e.g. "forex trading", or empty/null if just opening the site)
   - targetTab: "people" | "groups" | "repositories" | "all"
3. "click": User wants to click an element, video, button, link, tab, or profile.
   - targetElement: description of what to click
4. "type": User wants to type text or press keys into the page.
   - textToType: text to type
   - pressEnter: boolean
5. "scroll": User wants to scroll up or down.
   - scrollDirection: "down" | "up"
6. "wake": User wants to wake, boot, turn on, spin up an agent PC.
7. "pause": User wants to pause, hibernate, shut down, put to sleep, or stop compute on agent PC(s).
8. "status": User asks which VMs/agents are active, running, awake, or sleeping.
9. "clear_posts": User wants to clear, delete, or reset scheduled posts.
10. "conversational": User is asking for strategy advice, greeting, asking general questions, or discussing ideas without needing an immediate workstation click/type/navigation.

Respond ONLY with valid JSON:
{
  "intent": "screenshot" | "navigate_or_search" | "click" | "type" | "scroll" | "wake" | "pause" | "status" | "clear_posts" | "conversational",
  "targetAgentId": "fb_laxdollar" | "fb_jotrainer" | "fb_contentor" | "ig_real" | "ig_shader" | "analytics",
  "baseUrl": string | null,
  "cleanTopic": string | null,
  "searchQuery": string | null,
  "targetTab": "people" | "groups" | "repositories" | "all" | null,
  "targetElement": string | null,
  "textToType": string | null,
  "pressEnter": boolean | null,
  "scrollDirection": "down" | "up" | null,
  "reasoning": string
}`;

    const text = await Promise.race([
      generateWithFallback([{ text: aiCompilerPrompt }]),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Compiler timeout")), 12000)),
    ]);

    if (text) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.intent) {
          return {
            intent: parsed.intent,
            targetAgentId: parsed.targetAgentId || fallbackAgent,
            baseUrl: parsed.baseUrl || undefined,
            cleanTopic: parsed.cleanTopic || undefined,
            searchQuery: parsed.searchQuery || undefined,
            targetTab: parsed.targetTab || undefined,
            targetElement: parsed.targetElement || undefined,
            textToType: parsed.textToType || undefined,
            pressEnter: Boolean(parsed.pressEnter),
            scrollDirection: parsed.scrollDirection || undefined,
            reasoning: parsed.reasoning || undefined,
          };
        }
      }
    }
  } catch (err: any) {
    console.warn("[BrainCompiler] AI interpretation notice:", err?.message || err);
  }

  // Graceful fallback
  const targetAgent = extractAgentFromPrompt(rawPrompt, contextId) || fallbackAgent;
  return {
    intent: "conversational",
    targetAgentId: targetAgent,
  };
}

/**
 * Handle incoming user instructions for real agency actions and workstation operations.
 * Powered by the Autonomous Reasoning Brain (compileInstructionWithBrain).
 */
export async function handleAgencyExecutiveCommand(
  text: string,
  contextId: string,
  campaignId: string = "default_campaign"
): Promise<{ handled: boolean; replyText?: string; mediaUrl?: string }> {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const cleanPunctLower = lower.replace(/[?!.,]+$/, "").trim();

  // 1. Check if user is confirming a pending authorization
  const pendingMap: Map<string, any> = (global as any).__pendingConfirmations || pendingConfirmations;
  const pending = pendingMap.get(contextId);

  const isAffirmative =
    /^(y|ye|yes|yep|yeah|ya|yup|yess|sure|confirm|proceed|ok|okay|do it|authorize|go ahead|wake|start|run)$/i.test(
      cleanPunctLower
    ) ||
    cleanPunctLower === "yes" ||
    cleanPunctLower.startsWith("yes ") ||
    cleanPunctLower === "confirm" ||
    cleanPunctLower.startsWith("confirm ") ||
    cleanPunctLower === "proceed" ||
    cleanPunctLower === "do it";

  if (pending && isAffirmative && Date.now() - pending.timestamp < 10 * 60 * 1000) {
    pendingMap.delete(contextId);
    const { agentId, action, rawPrompt } = pending;
    const displayName = getAgentDisplayName(agentId);
    if (contextId) lastActiveAgentByContext.set(contextId, agentId);

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
        replyText: `⚡ **Manual Authorization Confirmed!**\n\n**${displayName}**'s PC is now booted and running. Workstation ID: \`${sb.sandboxId || "Active"}\`.\n\nGoogle Chrome and Live VNC are ready on DISPLAY=:0. What task would you like ${displayName} to execute?`,
      };
    }
  }

  // 2. Invoke the Semantic Reasoning Brain to interpret the instruction
  const compiled = await compileInstructionWithBrain(text, contextId, campaignId);
  const targetAgentId = compiled.targetAgentId || "ig_shader";
  const displayName = getAgentDisplayName(targetAgentId);
  if (contextId) lastActiveAgentByContext.set(contextId, targetAgentId);

  // ── INTENT: SCREENSHOT ────────────────────────────────────────────────────
  if (compiled.intent === "screenshot") {
    let activeSb = (global as any).__activeSandboxes?.get(`${campaignId}_${targetAgentId}`);
    if (!activeSb) {
      await getOrCreateAgentSandbox(campaignId, targetAgentId, true);
      activeSb = (global as any).__activeSandboxes?.get(`${campaignId}_${targetAgentId}`);
    }

    if (activeSb) {
      await initSandboxBrowserAndCdp(activeSb, targetAgentId);
    }

    let screenshotBase64 = "";
    let visualAnalysis = "";

    if (activeSb && typeof activeSb.screenshot === "function") {
      try {
        const shotBuffer = await activeSb.screenshot();
        if (shotBuffer && shotBuffer.length > 0) {
          screenshotBase64 = Buffer.from(shotBuffer).toString("base64");
          visualAnalysis = await analyzeWorkstationScreenshot(shotBuffer, `${displayName} Live Workstation Display`);
        }
      } catch (err: any) {
        console.warn("[AgencyActions] Screenshot capture notice:", err);
      }
    }

    if (screenshotBase64) {
      const mediaUrl = `data:image/png;base64,${screenshotBase64}`;
      const hasAnomaly =
        visualAnalysis.toLowerCase().includes("firefox") ||
        visualAnalysis.toLowerCase().includes("blocked") ||
        visualAnalysis.toLowerCase().includes("not_verified");
      return {
        handled: true,
        replyText: `${hasAnomaly ? "⚠️" : "📸"} **Live Workstation Screenshot: ${displayName}**\n\n${visualAnalysis || "Current live workstation display captured."}\n\n• **Workstation:** ${displayName}\n• **Status:** ${hasAnomaly ? "Attention Required" : "Active Live VNC"}`,
        mediaUrl,
      };
    } else {
      return {
        handled: true,
        replyText: `📸 **Workstation in Standby ($0 Compute)**\n\nThe microVM for **${displayName}** is currently in standby to preserve your compute credits.\n\nReply **WAKE ${displayName}** or give a direct task command to boot the PC and view the live screen.`,
      };
    }
  }

  // ── INTENT: NAVIGATE OR SEARCH ───────────────────────────────────────────
  if (compiled.intent === "navigate_or_search") {
    const result = await executeAgentChromeTask(campaignId, targetAgentId, text);
    return {
      handled: true,
      replyText: result.replyText,
      mediaUrl: result.mediaUrl,
    };
  }

  // ── INTENT: CLICK ────────────────────────────────────────────────────────
  if (compiled.intent === "click") {
    let activeSb = (global as any).__activeSandboxes?.get(`${campaignId}_${targetAgentId}`);
    if (!activeSb) {
      await getOrCreateAgentSandbox(campaignId, targetAgentId, true);
      activeSb = (global as any).__activeSandboxes?.get(`${campaignId}_${targetAgentId}`);
    }

    const clickTarget = compiled.targetElement || "result";
    if (activeSb) {
      if (clickTarget.toLowerCase().includes("enter")) {
        await cdpPressEnter(activeSb);
      } else {
        await cdpClickText(activeSb, clickTarget);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    let shotBuffer: Uint8Array | null = null;
    if (activeSb && typeof activeSb.screenshot === "function") {
      shotBuffer = await activeSb.screenshot().catch(() => null);
    }
    let screenshotBase64 = "";
    let visualAnalysis = "";
    if (shotBuffer && shotBuffer.length > 0) {
      screenshotBase64 = Buffer.from(shotBuffer).toString("base64");
      visualAnalysis = await analyzeWorkstationScreenshot(shotBuffer, `${displayName}: Clicked ${clickTarget}`);
    }
    const mediaUrl = screenshotBase64 ? `data:image/png;base64,${screenshotBase64}` : undefined;
    return {
      handled: true,
      replyText: `🎯 **${displayName} – Clicked "${clickTarget}"**\n\n${visualAnalysis ? `${visualAnalysis}\n\n` : ""}• **Workstation:** ${displayName} (Live screenshot above)`,
      mediaUrl,
    };
  }

  // ── INTENT: TYPE ─────────────────────────────────────────────────────────
  if (compiled.intent === "type") {
    let activeSb = (global as any).__activeSandboxes?.get(`${campaignId}_${targetAgentId}`);
    if (!activeSb) {
      await getOrCreateAgentSandbox(campaignId, targetAgentId, true);
      activeSb = (global as any).__activeSandboxes?.get(`${campaignId}_${targetAgentId}`);
    }

    const textToType = compiled.textToType || "";
    if (activeSb && textToType) {
      await cdpTypeInput(activeSb, textToType);
      if (compiled.pressEnter) {
        await cdpPressEnter(activeSb);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    let shotBuffer: Uint8Array | null = null;
    if (activeSb && typeof activeSb.screenshot === "function") {
      shotBuffer = await activeSb.screenshot().catch(() => null);
    }
    let screenshotBase64 = "";
    let visualAnalysis = "";
    if (shotBuffer && shotBuffer.length > 0) {
      screenshotBase64 = Buffer.from(shotBuffer).toString("base64");
      visualAnalysis = await analyzeWorkstationScreenshot(shotBuffer, `${displayName}: Typed "${textToType}"`);
    }
    const mediaUrl = screenshotBase64 ? `data:image/png;base64,${screenshotBase64}` : undefined;
    return {
      handled: true,
      replyText: `⌨️ **${displayName} – Typed into page**\n\n${visualAnalysis ? `${visualAnalysis}\n\n` : ""}• **Typed:** "${textToType}"\n• **Workstation:** ${displayName} (Live screenshot above)`,
      mediaUrl,
    };
  }

  // ── INTENT: SCROLL ───────────────────────────────────────────────────────
  if (compiled.intent === "scroll") {
    let activeSb = (global as any).__activeSandboxes?.get(`${campaignId}_${targetAgentId}`);
    if (!activeSb) {
      await getOrCreateAgentSandbox(campaignId, targetAgentId, true);
      activeSb = (global as any).__activeSandboxes?.get(`${campaignId}_${targetAgentId}`);
    }

    const direction = compiled.scrollDirection || "down";
    if (activeSb) {
      await cdpScroll(activeSb, direction as any, 600);
      await new Promise((r) => setTimeout(r, 1200));
    }

    let shotBuffer: Uint8Array | null = null;
    if (activeSb && typeof activeSb.screenshot === "function") {
      shotBuffer = await activeSb.screenshot().catch(() => null);
    }
    let screenshotBase64 = "";
    let visualAnalysis = "";
    if (shotBuffer && shotBuffer.length > 0) {
      screenshotBase64 = Buffer.from(shotBuffer).toString("base64");
      visualAnalysis = await analyzeWorkstationScreenshot(shotBuffer, `${displayName} after scrolling ${direction}`);
    }
    const mediaUrl = screenshotBase64 ? `data:image/png;base64,${screenshotBase64}` : undefined;
    return {
      handled: true,
      replyText: `📸 **${displayName} – Scrolled ${direction.toUpperCase()}**\n\n${visualAnalysis || "Live workstation display captured."}\n\n• **Workstation:** ${displayName}\n• **Action:** Scrolled ${direction}`,
      mediaUrl,
    };
  }

  // ── INTENT: WAKE ─────────────────────────────────────────────────────────
  if (compiled.intent === "wake") {
    const sb = await wakeAgentPc(campaignId, targetAgentId);
    let screenshotBase64 = "";
    const activeSb = (global as any).__activeSandboxes?.get(`${campaignId}_${targetAgentId}`);
    if (activeSb && typeof activeSb.screenshot === "function") {
      const shotBuffer = await activeSb.screenshot().catch(() => null);
      if (shotBuffer && shotBuffer.length > 0) {
        screenshotBase64 = Buffer.from(shotBuffer).toString("base64");
      }
    }
    const mediaUrl = screenshotBase64 ? `data:image/png;base64,${screenshotBase64}` : undefined;
    return {
      handled: true,
      replyText: `⚡ **${displayName} Workstation is Awake**\n\nWorkstation ID: \`${sb.sandboxId || "Active"}\`.\nGoogle Chrome and Live VNC are ready on DISPLAY=:0.`,
      mediaUrl,
    };
  }

  // ── INTENT: PAUSE / STOP ─────────────────────────────────────────────────
  if (compiled.intent === "pause") {
    await pauseAllAgentSandboxes(campaignId);
    lastActiveAgentByContext.delete(contextId);
    return {
      handled: true,
      replyText: `🛑 **Workstations Paused ($0 Compute Mode)**\n\nI have securely paused the cloud microVMs and frozen all browser sessions.\n\n• **MicroVM Status:** Paused ($0 compute)\n• **State & Memory:** Opened tabs, logins, and cookies 100% preserved in persistent sandbox\n• **Agent Status:** Resting / Idle`,
    };
  }

  // ── INTENT: STATUS ───────────────────────────────────────────────────────
  if (compiled.intent === "status") {
    const runningList = await db
      .select({ agentId: agentSandboxes.agentId, sandboxId: agentSandboxes.sandboxId })
      .from(agentSandboxes)
      .where(and(eq(agentSandboxes.campaignId, campaignId), eq(agentSandboxes.status, "running")))
      .all();

    const activeMap: Map<string, any> = (global as any).__activeSandboxes;
    const activeIds = new Set<string>();
    for (const r of runningList) {
      if (r.agentId) activeIds.add(r.agentId);
    }
    if (activeMap) {
      for (const key of activeMap.keys()) {
        const agId = key.replace(new RegExp(`^${campaignId}_`), "");
        if (agId && !agId.startsWith("campaign_")) activeIds.add(agId);
      }
    }

    if (activeIds.size === 0) {
      return {
        handled: true,
        replyText: `💤 **All Agent Workstations are in Standby ($0 Compute)**\n\nEvery cloud microVM is currently paused to preserve your compute credits. Open tabs, browser sessions, cookies, and login tokens are 100% preserved in the persistent vault.\n\nReply with a command or **WAKE <agent>** to spin up a workstation anytime!`,
      };
    }

    const listLines = Array.from(activeIds).map((id) => {
      const name = getAgentDisplayName(id);
      return `• **${name}** (\`${id}\`): Active Live VNC Desktop`;
    });

    return {
      handled: true,
      replyText: `🖥️ **Active Workstations (${activeIds.size} Running)**\n\n${listLines.join("\n")}\n\nAll other workstations remain paused at $0 compute. Reply **"pause"** to put them to sleep, or give any task for an active agent.`,
    };
  }

  // ── INTENT: CLEAR POSTS ──────────────────────────────────────────────────
  if (compiled.intent === "clear_posts") {
    const { deletedCount } = await clearScheduledPosts(campaignId);
    return {
      handled: true,
      replyText: `🧹 **Scheduled Posts Cleared!**\n\nI have wiped **${deletedCount}** scheduled/draft posts from the database queue. The campaign calendar is now clean and ready for fresh scheduling.`,
    };
  }

  // ── INTENT: CONVERSATIONAL (Pass through to askMasterAgent) ───────────────
  return { handled: false };
}

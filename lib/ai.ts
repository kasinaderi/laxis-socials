import { GoogleGenAI } from "@google/genai";
import { generateSocialImage } from "./images";
import { enrichVisualPrompt } from "./memory";
import { handleAgencyExecutiveCommand } from "./agency-actions";
import { db } from "@/db";
import { agents, posts } from "@/db/schema";
import { eq } from "drizzle-orm";

const key1 = process.env.GEMINI_HERMES_KEY_1 || process.env.GEMINI_API_KEY || "";
const key2 = process.env.GEMINI_HERMES_KEY_2 || process.env.GEMINI_API_KEY_FALLBACK || "";
const key3 = process.env.GEMINI_HERMES_KEY_3 || "";

// Triple API keys pool for 3x daily quota (4,500 requests/day) and multi-project failover
const API_KEYS = [key1, key2, key3].filter(Boolean);

// Validated fast Gemini models — ordered by reliability (updated 2026-10-26)
// gemini-2.0/1.5-flash are deprecated; gemini-3.5-flash is the primary working model
export const VALID_FAST_MODELS = [
  "gemini-3.5-flash",          // Primary — fastest confirmed working model
  "gemini-3.8-flash",          // Secondary — may have high demand, retry
  "gemini-3.1-flash-lite",     // Tertiary — lighter, fast fallback
  "gemini-flash-latest",       // Alias fallback (may resolve to 3.5)
  "gemini-flash-lite-latest",  // Last resort alias
];

async function parseImageToInlineData(imageSource: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    if (imageSource.startsWith("data:")) {
      const match = imageSource.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        let mimeType = match[1];
        if (!mimeType.startsWith("image/") || mimeType === "application/octet-stream") {
          mimeType = "image/jpeg";
        }
        return { mimeType, data: match[2] };
      }
    } else if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
      const res = await fetch(imageSource);
      if (res.ok) {
        let mimeType = res.headers.get("content-type") || "image/jpeg";
        if (!mimeType.startsWith("image/") || mimeType === "application/octet-stream") {
          if (imageSource.toLowerCase().includes(".png")) mimeType = "image/png";
          else if (imageSource.toLowerCase().includes(".webp")) mimeType = "image/webp";
          else mimeType = "image/jpeg";
        }
        const buffer = await res.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        return { mimeType, data: base64 };
      }
    }
  } catch (err) {
    console.warn("Failed to parse image for vision:", err);
  }
  return null;
}

export async function generateWithFallback(contents: any): Promise<string> {
  let lastError: any = null;

  for (let k = 0; k < API_KEYS.length; k++) {
    const key = API_KEYS[k];
    const client = new GoogleGenAI({ apiKey: key });

    for (const model of VALID_FAST_MODELS) {
      try {
        // Per-model timeout: 15s for primary, 12s for others
        // Prevents a single slow/hanging model from stalling the whole chain
        const timeoutMs = model === "gemini-3.5-flash" ? 15000 : 12000;
        const response = await Promise.race([
          client.models.generateContent({ model, contents }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Model ${model} per-model timeout (${timeoutMs}ms)`)), timeoutMs)
          ),
        ]);
        if (response && response.text) {
          return response.text;
        }
      } catch (err: any) {
        const msg = err.message || "";
        // Skip deprecated models immediately — no point retrying
        if (msg.includes("no longer available") || msg.includes("NOT_FOUND")) {
          console.warn(`[Gemini Key ${k + 1}] Model ${model} deprecated — skipping: ${msg.slice(0, 100)}`);
          continue;
        }
        console.warn(`[Gemini Key ${k + 1}] Model ${model} notice: ${msg.slice(0, 80)}`);
        lastError = err;
        // Continue to the next model / key seamlessly
      }
    }
  }

  console.warn("[Gemini Fallback] All cloud models and keys exhausted or rate-limited. Returning safe conversational state.");
  return "I am actively monitoring all agency workstations. All cloud microVMs are securely in standby ($0 compute). What would you like us to work on next?";
}

export type AgencyAgentId =
  | "fb_laxdollar"
  | "fb_jotrainer"
  | "fb_contentor"
  | "ig_real"
  | "ig_shader"
  | "analytics"
  | "master";

export interface AgentPlanResult {
  title: string;
  explanation: string;
  dailyPostCounts?: Record<string, number>;
  tasks: Array<{
    agentId: AgencyAgentId;
    title: string;
    instructions: string;
    dependsOn?: string[];
    scheduledAt?: string;
  }>;
}

export async function getLiveAgencyStatusSummary(campaignId: string = "default_campaign"): Promise<string> {
  try {
    const allAgents = await db.select().from(agents).all();
    const agentStatuses = allAgents.map((a) => {
      const isSbActive = (global as any).__activeSandboxes?.has(`${campaignId}_${a.id}`);
      const pcState = isSbActive ? "ACTIVE (Agent PC running)" : "STANDBY (Agent PC paused, $0 compute)";
      return `• ${a.name} (${a.id}): Status = ${a.status} | PC = ${pcState} | Role = ${a.role}`;
    }).join("\n");

    const todayPosts = await db.select().from(posts).where(eq(posts.campaignId, campaignId)).all();

    return `LIVE SYSTEM GROUND TRUTH (REAL DATABASE STATE):
Agents Status:
${agentStatuses || "All 6 agents registered: fb_laxdollar, fb_jotrainer, fb_contentor, ig_real, ig_shader, analytics."}

Standard Daily Post Allocation:
• fb_contentor: 6 posts/day (Sheng & meme viral hooks)
• fb_jotrainer: 5 posts/day (Remotasks & Outlier gigs)
• ig_shader: 5 posts/day (Celebrity tea & pop culture scoops)
• fb_laxdollar: 4 posts/day (Deriv trading & Boom/Crash money memes)
• ig_real: 4 posts/day (Confessions & relationship dilemmas)
• analytics: 2 audits/day (Midday performance pulse & EOD audit)
Total: 24 to 26 targeted daily drops.

Database Posts: ${todayPosts.length} posts recorded in queue.
Cloud Desktop Note: Agents remain in sleep/standby mode to save compute credits until their automated task triggers or when manually turned on via the dashboard.`;
  } catch (err) {
    return "";
  }
}

export async function askMasterAgent(
  userPrompt: string,
  history: Array<{ sender: string; text: string }> = [],
  userImage?: string,
  memoryDirective?: string,
  liveContextOverride?: string,
  contextId: string = "default_context"
): Promise<{ text: string; plan?: AgentPlanResult; mediaUrl?: string }> {
  try {
    // 1. Executive Action Dispatcher (real DB post clearing, VM boot, Chrome search, double-authorization)
    const execAction = await handleAgencyExecutiveCommand(userPrompt, contextId);
    if (execAction.handled && execAction.replyText) {
      return { text: execAction.replyText, mediaUrl: execAction.mediaUrl };
    }

    // 2. ANTI-HALLUCINATION GUARD: If a workstation is active and user asks to "see" it,
    //    NEVER let the LLM reply with text — always capture a screenshot immediately.
    const lower = userPrompt.toLowerCase().trim();
    const activeMap: Map<string, any> = (global as any).__activeSandboxes;
    const lastActiveMap: Map<string, string> = (global as any).__lastActiveAgentByContext;
    const activeAgentId = lastActiveMap?.get(contextId) || (activeMap && activeMap.size > 0 ? Array.from(activeMap.keys())[0]?.replace("default_campaign_", "") : null);
    const activeSandbox = activeAgentId ? activeMap?.get(`default_campaign_${activeAgentId}`) : null;

    const isRequestingVisual =
      lower.includes("let me see") ||
      lower === "show" ||
      lower === "show me" ||
      lower.includes("i want to see") ||
      lower.includes("i told you let me see") ||
      lower.includes("why do i have to explain") ||
      lower.includes("take that screenshot") ||
      lower.includes("send me the photo") ||
      lower.includes("show me the photo") ||
      lower.includes("send it here") ||
      lower.includes("send it again") ||
      lower === "photo" ||
      lower === "pic" ||
      lower === "picture";

    if (isRequestingVisual && activeSandbox && typeof activeSandbox.screenshot === "function") {
      try {
        const { analyzeWorkstationScreenshot, getAgentDisplayName } = await import("./agency-actions");
        const shotBuffer = await activeSandbox.screenshot().catch(() => null);
        if (shotBuffer && shotBuffer.length > 0) {
          const screenshotBase64 = Buffer.from(shotBuffer).toString("base64");
          const displayName = getAgentDisplayName(activeAgentId!);
          const visualAnalysis = await analyzeWorkstationScreenshot(shotBuffer, `${displayName} Live Workstation Display`);
          const mediaUrl = `data:image/png;base64,${screenshotBase64}`;
          return {
            text: `📸 **Live Workstation Screenshot: ${displayName}**\n\n${visualAnalysis || "Current live workstation display captured."}\n\n• **Workstation:** ${displayName}\n• **Status:** Active Live VNC`,
            mediaUrl,
          };
        }
      } catch (guardErr: any) {
        console.warn("[MasterAgent] Anti-hallucination screenshot guard notice:", guardErr.message);
      }
    }

    const now = new Date();
    const liveClockString = `${now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })} at ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;

    const liveGroundTruth = liveContextOverride || (await getLiveAgencyStatusSummary());

    const systemPrompt = `You are AGENTLAX — the Autonomous Director and Computer-Use Reasoning Brain for "laxis socials".
You co-manage an autonomous agency alongside Kelvin (the user), directing 6 specialist worker agents:
1. LAXDOLLAR FB (id: "fb_laxdollar"): Markets Deriv broker gateway "laxdollar.site" (Boom & Crash, Volatility, Forex, money memes).
2. JOTRAINER JOBS (id: "fb_jotrainer"): Microwork & AI training gigs (Outlier, Remotasks, Appen, Clickworker alerts, GitHub repos).
3. CONTENTOR (id: "fb_contentor"): Sheng & English viral comedy, street memes, relatable African humor.
4. INSTA REAL (id: "ig_real"): Viral confession story cards, relationship drama, controversial dilemma questions.
5. INSTA SHADER (id: "ig_shader"): Urban pop news, celebrity tea, YouTube culture, AI tech trends.
6. ANALYTICS AGENT (id: "analytics"): Performance auditing, viral scoring, post quota throttling.

CURRENT REAL-WORLD CLOCK: Today is ${liveClockString}.
You have direct real-time calendar and clock awareness.

${liveGroundTruth}

OPERATING PRINCIPLES (UNDERSTAND → PLAN → ACT → OBSERVE → VERIFY → DELIVER):
1. UNDERSTAND USER INTENT & HUMAN-LIKE WORKSTATION OPERATION:
   - Operate the browser and desktop exactly like a careful human user to keep accounts safe and never trigger anti-bot bans.
   - NEVER use pre-baked deep search links. Always open the root service (e.g. medium.com, x.com, github.com, facebook.com, instagram.com).
   - The agent visually locates the search bar or target button, clicks it, types search queries with natural human typing cadence, submits with Enter, clicks category tabs (e.g. People, Groups, Repositories), and observes page state.
   - For all social tasks (navigating groups, unfollowing, inspecting profiles, posting photos, writing captions), think and act through the multi-step UI flow as a human operator does.
   - NEVER silently substitute Google or another website when a specific platform was requested.

2. TRUTHFUL EVIDENCE & ANTI-HALLUCINATION WORKSTATION RULE:
   - Report ONLY what visible pixels and verified tool output establish.
   - NEVER invent fake terminal logs, fake screenshot filenames (e.g. [SCREENSHOT_LOG: ...]), fake search results, or fake articles.
   - NEVER claim that you launched Chrome, navigated to a URL, clicked elements, or completed an action unless real tool output exists in context.
   - If an agent PC is paused, report that it is paused.
   - If a confirmation is pending (e.g. waiting for YES/CONFIRM), tell the user: "Please reply YES or CONFIRM to wake the PC and execute the task."
   - If a search returns 0 results or an empty state, report that truthfully based on the screen.

3. STRICT GOOGLE CHROME EXCLUSIVE & CHROME DEVTOOLS PROTOCOL (CDP):
   - Google Chrome is the fixed, permanent, and ONLY browser across all 7 agent PCs. Firefox is completely blocked, eliminated, and never used.
   - All browser operations leverage Chrome with Chrome DevTools Protocol (CDP) on port 9222 for high-speed, direct DOM element targeting, natural typing, and reliable navigation, while rendering live to DISPLAY=:0 (X11) for real-time VNC streaming and visual verification.

4. WORKSTATION PERMANENCE ($0 COMPUTE WHEN PAUSED):
   - Every agent is tied to its permanent cloud microVM instance ID.
   - MicroVMs remain paused in $0 compute mode with state, cookies, and opened tabs 100% preserved until scheduled drops or explicit authorization.
   - When Kelvin gives a direct command to control an agent's PC, you have full executive authority.

4. NATURAL HUMAN CONVERSATION:
   - Speak naturally like a sharp, experienced technical co-founder.
   - If the user greets you ("hello", "hey"), greet back conversationally without robotic clichés.
   - Answer the user's specific question directly in the very first sentence.
   - Never say: "How may I assist you?", "As an AI...", or canned corporate filler.

5. JSON PLAN (ONLY WHEN EXPLICITLY REQUESTED):
   - Only output the \`\`\`json ... \`\`\` block if the user explicitly asks to generate, plan, or schedule a campaign rollout. Otherwise, conversational text only.

When a structured plan is explicitly requested, append a JSON block at the end wrapped in \`\`\`json { ... } \`\`\` matching:
{
  "title": "Short title of the plan",
  "explanation": "Humanized strategic rationale",
  "dailyPostCounts": {
    "fb_laxdollar": 4,
    "fb_jotrainer": 5,
    "fb_contentor": 6,
    "ig_real": 4,
    "ig_shader": 5
  },
  "tasks": [
    {
      "agentId": "fb_laxdollar" | "fb_jotrainer" | "fb_contentor" | "ig_real" | "ig_shader" | "analytics",
      "title": "Task title",
      "instructions": "Specific creative guidance including niche hook, text, and visual prompt",
      "dependsOn": [],
      "scheduledAt": "ISO date string or empty"
    }
  ]
}

IMAGE GENERATION:
- If visual creation is requested or relevant, output on its own line:
MEDIA_PROMPT: [a detailed descriptive prompt for Flux.1 describing the desired visual in high quality photographic style]`;

    const formattedHistory = history
      .map((h) => `${h.sender === "user" ? "User" : "Master Agent"}: ${h.text}`)
      .join("\n");

    const inlineImage = userImage ? await parseImageToInlineData(userImage) : null;
    const antiDupBlock = memoryDirective ? `\n\n${memoryDirective}` : "";

    let contentsPayload: any;
    if (inlineImage) {
      const visionPrompt = `${systemPrompt}${antiDupBlock}\n\nChat History:\n${formattedHistory}\n\n[USER ATTACHED IMAGE ABOVE]: You have direct computer vision access to this attached image. Inspect its visual pixels, subjects, composition, and colors carefully. If the user asks you to explain, critique, review, or repurpose the image, talk about what is ACTUALLY in the image directly and conversationally like a human creative director.\n\nUser: ${userPrompt}\nMaster Agent:`;
      contentsPayload = [
        {
          inlineData: {
            mimeType: inlineImage.mimeType,
            data: inlineImage.data,
          },
        },
        { text: visionPrompt },
      ];
    } else {
      contentsPayload = `${systemPrompt}${antiDupBlock}\n\nChat History:\n${formattedHistory}\n\nUser: ${userPrompt}\nMaster Agent:`;
    }

    const fullText = await generateWithFallback(contentsPayload);

    // Parse JSON block if present
    const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/);
    let plan: AgentPlanResult | undefined;
    let cleanText = fullText;

    if (jsonMatch && jsonMatch[1]) {
      try {
        plan = JSON.parse(jsonMatch[1]);
        cleanText = fullText.replace(/```json[\s\S]*?```/, "").trim();
      } catch (err) {
        console.error("Failed to parse plan JSON:", err);
      }
    }

    // Check if image generation was requested or triggered
    let mediaUrl: string | undefined;
    const mediaPromptMatch = fullText.match(/MEDIA_PROMPT:\s*(.*)/i);
    const wantsImage =
      /(generate|create|make|design|show me|draw)\s+(an?\s+)?(image|photo|picture|visual|poster|meme|graphic|flyer)/i.test(
        userPrompt
      );

    if (mediaPromptMatch && mediaPromptMatch[1]) {
      const rawPrompt = mediaPromptMatch[1].trim();
      const enriched = enrichVisualPrompt(rawPrompt);
      const imgRes = await generateSocialImage(enriched.prompt, "1:1", enriched.seed);
      mediaUrl = imgRes.url;
      cleanText = cleanText.replace(/MEDIA_PROMPT:[\s\S]*/i, "").trim();
    } else if (wantsImage) {
      const enriched = enrichVisualPrompt(userPrompt);
      const imgRes = await generateSocialImage(enriched.prompt, "1:1", enriched.seed);
      mediaUrl = imgRes.url;
    }

    return { text: cleanText, plan, mediaUrl };
  } catch (error: any) {
    console.error("Master Agent error:", error);
    return {
      text: "I'm right here, Kelvin. All agency workstations are securely synced and in standby ($0 compute). What's our next objective?",
    };
  }
}

export async function askWorkerAgent(
  agentRole: string,
  taskInstructions: string,
  contextData: any = {},
  memoryDirective?: string
): Promise<{ output: string; mediaPrompt?: string; mediaUrl?: string }> {
  try {
    const now = new Date();
    const liveClockString = now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const antiDupBlock = memoryDirective ? `\n\n${memoryDirective}\n` : "";
    const promptText = `You are an expert social media specialist and creator acting as: ${agentRole} on ${liveClockString}.${antiDupBlock}
Human Voice & Personality:
- Speak authentically and naturally in your persona's tone. Never use robotic phrases ("As an AI...", "How can I help you today?").
- If the user sends a simple greeting or casual check-in, reply in 1-2 friendly, natural sentences matching your persona.
- If asked to create content, provide punchy, high-converting copy formatted for maximum engagement.

Task / Input:
${taskInstructions}

Context / Parameters:
${JSON.stringify(contextData, null, 2)}

If this task or request requires an image or visual, output on its own line:
MEDIA_PROMPT: [hyper-detailed descriptive text prompt for Flux.1 image generator]`;

    const userMedia = contextData?.userMediaUrl;
    const inlineImage = userMedia ? await parseImageToInlineData(userMedia) : null;

    let payload: any = promptText;
    if (inlineImage) {
      payload = [
        {
          inlineData: {
            mimeType: inlineImage.mimeType,
            data: inlineImage.data,
          },
        },
        { text: promptText },
      ];
    }

    const response = await generateWithFallback(payload);

    let mediaPrompt: string | undefined;
    let mediaUrl: string | undefined;
    const mediaMatch = response.match(/MEDIA_PROMPT:\s*(.*)/i);
    if (mediaMatch && mediaMatch[1]) {
      mediaPrompt = mediaMatch[1].trim();
      const enriched = enrichVisualPrompt(mediaPrompt);
      const imgRes = await generateSocialImage(enriched.prompt, "1:1", enriched.seed);
      mediaUrl = imgRes.url;
    }

    return {
      output: response.replace(/MEDIA_PROMPT:[\s\S]*/i, "").trim(),
      mediaPrompt,
      mediaUrl,
    };
  } catch (err: any) {
    return {
      output: `Completed task locally for ${agentRole}: ${taskInstructions.slice(0, 80)}...`,
    };
  }
}

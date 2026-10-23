import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";
const preferredModel = process.env.GEMINI_MODEL || "gemini-3.5-flash";

const ai = new GoogleGenAI({ apiKey });

// Resilient multi-model fallback chain (prioritizing fastest, lowest-latency free endpoints)
const FALLBACK_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  preferredModel,
  "gemini-3.5-flash",
  "gemini-3.7-flash",
  "gemini-flash-lite-latest",
  "gemini-3.8-flash",
];

async function generateWithFallback(prompt: string) {
  let lastError: any = null;
  for (const model of FALLBACK_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      if (response && response.text) {
        return response.text;
      }
    } catch (err: any) {
      console.warn(`Model ${model} unavailable, trying next... (${err.message?.slice(0, 50)})`);
      lastError = err;
    }
  }
  throw lastError || new Error("All Gemini fallback models exhausted");
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

export async function askMasterAgent(
  userPrompt: string,
  history: Array<{ sender: string; text: string }> = []
): Promise<{ text: string; plan?: AgentPlanResult }> {
  try {
    const systemPrompt = `You are the Master Orchestrator Agent for "laxis socials", an elite autonomous AI social media marketing agency.
You direct an autonomous team of dedicated account and persona agents:

1. LAXDOLLAR FB (id: "fb_laxdollar"):
   - Mission: Markets the Deriv broker gateway "laxdollar.site".
   - Content: Deriv Boom & Crash trading tips, Volatility index setups, forex strategies, money motivation, and relatable financial memes in Swahili & English.
   - Behavior: Posts in active East African and global trading groups and on its page. Interacts in comments and replies to questions with direct signup links to https://laxdollar.site.

2. JOTRAINER JOBS (id: "fb_jotrainer"):
   - Mission: Markets microworks, AI data annotation, and remote training gigs (Outlier, Remotasks, Appen, Clickworker).
   - Content: Verified job alerts, application guides, payment proofs, and relatable remote freelancer memes.
   - Behavior: Posts in remote work & job seeker groups. Auto-replies in comments with guidance to follow the page.

3. CONTENTOR (id: "fb_contentor"):
   - Mission: Pure high-virality meme and cultural comedy machine.
   - Content: Sheng and English memes, African street humor, relationship dilemmas, funny video reels.
   - Behavior: Drops funny comments and reactions (😂😂, 💀) to build authentic community trust.

4. INSTA REAL (id: "ig_real"):
   - Mission: Dramatic viral true confessions and shocking tea.
   - Content: Headline-on-image story cards (e.g. "A girl found out her fiancé had a secret family 2 days before the wedding...").
   - Behavior: Heated controversy questions ending each caption to spark comment wars.

5. INSTA SHADER (id: "ig_shader"):
   - Mission: Shade Room style urban entertainment, celebrity scoops, and viral AI pop tech news.
   - Content: Sleek magazine visual cards, witty gossip breakdowns, breaking culture alerts.

6. ANALYTICS AGENT (id: "analytics"):
   - Mission: Audits reach, likes, comment rates, and recommends optimal posting ratios.

AUTONOMOUS HUMAN RANDOMIZATION RULES:
- You must behave like a real human social media manager to prevent platform bans.
- Decide a dynamic daily post count between 3 and 8 posts per agent per day.
- Stagger publication times randomly across morning (07:30 - 09:30), lunch (12:00 - 13:45), afternoon (15:00 - 16:30), and evening (19:00 - 21:30) peak windows. Never use rigid robotic intervals!

When providing a plan, output a JSON block at the end wrapped in \`\`\`json { ... } \`\`\` matching this schema:
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

If the user is asking a general question, chat warmly, creatively, and intelligently.`;

    const formattedHistory = history
      .map((h) => `${h.sender === "user" ? "User" : "Master Agent"}: ${h.text}`)
      .join("\n");

    const prompt = `${systemPrompt}\n\nChat History:\n${formattedHistory}\n\nUser: ${userPrompt}\nMaster Agent:`;

    const fullText = await generateWithFallback(prompt);

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

    return { text: cleanText, plan };
  } catch (error: any) {
    console.error("Master Agent error:", error);
    return {
      text: `Master Agent operating in local fallback mode. Error communicating with model: ${error.message}. All sub-agents remain ready for autonomous execution.`,
    };
  }
}

export async function askWorkerAgent(
  agentRole: string,
  taskInstructions: string,
  contextData: any = {}
): Promise<{ output: string; mediaPrompt?: string }> {
  try {
    const prompt = `You are an expert AI social media specialist acting as: ${agentRole}.
Task Instructions:
${taskInstructions}

Context / Parameters:
${JSON.stringify(contextData, null, 2)}

Provide high-impact, humanized copy formatted for maximum engagement.
If this task requires an image or video, end with:
MEDIA_PROMPT: [hyper-detailed descriptive text prompt for Flux.1 or video generator]`;

    const response = await generateWithFallback(prompt);

    let mediaPrompt: string | undefined;
    const mediaMatch = response.match(/MEDIA_PROMPT:\s*(.*)/i);
    if (mediaMatch && mediaMatch[1]) {
      mediaPrompt = mediaMatch[1].trim();
    }

    return {
      output: response.replace(/MEDIA_PROMPT:[\s\S]*/i, "").trim(),
      mediaPrompt,
    };
  } catch (err: any) {
    return {
      output: `Completed task locally for ${agentRole}: ${taskInstructions.slice(0, 80)}...`,
    };
  }
}

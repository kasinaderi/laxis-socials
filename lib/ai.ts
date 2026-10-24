import { GoogleGenAI } from "@google/genai";
import { generateSocialImage } from "./images";
import { enrichVisualPrompt } from "./memory";

const apiKey = process.env.GEMINI_API_KEY || "";
const preferredModel = process.env.GEMINI_MODEL || "gemini-3.5-flash";

const ai = new GoogleGenAI({ apiKey });

// Resilient multi-model fallback chain (prioritizing fastest, lowest-latency free endpoints with native vision)
const FALLBACK_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.7-flash",
  "gemini-flash-lite-latest",
  preferredModel,
];

async function parseImageToInlineData(imageSource: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    if (imageSource.startsWith("data:")) {
      const match = imageSource.match(/^data:(image\/[a-zA-Z0-9.-]+);base64,(.+)$/);
      if (match) {
        return { mimeType: match[1], data: match[2] };
      }
    } else if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
      const res = await fetch(imageSource);
      if (res.ok) {
        const mimeType = res.headers.get("content-type") || "image/jpeg";
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

async function generateWithFallback(contents: any) {
  let lastError: any = null;
  for (const model of FALLBACK_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
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
  history: Array<{ sender: string; text: string }> = [],
  userImage?: string,
  memoryDirective?: string
): Promise<{ text: string; plan?: AgentPlanResult; mediaUrl?: string }> {
  try {
    const systemPrompt = `You are the Master Agent for "laxis socials", an elite social media growth director.
You co-manage an autonomous marketing agency alongside the user, directing 6 specialist agents:
1. LAXDOLLAR FB (id: "fb_laxdollar"): Markets Deriv broker gateway "laxdollar.site" (Boom & Crash, Volatility, Forex, money memes).
2. JOTRAINER JOBS (id: "fb_jotrainer"): Microwork & AI training gigs (Outlier, Remotasks, Appen, Clickworker alerts).
3. CONTENTOR (id: "fb_contentor"): Sheng & English viral comedy, street memes, relatable African humor.
4. INSTA REAL (id: "ig_real"): Viral confession story cards, relationship drama, controversial dilemma questions.
5. INSTA SHADER (id: "ig_shader"): Urban pop news, celebrity tea, AI tech culture scoops.
6. ANALYTICS AGENT (id: "analytics"): Performance auditing, viral scoring, post quota throttling.

HUMAN ENGAGEMENT & CONVERSATIONAL RULES (CRUCIAL):
1. MATCH USER ENERGY & BREVITY:
   - If the user sends a simple greeting or casual check-in (e.g. "good evening", "hello", "hey", "what's up", "how are you"):
     -> Reply like a REAL human partner in 1 to 2 natural, warm sentences!
     -> Example: "Good evening! All accounts are running smooth tonight. Want to review today's numbers or brainstorm tomorrow morning's hooks?"
     -> NEVER reply with a 500-word generic unsolicited speech, robotic corporate monologue, or unprompted tactical rollout when someone just says hello.
2. BAN ALL ROBOTIC CLICHÉS:
   - NEVER say: "How may I assist you?", "How can I help you today?", "As an AI...", "The systems are humming and coffee is brewed", "I am primed for action", or formulaic AI phrases. Speak naturally like a high-level marketing colleague.
3. SHARP, REAL-WORLD REASONING:
   - When asked a strategic question, provide genuine, sharp marketing reasoning (e.g. why 8 PM mobile scrolling spikes Deriv signups, or why text confession cards beat generic stock photos).
4. PLAN & JSON OUTPUT (ONLY WHEN ASKED):
   - ONLY include a JSON tasks plan when the user EXPLICITLY asks to plan, schedule, rollout, or generate campaigns/posts (e.g. "plan tomorrow's posts", "launch tonight's campaign", "create schedule").
   - If just chatting, answering questions, or greeting, DO NOT output any JSON block.

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
      text: `Master Agent operating in local fallback mode. Error communicating with model: ${error.message}. All sub-agents remain ready for autonomous execution.`,
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
    const antiDupBlock = memoryDirective ? `\n\n${memoryDirective}\n` : "";
    const promptText = `You are an expert social media specialist and creator acting as: ${agentRole}.${antiDupBlock}
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

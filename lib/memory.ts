import { db } from "@/db";
import { posts, agentMessages, agentDeliverables } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";

export interface PastPostItem {
  id: string;
  title: string;
  hook: string;
  caption: string;
  mediaUrl?: string;
  createdAt: string;
}

export interface ContentMemory {
  campaignId: string;
  recentPosts: PastPostItem[];
  recentHooks: string[];
  recentTitles: string[];
  recentImagePrompts: string[];
}

/**
 * Retrieves the historical content memory from Turso Cloud SQLite
 * to prevent the agents from ever duplicating topics, captions, or image concepts.
 */
export async function getAgentContentMemory(
  campaignId: string,
  limit = 20
): Promise<ContentMemory> {
  try {
    const rawPosts = await db
      .select()
      .from(posts)
      .where(eq(posts.campaignId, campaignId))
      .orderBy(desc(posts.createdAt))
      .limit(limit)
      .all();

    const recentPosts: PastPostItem[] = rawPosts.map((p) => {
      // Extract the hook (first sentence or first 120 characters)
      const firstLine = (p.caption || "").split("\n")[0] || "";
      const hook = firstLine.slice(0, 140).trim();

      let mediaUrl: string | undefined;
      try {
        const parsed = JSON.parse(p.mediaUrls || "[]");
        if (Array.isArray(parsed) && parsed.length > 0) {
          mediaUrl = parsed[0];
        }
      } catch {
        // ignore
      }

      return {
        id: p.id,
        title: p.title,
        hook,
        caption: p.caption,
        mediaUrl,
        createdAt: p.createdAt,
      };
    });

    const recentTitles = recentPosts.map((p) => p.title).filter(Boolean);
    const recentHooks = recentPosts.map((p) => p.hook).filter(Boolean);

    // Also collect any image deliverable prompts if stored
    const deliverables = await db
      .select()
      .from(agentDeliverables)
      .where(and(eq(agentDeliverables.campaignId, campaignId), eq(agentDeliverables.type, "image")))
      .orderBy(desc(agentDeliverables.createdAt))
      .limit(10)
      .all();

    const recentImagePrompts = deliverables.map((d) => d.content || d.name).filter(Boolean);

    return {
      campaignId,
      recentPosts,
      recentHooks,
      recentTitles,
      recentImagePrompts,
    };
  } catch (err) {
    console.warn("Could not query content memory, proceeding with empty memory fallback:", err);
    return {
      campaignId,
      recentPosts: [],
      recentHooks: [],
      recentTitles: [],
      recentImagePrompts: [],
    };
  }
}

/**
 * Formats a bulletproof negative-prompt directive for Gemini
 * so the model is strictly forbidden from repeating recent concepts.
 */
export function buildAntiDuplicationDirective(memory: ContentMemory, agentNiche?: string): string {
  if (!memory.recentPosts || memory.recentPosts.length === 0) {
    return `[ANTI-DUPLICATION MEMORY]: No prior posts recorded yet for this campaign. Feel free to establish a fresh initial baseline angle.`;
  }

  const postList = memory.recentPosts
    .slice(0, 12)
    .map((p, idx) => `  ${idx + 1}. [${new Date(p.createdAt).toLocaleDateString()}] Title: "${p.title}" | Hook: "${p.hook}"`)
    .join("\n");

  return `======================================================================
MANDATORY ANTI-DUPLICATION & FRESHNESS PROTOCOL:
The following ${memory.recentPosts.length} posts were ALREADY generated and published in recent days:
${postList}

CRITICAL RULES FOR CONTENT NOVELTY:
1. STRICT ZERO-REPETITION: You MUST NOT reuse, recycle, or rephrase any of the above hooks, jokes, scenarios, or storylines.
2. NEW ANGLE: Pick a completely novel angle, unexpected perspective, different real-life dilemma, fresh psychological trigger, or current trend.
3. FRESH VOCABULARY: Avoid starting with the same opening words as any recent post above.
4. VISUAL DIVERSITY: The visual/image prompt must portray a completely different scene, character type, lighting, and composition from past creations.
======================================================================`;
}

/**
 * Computes Jaccard word-similarity between two text strings
 * Returns a value between 0 (completely distinct) and 1 (identical)
 */
export function calculateTextSimilarity(textA: string, textB: string): number {
  const tokenize = (str: string) =>
    new Set(
      str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3) // filter short common stop-words
    );

  const wordsA = tokenize(textA);
  const wordsB = tokenize(textB);

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) {
      intersection++;
    }
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Checks whether a generated draft is too similar to any previously published post.
 * If similarity exceeds 40%, it flags the collision so the system can mutate it.
 */
export function verifyDraftUniqueness(
  newDraft: string,
  memory: ContentMemory
): { isUnique: boolean; maxSimilarity: number; conflictingTitle?: string } {
  let maxSimilarity = 0;
  let conflictingTitle: string | undefined;

  for (const past of memory.recentPosts) {
    const sim = calculateTextSimilarity(newDraft, past.caption);
    if (sim > maxSimilarity) {
      maxSimilarity = sim;
      conflictingTitle = past.title;
    }
  }

  // 0.40 (40% shared vocabulary) is the threshold for duplicate detection
  const isUnique = maxSimilarity < 0.40;

  return {
    isUnique,
    maxSimilarity: Math.round(maxSimilarity * 100),
    conflictingTitle,
  };
}

/**
 * Visual Entropy & Cinematography Director
 * Randomizes camera lens, lighting conditions, framing, and mood to ensure
 * two generated images never look remotely similar even within the same niche.
 */
const CAMERA_ANGLES = [
  "eye-level candid photo",
  "dramatic low-angle hero perspective",
  "overhead flat-lay view",
  "35mm street photography lens with subtle motion blur",
  "ultra-sharp 85mm portrait with shallow depth of field",
  "cinematic wide-angle establishing shot",
  "macro close-up focusing on expressive details",
];

const LIGHTING_STYLES = [
  "golden hour warm sunset lighting with glowing rim highlights",
  "moody cyberpunk neon reflections with vibrant blues and purples",
  "bright crisp morning sunlight through large glass windows",
  "cinematic volumetric studio lighting with soft shadows",
  "overcast natural daylight with muted organic tones",
  "dramatic high-contrast chiaroscuro lighting",
  "cozy ambient indoor lamp glow with bokeh background",
];

const ENVIRONMENTS = [
  "modern high-rise rooftop overlooking a sprawling metropolis",
  "bustling vibrant urban street market in Nairobi",
  "minimalist sleek Scandinavian home office with plants",
  "luxurious boutique cafe terrace with espresso cup",
  "state-of-the-art trading terminal room with multi-screen glow",
  "sunlit creative design studio with moodboards and coffee",
  "vibrant city center walkway during peak transit hour",
];

export function enrichVisualPrompt(basePrompt: string, seedOffset = 0): { prompt: string; seed: number } {
  const angle = CAMERA_ANGLES[Math.floor(Math.random() * CAMERA_ANGLES.length)];
  const light = LIGHTING_STYLES[Math.floor(Math.random() * LIGHTING_STYLES.length)];
  const env = ENVIRONMENTS[Math.floor(Math.random() * ENVIRONMENTS.length)];

  // Inject high-entropy randomness
  const seed = Date.now() + Math.floor(Math.random() * 10000000) + seedOffset;

  const enriched = `${basePrompt.trim()}, ${angle}, set in ${env}, ${light}, 8k resolution, cinematic commercial photography, hyper-detailed, masterpiece`;

  return {
    prompt: enriched,
    seed,
  };
}

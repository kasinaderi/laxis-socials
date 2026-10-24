/**
 * Hybrid Autonomous Image Generator
 * Primary: Cloudflare Workers AI (FLUX.1 [schnell] by Black Forest Labs)
 * Fallback: Pollinations.ai (Flux.1 / SDXL - Unlimited)
 * 100% Free - zero credit card required.
 */

export interface GenerateImageOptions {
  prompt: string;
  width?: number;
  height?: number;
  aspectRatio?: "1:1" | "9:16" | "16:9" | "4:5";
  seed?: number;
  model?: "flux" | "flux-realism" | "flux-anime" | "turbo";
}

/**
 * Sanitizes and cleans prompts to strictly prevent moderation blocks.
 * Strips markdown symbols, quotes, brackets, domain names (.site, .com), and truncates to optimal length.
 */
export function sanitizeImagePrompt(raw: string): string {
  let cleaned = (raw || "")
    // Remove markdown formatting: **, __, *, _, #, `, ~, [, ], {, }, (, ), <, >
    .replace(/[*_#`~[\]{}()<>]/g, " ")
    // Remove quotes
    .replace(/["'“”‘’]/g, " ")
    // Replace domain names & URLs with safe descriptive terms
    .replace(/https?:\/\/\S+/gi, "trading desk")
    .replace(/www\.\S+/gi, "trading desk")
    .replace(/[a-zA-Z0-9-]+\.(?:site|com|org|net|io|co)/gi, "financial terminal")
    // Replace brand names that can trigger safety filters
    .replace(/\bderiv\b/gi, "forex")
    // Remove "MEDIA_PROMPT:" or "PROMPT:" or "Image:" prefixes
    .replace(/^(media_prompt|image_prompt|prompt|image)\s*:\s*/i, "")
    // Collapse extra whitespace
    .replace(/\s+/g, " ")
    .trim();

  // If prompt is too long (> 220 chars), trim cleanly at word boundary
  if (cleaned.length > 220) {
    const truncated = cleaned.slice(0, 220);
    const lastSpace = truncated.lastIndexOf(" ");
    cleaned = lastSpace > 120 ? truncated.slice(0, lastSpace) : truncated;
  }

  // Fallback if prompt was empty or too short
  if (!cleaned || cleaned.length < 10) {
    cleaned = "cinematic modern office desk with glowing candlestick chart screens, 8k commercial photography";
  }

  return cleaned;
}

/**
 * Generates an image using Cloudflare Workers AI FLUX.1 [schnell]
 * Runs directly on Cloudflare Edge GPUs (~2-3 seconds).
 * Returns a high-res base64 data URL.
 */
export async function generateCloudflareFlux(
  prompt: string,
  steps = 4
): Promise<string | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const model = process.env.CLOUDFLARE_FLUX_MODEL || "@cf/black-forest-labs/flux-1-schnell";

  if (!accountId || !apiToken) {
    return null;
  }

  try {
    const clean = sanitizeImagePrompt(prompt);
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: clean,
          steps,
        }),
      }
    );

    if (!res.ok) {
      console.warn(`Cloudflare Workers AI returned status ${res.status}, falling back...`);
      return null;
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      if (data.result && data.result.image) {
        return `data:image/jpeg;base64,${data.result.image}`;
      }
    } else {
      // Raw binary response
      const arrayBuf = await res.arrayBuffer();
      const base64 = Buffer.from(arrayBuf).toString("base64");
      return `data:image/jpeg;base64,${base64}`;
    }
  } catch (err: any) {
    console.warn("Cloudflare Workers AI generation error, falling back:", err.message);
  }

  return null;
}

export function buildImageUrl(options: GenerateImageOptions): string {
  const seed = options.seed ?? Math.floor(Math.random() * 100000000);
  const { aspectRatio = "1:1", model = "flux" } = options;

  let width = options.width;
  let height = options.height;

  if (!width || !height) {
    switch (aspectRatio) {
      case "9:16":
        width = 720;
        height = 1280;
        break;
      case "16:9":
        width = 1280;
        height = 720;
        break;
      case "4:5":
        width = 1080;
        height = 1350;
        break;
      case "1:1":
      default:
        width = 1024;
        height = 1024;
        break;
    }
  }

  const cleanPrompt = sanitizeImagePrompt(options.prompt);
  const encodedPrompt = encodeURIComponent(cleanPrompt);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&model=${model}&nologo=true`;
}

/**
 * Intelligent Multi-Provider Image Dispatcher:
 * 1. Tries Cloudflare Workers AI (FLUX.1 [schnell]) first for lightning-fast edge inference.
 * 2. Automatically falls back to Pollinations FLUX.1 if Cloudflare reaches its quota or fails.
 */
export async function generateSocialImage(
  prompt: string,
  aspectRatio: "1:1" | "9:16" | "16:9" | "4:5" = "1:1",
  seed?: number
): Promise<{ url: string; prompt: string; seed: number; provider: string }> {
  const cleanPrompt = sanitizeImagePrompt(prompt);
  const chosenSeed = seed ?? Math.floor(Math.random() * 100000000);

  // 1. Try Cloudflare Workers AI FLUX.1 [schnell]
  const cfImage = await generateCloudflareFlux(cleanPrompt, 4);
  if (cfImage) {
    return {
      url: cfImage,
      prompt: cleanPrompt,
      seed: chosenSeed,
      provider: "cloudflare-flux",
    };
  }

  // 2. Fallback to Pollinations FLUX.1
  const pollUrl = buildImageUrl({ prompt: cleanPrompt, aspectRatio, seed: chosenSeed });
  return {
    url: pollUrl,
    prompt: cleanPrompt,
    seed: chosenSeed,
    provider: "pollinations-flux",
  };
}

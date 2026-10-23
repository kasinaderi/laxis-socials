/**
 * 100% Free Image Generation using Pollinations.ai (Flux.1 / SDXL)
 * No API key, no credit card, no token limits required.
 */

export interface GenerateImageOptions {
  prompt: string;
  width?: number;
  height?: number;
  aspectRatio?: "1:1" | "9:16" | "16:9" | "4:5";
  seed?: number;
  model?: "flux" | "flux-realism" | "flux-anime" | "turbo";
}

export function buildImageUrl(options: GenerateImageOptions): string {
  const { prompt, aspectRatio = "1:1", seed = Math.floor(Math.random() * 1000000), model = "flux" } = options;

  let width = options.width;
  let height = options.height;

  if (!width || !height) {
    switch (aspectRatio) {
      case "9:16": // Instagram Stories, Reels, TikTok, Shorts
        width = 720;
        height = 1280;
        break;
      case "16:9": // YouTube, X/Twitter Landscape, LinkedIn Header
        width = 1280;
        height = 720;
        break;
      case "4:5": // Instagram Portrait Feed
        width = 1080;
        height = 1350;
        break;
      case "1:1": // Instagram Square, Facebook
      default:
        width = 1024;
        height = 1024;
        break;
    }
  }

  const encodedPrompt = encodeURIComponent(prompt.trim());
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&model=${model}&nologo=true`;
}

export async function generateSocialImage(
  prompt: string,
  aspectRatio: "1:1" | "9:16" | "16:9" | "4:5" = "1:1"
): Promise<{ url: string; prompt: string }> {
  const url = buildImageUrl({ prompt, aspectRatio });
  return { url, prompt };
}

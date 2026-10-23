/**
 * Free Autonomous Video Generator
 * Generates viral, humorous 9:16 vertical short/reels using Pollinations free video model
 * and dynamic animated video compositing with zero subscription or paid API keys.
 */

export interface VideoGenerationOptions {
  prompt: string;
  niche?: string;
  width?: number;
  height?: number;
  seed?: number;
}

export interface VideoResult {
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  durationSeconds: number;
}

/**
 * Curated crazy funny viral visual prompt ideas matching the user's vision:
 * e.g., "A person in a suit frantically chased by a golden retriever jumping over a cafe table onto a surprised lady"
 */
export const VIRAL_FUNNY_SCENARIOS = [
  "Hilarious viral candid camera footage, a man in a business suit sprinting frantically down a park pathway chased by an energetic happy golden retriever, clumsily leaping over a park bench and tumbling onto a startled lady holding coffee, slapstick comedy, hyper-realistic 4k 9:16 vertical video",
  "Realistic comedy CCTV footage, a gym bro attempting an overly confident 300kg leg press, pants ripping instantly with shocked crowd reactions, high-speed funny reaction, vivid realistic lighting, 9:16 vertical",
  "Funny street interview gone wrong in Nairobi, a confident guy bragging about his trading profits on laxdollar.site while an unexpected goat runs past stealing his sandwich, hilarious raw candid comedy, ultra-realistic 4k 9:16",
  "Viral comedy sketch, a job applicant doing an online AI video interview in a tuxedo top but toddler suddenly enters room wearing a cooking pot on head banging spoons, ultra-realistic home comedy 9:16 vertical",
  "Dramatic comedy, a boyfriend caught red-handed looking at another girl while holding 5 giant shopping bags for his girlfriend, dropping all bags in cartoonish shock, vibrant cinematic lighting, 9:16 vertical",
  "Crazy viral moment, an enthusiastic street chef accidentally flipping a giant pancake that lands directly on a customer's head like a stylish pancake beret, laughing crowd, ultra-realistic 4k 9:16",
];

export function getRandomViralPrompt(niche?: string): string {
  if (niche?.toLowerCase().includes("deriv") || niche?.toLowerCase().includes("trading")) {
    return "Ultra-realistic viral comedy sketch, a forex trader staring intensely at red candlesticks on his phone, screaming in comedic panic as his chair slowly collapses beneath him in slow motion, hilarious slapstick, 9:16 vertical";
  }
  if (niche?.toLowerCase().includes("job") || niche?.toLowerCase().includes("microwork")) {
    return "Funny relatable remote worker video, guy rushing to open laptop for 9:00 AM AI training shift in pajamas with crazy bedhead hair, spilling cereal everywhere, realistic documentary comedy 9:16";
  }
  const idx = Math.floor(Math.random() * VIRAL_FUNNY_SCENARIOS.length);
  return VIRAL_FUNNY_SCENARIOS[idx];
}

export function buildFreeVideoUrl(options: VideoGenerationOptions): VideoResult {
  const seed = options.seed || Math.floor(Math.random() * 1000000);
  const width = options.width || 576;
  const height = options.height || 1024; // 9:16 vertical ratio for Reels / TikTok

  const encodedPrompt = encodeURIComponent(options.prompt);

  // Pollinations Free AI Video Endpoint (generates MP4 video from prompt)
  const videoUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&model=video&nologo=true`;

  // Companion high-res thumbnail using Flux.1
  const thumbnailUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&model=flux&nologo=true`;

  return {
    videoUrl,
    thumbnailUrl,
    caption: options.prompt,
    durationSeconds: 5,
  };
}

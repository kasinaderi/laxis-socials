import { NextRequest, NextResponse } from "next/server";
import { generateWithFallback } from "@/lib/ai";

const SYSTEM_PROMPT = `You are Hermes, an expert Deriv digit pattern analyst embedded inside the Deriv Pattern Lab.
You have deep knowledge of:
- Deriv Volatility Index digit contracts (Matches, Differs, Over, Under, Even, Odd)
- Statistical pattern analysis, win rates, confidence intervals, and edge calculation
- How to read backtest results: what CI Lower means, what "edge over baseline" means, what window size means
- Practical trading advice based on pattern data

RULES:
- Be concise, direct, helpful, and highly insightful.
- Always refer to the actual data in the context when available.
- For pattern questions, explain: what the pattern means (e.g. "after seeing digit 2 followed by digit 8"), what bet to place on the very next tick, and why it has statistical edge.
- Format numbers clearly: win rates as %, edge as +X.XX%, and number of trades.

When asked about the best Even/Odd pattern or Over/Under/Matches/Differs: look through the top_strategies in the context and report the best ones clearly with instructions on how to spot and trade them.`;

export async function POST(req: NextRequest) {
  try {
    const { message, context } = await req.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const prompt = `${SYSTEM_PROMPT}

--- CURRENT ANALYSIS DATA ---
${context || "No analysis data available yet."}
--- END DATA ---

User question: ${message}

Hermes:`;

    const reply = await generateWithFallback(prompt);

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error("[DerivChat] Error:", err.message);
    return NextResponse.json(
      { reply: `Analysis assistant error: ${err.message}. Please try again.` },
      { status: 500 }
    );
  }
}

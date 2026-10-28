import { NextRequest, NextResponse } from "next/server";
import { generateWithFallback } from "@/lib/ai";
import { db } from "@/db";
import { derivPatternMemory, derivAnalyses } from "@/db/schema";
import { desc } from "drizzle-orm";

const SYSTEM_PROMPT = `You are Hermes, an expert Deriv digit pattern analyst and AI strategist embedded inside the Deriv Pattern Lab.
You have direct, continuous access to the lab's persistent SQLite/Turso database memory (deriv_pattern_memory and deriv_analyses).

Your capabilities:
1. CONTINUOUS LEARNING MEMORY: You remember patterns across multiple analysis sessions, days, and market regimes.
2. CROSS-VOLATILITY INVARIANCE: You can identify patterns that work consistently across multiple Volatility Indices (e.g., patterns that hold high win rates in both R_10 and R_50_1S).
3. 10-FOLD MULTI-BACKTEST INTERPRETATION: You understand walk-forward cross-validation, stability grades (ELITE, ROBUST, LEARNING, DECAYING), and peak golden market zones.
4. MARKET RANKING: You guide the user to the single best market to trade right now based on multi-market scans (e.g. comparing 1s markets vs standard markets).

RULES:
- Be concise, direct, helpful, and highly insightful.
- When asked about patterns, ALWAYS cite the actual memory data provided below: sessions observed, lifetime win rate, stability grade, and which symbols it works on.
- When asked which market to trade: pick the clear #1 ranked market from the scan or memory and give the exact pattern sequence to wait for.
- Format numbers clearly: win rates as %, edge as +X.XX%, and number of trades.
- For physical trading instructions: give the exact trigger sequence (e.g. "Wait for tick sequence [2] -> [8], then immediately bet DIFFERS 4 for 1 tick duration").`;

interface CrossVolEntry {
  pattern: string;
  tradeType: string;
  symbols: string[];
  totalTrades: number;
  totalWins: number;
  lifetimeWr: number;
  bestGrade: string;
  sessions: number;
}

export async function POST(req: NextRequest) {
  try {
    const { message, context } = await req.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // ── 1. Query Persistent Pattern Memory from DB ────────────────────────────
    let memorySummary = "No long-term memory records yet.";
    let crossVolSummary = "No cross-volatility patterns observed yet.";
    let recentScanSummary = "";

    try {
      const allMemories = await db
        .select()
        .from(derivPatternMemory)
        .orderBy(desc(derivPatternMemory.sessionsObserved), desc(derivPatternMemory.lifetimeWinRate))
        .limit(60);

      if (allMemories.length > 0) {
        // Group patterns to identify Cross-Volatility Invariant patterns
        const groupMap: Record<string, CrossVolEntry> = {};

        for (const m of allMemories) {
          const key = `${m.pattern}:${m.tradeType}`;
          if (!groupMap[key]) {
            groupMap[key] = {
              pattern: m.pattern,
              tradeType: m.tradeType,
              symbols: [],
              totalTrades: 0,
              totalWins: 0,
              lifetimeWr: 0,
              bestGrade: m.stabilityGrade,
              sessions: 0,
            };
          }
          if (!groupMap[key].symbols.includes(m.symbol)) {
            groupMap[key].symbols.push(m.symbol);
          }
          groupMap[key].totalTrades += m.lifetimeTrades;
          groupMap[key].totalWins += m.lifetimeWins;
          groupMap[key].sessions += m.sessionsObserved;
          if (m.stabilityGrade === "ELITE" || (m.stabilityGrade === "ROBUST" && groupMap[key].bestGrade !== "ELITE")) {
            groupMap[key].bestGrade = m.stabilityGrade;
          }
        }

        // Calculate aggregated cross-volatility win rates
        const crossVolList = Object.values(groupMap)
          .map(g => ({
            ...g,
            lifetimeWr: Math.round((g.totalWins / Math.max(1, g.totalTrades)) * 1000) / 10,
          }))
          .sort((a, b) => b.symbols.length - a.symbols.length || b.lifetimeWr - a.lifetimeWr);

        // Find multi-symbol patterns
        const multiVol = crossVolList.filter(g => g.symbols.length >= 2);
        if (multiVol.length > 0) {
          crossVolSummary = multiVol.slice(0, 8).map((g, idx) =>
            `${idx + 1}. Pattern ${g.pattern} ➔ ${g.tradeType} | Tested across ${g.symbols.join(", ")} (${g.symbols.length} markets) | Lifetime WR: ${g.lifetimeWr}% (${g.totalWins}/${g.totalTrades} wins) | Sessions: ${g.sessions} | Grade: ${g.bestGrade}`
          ).join("\n");
        } else {
          crossVolSummary = "Patterns currently observed in single markets. As you scan more volatility markets (like All 1s Markets), cross-market invariant patterns will populate here.";
        }

        // Top 10 memory highlights
        memorySummary = allMemories.slice(0, 10).map((m, idx) =>
          `#${idx + 1} [${m.symbol}] Pattern ${m.pattern} ➔ ${m.tradeType} | Grade: ${m.stabilityGrade} | Sessions: ${m.sessionsObserved} | Lifetime WR: ${(parseFloat(m.lifetimeWinRate) * 100).toFixed(1)}% (${m.lifetimeWins}/${m.lifetimeTrades} trades) | Peak: ${m.bestMarketArea || "Overall"}`
        ).join("\n");
      }

      // Recent 5 analyses summary
      const recentAnalyses = await db
        .select()
        .from(derivAnalyses)
        .orderBy(desc(derivAnalyses.createdAt))
        .limit(5);

      if (recentAnalyses.length > 0) {
        recentScanSummary = recentAnalyses.map(a =>
          `- [${a.createdAt.slice(0, 16)}] Symbol: ${a.symbol} | Ticks: ${a.tickCount} | Status: ${a.status} | Summary: ${a.summary || "No summary"}`
        ).join("\n");
      }
    } catch (dbErr: any) {
      console.warn("[DerivChat] DB memory read error (non-fatal):", dbErr.message);
    }

    const prompt = `${SYSTEM_PROMPT}

=== CUMULATIVE PATTERN LEARNING DATABASE MEMORY ===
Total Learned Patterns: In Persistent Memory
Top Memory Patterns:
${memorySummary}

CROSS-VOLATILITY INVARIANT PATTERNS (Works Across Multiple Indices):
${crossVolSummary}

RECENT LAB ANALYSIS SESSIONS:
${recentScanSummary || "None logged yet."}
=== END DATABASE MEMORY ===

--- CURRENT FRONTEND LAB CONTEXT ---
${context || "No active scan loaded on screen."}
--- END CURRENT CONTEXT ---

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

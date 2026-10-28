import { NextRequest, NextResponse } from "next/server";
import { fetchDerivTicksLive } from "@/lib/deriv-fetcher";

/**
 * GET /api/deriv/ticks?symbol=R_10&count=5000
 * Fetches live tick history directly from Deriv cluster.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol") || "R_10";
    const count = Math.min(10000, Math.max(50, parseInt(searchParams.get("count") || "5000", 10)));

    const result = await fetchDerivTicksLive(symbol, count);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch ticks from Deriv" },
      { status: 500 }
    );
  }
}

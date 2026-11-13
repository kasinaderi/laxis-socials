import { NextResponse } from "next/server";
import { tickScheduler } from "@/lib/scheduler";

export async function GET() {
  try {
    const result = await tickScheduler();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}

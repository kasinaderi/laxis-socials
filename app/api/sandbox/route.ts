import { NextResponse } from "next/server";
import { getOrCreateAgentSandbox, toggleUserTakeover, pauseAgentSandbox } from "@/lib/sandbox";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId") || "fb_laxdollar";
    const campaignId = searchParams.get("campaignId") || "default_campaign";

    // Strictly read-only on page loads: launchIfMissing = false to protect credits!
    const sandbox = await getOrCreateAgentSandbox(campaignId, agentId, false);
    return NextResponse.json(sandbox);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { action, agentId = "fb_laxdollar", campaignId = "default_campaign", value, url } = await req.json();

    if (action === "takeover") {
      // Explicit takeover requests sandbox start
      const sandbox = await getOrCreateAgentSandbox(campaignId, agentId, true);
      const res = toggleUserTakeover(campaignId, agentId, Boolean(value));
      return NextResponse.json({ ...sandbox, ...res });
    } else if (action === "pause" || action === "save_and_sleep") {
      const res = await pauseAgentSandbox(campaignId, agentId);
      return NextResponse.json({ ...res, savedToVault: true });
    } else if (action === "resume" || action === "turn_on") {
      // Explicit launch requested by user clicking the toggle button
      const res = await getOrCreateAgentSandbox(campaignId, agentId, true);
      return NextResponse.json(res);
    } else if (action === "navigate") {
      const sandbox = await getOrCreateAgentSandbox(campaignId, agentId, true);
      const activeSb = (global as any).__activeSandboxes?.get(`${campaignId}_${agentId}`);
      if (activeSb && typeof activeSb.open === "function" && url) {
        await activeSb.open(url);
      }
      return NextResponse.json({ success: true, url, streamUrl: sandbox.streamUrl });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

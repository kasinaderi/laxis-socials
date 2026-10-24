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
    const body = await req.json();
    const { action, agentId = "fb_laxdollar", campaignId = "default_campaign", value, url, text, key } = body;

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
    } else if (action === "type") {
      const activeSb = (global as any).__activeSandboxes?.get(`${campaignId}_${agentId}`);
      if (activeSb && text) {
        try {
          if (typeof activeSb.write === "function") {
            await activeSb.write(text);
          } else if (typeof activeSb.commands?.run === "function") {
            await activeSb.commands.run(`xdotool type --delay 20 "${text.replace(/"/g, '\\"')}"`);
          }
        } catch (typeErr) {
          console.warn("[Sandbox] type error:", typeErr);
        }
      }
      return NextResponse.json({ success: true, typed: text });
    } else if (action === "key") {
      const activeSb = (global as any).__activeSandboxes?.get(`${campaignId}_${agentId}`);
      if (activeSb && key) {
        try {
          if (typeof activeSb.press === "function") {
            await activeSb.press(key);
          } else if (typeof activeSb.commands?.run === "function") {
            await activeSb.commands.run(`xdotool key ${key}`);
          }
        } catch (keyErr) {
          console.warn("[Sandbox] key error:", keyErr);
        }
      }
      return NextResponse.json({ success: true, key });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

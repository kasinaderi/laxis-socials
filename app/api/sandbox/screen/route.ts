import { NextResponse } from "next/server";
import { isFreestyleAgent } from "@/lib/sandbox";
import { getFreestyleConfigForAgent } from "@/lib/freestyle-sandbox";
import { Freestyle } from "freestyle";
import { db } from "@/db";
import { agentSandboxes } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const FREESTYLE_API_KEY =
  process.env.FREESTYLE_API_KEY ||
  "HJvPGG99GGP8NFW3auYy8o-5PBhkqJYwCsHPye82jT3ttbFs6E3eBdPmpMJaNCg37Bz";

const FALLBACK_VM_ID = "vm-3cb555595b524fd8939eee9e5200a353";

function getFreestyleClient() {
  return new Freestyle({ apiKey: FREESTYLE_API_KEY });
}

async function getVmRef(freestyle: any, agentId: string) {
  const { slug } = getFreestyleConfigForAgent(agentId);
  try {
    const list = await freestyle.vms.list();
    const rawVm = list.vms.find((v: any) => v.slug === slug);
    if (rawVm) return freestyle.vms.ref(rawVm.id);
  } catch {}
  return freestyle.vms.ref(FALLBACK_VM_ID);
}

// GET /api/sandbox/screen?agentId=ig_shader&campaignId=default_campaign
// Returns a live PNG screenshot of the VM desktop
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId") || "ig_shader";
    const campaignId = searchParams.get("campaignId") || "default_campaign";

    if (!isFreestyleAgent(agentId)) {
      return NextResponse.json({ error: "Not a Freestyle agent" }, { status: 400 });
    }

    // ⚡ FAST PATH: Check DB status first (no network round-trip to Freestyle API).
    // pauseFreestyleSandbox() pre-marks DB as "paused" before the actual pause() call,
    // so this check stops screen polling from waking a VM that is being (or has been) paused.
    try {
      const dbRecord = await db
        .select({ status: agentSandboxes.status })
        .from(agentSandboxes)
        .where(and(eq(agentSandboxes.campaignId, campaignId), eq(agentSandboxes.agentId, agentId)))
        .get();
      if (dbRecord?.status && dbRecord.status !== "running") {
        return NextResponse.json(
          { error: "VM is paused", state: dbRecord.status },
          { status: 503, headers: { "X-VM-State": dbRecord.status, "Cache-Control": "no-store" } }
        );
      }
    } catch {
      // DB check failed — fall through to API state check
    }

    const freestyle = getFreestyleClient();
    const vm = await getVmRef(freestyle, agentId);

    // ⚠️ CRITICAL: Check VM state BEFORE exec — calling exec on a paused VM auto-wakes it.
    // We must bail out early if the VM is not running to prevent the pause-bounce-back bug.
    try {
      const vmState = await vm.data();
      if (vmState?.state && vmState.state !== "running") {
        return NextResponse.json(
          { error: "VM is paused", state: vmState.state },
          {
            status: 503,
            headers: {
              "X-VM-State": vmState.state,
              "Cache-Control": "no-store, no-cache, must-revalidate",
            },
          }
        );
      }
    } catch {
      // If we can't check state, skip — better to try screenshot than to block forever
    }

    // Take a screenshot via scrot and return raw PNG bytes
    const res = await vm.exec({
      command: "DISPLAY=:0 scrot -o /tmp/live_shot.png 2>/dev/null && base64 -w 0 /tmp/live_shot.png",
      linuxUser: "root",
      timeoutMs: 10_000,
    });

    const b64 = (res.stdout || "").trim();
    if (!b64) {
      return NextResponse.json({ error: "No screenshot available" }, { status: 503 });
    }

    const pngBuffer = Buffer.from(b64, "base64");
    return new Response(pngBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-VM-State": "running",
      },
    });
  } catch (err: any) {
    console.error("[Screen] Screenshot error:", err?.message);
    return NextResponse.json({ error: err?.message || "Screenshot failed" }, { status: 500 });
  }
}

// POST /api/sandbox/screen — send mouse/keyboard input to the VM
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { agentId = "ig_shader", action, x, y, button, key, text, scrollY } = body;

    if (!isFreestyleAgent(agentId)) {
      return NextResponse.json({ error: "Not a Freestyle agent" }, { status: 400 });
    }

    const freestyle = getFreestyleClient();
    const vm = await getVmRef(freestyle, agentId);

    // ⚠️ CRITICAL: Do NOT send input to a paused VM — exec auto-wakes it
    try {
      const vmState = await vm.data();
      if (vmState?.state && vmState.state !== "running") {
        return NextResponse.json({ error: "VM is paused", state: vmState.state }, { status: 503 });
      }
    } catch {}


    let cmd = "";

    if (action === "click" && x !== undefined && y !== undefined) {
      const btn = button === "right" ? 3 : 1;
      cmd = `DISPLAY=:0 xdotool mousemove ${Math.round(x)} ${Math.round(y)} click ${btn}`;
    } else if (action === "move" && x !== undefined && y !== undefined) {
      cmd = `DISPLAY=:0 xdotool mousemove ${Math.round(x)} ${Math.round(y)}`;
    } else if (action === "dblclick" && x !== undefined && y !== undefined) {
      cmd = `DISPLAY=:0 xdotool mousemove ${Math.round(x)} ${Math.round(y)} click --repeat 2 1`;
    } else if (action === "scroll" && scrollY !== undefined) {
      const btn = scrollY > 0 ? 5 : 4; // 4=up, 5=down
      cmd = `DISPLAY=:0 xdotool click ${btn}`;
    } else if (action === "key" && key) {
      cmd = `DISPLAY=:0 xdotool key ${key}`;
    } else if (action === "type" && text) {
      const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      cmd = `DISPLAY=:0 xdotool type --delay 10 "${escaped}"`;
    } else if (action === "navigate" && text) {
      // Open URL in Chrome on the VM
      cmd = `DISPLAY=:0 nohup google-chrome --no-sandbox "${text.replace(/"/g, '\\"')}" >/dev/null 2>&1 &`;
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    await vm.exec({ command: cmd, linuxUser: "root", timeoutMs: 8_000 });
    return NextResponse.json({ success: true, action });
  } catch (err: any) {
    console.error("[Screen] Input error:", err?.message);
    return NextResponse.json({ error: err?.message || "Input failed" }, { status: 500 });
  }
}

/**
 * /api/hermes/record
 *
 * POST { action: "start",  agentId, routeName }   — start CDP listener inside VM, name the route
 * POST { action: "stop",   agentId }               — stop listener, parse + save route to DB
 * GET  ?agentId=xxx                                — list all saved golden routes for an agent
 * DELETE { agentId, routeName }                    — delete a saved route
 */

import { NextRequest, NextResponse } from "next/server";
import { getAgentHermesRoutes, saveAgentHermesRoutes } from "@/lib/hermes";
import { getOrCreateAgentSandbox } from "@/lib/sandbox";

const campaignId = "default_campaign";

function getActiveSandbox(agentId: string) {
  const map: Map<string, any> = (global as any).__activeSandboxes;
  if (!map) return null;
  return map.get(`${campaignId}_${agentId}`) || null;
}

// ── In-VM CDP recorder script ──────────────────────────────────────────────
const RECORDER_PY = `#!/usr/bin/env python3
"""
Hermes Golden Route Recorder
Hooks into Chrome DevTools Protocol to capture navigation & click events
and saves them as a replayable route template.
"""
import json, time, sys, os, urllib.request, threading, signal

CDP_HOST = "http://localhost:9222"
LOG_FILE = "/tmp/hermes_recorder.log"
ROUTE_FILE = "/tmp/hermes_recorded_route.json"

steps = []
stop_flag = threading.Event()

def log(msg):
    with open(LOG_FILE, "a") as f:
        f.write(f"[{time.strftime('%X')}] {msg}\\n")

def get_ws_url():
    try:
        r = urllib.request.urlopen(f"{CDP_HOST}/json", timeout=5)
        tabs = json.loads(r.read())
        for t in tabs:
            if t.get("type") == "page":
                return t.get("webSocketDebuggerUrl", "")
    except Exception as e:
        log(f"CDP connect error: {e}")
    return ""

def capture_current_url():
    try:
        r = urllib.request.urlopen(f"{CDP_HOST}/json", timeout=3)
        tabs = json.loads(r.read())
        for t in tabs:
            if t.get("type") == "page":
                return t.get("url", "")
    except:
        pass
    return ""

def poll_loop():
    last_url = ""
    log("Recorder polling started")
    while not stop_flag.is_set():
        url = capture_current_url()
        if url and url != last_url and not url.startswith("devtools://"):
            steps.append({"action": "navigate", "url": url, "ts": time.time()})
            log(f"Captured navigate: {url}")
            last_url = url
        time.sleep(1.5)

def handle_signal(sig, frame):
    stop_flag.set()

signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)

# Start polling thread
t = threading.Thread(target=poll_loop, daemon=True)
t.start()
log("Hermes Recorder running. Send SIGTERM to stop.")

# Write PID so the stop action can kill us
with open("/tmp/hermes_recorder.pid", "w") as f:
    f.write(str(os.getpid()))

# Wait for stop signal
stop_flag.wait()
t.join(timeout=2)

# Deduplicate consecutive same-URL navigations
clean_steps = []
for s in steps:
    if not clean_steps or clean_steps[-1]["url"] != s.get("url"):
        clean_steps.append(s)

route = {"steps": clean_steps, "hits": 0, "recorded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")}
with open(ROUTE_FILE, "w") as f:
    json.dump(route, f, indent=2)

log(f"Route saved with {len(clean_steps)} steps.")
print(json.dumps({"ok": True, "steps": len(clean_steps), "route_file": ROUTE_FILE}))
`;

// ── Helpers ──────────────────────────────────────────────────────────────
async function runInVM(sb: any, cmd: string, timeout = 15_000): Promise<string> {
  try {
    const r = await sb.commands.run(cmd, { timeout }).catch((e: any) => ({ stdout: "", stderr: e?.message }));
    return (r?.stdout || "").trim();
  } catch {
    return "";
  }
}

// ── GET — list saved routes for an agent ─────────────────────────────────
export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get("agentId") || "";
  if (!agentId) {
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  }
  const routes = await getAgentHermesRoutes(agentId);
  const list = Object.entries(routes)
    .filter(([k]) => k.startsWith("golden_"))
    .map(([k, v]: [string, any]) => ({
      routeName: k.replace("golden_", ""),
      key: k,
      steps: v?.steps?.length || 0,
      hits: v?.hits || 0,
      recordedAt: v?.recorded_at || null,
    }));
  return NextResponse.json({ agentId, routes: list, total: list.length });
}

// ── DELETE — remove a saved route ─────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { agentId, routeName } = await req.json();
  if (!agentId || !routeName) {
    return NextResponse.json({ error: "agentId and routeName required" }, { status: 400 });
  }
  const routes = await getAgentHermesRoutes(agentId);
  const key = `golden_${routeName}`;
  if (!routes[key]) return NextResponse.json({ error: "Route not found" }, { status: 404 });
  delete routes[key];
  await saveAgentHermesRoutes(agentId, routes);
  return NextResponse.json({ success: true, deleted: routeName });
}

// ── POST — start or stop recording ────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, agentId, routeName } = body;

    if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });

    let sb = getActiveSandbox(agentId);
    if (!sb) {
      // Auto-wake the sandbox so the user doesn't have to manually click Turn On first
      await getOrCreateAgentSandbox(campaignId, agentId, true);
      sb = getActiveSandbox(agentId);
    }

    if (!sb) {
      return NextResponse.json(
        { error: `${agentId} workstation could not be started. Check credentials.` },
        { status: 500 }
      );
    }

    // ── START ─────────────────────────────────────────────────────────────
    if (action === "start") {
      if (!routeName || !routeName.trim()) {
        return NextResponse.json({ error: "routeName is required to start recording" }, { status: 400 });
      }
      const safeName = routeName.trim().replace(/[^a-z0-9_\-]/gi, "_").toLowerCase();

      // Write recorder script into VM
      const escaped = RECORDER_PY.replace(/'/g, "'\\''");
      await runInVM(sb, `cat > /tmp/hermes_recorder.py << 'PYEOF'\n${RECORDER_PY}\nPYEOF`, 10_000);

      // Kill any existing recorder
      await runInVM(sb, `pkill -f hermes_recorder.py 2>/dev/null || true; sleep 0.5`);

      // Clear old route file
      await runInVM(sb, `rm -f /tmp/hermes_recorded_route.json /tmp/hermes_recorder.pid /tmp/hermes_recorder.log`);

      // Start recorder in background
      await runInVM(sb, `nohup python3 /tmp/hermes_recorder.py > /tmp/hermes_recorder.log 2>&1 &`, 5_000);
      await new Promise(r => setTimeout(r, 1200));

      // Store pending route name in VM
      await runInVM(sb, `echo '${safeName}' > /tmp/hermes_pending_route_name.txt`);

      return NextResponse.json({
        success: true,
        message: `Recording started for "${safeName}" on ${agentId}. Navigate in Chrome — every page you visit is captured. Click Stop & Save when done.`,
        agentId,
        routeName: safeName,
      });
    }

    // ── STOP ──────────────────────────────────────────────────────────────
    if (action === "stop") {
      // Read the pending route name
      const pendingName = await runInVM(sb, `cat /tmp/hermes_pending_route_name.txt 2>/dev/null || echo "unnamed_route"`);
      const safeName = (pendingName || "unnamed_route").trim();

      // Send SIGTERM to recorder to flush & save
      await runInVM(sb, `pid=$(cat /tmp/hermes_recorder.pid 2>/dev/null); [ -n "$pid" ] && kill -TERM $pid 2>/dev/null; sleep 2`);

      // Read the recorded route JSON
      const routeJson = await runInVM(sb, `cat /tmp/hermes_recorded_route.json 2>/dev/null || echo "{}"`);
      let recorded: any = {};
      try { recorded = JSON.parse(routeJson); } catch { recorded = {}; }

      const steps = recorded?.steps || [];
      if (steps.length === 0) {
        return NextResponse.json({
          success: false,
          message: "No steps were captured. Make sure Chrome was open and you navigated to at least one page while recording.",
        });
      }

      // Save to Turso DB under the agent's routes
      const existing = await getAgentHermesRoutes(agentId);
      const key = `golden_${safeName}`;
      existing[key] = { ...recorded, hits: existing[key]?.hits || 0 };
      await saveAgentHermesRoutes(agentId, existing);

      // Cleanup VM temp files
      await runInVM(sb, `rm -f /tmp/hermes_recorder.py /tmp/hermes_recorder.pid /tmp/hermes_pending_route_name.txt /tmp/hermes_recorded_route.json`);

      return NextResponse.json({
        success: true,
        agentId,
        routeName: safeName,
        stepsRecorded: steps.length,
        steps,
        message: `Golden route "${safeName}" saved with ${steps.length} step(s). Hermes will use this route automatically during autopilot.`,
      });
    }

    return NextResponse.json({ error: "Invalid action. Use: start | stop" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

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
    } else if (action === "paste") {
      const sandbox = await getOrCreateAgentSandbox(campaignId, agentId, true);
      const activeSb = (global as any).__activeSandboxes?.get(`${campaignId}_${agentId}`);
      if (activeSb && text) {
        try {
          // 1. Direct type/write into active window
          if (typeof activeSb.write === "function") {
            await activeSb.write(text);
          } else if (typeof activeSb.commands?.run === "function") {
            await activeSb.commands.run(`xdotool type --delay 10 "${text.replace(/"/g, '\\"')}"`);
          }

          // 2. Also populate X11 clipboard so Ctrl+V or right-click paste works inside desktop
          if (activeSb.commands?.run) {
            await activeSb.commands.run(
              `python3 -c "import subprocess; p = subprocess.Popen(['xclip', '-selection', 'clipboard'], stdin=subprocess.PIPE); p.communicate(input=${JSON.stringify(text)}.encode('utf-8'))" 2>/dev/null || true`
            );
          }
        } catch (err: any) {
          console.warn("[Sandbox] paste error:", err);
        }
      }
      return NextResponse.json({ success: true, pasted: text.slice(0, 50) });
    } else if (action === "command" || action === "exec") {
      const sandbox = await getOrCreateAgentSandbox(campaignId, agentId, true);
      const activeSb = (global as any).__activeSandboxes?.get(`${campaignId}_${agentId}`);
      let stdout = "";
      let stderr = "";
      let exitCode = 0;
      const cmdToRun = body.command || text;
      if (activeSb && cmdToRun) {
        try {
          const cmdRes = await activeSb.commands.run(cmdToRun);
          stdout = cmdRes.stdout || "";
          stderr = cmdRes.stderr || "";
          exitCode = cmdRes.exitCode ?? 0;
        } catch (cmdErr: any) {
          stderr = cmdErr.message || "Command execution failed";
          exitCode = 1;
        }
      }
      return NextResponse.json({ success: exitCode === 0, stdout, stderr, exitCode });
    } else if (action === "install_chrome") {
      const sandbox = await getOrCreateAgentSandbox(campaignId, agentId, true);
      const activeSb = (global as any).__activeSandboxes?.get(`${campaignId}_${agentId}`);
      if (activeSb) {
        try {
          const script = `
            export DEBIAN_FRONTEND=noninteractive
            sudo apt-get update -qq
            sudo apt-get install -y -qq wget curl ca-certificates xclip xdotool
            if ! command -v google-chrome &> /dev/null && ! command -v google-chrome-stable &> /dev/null; then
              wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
              sudo dpkg -i /tmp/chrome.deb || sudo apt-get install -f -y -qq
              rm -f /tmp/chrome.deb
            fi
            echo "Installed Google Chrome: $(google-chrome --version || echo 'Success')"
          `;
          const cmdRes = await activeSb.commands.run(script);
          return NextResponse.json({
            success: true,
            message: "Google Chrome installed successfully",
            output: cmdRes.stdout || cmdRes.stderr,
          });
        } catch (installErr: any) {
          return NextResponse.json({ success: false, error: installErr.message }, { status: 500 });
        }
      }
      return NextResponse.json({ error: "Sandbox not active" }, { status: 400 });
    } else if (action === "open_chrome") {
      const sandbox = await getOrCreateAgentSandbox(campaignId, agentId, true);
      const activeSb = (global as any).__activeSandboxes?.get(`${campaignId}_${agentId}`);
      if (activeSb && activeSb.commands?.run) {
        await activeSb.commands.run(`nohup google-chrome --no-sandbox "${url || "https://google.com"}" >/dev/null 2>&1 &`);
      }
      return NextResponse.json({ success: true, url: url || "https://google.com" });
    } else if (action === "init_all") {
      const agentIds = ["fb_laxdollar", "fb_jotrainer", "fb_contentor", "ig_real", "ig_shader", "analytics"];
      const results = await Promise.allSettled(
        agentIds.map((id) => getOrCreateAgentSandbox(campaignId, id, true))
      );
      return NextResponse.json({ success: true, initialized: results.map((r, i) => ({ agentId: agentIds[i], status: r.status })) });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { Sandbox } from "@e2b/desktop";
import { initSandboxBrowserAndCdp } from "../lib/cdp";
import { checkHermesStatus } from "../lib/hermes";
import { getFreestyleClient } from "../lib/freestyle-sandbox";

const FREESTYLE_VM_ID = "vm-3cb555595b524fd8939eee9e5200a353";

// E2B Sandboxes
const E2B_AGENTS = [
  { agentId: "fb_laxdollar", sandboxId: "ie8j3xdytp0na3rkalc64" },
  { agentId: "fb_jotrainer", sandboxId: "iwusp9b7whv1c0o0mrdh7" },
  { agentId: "fb_contentor", sandboxId: "ie3chrxl96302vbgnkth3" },
  { agentId: "ig_real", sandboxId: "i8bfuknxn4s1imao7tf6a" },
  { agentId: "analytics", sandboxId: "imdb9jj4iqzq1d2dj8qnh" },
];

async function syncAll() {
  console.log("==========================================");
  console.log("SYNCING ALL AGENTS WITH LATEST CDP & HERMES");
  console.log("==========================================\n");

  // 1. Sync Freestyle VM (ig_shader)
  try {
    console.log(`[1/6] Syncing Freestyle VM ig_shader (${FREESTYLE_VM_ID})...`);
    const freestyle = await getFreestyleClient();
    const vmRef = freestyle.vms.ref(FREESTYLE_VM_ID);
    const vmData = await vmRef.data().catch(() => null);
    console.log(`  State: ${vmData?.state || "unknown"}`);

    const freestyleWrapper = {
      commands: {
        run: async (cmd) => {
          const res = await vmRef.exec({ command: cmd, linuxUser: "user", timeoutMs: 30000 });
          return { stdout: res.stdout || "", stderr: res.stderr || "", exitCode: res.exitCode };
        }
      }
    };

    await initSandboxBrowserAndCdp(freestyleWrapper, "ig_shader");
    const hStatus = await checkHermesStatus(freestyleWrapper);
    console.log(`  Hermes configured: ${hStatus.configured} (${hStatus.version})`);

    // Install a systemd pre-stop hook so dashboard-triggered pauses also kill the tunnel cleanly
    console.log("  Installing cloudflared pre-stop hook...");
    const preStopService = `[Unit]
Description=Stop Cloudflare tunnel before Freestyle VM pause
DefaultDependencies=no
Before=shutdown.target reboot.target halt.target suspend.target

[Service]
Type=oneshot
ExecStart=/bin/systemctl stop cloudflared-tunnel
RemainAfterExit=yes

[Install]
WantedBy=halt.target reboot.target shutdown.target suspend.target`;

    await vmRef.exec({
      command: `cat > /etc/systemd/system/stop-tunnel-on-pause.service << 'SVCEOF'\n${preStopService}\nSVCEOF\nsystemctl daemon-reload\nsystemctl enable stop-tunnel-on-pause.service`,
      linuxUser: "root",
      timeoutMs: 10000,
    }).catch((e) => console.log("  pre-stop hook notice:", e.message));
    console.log("  ✓ Pre-stop hook installed — tunnel will auto-stop on any pause/shutdown");

    // Safely freeze back into $0 compute mode
    await vmRef.exec({ command: "systemctl stop cloudflared-tunnel", linuxUser: "root", timeoutMs: 5000 }).catch(() => {});
    await vmRef.update({ automaticRestart: false, idleTimeoutSeconds: 300 }).catch(() => {});
    await vmRef.pause();
    console.log("  ✓ ig_shader synced & safely frozen in $0 compute mode!\n");
  } catch (err) {
    console.error("  ❌ ig_shader sync error:", err.message, "\n");
  }

  // 2. Sync E2B Agents
  for (let i = 0; i < E2B_AGENTS.length; i++) {
    const { agentId, sandboxId } = E2B_AGENTS[i];
    console.log(`[${i + 2}/6] Syncing ${agentId} (${sandboxId})...`);
    try {
      const sb = await Sandbox.connect(sandboxId);
      await initSandboxBrowserAndCdp(sb, agentId);
      const hStatus = await checkHermesStatus(sb);
      console.log(`  Hermes configured: ${hStatus.configured} (${hStatus.version})`);
      
      // Pause after sync to preserve compute
      console.log(`  Safely pausing ${agentId} into $0 compute mode...`);
      await sb.pause();
      console.log(`  ✓ ${agentId} synced & paused successfully!\n`);
    } catch (err) {
      console.error(`  ❌ ${agentId} sync notice:`, err.message, "\n");
    }
  }

  console.log("==========================================");
  console.log("ALL AGENTS FULLY SYNCED & READY!");
  console.log("==========================================");
}

syncAll();

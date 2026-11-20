import { Freestyle } from "freestyle";
import { db } from "@/db";
import { agentSandboxes } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { initSandboxBrowserAndCdp } from "./cdp";
import { SandboxStatusInfo } from "./sandbox";

const apiKey =
  process.env.FREESTYLE_API_KEY ||
  "HJvPGG99GGP8NFW3auYy8o-5PBhkqJYwCsHPye82jT3ttbFs6E3eBdPmpMJaNCg37Bz";

export function getFreestyleConfigForAgent(agentId: string) {
  const cleanId = agentId.replace(/_/g, "-");
  const slug = `laxis-${cleanId}`;
  const vncDomain = `${slug}-vnc.style.dev`;
  const streamUrl = `https://${vncDomain}/vnc.html?autoconnect=true&reconnect=true&resize=scale&path=websockify`;
  return { slug, vncDomain, streamUrl };
}

export const FREESTYLE_SLUG = "laxis-ig-shader";
export const FREESTYLE_VNC_DOMAIN = "laxis-ig-shader-vnc.style.dev";
export const FREESTYLE_STREAM_URL = `https://${FREESTYLE_VNC_DOMAIN}/vnc.html?autoconnect=true&reconnect=true&resize=scale&path=websockify`;

export interface FreestyleSandboxWrapper {
  sandboxId: string;
  provider: "freestyle";
  vm: any;
  commands: {
    run: (
      cmd: string,
      opts?: { timeout?: number; envs?: Record<string, string>; linuxUser?: string }
    ) => Promise<{
      stdout: string;
      stderr: string;
      exitCode: number;
    }>;
  };
  screenshot: () => Promise<Buffer>;
  pause: () => Promise<void>;
  isRunning: () => Promise<boolean>;
  stream: {
    url: string;
    start: () => Promise<void>;
  };
  getHost: (port: number) => string;
  open: (url: string) => Promise<void>;
  write: (text: string) => Promise<void>;
  press: (key: string) => Promise<void>;
  setTimeout: (ms: number) => Promise<void>;
}

async function getFreestyleClient(): Promise<any> {
  const key = process.env.FREESTYLE_API_KEY || apiKey;
  if (!key) {
    console.warn("[Freestyle] Missing FREESTYLE_API_KEY in environment");
    return null;
  }
  try {
    const { Freestyle } = await import("freestyle");
    return new Freestyle({ apiKey: key });
  } catch (err: any) {
    console.error("[Freestyle] Error instantiating client:", err?.message);
    return null;
  }
}

export function createFreestyleWrapper(
  vmRef: any,
  vmId: string,
  agentId: string = "ig_shader"
): FreestyleSandboxWrapper {
  const { vncDomain, streamUrl } = getFreestyleConfigForAgent(agentId);

  const wrapper: FreestyleSandboxWrapper = {
    sandboxId: vmId,
    provider: "freestyle",
    vm: vmRef,
    commands: {
      run: async (cmd: string, opts?: { timeout?: number; envs?: Record<string, string>; linuxUser?: string }) => {
        try {
          const res = await vmRef.exec({
            command: cmd,
            timeoutMs: opts?.timeout || 180_000,
            env: opts?.envs,
            linuxUser: opts?.linuxUser || "root",
          });
          return {
            stdout: res.stdout || "",
            stderr: res.stderr || "",
            exitCode: res.exitCode ?? 0,
          };
        } catch (err: any) {
          console.warn("[Freestyle] commands.run error:", err?.message);
          return {
            stdout: "",
            stderr: err?.message || "Execution error",
            exitCode: 1,
          };
        }
      },
    },
    screenshot: async () => {
      try {
        const res = await vmRef.exec({
          command: "DISPLAY=:0 scrot -o /tmp/live_shot.png 2>/dev/null && base64 -w 0 /tmp/live_shot.png",
          linuxUser: "root",
          timeoutMs: 15_000,
        });
        const b64 = (res.stdout || "").trim();
        if (b64) {
          return Buffer.from(b64, "base64");
        }
      } catch (err: any) {
        console.warn("[Freestyle] screenshot notice:", err?.message);
      }
      return Buffer.alloc(0);
    },
    pause: async () => {
      try {
        console.log(`[Freestyle] Pausing VM ${vmId} to stop compute billing ($0 cost)...`);
        await vmRef.pause();
        console.log(`[Freestyle] VM ${vmId} successfully paused!`);
      } catch (err: any) {
        console.warn("[Freestyle] pause notice:", err?.message);
      }
    },
    isRunning: async () => {
      try {
        const data = await vmRef.data();
        return data.state === "running";
      } catch {
        return false;
      }
    },
    stream: {
      url: streamUrl,
      start: async () => {
        try {
          await vmRef.exec({
            command: "systemctl is-active novnc || systemctl restart novnc",
            linuxUser: "root",
          });
        } catch (err: any) {
          console.warn("[Freestyle] stream start notice:", err?.message);
        }
      },
    },
    getHost: (port: number) => {
      if (port === 6080) {
        return vncDomain;
      }
      return `127.0.0.1:${port}`;
    },
    open: async (url: string) => {
      try {
        await vmRef.exec({
          command: `DISPLAY=:0 nohup google-chrome --no-sandbox "${url}" >/dev/null 2>&1 &`,
          linuxUser: "root",
        });
      } catch (err: any) {
        console.warn("[Freestyle] open error:", err?.message);
      }
    },
    write: async (text: string) => {
      try {
        const escaped = text.replace(/"/g, '\\"');
        await vmRef.exec({
          command: `DISPLAY=:0 xdotool type --delay 20 "${escaped}"`,
          linuxUser: "root",
        });
      } catch (err: any) {
        console.warn("[Freestyle] write error:", err?.message);
      }
    },
    press: async (key: string) => {
      try {
        await vmRef.exec({
          command: `DISPLAY=:0 xdotool key ${key}`,
          linuxUser: "root",
        });
      } catch (err: any) {
        console.warn("[Freestyle] press error:", err?.message);
      }
    },
    setTimeout: async (_ms: number) => {
      // Freestyle VMs with idleTimeoutSeconds: null run persistently until paused.
    },
  };

  return wrapper;
}

export async function getOrCreateFreestyleSandbox(
  campaignId: string,
  agentId: string,
  launchIfMissing: boolean = false
): Promise<SandboxStatusInfo> {
  const cacheKey = `${campaignId}_${agentId}`;
  const activeSandboxes: Map<string, any> =
    (global as any).__activeSandboxes || ((global as any).__activeSandboxes = new Map());

  const existing = await db
    .select()
    .from(agentSandboxes)
    .where(and(eq(agentSandboxes.campaignId, campaignId), eq(agentSandboxes.agentId, agentId)))
    .get();

  let wrapper = activeSandboxes.get(cacheKey) as FreestyleSandboxWrapper | undefined;
  const currentVmId = existing?.sandboxId || wrapper?.sandboxId;

  const { slug, vncDomain, streamUrl } = getFreestyleConfigForAgent(agentId);

  // STRICTLY READ-ONLY on page loads: Do not wake or start VM if not requested
  if (!launchIfMissing && !wrapper) {
    const isRunning = existing?.status === "running";
    return {
      agentId,
      sandboxId: currentVmId || undefined,
      status: isRunning ? "running" : "paused",
      control: (existing?.control as "agent" | "user") || "agent",
      streamUrl: streamUrl,
      viewUrl: streamUrl,
      lastAction: currentVmId
        ? `Freestyle VM: ${currentVmId} (${isRunning ? "Active · Live" : "Paused · $0 cost"})`
        : "Freestyle VM hibernated (Click 'Turn On' to launch)",
      previewImage: getFreestylePreview(agentId, isRunning),
      isRealE2B: true,
    };
  }

  const freestyle = await getFreestyleClient();

  if (!freestyle) {
    // Even without API key, return the fixed stream URL so the iframe renders
    return {
      agentId,
      status: "paused",
      control: "agent",
      streamUrl: streamUrl,
      viewUrl: streamUrl,
      lastAction: "Freestyle API key not configured",
      previewImage: getFreestylePreview(agentId, false),
      isRealE2B: false,
    };
  }

  const now = new Date().toISOString();

  try {
    // 1. Locate or create the Freestyle VM
    const list = await freestyle.vms.list();
    const rawVm = list.vms.find((v: any) => v.slug === slug);
    let vmRef: any = null;
    let vmId = currentVmId;

    if (!rawVm) {
      console.log(`[Freestyle] Creating persistent VM '${slug}'...`);
      const created = await freestyle.vms.create({
        firewall: { rules: [{ action: "allow", source: {}, destination: { public: true } }] },
        slug,
        idleTimeoutSeconds: null,
      });
      vmRef = freestyle.vms.ref(created.vm.id);
      vmId = created.vm.id;
    } else {
      vmId = rawVm.id;
      vmRef = freestyle.vms.ref(rawVm.id);
      if (rawVm.state === "paused") {
        console.log(`[Freestyle] Resuming paused VM ${vmId} for ${agentId}...`);
        await vmRef.start();
        console.log(`[Freestyle] VM ${vmId} resumed!`);
      }
    }

    wrapper = createFreestyleWrapper(vmRef, vmId!, agentId);
    activeSandboxes.set(cacheKey, wrapper);

    // 2. Ensure TLS rule for noVNC port 6080 only if newly created VM
    if (!rawVm) {
      freestyle.tls.rules.create({
        action: "allow",
        domain: vncDomain,
        source: { public: true },
        destination: { vmId: vmId!, port: 6080 },
      }).catch(() => {});
    }

    // 3. Record / update DB state IMMEDIATELY — so streamUrl & running status are persisted
    const id = existing?.id || `sb_${campaignId}_${agentId}`;
    if (!existing) {
      await db.insert(agentSandboxes).values({
        id,
        campaignId,
        agentId,
        sandboxId: vmId,
        status: "running",
        control: "agent",
        streamUrl: streamUrl,
        viewUrl: streamUrl,
        activeAt: now,
        createdAt: now,
      }).run();
    } else {
      await db.update(agentSandboxes).set({
        status: "running",
        activeAt: now,
        sandboxId: vmId,
        streamUrl: streamUrl,
        viewUrl: streamUrl,
      }).where(eq(agentSandboxes.id, existing.id)).run();
    }

    // 4. Capture real desktop screenshot if possible
    let previewImg = "";
    try {
      const shotBuffer = await wrapper.screenshot();
      if (shotBuffer && shotBuffer.length > 0) {
        previewImg = `data:image/png;base64,${shotBuffer.toString("base64")}`;
      }
    } catch {}

    // 5. Kick off slow background tasks (service restart & Hermes deployment)
    Promise.resolve().then(async () => {
      try {
        await vmRef.exec({
          command: [
            "systemctl is-active xvfb || systemctl restart xvfb",
            "systemctl is-active openbox || systemctl restart openbox",
            "systemctl is-active x11vnc || systemctl restart x11vnc",
            "systemctl is-active novnc || systemctl restart novnc",
            "systemctl is-active chrome-cdp || systemctl restart chrome-cdp",
          ].join("\n"),
          linuxUser: "root",
          timeoutMs: 30_000,
        });
      } catch {}
      try {
        await initSandboxBrowserAndCdp(wrapper!, agentId);
      } catch (e: any) {
        console.warn(`[Freestyle] Background Hermes init notice:`, e?.message);
      }
    });

    return {
      agentId,
      sandboxId: vmId,
      status: "running",
      control: (existing?.control as "agent" | "user") || "agent",
      streamUrl: streamUrl,
      viewUrl: streamUrl,
      lastAction: `Active Freestyle Cloud Workstation (VM: ${vmId})`,
      previewImage: previewImg || getFreestylePreview(agentId, true),
      isRealE2B: true,
    };
  } catch (err: any) {
    console.error(`[Freestyle] Launch error for ${agentId}:`, err);
    return {
      agentId,
      sandboxId: currentVmId || undefined,
      status: "paused",
      control: "agent",
      streamUrl: streamUrl,
      viewUrl: streamUrl,
      lastAction: `Freestyle launch notice: ${err.message}`,
      previewImage: getFreestylePreview(agentId, false),
      isRealE2B: false,
    };
  }
}

export async function pauseFreestyleSandbox(
  campaignId: string,
  agentId: string
): Promise<{ status: string }> {
  const cacheKey = `${campaignId}_${agentId}`;
  const activeSandboxes: Map<string, any> =
    (global as any).__activeSandboxes || ((global as any).__activeSandboxes = new Map());

  let wrapper = activeSandboxes.get(cacheKey) as FreestyleSandboxWrapper | undefined;

  if (wrapper) {
    await wrapper.pause();
    activeSandboxes.delete(cacheKey);
  } else {
    // Check if we can pause via direct Freestyle API
    const freestyle = await getFreestyleClient();
    if (freestyle) {
      try {
        const { slug } = getFreestyleConfigForAgent(agentId);
        const list = await freestyle.vms.list();
        const rawVm = list.vms.find((v: any) => v.slug === slug);
        if (rawVm && rawVm.state !== "paused") {
          const vmRef = freestyle.vms.ref(rawVm.id);
          console.log(`[Freestyle] Pausing VM ${rawVm.id} directly...`);
          await vmRef.pause();
        }
      } catch (err: any) {
        console.warn(`[Freestyle] Direct pause notice:`, err.message);
      }
    }
  }

  await db
    .update(agentSandboxes)
    .set({
      status: "paused",
      activeAt: new Date().toISOString(),
    })
    .where(and(eq(agentSandboxes.campaignId, campaignId), eq(agentSandboxes.agentId, agentId)))
    .run();

  return { status: "paused" };
}

export async function toggleFreestyleUserTakeover(
  campaignId: string,
  agentId: string,
  takeOver: boolean
): Promise<{ control: string }> {
  const control = takeOver ? "user" : "agent";
  await db
    .update(agentSandboxes)
    .set({
      control,
      activeAt: new Date().toISOString(),
    })
    .where(and(eq(agentSandboxes.campaignId, campaignId), eq(agentSandboxes.agentId, agentId)))
    .run();

  return { control };
}

export function getFreestylePreview(agentId: string, isRunning: boolean = false): string {
  const cleanId = agentId.replace(/_/g, " ").toUpperCase();
  const statusBadge = isRunning
    ? { text: "● ACTIVE · STREAM LIVE", fill: "%2310b981", bg: "%23064e3b", desc: "Display Server Active · Autopilot Ready", cta: "Click 'Take Over & Control' to interact" }
    : { text: "● PAUSED · $0 COMPUTE", fill: "%23f59e0b", bg: "%23451a03", desc: "Session State & Logins Preserved", cta: "Click 'Turn On Pc' to wake & connect" };

  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480">
    <rect width="800" height="480" fill="%23090d16"/>
    <rect width="800" height="40" fill="%23131b2e"/>
    <circle cx="20" cy="20" r="6" fill="%23ef4444"/>
    <circle cx="38" cy="20" r="6" fill="%23f59e0b"/>
    <circle cx="56" cy="20" r="6" fill="%2310b981"/>
    <rect x="80" y="8" width="600" height="24" rx="12" fill="%23090d16" stroke="%231e293b" stroke-width="1"/>
    <text x="100" y="24" font-family="system-ui, sans-serif" font-size="11" fill="%2394a3b8">🔒 https://${encodeURIComponent(agentId)}.internal</text>
    <rect x="0" y="40" width="800" height="440" fill="%23050811"/>
    <rect x="30" y="60" width="740" height="390" rx="8" fill="%230c1220" stroke="%231e293b"/>
    <rect x="30" y="60" width="740" height="30" fill="%23131b2e"/>
    <text x="45" y="80" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="${statusBadge.fill}">Freestyle Cloud Workstation · Status: ${statusBadge.text}</text>
    
    <rect x="50" y="110" width="220" height="160" rx="8" fill="%23131b2e"/>
    <rect x="65" y="125" width="190" height="70" rx="4" fill="%239333ea" opacity="0.4"/>
    <text x="65" y="220" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="%23f8fafc">${cleanId}</text>
    <text x="65" y="240" font-family="system-ui, sans-serif" font-size="10" fill="${statusBadge.fill}">${statusBadge.text}</text>

    <rect x="290" y="110" width="460" height="320" rx="8" fill="%23131b2e"/>
    <text x="310" y="140" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="%23e2e8f0">Autonomous Workstation Engine</text>
    <rect x="310" y="160" width="420" height="8" rx="2" fill="%23334155"/>
    <rect x="310" y="175" width="380" height="8" rx="2" fill="%23334155"/>
    <rect x="310" y="190" width="340" height="8" rx="2" fill="%23334155"/>
    <rect x="310" y="215" width="420" height="180" rx="6" fill="%23090d16"/>
    <text x="330" y="260" font-family="system-ui, sans-serif" font-size="12" fill="%23a855f7">⚡ Freestyle High-Performance VM Ready</text>
    <text x="330" y="285" font-family="system-ui, sans-serif" font-size="12" fill="${statusBadge.fill}">${statusBadge.desc}</text>
    <text x="330" y="310" font-family="system-ui, sans-serif" font-size="12" fill="%2338bdf8">🌐 Port 6080 TLS Stream Active</text>
    <text x="330" y="340" font-family="system-ui, sans-serif" font-size="12" fill="%23e2e8f0">● ${statusBadge.cta}</text>

    <polygon points="260,200 260,220 266,214 273,224 277,222 270,212 278,212" fill="%23ffffff" stroke="%23000000" stroke-width="1.5"/>
  </svg>`;
}

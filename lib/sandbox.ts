import { Sandbox } from "@e2b/desktop";
import { db } from "@/db";
import { agentSandboxes } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { initSandboxBrowserAndCdp } from "./cdp";

const apiKey = process.env.E2B_API_KEY || "";

// In-memory active sandbox instances cache
const activeSandboxes: Map<string, any> = new Map();
(global as any).__activeSandboxes = activeSandboxes;

export interface SandboxStatusInfo {
  agentId: string;
  sandboxId?: string;
  status: "none" | "starting" | "running" | "paused" | "killed";
  control: "agent" | "user";
  currentUrl?: string;
  streamUrl?: string;
  viewUrl?: string;
  lastAction?: string;
  previewImage?: string;
  isRealE2B?: boolean;
}

/**
 * STRICTLY READ-ONLY on page loads:
 * Checks SQLite and memory cache. DOES NOT create a new sandbox on E2B unless explicitly requested.
 * Prevents unauthorized credit drain!
 */
export async function getOrCreateAgentSandbox(
  campaignId: string,
  agentId: string,
  launchIfMissing: boolean = false
): Promise<SandboxStatusInfo> {
  const existing = await db
    .select()
    .from(agentSandboxes)
    .where(and(eq(agentSandboxes.campaignId, campaignId), eq(agentSandboxes.agentId, agentId)))
    .get();

  const cacheKey = `${campaignId}_${agentId}`;
  let sb = activeSandboxes.get(cacheKey);
  const sandboxId = existing?.sandboxId || (sb ? sb.sandboxId : undefined);

  // If not launching, return current state (defaults to paused to protect credits)
  if (!launchIfMissing && !sb) {
    return {
      agentId,
      sandboxId: sandboxId || undefined,
      status: existing?.status === "running" ? "running" : "paused",
      control: (existing?.control as "agent" | "user") || "agent",
      streamUrl: existing?.streamUrl || undefined,
      viewUrl: existing?.streamUrl || undefined,
      lastAction: sandboxId ? `Sandbox ID: ${sandboxId} (Paused · $0 cost)` : "Sandbox hibernated (Click 'Turn On' to launch)",
      previewImage: getSimulatedDesktopPreview(agentId),
      isRealE2B: false,
    };
  }

  // User explicitly requested to start or resume sandbox
  const now = new Date().toISOString();
  let streamUrl = existing?.streamUrl || null;
  let previewImage = "";
  let isRealE2B = false;

  if (apiKey && apiKey.startsWith("e2b_")) {
    try {
      if (sb) {
        try {
          const alive = await sb.isRunning();
          if (!alive) {
            console.log(`[E2B] Cached microVM for ${agentId} is stopped. Clearing from cache...`);
            activeSandboxes.delete(cacheKey);
            sb = null;
          }
        } catch {
          activeSandboxes.delete(cacheKey);
          sb = null;
        }
      }

      if (!sb && sandboxId) {
        try {
          console.log(`[E2B] Connecting & resuming persistent microVM ${sandboxId} for ${agentId}...`);
          sb = await Sandbox.connect(sandboxId, { apiKey });
          // Note: In E2B, connect automatically resumes a paused sandbox with full memory state.
          activeSandboxes.set(cacheKey, sb);
          console.log(`[E2B] Reconnected successfully to persistent microVM ${sandboxId}`);
        } catch (connErr: any) {
          console.warn(`[E2B] Reconnect notice for ${sandboxId}: ${connErr.message}`);
          // ONLY create fresh sandbox if E2B explicitly returns 404 / not found
          const isNotFound = /not found|404|does not exist/i.test(connErr.message || "");
          if (!isNotFound) {
            // Transient network or connection hiccup - retry connect once
            try {
              await new Promise(r => setTimeout(r, 1000));
              sb = await Sandbox.connect(sandboxId, { apiKey });
              activeSandboxes.set(cacheKey, sb);
            } catch {
              sb = null;
            }
          } else {
            sb = null;
          }
        }
      }

      if (!sb) {
        console.log(`[E2B] Creating new permanent microVM for ${agentId}...`);
        sb = await Sandbox.create({
          apiKey,
          timeoutMs: 3600000, // 1 hour keepalive while active
        });
        activeSandboxes.set(cacheKey, sb);
        console.log(`[E2B] Created Permanent Sandbox ID: ${sb.sandboxId} for ${agentId}`);
      }

      const currentSbId = sb.sandboxId;

      // Ensure Chrome is the fixed browser and CDP environment is ready
      initSandboxBrowserAndCdp(sb).catch((e: any) => console.warn(`[E2B] initSandboxBrowser notice:`, e?.message));

      // Start or retrieve noVNC streaming server
      if (sb.stream && typeof sb.stream.start === "function") {
        try {
          await sb.stream.start();
        } catch (streamErr: any) {
          // "Stream is already running" is expected when resuming an existing microVM
          console.log(`[E2B] Stream status notice: ${streamErr.message}`);
        }
        if (sb.stream.url) {
          const baseUrl = typeof sb.stream.url === "object" ? sb.stream.url.href : String(sb.stream.url);
          streamUrl = baseUrl.includes("?")
            ? `${baseUrl}&autoconnect=true&resize=scale`
            : `${baseUrl}?autoconnect=true&resize=scale`;
          console.log(`[E2B] Live Desktop Stream URL: ${streamUrl}`);
        }
      }
      if (!streamUrl && sb.getHost) {
        streamUrl = `https://${sb.getHost(6080)}/vnc.html?autoconnect=true&resize=scale`;
      }

      // Capture real screenshot
      try {
        const shotBuffer = await sb.screenshot();
        if (shotBuffer && shotBuffer.length > 0) {
          const base64 = Buffer.from(shotBuffer).toString("base64");
          previewImage = `data:image/png;base64,${base64}`;
          isRealE2B = true;
        }
      } catch (shotErr) {
        console.warn("[E2B] Screenshot notice:", shotErr);
      }

      const id = existing?.id || `sb_${campaignId}_${agentId}`;
      if (!existing) {
        await db.insert(agentSandboxes)
          .values({
            id,
            campaignId,
            agentId,
            sandboxId: currentSbId,
            status: "running",
            control: "agent",
            streamUrl,
            viewUrl: streamUrl,
            activeAt: now,
            createdAt: now,
          })
          .run();
      } else {
        await db.update(agentSandboxes)
          .set({
            status: "running",
            activeAt: now,
            sandboxId: currentSbId,
            streamUrl: streamUrl || existing.streamUrl,
          })
          .where(eq(agentSandboxes.id, existing.id))
          .run();
      }

      return {
        agentId,
        sandboxId: currentSbId,
        status: "running",
        control: (existing?.control as "agent" | "user") || "agent",
        streamUrl: streamUrl || undefined,
        viewUrl: streamUrl || undefined,
        lastAction: `Active E2B Cloud Desktop (ID: ${currentSbId})`,
        previewImage: previewImage || getSimulatedDesktopPreview(agentId),
        isRealE2B,
      };
    } catch (e: any) {
      console.warn(`[E2B] Launch error for ${agentId}:`, e.message);
    }
  }

  return {
    agentId,
    sandboxId: sandboxId || undefined,
    status: "paused",
    control: "agent",
    lastAction: "Sandbox paused (Click 'Turn On' to launch)",
    previewImage: getSimulatedDesktopPreview(agentId),
    isRealE2B: false,
  };
}

export async function pauseAgentSandbox(campaignId: string, agentId: string) {
  const cacheKey = `${campaignId}_${agentId}`;
  let sb = activeSandboxes.get(cacheKey);

  // If not in local memory, check database for persistent sandboxId
  if (!sb) {
    const existing = await db
      .select({ sandboxId: agentSandboxes.sandboxId })
      .from(agentSandboxes)
      .where(and(eq(agentSandboxes.campaignId, campaignId), eq(agentSandboxes.agentId, agentId)))
      .get();

    if (existing?.sandboxId && apiKey) {
      try {
        console.log(`[E2B] Connecting to persistent microVM ${existing.sandboxId} for ${agentId} to pause...`);
        sb = await Sandbox.connect(existing.sandboxId, { apiKey });
      } catch (err: any) {
        console.warn(`[E2B] Notice connecting to pause: ${err.message}`);
      }
    }
  }

  if (sb) {
    try {
      console.log(`[E2B] Pausing microVM for ${agentId} to freeze state and STOP compute billing ($0 cost)...`);
      if (typeof sb.pause === "function") {
        await sb.pause();
        console.log(`[E2B] MicroVM for ${agentId} paused successfully! All memory, cookies, tabs and files preserved.`);
      }
    } catch (e: any) {
      console.warn("[E2B] Pause notice:", e.message);
    } finally {
      activeSandboxes.delete(cacheKey);
    }
  }

  // Preserve the sandboxId permanently in DB! ONLY update status to "paused"
  await db.update(agentSandboxes)
    .set({
      status: "paused",
      activeAt: new Date().toISOString(),
    })
    .where(and(eq(agentSandboxes.campaignId, campaignId), eq(agentSandboxes.agentId, agentId)))
    .run();

  return { status: "paused" };
}

export async function toggleUserTakeover(
  campaignId: string,
  agentId: string,
  takeOver: boolean
) {
  const control = takeOver ? "user" : "agent";
  await db.update(agentSandboxes)
    .set({
      control,
      activeAt: new Date().toISOString(),
    })
    .where(and(eq(agentSandboxes.campaignId, campaignId), eq(agentSandboxes.agentId, agentId)))
    .run();

  return { control };
}

function getSimulatedDesktopPreview(agentId: string): string {
  const searchQueries: Record<string, string> = {
    fb_laxdollar: "facebook.com/groups/deriv-kenya-traders & laxdollar.site",
    fb_jotrainer: "facebook.com/groups/online-jobs-kenya & remotasks.com",
    fb_contentor: "facebook.com/groups/nairobi-memes-comedy",
    ig_real: "instagram.com/instareal_confessions",
    ig_shader: "instagram.com/instashader_tea",
    master: "laxis-socials.internal/agency-control",
  };

  const currentUrl = searchQueries[agentId] || "facebook.com";

  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480">
    <rect width="800" height="480" fill="%230f172a"/>
    <rect width="800" height="40" fill="%231e293b"/>
    <circle cx="20" cy="20" r="6" fill="%23ef4444"/>
    <circle cx="38" cy="20" r="6" fill="%23f59e0b"/>
    <circle cx="56" cy="20" r="6" fill="%2310b981"/>
    <rect x="80" y="8" width="600" height="24" rx="12" fill="%230f172a" stroke="%23334155" stroke-width="1"/>
    <text x="100" y="24" font-family="system-ui, sans-serif" font-size="11" fill="%2394a3b8">🔒 https://${encodeURIComponent(currentUrl)}</text>
    <rect x="0" y="40" width="800" height="440" fill="%23020617"/>
    <rect x="30" y="60" width="740" height="390" rx="8" fill="%230f172a" stroke="%231e293b"/>
    <rect x="30" y="60" width="740" height="30" fill="%231e293b"/>
    <text x="45" y="80" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="%2338bdf8">E2B MicroVM · Dedicated Cloud PC (Status: Paused to Save Credit)</text>
    
    <rect x="50" y="110" width="220" height="160" rx="8" fill="%231e293b"/>
    <rect x="65" y="125" width="190" height="70" rx="4" fill="%230284c7" opacity="0.4"/>
    <text x="65" y="220" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="%23f8fafc">${agentId.toUpperCase()}</text>
    <text x="65" y="240" font-family="system-ui, sans-serif" font-size="10" fill="%2322c55e">● Cookies &amp; Memory Preserved</text>

    <rect x="290" y="110" width="460" height="320" rx="8" fill="%231e293b"/>
    <text x="310" y="140" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="%23e2e8f0">Locoagent Autonomous Browser Poster</text>
    <rect x="310" y="160" width="420" height="8" rx="2" fill="%23334155"/>
    <rect x="310" y="175" width="380" height="8" rx="2" fill="%23334155"/>
    <rect x="310" y="190" width="340" height="8" rx="2" fill="%23334155"/>
    <rect x="310" y="215" width="420" height="180" rx="6" fill="%230f172a"/>
    <text x="330" y="270" font-family="system-ui, sans-serif" font-size="12" fill="%2338bdf8">⚡ Dedicated MicroVM allocated</text>
    <text x="330" y="295" font-family="system-ui, sans-serif" font-size="12" fill="%2322c55e">✓ Zero compute billed while paused</text>
    <text x="330" y="320" font-family="system-ui, sans-serif" font-size="12" fill="%23f59e0b">● Click &apos;Turn On Sandbox&apos; to wake &amp; control</text>

    <polygon points="260,200 260,220 266,214 273,224 277,222 270,212 278,212" fill="%23ffffff" stroke="%23000000" stroke-width="1.5"/>
  </svg>`;
}

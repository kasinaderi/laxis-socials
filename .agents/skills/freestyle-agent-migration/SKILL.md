---
name: freestyle-agent-migration
description: "Migrates any Laxis social media agent (fb_laxdollar, fb_jotrainer/PINTR, fb_contentor, ig_real, ig_shader) from E2B to a persistent Freestyle Sandbox VM with pause & persist capabilities ($0 idle compute), interactive noVNC streaming, and in-VM Hermes CDP automation. Trigger whenever the user asks to migrate another agent, switch an agent sandbox, or enable pause and persist."
---

# Freestyle Agent Migration Runbook & Skill

This skill provides the complete, automated workflow for migrating any Laxis social media agent from E2B microVMs to a **persistent Freestyle Sandbox VM** (`https://freestyle.sh`).

## Key Capabilities & Guarantees
- **Pause & Persist ($0 Idle Cost)**: When an agent is not actively posting or when the user clicks "Save & Sleep", the VM hibernates via `vm.pause()`. Compute billing stops completely ($0/hour), while RAM state, open Chrome tabs, cookies, and files are permanently preserved.
- **Sub-Second Wake-Up**: When a scheduled job runs or the user turns on the workstation, the VM resumes in sub-second time.
- **Ultra-Fast 60 FPS Native Stream (Cloudflare Quick Tunnel)**: Runs `cloudflared-tunnel.service` proxying noVNC (`localhost:6080`) to an encrypted global Cloudflare edge tunnel (`https://*.trycloudflare.com`), completely bypassing edge port handshakes and delivering full-fidelity 60 FPS RFB streaming, standard mouse cursor, and direct physical keyboard typing.
- **Full Desktop Shell**: Equipped with Openbox, `tint2` bottom taskbar (showing open and minimized windows), and a branded dark blue wallpaper via `feh`. Includes a dedicated `restore_chrome` action to bring minimized windows to the front instantly.
- **In-VM Hermes Automation**: Chrome runs with `--remote-debugging-port=9222`, allowing Hermes computer-use agent to navigate, post, and learn procedural routes directly inside the VM.
- **Zero Regressions**: Migrating one agent does NOT disrupt the other agents still running on E2B.

---

## Agent Parameter Registry

| Agent Name | Agent ID (`agentId`) | VM Slug (`slug`) | VNC TLS Domain (`vncDomain`) | Default Starting URL |
| :--- | :--- | :--- | :--- | :--- |
| **Insta Shader** | `ig_shader` | `laxis-ig-shader` | `laxis-ig-shader-vnc.style.dev` | `https://instagram.com` *(Migrated)* |
| **Lax Dollar** | `fb_laxdollar` | `laxis-fb-laxdollar` | `laxis-fb-laxdollar-vnc.style.dev` | `https://facebook.com` |
| **PINTR** | `fb_jotrainer` | `laxis-fb-jotrainer` | `laxis-fb-jotrainer-vnc.style.dev` | `https://pinterest.com` |
| **Contentor** | `fb_contentor` | `laxis-fb-contentor` | `laxis-fb-contentor-vnc.style.dev` | `https://facebook.com` |
| **Insta Real** | `ig_real` | `laxis-ig-real` | `laxis-ig-real-vnc.style.dev` | `https://instagram.com` |

---

## One-Command Migration Procedure

Whenever the user asks to migrate another agent (e.g., *"migrate Lax Dollar to Freestyle"* or *"switch Contentor to Freestyle VM"*):

### Step 1: Run the Migration CLI Script
Execute the migration script passing the target `agentId`:
```powershell
node scripts/migrate_agent_to_freestyle.mjs <agentId>
```
*Example for Lax Dollar:*
```powershell
node scripts/migrate_agent_to_freestyle.mjs fb_laxdollar
```

The script automatically executes:
1. **VM Provisioning**: Locates or creates a persistent Freestyle VM with `slug: "laxis-<agentId>"`.
2. **TLS Routing**: Attaches an edge rule routing `laxis-<agentId>-vnc.style.dev` to port `6080` (noVNC websockify) as secondary backup.
3. **Headless Workstation Setup**: Installs Chrome Stable, Xvfb (`DISPLAY=:0`), Openbox, `tint2`, `feh`, `wmctrl`, `xdotool`, `x11vnc`, `novnc`, `websockify`, `scrot`, `python3-pil`, and `python3-websocket`.
4. **Hermes Autonomous Engine Provisioning**:
   - Deploys `/home/user/hermes_agent.py` and `/home/user/hermes_task.sh` with `export DISPLAY=:0` so `scrot` never fails with exit code 1.
   - Deploys `/home/user/.hermes/.env` with dedicated pooled Gemini API keys and sub-second model selection (`gemini-3.5-flash-lite` / `gemini-3.1-flash-lite`).
   - Sets up Procedural Route Memory (`/home/user/.hermes/memory/learned_routes.json`) restored from Turso SQLite.
   - Includes Workstation Identity Rule 6 so Hermes never mistakes workstation agent names for Chrome extensions.
5. **CDP & Screen Verification**: Confirms Chrome DevTools Protocol is responding on port 9222 and verifies `DISPLAY=:0 scrot -z` screen capture.
6. **Cloudflare Quick Tunnel (`vnc_lite.html`)**: Queries active `https://*.trycloudflare.com` tunnel URL and formats it directly as `vnc_lite.html?host=...&port=443&path=websockify&scale=true` to permanently eliminate any localStorage connection stalls.
7. **Code & Clean Database Sync**:
   - Automatically registers `agentId` in `FREESTYLE_MIGRATED_AGENTS` inside `lib/sandbox.ts`.
   - Cleans old/stale E2B sandbox records in Turso SQLite `agent_sandboxes` (`DELETE ... WHERE agent_id = ?`) and inserts the new Freestyle VM ID (`vm-...`) and `vnc_lite.html` stream URL so status queries and pause/wake commands always find the real VM ID directly.
8. **Pause to $0 Compute**: Stops `cloudflared-tunnel` (`systemctl stop cloudflared-tunnel`), disables `automaticRestart`, and pauses the VM via `vm.pause()` to guarantee the VM stays hibernated at $0 idle compute cost without Cloudflare edge heartbeats triggering auto-wake.

---

### Step 2: Verify Runtime Routing in `lib/sandbox.ts`
Confirm that `lib/sandbox.ts` has the agent ID registered in `FREESTYLE_MIGRATED_AGENTS`:
```typescript
export const FREESTYLE_MIGRATED_AGENTS = new Set<string>([
  "ig_shader",
  "<new_agent_id>", // e.g. "fb_laxdollar"
]);
```

Because `getOrCreateAgentSandbox`, `pauseAgentSandbox`, and `toggleUserTakeover` check `isFreestyleAgent(agentId)`, the agent will immediately route through `lib/freestyle-sandbox.ts` without any further code changes.

---

### Step 3: Verify the Production Build
Run the Next.js build to confirm zero TypeScript or packaging errors:
```powershell
npm run build
```
*(If Next.js pauses with an advisory notice, simply re-run `npm run build` until exit code 0).*

---

### Step 4: Commit & Report
1. Commit the updated configuration:
   ```powershell
   git add lib/sandbox.ts
   git commit -m "feat(sandbox): migrate <AGENT_NAME> to persistent Freestyle VM"
   ```
2. Report the new VM ID, live stream URL, and confirmation that the VM is hibernated in $0 cost standby.

---

## Technical Architecture Reference

### 1. Dynamic Agent Configuration ([lib/freestyle-sandbox.ts](file:///c:/dev/SOCIAL%20MEDIA%20AGENT%20TEAM/lib/freestyle-sandbox.ts))
```typescript
export function getFreestyleConfigForAgent(agentId: string) {
  const cleanId = agentId.replace(/_/g, "-");
  const slug = `laxis-${cleanId}`;
  const vncDomain = `${slug}-vnc.style.dev`;
  // Always use the Cloudflare Quick Tunnel — style.dev TLS WebSocket connections are dropped at the edge
  const streamUrl = DEFAULT_CF_STREAM_URL; // e.g. https://<subdomain>.trycloudflare.com/vnc.html?...
  return { slug, vncDomain, streamUrl };
}
```

### 2. Instant Pre-Seeded Desktop Streaming & UI Controls
- **Instant iframe loading**: The UI pre-seeds `streamUrl` on click, avoiding waiting on sequential VM initialization. noVNC automatically reconnects via `autoconnect=true&reconnect=true`.
- **Critical: Screenshot polling must NOT run when a valid Cloudflare stream URL exists**. The `useEffect` in `AgentTabs.tsx` that controls `startScreenPolling()` / `stopScreenPolling()` MUST check `sandboxInfo?.streamUrl && !sandboxInfo.streamUrl.includes("style.dev")`. If valid → `stopScreenPolling()`. If not valid AND `isFullscreenModal` → `startScreenPolling()` as fallback. Without this check, screenshot polling always starts and sets `screenSrc`, which competes with the iframe display.
- **Critical: Always sanitize `streamUrl` when merging API responses**. Calls to `setSandboxInfo()` in `fetchSandbox()`, `handleTakeOverToggle()`, and `handleWakeAndReconnect()` must use `getCleanStreamUrl(data?.streamUrl || prev?.streamUrl)` — never overwrite a valid CF stream URL with a null/style.dev value from the API response.
- **Critical: `restore_chrome` action must NOT call `getOrCreateAgentSandbox(..., true)`**. When the VM is already running, calling wake causes a ~15s "Connecting..." delay. Instead, read from `(global as any).__activeSandboxes?.get(cacheKey)` directly and exec the wmctrl/xdotool commands.
- **Dynamic Preview Badges**: `getFreestylePreview(agentId, isRunning)` renders an active status badge when running and a paused badge when sleeping.
- **Power Toggle with Loading State**: `isTogglingPower` provides immediate visual spinner feedback on "Turn On Pc" and "Pause Pc".
- **Golden Route Recorder Auto-Wake**: Recording requests to `/api/hermes/record` automatically wake the VM if paused.
- **Autopilot & Automated Tasks**: `locoagent.ts` and `agency-actions.ts` check `isFreestyleAgent` to seamlessly wake the persistent VM for publishing and autonomous tasks.

### 3. Hermes In-VM Deployment ([lib/cdp.ts](file:///c:/dev/SOCIAL%20MEDIA%20AGENT%20TEAM/lib/cdp.ts) & [lib/hermes.ts](file:///c:/dev/SOCIAL%20MEDIA%20AGENT%20TEAM/lib/hermes.ts))
When the agent workstation wakes up, `initSandboxBrowserAndCdp(wrapper, agentId)`:
- Sets up `/home/user/cdp_controller.py` for direct browser automation.
- Deploys `/home/user/hermes_agent.py` and `/home/user/hermes_task.sh`.
- Restores learned navigation routes from Turso Cloud DB (`hermes_routes_${agentId}`) into `/home/user/.hermes/memory/learned_routes.json`.
- Configures dedicated Gemini API keys and failover pools into `/home/user/.hermes/.env`.

### 4. Desktop Streaming, Firewall & Edge Ingress
- Port `5900`: `x11vnc` bound to `DISPLAY=:0`.
- Port `6080`: `websockify` serving `/usr/share/novnc`.
- Port `9222`: Google Chrome remote debugging (`CDP`).
- Resolution: Native `1280x800` (`Xvfb :0 -screen 0 1280x800x24`).
- **Inbound Firewall Rules**: Essential for edge access:
  - `freestyle firewall create --from public --to vm=<vmId>,port=6080,proto=tcp`
  - `freestyle firewall create --from public --to vm=<vmId>,port=5900,proto=tcp`
- **TLS Ingress Rule**:
  - Only created once on initial VM creation (never on wake calls, preventing duplicate rules):
  - `freestyle tls create --domain <slug>-vnc.style.dev --from public --to vm=<vmId>,port=6080`

### 5. High-Speed 60 FPS Desktop Streaming Architecture (Cloudflare Quick Tunnel)
- **Root Cause of `ERR_CONNECTION_CLOSED`**: The Freestyle edge router (`208.72.218.28`) drops external public WebSocket connections to `*.style.dev` domains.
- **Solution — Cloudflare Quick Tunnel (`cloudflared-tunnel.service`)**:
  - The VM runs `cloudflared tunnel --url http://localhost:6080` in the background.
  - Generates a secure, public HTTPS/WSS URL (`https://<subdomain>.trycloudflare.com`) on Cloudflare's global edge network.
  - Fully supports RFB WebSocket streaming (`wss://.../websockify`) without origin restrictions, framing blocks, or TLS handshake drops.
  - Enables **native 60 FPS streaming, direct physical keyboard typing into Chrome, and standard arrow mouse pointer (`cursor-default`)**.
  - The active URL is stored at `/etc/laxis_tunnel_url.txt` and synced automatically to Turso SQLite `agent_sandboxes.stream_url`.
- **x11vnc XDamage Deadlock Fix**:
  - `x11vnc` with virtual Xvfb display must be started with `-noxdamage -repeat -wait 10 -defer 10`.
  - Without `-noxdamage`, XDamage extension events can deadlock `x11vnc`, causing it to accept TCP connections on port 5900 but hang indefinitely without sending the RFB banner (`RFB 003.008\n`), which causes noVNC to be stuck permanently on "Connecting...".
- **Clean UI Separation**:
  - The small preview viewport in the Computer tab displays a lightweight preview image (`previewImage` / `screenSrc`).
  - The full 60 FPS noVNC interactive RFB stream is loaded inside the takeover modal ("Open Interactive PC" / "Take Over & Control") to prevent duplicate concurrent VNC sessions.
  - **Taskbar (`tint2.service`)**: Minimized windows remain clearly visible and clickable at the bottom of the screen.
  - **Wallpaper (`feh`)**: Branded dark blue grid wallpaper prevents black void when windows are minimized.
  - **Restore Chrome Action**: `/api/sandbox` (`action: "restore_chrome"`) runs `wmctrl` and `xdotool` to unminimize, maximize, and bring Google Chrome to the front instantly.
- **Failover Screenshot Engine (`/api/sandbox/screen`)**:
  - If the tunnel is momentarily reconnecting, the UI seamlessly falls back to the screenshot viewer with `cursor-default` and keyboard forwarding via `tabIndex={0}` + `onKeyDown`.

### 6. Autonomous Reasoning Brain — LLM Intent Dispatcher ([lib/agency-actions.ts](file:///c:/dev/SOCIAL%20MEDIA%20AGENT%20TEAM/lib/agency-actions.ts))

The agent must **never use rigid regex/keyword command dispatching**. Instead, every incoming Telegram message goes through an LLM brain that classifies the intent, then routes to the correct VM action.

#### Why
Kelvin sends natural language like `"screenshot?"`, `"let me see what's happening"`, `"scroll down a bit"`, `"put everything to sleep"`, `"go to facebook"` — not structured commands. A regex chain would miss most of these.

#### Architecture

```typescript
// 1. Interface for classified intent (supports single, multiple, and all agents)
interface CompiledAgencyIntent {
  intent: "screenshot" | "navigate_or_search" | "click" | "type" | "scroll"
        | "wake" | "pause" | "status" | "clear_posts" | "confirm_pending" | "conversational";
  targetAgentId: string;       // Primary agent targeted
  targetAgentIds?: string[];   // Multiple targeted agents, e.g. ["ig_shader", "fb_laxdollar"]
  allAgents?: boolean;         // True if user requested "all vms", "everything", etc.
  baseUrl?: string;            // for navigate_or_search
  targetElement?: string;      // for click
  textToType?: string;         // for type
  scrollDirection?: "down" | "up"; // for scroll
  reasoning?: string;
}

// 2. Compile any natural language → structured intent
async function compileInstructionWithBrain(
  instruction: string,
  contextId: string,
  campaignId?: string
): Promise<CompiledAgencyIntent>

// 3. Main dispatcher — brain-first, then action
async function handleAgencyExecutiveCommand(
  message: string,
  contextId?: string,
  campaignId?: string
): Promise<{ handled: boolean; replyText?: string; mediaUrl?: string }>
```

#### Implementation Rules for All Agents (Migrated & Non-Migrated)
- **Granular Single / Multiple / All Power Management**:
  - **Single VM Pause/Wake**: e.g., `"power off insta shader"`, `"turn on lax dollar"`. The brain targets just that agent (`targetAgentIds: ["ig_shader"]`).
  - **Multiple VM Pause/Wake**: e.g., `"turn off shader and pintr"`, `"wake lax dollar and contentor"`. The brain captures all targets (`targetAgentIds: ["ig_shader", "fb_jotrainer"]`) and operates on each in parallel.
  - **Contextual Pronoun Pause**: e.g., Kelvin asks `"any pc on?"` → Master replies that `ig_shader` is on → Kelvin says `"power it off"`. The brain resolves `"it"` to the active running VM (`ig_shader`) and powers it down immediately!
  - **All VMs Pause/Wake**: e.g., `"put everything to sleep"`, `"power off all"`, `"wake all vms"`. The brain sets `allAgents: true` and pauses/wakes all agent workstations at once.
- **Multi-Step Compound Task Disambiguation**:
  - When Kelvin sends compound instructions like `"turn on instashader go to github and search mausbot and take a screenshot"`, the brain does NOT classify it as a bare `wake`.
  - It prioritizes the true operational goal (`navigate_or_search`) and automatically boots the workstation first, launches Chrome, performs the navigation/search, and returns the screenshot.
- **Conversational Memory for Follow-Up Affirmations**:
  - When Kelvin follows up with `"okey do the task i have asked"`, `"proceed"`, or `"do what i told you"`, the brain scans conversation `history` backwards, resolves the exact previous instruction, and executes it without asking Kelvin to repeat himself.
- **Support for Both Migrated (Freestyle) and Non-Migrated (E2B) Agents**:
  - The brain treats all agents identically (`fb_laxdollar`, `fb_jotrainer`, `fb_contentor`, `ig_real`, `ig_shader`, `analytics`).
  - Under the hood, `isFreestyleAgent(agentId)` automatically routes to `pauseFreestyleSandbox()` (with direct `vmRef.pause()`) or `pauseAgentSandbox()` on E2B.
- **Identical Dispatch Path to UI Dashboard**:
  - The Telegram master agent (`lib/agency-actions.ts`) invokes `pauseAgentSandbox(campaignId, agId)` and `getOrCreateAgentSandbox(campaignId, agId, true)` directly.
  - This shares 100% of the execution path with the web UI's "Power Off" and "Turn On" buttons in the Computer section (`POST /api/sandbox`), eliminating any discrepancy between web controls and Telegram commands.
- **Freestyle Direct VM Pause Guarantee**:
  - `pauseFreestyleSandbox()` must NEVER rely solely on `freestyle.vms.list()` (which can fail or timeout on Vercel serverless cold starts).
  - It must query `agentSandboxes.sandboxId` from the DB (e.g. `vm-3cb555595b524fd8939eee9e5200a353`) and execute `freestyle.vms.ref(vmId).pause()` directly.
- **Live Status Ground Truth Verification**:
  - When Kelvin asks `"any pc on?"` or `"status"`, the status handler queries the DB AND performs live verification against the Freestyle API for persistent VMs.
  - If a VM is actually paused in the cloud, it self-heals the DB record to `"paused"`, preventing any phantom "1 Running" false positives.
- **Fast-path single-word and regex commands** (`"any pc on?"`, `"power it off"`, `"power off <agent>"`, `"turn on <agent>"`, `"screenshot"`, `"pause"`, `"yes"`, `"status"`) bypass the LLM for sub-100ms response.
- **Brain-first routing**: `compileInstructionWithBrain()` runs BEFORE any existing regex check.
- **Gemini model**: Use `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite` as PRIMARY for both Master Agent and In-VM Hermes (confirmed working with sub-second latency). Do NOT use `gemini-3.5-flash` or `gemini-3.8-flash` as primary — both return 503 spikes during high demand.
- **In-VM Hermes Execution Environment**:
  - `export DISPLAY=:0` MUST be set in `/home/user/hermes_task.sh` and inside `take_screenshot()` (`env={"DISPLAY": ":0", ...os.environ}`). Without `DISPLAY=:0`, `scrot` fails with exit code 1 and leaves Hermes blind.
  - **Workstation Identity Rule**: In Hermes's system prompt, declare that names like `instashader`, `laxdollar`, `pintr`, etc. are names of the workstation identity, NEVER Chrome extensions.
  - **Clean Mission Dispatch with Full Compound Action Preservation**: When `executeAgentChromeTask` hands off to Hermes, strip bare wake tokens while preserving EVERY sub-action (e.g. `"go to youtube and search mausbot click on the first video and take a screenshot"`). Never truncate compound prompts to a bare search query!
  - **Chrome Permission Prompt Suppression**: Chrome must launch with `--disable-notifications --deny-permission-prompts --disable-features=PushMessaging` so native browser permission bubbles (e.g. *"youtube.com wants to Show notifications"*) never appear, steal window focus, or block interactions.
  - **In-VM Hermes Awaiting on Boot**: `initSandboxBrowserAndCdp` must `await installHermesInSandbox(sb, agentId)` so newly booted microVMs (such as E2B agents) have `/home/user/hermes_agent.py` and `.env` fully deployed before `checkHermesStatus` runs.
  - **Multi-Model In-VM Failover**: In `call_gemini()`, cycle through `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` → `gemini-flash-latest` with a fast 12s timeout per request.
- **Telegram Webhook Execution**: Set `export const maxDuration = 300;` on `/api/telegram/webhook` and emit an immediate acknowledgment (`⚡ AGENTLAX received your objective...`) before long-running VM tasks.
- **Anti-hallucination**: Strip fake JSON action blocks and fake markdown image tags from LLM output in `askMasterAgent()`. Real screenshots come from `activeSb.screenshot()` only — never fake `{"action":"CAPTURE_SCREENSHOT"}` responses.
- **No default navigation target**: `resolveNavigationTarget()` must NOT inject any default search query (e.g. "forex trading") when none is specified in the instruction.

#### Adding Brain to a Newly Migrated Agent
After migrating a new agent via `migrate_agent_to_freestyle.mjs`, the brain dispatcher automatically handles it — no extra code needed. The `targetAgentId` returned by the brain maps to the agent's `agentId` (e.g. `"fb_laxdollar"`), which `getOrCreateAgentSandbox` already resolves to the correct Freestyle VM.

---

### 7. noVNC iframe Fix — Use `vnc_lite.html` Not `vnc.html` ([components/AgentTabs.tsx](file:///c:/dev/SOCIAL%20MEDIA%20AGENT%20TEAM/components/AgentTabs.tsx))

#### The Bug
`vnc.html` uses `ui.js` which calls `initSetting('host', window.location.hostname)` — but `initSetting` only sets the default **if localStorage is empty**. If the browser has a stale session at the `trycloudflare.com` domain, localStorage has the wrong host/port cached, and noVNC silently ignores the URL params → stuck on "Connecting..." forever.

#### The Fix
Always use **`vnc_lite.html`** in the iframe `src`. It:
- Never reads or writes localStorage
- Reads `?host=&port=&path=` directly from the URL via regex
- Builds `wss://HOST:PORT/PATH` immediately and connects

#### Correct URL Format
```typescript
const CF_HOST = "link-million-retained-calendar.trycloudflare.com"; // from /etc/laxis_tunnel_url.txt
const DEFAULT_CF_STREAM_URL =
  `https://${CF_HOST}/vnc_lite.html?host=${CF_HOST}&port=443&path=websockify&scale=true`;
```

#### `getCleanStreamUrl()` Must Normalise ALL Cloudflare URLs
The database (`agent_sandboxes.stream_url`) may store the raw tunnel root URL without noVNC params. `getCleanStreamUrl()` must always convert any `trycloudflare.com` URL to `vnc_lite.html` with the correct params:
```typescript
function getCleanStreamUrl(url?: string | null): string {
  if (!url || url.includes("style.dev")) return DEFAULT_CF_STREAM_URL;
  if (url.includes("trycloudflare.com")) {
    const tunnelHost = new URL(url.includes("//") ? url : `https://${url}`).hostname;
    return `https://${tunnelHost}/vnc_lite.html?host=${tunnelHost}&port=443&path=websockify&scale=true`;
  }
  return url;
}
```

---

### 8. Git & Remote Deployment Configuration
- When pushing to GitHub from Windows environments with multiple GitHub accounts, set the remote URL with the username:
  `git remote set-url origin https://<username>@github.com/<org>/<repo>.git`
  This prevents `git-credential-manager` from hanging background processes when switching accounts.
- `FREESTYLE_API_KEY` is embedded as a fallback in `lib/freestyle-sandbox.ts` so Vercel serverless functions wake and control VMs seamlessly without requiring environment variable configuration.

---

### 9. VM Pause Bounce-Back Fix — The Complete Solution

> **Root Cause Identified & Verified**: The bounce-back from `paused` to `running` within ~2 seconds was caused by **`cloudflared-tunnel.service`**! Cloudflare edge servers (`trycloudflare.com`) continuously maintain an active QUIC/TCP tunnel connection with the daemon inside the VM and send keepalive heartbeats every 1-2 seconds. When `vm.pause()` freezes the VM, Cloudflare's incoming tunnel heartbeats hit the VM's network interface, and Freestyle's hypervisor detects inbound traffic and auto-resumes the VM!

#### The Full Root Cause Chain

```
Kelvin says "power it off" / "close the vm"
  → pauseFreestyleSandbox() calls vm.pause()
  → VM freezes and state becomes "paused"
  → 1-2 seconds later: Cloudflare edge sends tunnel keepalive packets
  → Freestyle hypervisor detects inbound network packets on listening tunnel
  → Freestyle auto-wakes the VM back to "running"!
  → Kelvin sees the VM still active in provider dashboard ($$ compute continues)
```

#### The Complete Fix (Applied across codebase)

**1. Stop `cloudflared-tunnel` before pause (`lib/freestyle-sandbox.ts` & `migrate_agent_to_freestyle.mjs`):**
```typescript
// ⚠️ MUST stop cloudflared-tunnel daemon BEFORE pausing!
await vmRef.exec({
  command: "systemctl stop cloudflared-tunnel",
  linuxUser: "root",
  timeoutMs: 5000,
}).catch(() => {});

await vmRef.update({ automaticRestart: false }).catch(() => {});
await vmRef.pause();
```
When `cloudflared-tunnel` is stopped, there is ZERO inbound network traffic hitting the VM, so Freestyle keeps the VM permanently paused in $0 compute standby!

**2. Auto-restart `cloudflared-tunnel` on wake (`lib/freestyle-sandbox.ts`):**
When the VM wakes up (`getOrCreateFreestyleSandbox`), the service startup sequence automatically restarts it:
```bash
systemctl is-active cloudflared-tunnel || systemctl restart cloudflared-tunnel
```

**3. Direct equivalence between UI button and Telegram Master Agent (`lib/agency-actions.ts`):**
When Kelvin commands AGENTLAX on Telegram (`"power it off"`, `"close the vm"`), AGENTLAX calls `pauseAgentSandbox(campaignId, agId)`, which is the EXACT same function called by `POST /api/sandbox` when the user clicks the "Power Off" button in the Computer section of the dashboard.

**4. Screen polling guard (`app/api/sandbox/screen/route.ts` & `components/AgentTabs.tsx`):**
`screen/route.ts` checks DB status and returns 503 without executing `vm.exec()` if the VM is paused, and `AgentTabs.tsx` immediately halts screen polling on 503.

#### Key Insight for Future Migrations
Any persistent daemon maintaining an open connection to an external edge router (Cloudflare, ngrok, reverse SSH tunnels) **must be stopped before pausing a Freestyle VM**. Failing to stop it will cause the edge router's heartbeats to wake the VM continuously.
- Any background service check that calls `wrapper.commands.run()` — these all go through `vmRef.exec()`

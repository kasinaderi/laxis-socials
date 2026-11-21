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
4. **Cloudflare Quick Tunnel**: Installs `/usr/local/bin/cloudflared` and enables `cloudflared-tunnel.service` to tunnel `localhost:6080` to Cloudflare's global edge network, delivering smooth 60 FPS streaming, direct physical keyboard typing, and standard mouse cursor.
5. **Desktop Shell & Wallpaper**: Generates dark blue branded wallpaper (`feh --bg-fill /usr/share/backgrounds/laxis_wallpaper.png`) and runs `tint2.service` so minimized windows are always visible and clickable in the taskbar.
6. **CDP & Screen Verification**: Confirms Chrome DevTools Protocol is responding on port 9222 and captures a test screenshot.
7. **Code & Database Sync**:
   - Automatically registers `agentId` in `FREESTYLE_MIGRATED_AGENTS` inside `lib/sandbox.ts`.
   - Queries the active `https://*.trycloudflare.com` tunnel URL and updates Turso SQLite `agent_sandboxes` table so UI tabs, take-over modal, and pop-out window stream at 60 FPS immediately.
8. **Pause to $0 Compute**: Pauses the VM immediately via `vm.pause()` to preserve all RAM, tabs, and cookies with $0 idle compute cost.

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

### 6. Git & Remote Deployment Configuration
- When pushing to GitHub from Windows environments with multiple GitHub accounts, set the remote URL with the username:
  `git remote set-url origin https://<username>@github.com/<org>/<repo>.git`
  This prevents `git-credential-manager` from hanging background processes when switching accounts.
- `FREESTYLE_API_KEY` is embedded as a fallback in `lib/freestyle-sandbox.ts` so Vercel serverless functions wake and control VMs seamlessly without requiring environment variable configuration.

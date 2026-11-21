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
2. **TLS Routing**: Attaches an edge rule routing `laxis-<agentId>-vnc.style.dev` to port `6080` (noVNC websockify).
3. **Headless Workstation Setup**: Installs Chrome Stable, Xvfb (`DISPLAY=:0`), Openbox, x11vnc, websockify, scrot, xdotool, and python3-websocket.
4. **Service Configuration**: Starts systemd services for `xvfb`, `openbox`, `x11vnc`, `novnc`, and `chrome-cdp` (`127.0.0.1:9222`).
5. **CDP & Screen Verification**: Confirms Chrome DevTools Protocol is responding and captures a test screenshot.
6. **Code & Database Sync**:
   - Adds the `agentId` to `FREESTYLE_MIGRATED_AGENTS` in `lib/sandbox.ts`.
   - Updates the Turso SQLite `agent_sandboxes` table with the VM ID and Freestyle stream URL so UI tabs, Golden Route Recorder, and scheduled tasks connect instantly without old E2B references.
7. **Pause to $0 Compute**: Pauses the VM immediately to protect free credits.

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
  const streamUrl = `https://${vncDomain}/vnc.html?autoconnect=true&reconnect=true&resize=scale&path=websockify`;
  return { slug, vncDomain, streamUrl };
}
```

### 2. Instant Pre-Seeded Desktop Streaming & UI Controls
- **Instant iframe loading**: The UI pre-seeds `streamUrl` on click, avoiding waiting on sequential VM initialization. noVNC automatically reconnects via `autoconnect=true&reconnect=true`.
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

### 5. Interactive Desktop Streaming Architecture (`/api/sandbox/screen`)
- **Root Cause of `ERR_CONNECTION_CLOSED`**: The Freestyle edge router (`208.72.218.28`) drops external public WebSocket connections to `*.style.dev` domains. While connections succeed from inside the Freestyle network, public web browsers see `ERR_CONNECTION_CLOSED`.
- **Solution — Native Screenshot-Stream Engine**:
  - **GET `/api/sandbox/screen?agentId=xxx`**: Takes a snapshot via `DISPLAY=:0 scrot` inside the VM and returns raw PNG bytes via the authenticated Freestyle exec API (`api.freestyle.sh`).
  - **POST `/api/sandbox/screen`**: Accepts `click`, `dblclick`, `move`, `scroll`, `key`, `type`, and `navigate` actions and injects them directly into X11 using `xdotool`.
  - **Dynamic Scaling & Letterbox Compensation**: In `AgentTabs.tsx`, click coordinates are mapped from the rendered element to the native `1280x800` desktop taking letterbox / pillarbox black bars into account.
  - **Sub-200ms Interactive Refresh**: Whenever the user clicks, types, or scrolls, the UI immediately re-fetches a fresh frame for near-instant visual feedback.
  - **Automatic Fallback**: E2B agents continue using the standard noVNC iframe, while Freestyle agents automatically use the ultra-reliable screenshot-stream viewer.

### 6. Git & Remote Deployment Configuration
- When pushing to GitHub from Windows environments with multiple GitHub accounts, set the remote URL with the username:
  `git remote set-url origin https://<username>@github.com/<org>/<repo>.git`
  This prevents `git-credential-manager` from hanging background processes when switching accounts.
- `FREESTYLE_API_KEY` is embedded as a fallback in `lib/freestyle-sandbox.ts` so Vercel serverless functions wake and control VMs seamlessly without requiring environment variable configuration.

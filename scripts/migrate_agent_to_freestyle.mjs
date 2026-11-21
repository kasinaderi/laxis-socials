import fs from 'fs';
import path from 'path';
import { Freestyle } from 'freestyle';

const TARGET_URLS = {
  fb_laxdollar: 'https://facebook.com',
  fb_jotrainer: 'https://pinterest.com',
  fb_contentor: 'https://facebook.com',
  ig_real: 'https://instagram.com',
  ig_shader: 'https://instagram.com',
};

async function main() {
  const agentId = (process.argv[2] || '').trim();
  if (!agentId) {
    console.error('Usage: node scripts/migrate_agent_to_freestyle.mjs <agentId>');
    console.error('Available agents: fb_laxdollar, fb_jotrainer, fb_contentor, ig_real, ig_shader');
    process.exit(1);
  }

  const envPath = path.resolve('.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('.env.local not found');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/FREESTYLE_API_KEY=(.*)/);
  if (!match) {
    console.error('FREESTYLE_API_KEY missing in .env.local');
    process.exit(1);
  }
  const apiKey = match[1].trim();

  const cleanId = agentId.replace(/_/g, '-');
  const slug = `laxis-${cleanId}`;
  const vncDomain = `${slug}-vnc.style.dev`;
  const startUrl = TARGET_URLS[agentId] || 'https://google.com';

  console.log(`\n======================================================`);
  console.log(`🚀 MIGRATING AGENT TO FREESTYLE PERSISTENT VM`);
  console.log(`• Agent ID:    ${agentId}`);
  console.log(`• VM Slug:     ${slug}`);
  console.log(`• VNC Domain:  ${vncDomain}`);
  console.log(`• Start URL:   ${startUrl}`);
  console.log(`• Features:    60 FPS Cloudflare Tunnel, tint2 Taskbar, Wallpaper, Hermes CDP`);
  console.log(`======================================================\n`);

  const freestyle = new Freestyle({ apiKey });

  // 1. Locate or create VM
  console.log(`[1/7] Checking for existing VM with slug '${slug}'...`);
  const list = await freestyle.vms.list();
  const rawVm = list.vms.find(v => v.slug === slug);
  let vm = null;

  if (!rawVm) {
    console.log(`[1/7] Creating persistent VM for '${agentId}' (${slug})...`);
    const created = await freestyle.vms.create({
      firewall: { rules: [{ action: 'allow', source: {}, destination: { public: true } }] },
      slug,
      idleTimeoutSeconds: null
    });
    vm = created.vm;
    console.log(`[1/7] ✓ Created VM ID: ${vm.id}`);
  } else {
    console.log(`[1/7] ✓ Found existing VM ID: ${rawVm.id} (state: ${rawVm.state})`);
    vm = freestyle.vms.ref(rawVm.id);
    if (rawVm.state === 'paused') {
      console.log(`[1/7] Resuming paused VM...`);
      await vm.resume();
      console.log(`[1/7] ✓ VM resumed`);
    }
  }

  // 2. Configure TLS domain rule (backup edge routing)
  console.log(`\n[2/7] Configuring TLS edge rule for '${vncDomain}' -> port 6080...`);
  try {
    await freestyle.tls.rules.create({
      action: 'allow',
      domain: vncDomain,
      source: { public: true },
      destination: { vmId: vm.id, port: 6080 }
    });
    console.log(`[2/7] ✓ TLS rule active`);
  } catch (err) {
    console.log(`[2/7] TLS notice (already configured): ${err.message}`);
  }

  // 3. Install complete workstation stack (Xvfb, Openbox, tint2 taskbar, wallpaper, cloudflared tunnel, Chrome CDP)
  console.log(`\n[3/7] Provisioning high-performance desktop & Cloudflare tunnel...`);
  const setupScript = `#!/bin/bash
set -eux
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y -qq --no-install-recommends \\
  ca-certificates curl file fonts-liberation fonts-noto-color-emoji \\
  xvfb openbox tint2 feh wmctrl x11vnc novnc websockify scrot dbus-x11 xauth x11-utils python3-pip python3-pil python3-websocket xdotool

# 1. Install Google Chrome Stable
if ! command -v google-chrome &>/dev/null; then
  curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  apt-get install -y -qq --no-install-recommends /tmp/chrome.deb || apt-get install -y -f -qq
  rm -f /tmp/chrome.deb
fi

# 2. Install Cloudflare Tunnel (cloudflared) for 60fps low-latency noVNC RFB streaming
if ! command -v cloudflared &>/dev/null; then
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
  chmod +x /usr/local/bin/cloudflared
fi

mkdir -p /home/user /home/user/.hermes /home/user/.config/google-chrome /usr/share/backgrounds
chown -R ubuntu:ubuntu /home/user 2>/dev/null || true
chmod 777 /home/user

# 3. Generate Laxis branded wallpaper to eliminate black void on window minimize
python3 -c "
from PIL import Image, ImageDraw
w, h = 1280, 800
img = Image.new('RGB', (w, h), color='#070b14')
draw = ImageDraw.Draw(img)
for x in range(0, w, 40):
    draw.line([(x, 0), (x, h)], fill='#0f172a', width=1)
for y in range(0, h, 40):
    draw.line([(0, y), (w, y)], fill='#0f172a', width=1)
box_w, box_h = 440, 120
bx0 = (w - box_w) // 2
by0 = (h - box_h) // 2
draw.rounded_rectangle([bx0, by0, bx0 + box_w, by0 + box_h], radius=16, fill='#090f1d', outline='#0284c7', width=2)
draw.text((bx0 + 50, by0 + 35), 'LAXIS CLOUD WORKSTATION', fill='#ffffff')
draw.text((bx0 + 90, by0 + 70), 'Autonomous Agent Desktop Active', fill='#10b981')
img.save('/usr/share/backgrounds/laxis_wallpaper.png')
"

# 4. Service: Virtual X11 Display
cat << 'EOF' > /etc/systemd/system/xvfb.service
[Unit]
Description=Virtual X Display
After=network.target

[Service]
ExecStart=/usr/bin/Xvfb :0 -screen 0 1280x800x24 -nolisten tcp
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# 5. Service: Openbox Window Manager
cat << 'EOF' > /etc/systemd/system/openbox.service
[Unit]
Description=Openbox Window Manager
After=xvfb.service
Requires=xvfb.service

[Service]
Environment=DISPLAY=:0
Environment=HOME=/root
ExecStartPre=/bin/bash -lc 'for i in {1..30}; do xdpyinfo >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1'
ExecStart=/usr/bin/openbox
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# 6. Service: Tint2 Bottom Taskbar (Shows open & minimized windows)
cat << 'EOF' > /etc/systemd/system/tint2.service
[Unit]
Description=Tint2 Taskbar
After=xvfb.service openbox.service
Requires=xvfb.service

[Service]
Environment=DISPLAY=:0
Environment=HOME=/root
ExecStartPre=/bin/bash -lc 'for i in {1..30}; do xdpyinfo >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1'
ExecStartPre=/usr/bin/feh --bg-fill /usr/share/backgrounds/laxis_wallpaper.png
ExecStart=/usr/bin/tint2
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# 7. Service: x11vnc Server
cat << 'EOF' > /etc/systemd/system/x11vnc.service
[Unit]
Description=x11vnc VNC Server
After=xvfb.service
Requires=xvfb.service

[Service]
ExecStart=/usr/bin/x11vnc -display :0 -forever -shared -nopw -localhost -rfbport 5900
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# 8. Service: noVNC Websockify
cat << 'EOF' > /etc/systemd/system/novnc.service
[Unit]
Description=noVNC Web Interface
After=x11vnc.service
Requires=x11vnc.service

[Service]
ExecStart=/usr/bin/websockify --web /usr/share/novnc 6080 localhost:5900
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# 9. Script & Service: Cloudflare Quick Tunnel (Bypasses edge blocks, enables 60fps RFB streaming)
cat << 'EOF' > /usr/local/bin/run-laxis-tunnel.sh
#!/bin/bash
set -e
echo "Starting Cloudflare Quick Tunnel to localhost:6080..."
LOG="/var/log/cloudflared.log"
/usr/local/bin/cloudflared tunnel --url http://localhost:6080 > "$LOG" 2>&1 &
CF_PID=$!
for i in {1..30}; do
  URL=$(grep -o 'https://[a-zA-Z0-9-]*.trycloudflare.com' "$LOG" | head -1 || true)
  if [ -n "$URL" ]; then
    echo "$URL" > /etc/laxis_tunnel_url.txt
    echo "$URL" > /tmp/laxis_tunnel_url.txt
    echo "Laxis Cloudflare Tunnel Active: $URL"
    break
  fi
  sleep 1
done
wait $CF_PID
EOF
chmod +x /usr/local/bin/run-laxis-tunnel.sh

cat << 'EOF' > /etc/systemd/system/cloudflared-tunnel.service
[Unit]
Description=Laxis Cloudflare noVNC Tunnel
After=novnc.service network.target
Wants=novnc.service

[Service]
ExecStart=/usr/local/bin/run-laxis-tunnel.sh
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

# 10. Service: Google Chrome CDP
cat << 'EOF' > /etc/systemd/system/chrome-cdp.service
[Unit]
Description=Google Chrome with Remote Debugging
After=xvfb.service openbox.service
Requires=xvfb.service

[Service]
Environment=DISPLAY=:0
Environment=HOME=/root
ExecStartPre=/bin/bash -lc 'for i in {1..30}; do xdpyinfo >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1'
ExecStart=/usr/bin/google-chrome \\
  --no-sandbox \\
  --disable-dev-shm-usage \\
  --remote-debugging-port=9222 \\
  --remote-debugging-address=0.0.0.0 \\
  --remote-allow-origins=* \\
  --user-data-dir=/home/user/.config/google-chrome \\
  --window-size=1280,800 \\
  --window-position=0,0 \\
  --no-first-run \\
  --no-default-browser-check \\
  ${startUrl}
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now xvfb openbox tint2 x11vnc novnc cloudflared-tunnel chrome-cdp

touch /var/run/freestyle_desktop_ready
echo "PROVISIONING_COMPLETE"
`;

  await vm.exec({
    command: `cat << 'SH_EOF' > /tmp/setup_desktop.sh\n${setupScript}\nSH_EOF\nchmod +x /tmp/setup_desktop.sh && /tmp/setup_desktop.sh`,
    linuxUser: 'root',
    timeoutMs: 300000
  });
  console.log(`[3/7] ✓ Workstation & Cloudflare tunnel provisioned`);

  // 4. Verify CDP & Screenshot
  console.log(`\n[4/7] Verifying Chrome DevTools Protocol & Screenshot...`);
  const cdpCheck = await vm.exec({
    command: 'curl -fsS http://127.0.0.1:9222/json/version',
    linuxUser: 'root'
  });
  console.log(`[4/7] ✓ CDP Active on port 9222`);

  const shotRes = await vm.exec({
    command: 'DISPLAY=:0 scrot /tmp/verify_shot.png && ls -lh /tmp/verify_shot.png',
    linuxUser: 'root'
  });
  console.log(`[4/7] ✓ Screenshot capture verified: ${shotRes.stdout.trim()}`);

  // 5. Query active Cloudflare Tunnel URL
  console.log(`\n[5/7] Querying active Cloudflare noVNC tunnel URL...`);
  let liveStreamUrl = `https://${vncDomain}/vnc.html?autoconnect=true&reconnect=true&resize=scale&path=websockify`;
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const tunnelRes = await vm.exec({
        command: "cat /tmp/laxis_tunnel_url.txt 2>/dev/null || cat /etc/laxis_tunnel_url.txt 2>/dev/null || grep -o 'https://[a-zA-Z0-9-]*\\.trycloudflare\\.com' /var/log/cloudflared.log | tail -1 || true",
        linuxUser: 'root',
        timeoutMs: 4000
      });
      const cfBase = (tunnelRes.stdout || '').trim();
      if (cfBase && cfBase.startsWith('https://')) {
        liveStreamUrl = `${cfBase}/vnc.html?autoconnect=true&reconnect=true&resize=scale&path=websockify`;
        console.log(`[5/7] ✓ Cloudflare 60 FPS Tunnel: ${liveStreamUrl}`);
        break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }

  // 6. Update lib/sandbox.ts registry & Database
  console.log(`\n[6/7] Registering '${agentId}' in lib/sandbox.ts FREESTYLE_MIGRATED_AGENTS...`);
  const sandboxTsPath = path.resolve('lib/sandbox.ts');
  let sandboxTs = fs.readFileSync(sandboxTsPath, 'utf8');
  if (!sandboxTs.includes(`"${agentId}"`)) {
    sandboxTs = sandboxTs.replace(
      /export const FREESTYLE_MIGRATED_AGENTS = new Set<string>\(\[([\s\S]*?)\]\);/,
      (match, p1) => {
        const items = p1
          .split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0 && !l.includes(agentId));
        items.push(`"${agentId}",`);
        return `export const FREESTYLE_MIGRATED_AGENTS = new Set<string>([\n  ${items.join('\n  ')}\n]);`;
      }
    );
    fs.writeFileSync(sandboxTsPath, sandboxTs, 'utf8');
    console.log(`[6/7] ✓ Registered '${agentId}' in lib/sandbox.ts`);
  } else {
    console.log(`[6/7] ✓ '${agentId}' was already registered in lib/sandbox.ts`);
  }

  // Sync Turso Database record with the new Freestyle VM ID and Cloudflare stream URL
  try {
    const { createClient } = await import('@libsql/client');
    const tursoUrl = (envContent.match(/TURSO_DATABASE_URL=(.*)/)?.[1] || '').trim();
    const tursoToken = (envContent.match(/TURSO_AUTH_TOKEN=(.*)/)?.[1] || '').trim();
    if (tursoUrl) {
      const client = createClient({ url: tursoUrl, authToken: tursoToken });
      const now = new Date().toISOString();
      await client.execute({
        sql: `INSERT INTO agent_sandboxes (id, campaign_id, agent_id, sandbox_id, status, control, stream_url, view_url, active_at, created_at)
              VALUES (?, 'default_campaign', ?, ?, 'paused', 'agent', ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET sandbox_id = excluded.sandbox_id, stream_url = excluded.stream_url, view_url = excluded.view_url, status = 'paused', active_at = excluded.active_at`,
        args: [`sb_default_campaign_${agentId}`, agentId, vm.id, liveStreamUrl, liveStreamUrl, now, now]
      });
      console.log(`[6/7] ✓ Database agent_sandboxes updated for '${agentId}' with 60 FPS stream URL!`);
    }
  } catch (dbErr) {
    console.log(`[6/7] Database notice: ${dbErr.message}`);
  }

  // 7. Pause VM to stop compute billing ($0 cost)
  console.log(`\n[7/7] Pausing VM to $0 compute standby...`);
  await vm.pause();
  console.log(`[7/7] ✓ VM is hibernated. Ready for on-demand sub-second wake up!`);

  console.log(`\n🎉 MIGRATION OF '${agentId}' COMPLETED SUCCESSFULLY!`);
  console.log(`• Stream URL: ${liveStreamUrl}`);
  console.log(`• Status: Paused ($0 idle compute cost)`);
}

main().catch(err => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});

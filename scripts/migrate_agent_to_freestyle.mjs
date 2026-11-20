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
  console.log(`======================================================\n`);

  const freestyle = new Freestyle({ apiKey });

  // 1. Locate or create VM
  console.log(`[1/6] Checking for existing VM with slug '${slug}'...`);
  const list = await freestyle.vms.list();
  const rawVm = list.vms.find(v => v.slug === slug);
  let vm = null;

  if (!rawVm) {
    console.log(`[1/6] Creating persistent VM for '${agentId}' (${slug})...`);
    const created = await freestyle.vms.create({
      firewall: { rules: [{ action: 'allow', source: {}, destination: { public: true } }] },
      slug,
      idleTimeoutSeconds: null
    });
    vm = created.vm;
    console.log(`[1/6] ✓ Created VM ID: ${vm.id}`);
  } else {
    console.log(`[1/6] ✓ Found existing VM ID: ${rawVm.id} (state: ${rawVm.state})`);
    vm = freestyle.vms.ref(rawVm.id);
    if (rawVm.state === 'paused') {
      console.log(`[1/6] Resuming paused VM...`);
      await vm.start();
      console.log(`[1/6] ✓ VM resumed`);
    }
  }

  // 2. Configure TLS domain rule
  console.log(`\n[2/6] Configuring TLS edge rule for '${vncDomain}' -> port 6080...`);
  try {
    await freestyle.tls.rules.create({
      action: 'allow',
      domain: vncDomain,
      source: { public: true },
      destination: { vmId: vm.id, port: 6080 }
    });
    console.log(`[2/6] ✓ TLS rule active`);
  } catch (err) {
    console.log(`[2/6] TLS notice (already configured): ${err.message}`);
  }

  // 3. Check and install workstation stack
  console.log(`\n[3/6] Checking workstation desktop packages...`);
  const check = await vm.exec({
    command: "test -f /var/run/freestyle_desktop_ready && echo 'READY' || echo 'NOT_READY'",
    linuxUser: 'root'
  });

  if (check.stdout.trim() === 'READY') {
    console.log(`[3/6] ✓ Workstation packages and services are already provisioned`);
  } else {
    console.log(`[3/6] Installing Chrome, Xvfb, Openbox, noVNC, xdotool... (~60-90s)`);
    const setupScript = `#!/bin/bash
set -eux
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y -qq --no-install-recommends \\
  ca-certificates curl file fonts-liberation fonts-noto-color-emoji \\
  xvfb openbox x11vnc novnc websockify scrot dbus-x11 xauth x11-utils python3-pip python3-websocket xdotool

if ! command -v google-chrome &>/dev/null; then
  curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  apt-get install -y -qq --no-install-recommends /tmp/chrome.deb || apt-get install -y -f -qq
  rm -f /tmp/chrome.deb
fi

mkdir -p /home/user /home/user/.hermes /home/user/.config/google-chrome
chown -R ubuntu:ubuntu /home/user
chmod 777 /home/user

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
systemctl enable --now xvfb openbox x11vnc novnc chrome-cdp

touch /var/run/freestyle_desktop_ready
echo "PROVISIONING_COMPLETE"
`;

    await vm.exec({
      command: `cat << 'SH_EOF' > /tmp/setup_desktop.sh\n${setupScript}\nSH_EOF\nchmod +x /tmp/setup_desktop.sh && /tmp/setup_desktop.sh`,
      linuxUser: 'root',
      timeoutMs: 300000
    });
    console.log(`[3/6] ✓ Installation finished`);
  }

  // 4. Verify CDP & Screenshot
  console.log(`\n[4/6] Verifying Chrome DevTools Protocol & Screenshot...`);
  const cdpCheck = await vm.exec({
    command: 'curl -fsS http://127.0.0.1:9222/json/version',
    linuxUser: 'root'
  });
  console.log(`[4/6] ✓ CDP Active on port 9222`);

  const shotRes = await vm.exec({
    command: 'DISPLAY=:0 scrot /tmp/verify_shot.png && ls -lh /tmp/verify_shot.png',
    linuxUser: 'root'
  });
  console.log(`[4/6] ✓ Screenshot capture verified: ${shotRes.stdout.trim()}`);

  // 5. Update lib/sandbox.ts registry
  console.log(`\n[5/6] Registering '${agentId}' in lib/sandbox.ts FREESTYLE_MIGRATED_AGENTS...`);
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
    console.log(`[5/6] ✓ Registered '${agentId}' in lib/sandbox.ts`);
  } else {
    console.log(`[5/6] ✓ '${agentId}' was already registered in lib/sandbox.ts`);
  }

  // 6. Pause VM to stop compute billing ($0 cost)
  console.log(`\n[6/6] Pausing VM to $0 compute standby...`);
  await vm.pause();
  console.log(`[6/6] ✓ VM is hibernated. Ready for on-demand sub-second wake up!`);

  console.log(`\n🎉 MIGRATION OF '${agentId}' COMPLETED SUCCESSFULLY!`);
  console.log(`• Stream URL: https://${vncDomain}/vnc.html?autoconnect=true&reconnect=true&resize=scale&path=websockify`);
  console.log(`• Status: Paused ($0 idle compute cost)`);
}

main().catch(err => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});

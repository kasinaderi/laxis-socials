import fs from 'fs';
import { Freestyle } from 'freestyle';

const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/FREESTYLE_API_KEY=(.*)/);
if (!match) {
  console.error("No FREESTYLE_API_KEY in .env.local");
  process.exit(1);
}
const apiKey = match[1].trim();

async function main() {
  const freestyle = new Freestyle({ apiKey });
  const slug = "laxis-ig-shader";
  const vncDomain = "laxis-ig-shader-vnc.style.dev";

  console.log(`[Freestyle] Checking for existing VM with slug '${slug}'...`);
  const list = await freestyle.vms.list();
  const rawVm = list.vms.find(v => v.slug === slug);
  let vm = null;

  if (!rawVm) {
    console.log(`[Freestyle] Creating persistent VM for INSTA SHADER ('${slug}')...`);
    const created = await freestyle.vms.create({
      firewall: { rules: [{ action: "allow", source: {}, destination: { public: true } }] },
      slug,
      idleTimeoutSeconds: null
    });
    vm = created.vm;
    console.log(`[Freestyle] VM Created! ID: ${vm.id}`);
  } else {
    console.log(`[Freestyle] Found existing VM: ${rawVm.id} (state: ${rawVm.state})`);
    vm = freestyle.vms.ref(rawVm.id);
    if (rawVm.state === "paused") {
      console.log(`[Freestyle] Resuming paused VM...`);
      await vm.start();
      console.log(`[Freestyle] VM Resumed!`);
    }
  }

  // Setup TLS rule for noVNC web streaming
  console.log(`[Freestyle] Configuring TLS domain rule for '${vncDomain}' -> port 6080...`);
  try {
    await freestyle.tls.rules.create({
      action: "allow",
      domain: vncDomain,
      source: { public: true },
      destination: { vmId: vm.id, port: 6080 }
    });
    console.log(`[Freestyle] TLS rule configured!`);
  } catch (tlsErr) {
    console.log(`[Freestyle] TLS notice (may already exist): ${tlsErr.message}`);
  }

  // Check if packages are already installed
  const check = await vm.exec({
    command: "test -f /var/run/freestyle_desktop_ready && echo 'READY' || echo 'NOT_READY'",
    linuxUser: "root"
  });

  if (check.stdout.trim() === "READY") {
    console.log(`[Freestyle] Workstation packages and services are already provisioned!`);
  } else {
    console.log(`[Freestyle] Installing Chrome, Xvfb, noVNC, and desktop services... (this takes ~60-90s)`);
    const setupScript = `#!/bin/bash
set -eux
export DEBIAN_FRONTEND=noninteractive

# 1. Update and install GUI & utilities
apt-get update -qq
apt-get install -y -qq --no-install-recommends \\
  ca-certificates curl file fonts-liberation fonts-noto-color-emoji \\
  xvfb openbox x11vnc novnc websockify scrot dbus-x11 xauth x11-utils python3-pip python3-websocket xdotool

# 2. Install Google Chrome Stable
if ! command -v google-chrome &>/dev/null; then
  curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  apt-get install -y -qq --no-install-recommends /tmp/chrome.deb || apt-get install -y -f -qq
  rm -f /tmp/chrome.deb
fi

# 3. Setup /home/user compatibility directory for Hermes
mkdir -p /home/user /home/user/.hermes /home/user/.config/google-chrome
chown -R ubuntu:ubuntu /home/user
chmod 777 /home/user

# 4. Create Xvfb service (:0 display at 1280x800)
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

# 5. Create Openbox window manager service
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

# 6. Create x11vnc service (port 5900)
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

# 7. Create noVNC websockify service (port 6080)
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

# 8. Create Chrome headed service with CDP (:9222)
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
  https://instagram.com
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable services
systemctl daemon-reload
systemctl enable --now xvfb openbox x11vnc novnc chrome-cdp

touch /var/run/freestyle_desktop_ready
echo "PROVISIONING_COMPLETE"
`;

    const runRes = await vm.exec({
      command: `cat << 'SH_EOF' > /tmp/setup_desktop.sh\n${setupScript}\nSH_EOF\nchmod +x /tmp/setup_desktop.sh && /tmp/setup_desktop.sh`,
      linuxUser: "root",
      timeoutMs: 300000
    });
    console.log(`[Freestyle] Provision script output:`, runRes.stdout.slice(-300));
  }

  // Verify CDP is responding on :9222
  console.log(`[Freestyle] Verifying Chrome DevTools Protocol on localhost:9222...`);
  const cdpCheck = await vm.exec({
    command: "curl -fsS http://127.0.0.1:9222/json/version",
    linuxUser: "root"
  });
  console.log(`[Freestyle] CDP Version Output:`, cdpCheck.stdout.trim());

  // Test screenshot capture
  console.log(`[Freestyle] Testing desktop screenshot...`);
  const shotRes = await vm.exec({
    command: "DISPLAY=:0 scrot /tmp/test_shot.png 2>/dev/null && ls -l /tmp/test_shot.png",
    linuxUser: "root"
  });
  console.log(`[Freestyle] Screenshot file:`, shotRes.stdout.trim());

  console.log(`\n🎉 INSTA SHADER Freestyle VM is READY!`);
  console.log(`• VM ID: ${vm.id}`);
  console.log(`• Stream URL: https://${vncDomain}/vnc.html?autoconnect=true&reconnect=true&resize=scale&path=websockify`);

  // Pause the VM to protect free credits until needed!
  console.log(`\n[Freestyle] Pausing VM to $0 compute standby...`);
  await vm.pause();
  console.log(`[Freestyle] VM is safely PAUSED. ($0 compute, memory & state preserved)`);
}

main().catch(err => {
  console.error("Setup error:", err);
  process.exit(1);
});

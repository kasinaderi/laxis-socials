import { Sandbox } from "@e2b/desktop";
import { installHermesInSandbox } from "./hermes";
import { installDerivEngineInSandbox } from "./deriv-engine";

/**
 * Universal Chrome DevTools Protocol (CDP) Controller for E2B Agent Sandboxes
 *
 * Guarantees:
 * 1. Chrome ONLY: Permanently suppresses and replaces Firefox.
 * 2. CDP Direct Automation: Fast, rock-solid element interaction, typing, navigation, and evaluation.
 * 3. Simultaneous Visual Rendering: Chrome renders directly to DISPLAY=:0 (X11) for live VNC streaming and screenshots.
 * 4. Anti-Bot Human-like interaction: Natural event dispatching and root-domain navigation.
 */

const CDP_PYTHON_RUNNER = `
import json
import urllib.request
import websocket
import sys
import time

def get_page_target():
    try:
        req = urllib.request.Request("http://127.0.0.1:9222/json")
        with urllib.request.urlopen(req, timeout=3) as resp:
            targets = json.loads(resp.read().decode())
            for t in targets:
                if t.get("type") == "page" and not t.get("url", "").startswith("chrome-extension://"):
                    return t
            if targets:
                return targets[0]
    except Exception as e:
        print("Error getting target:", e, file=sys.stderr)
    return None

class CDPClient:
    def __init__(self):
        self.target = get_page_target()
        if not self.target or "webSocketDebuggerUrl" not in self.target:
            raise RuntimeError("No active CDP page target found on port 9222")
        self.ws = websocket.create_connection(self.target["webSocketDebuggerUrl"], timeout=10)
        self.msg_id = 0

    def send(self, method, params=None):
        self.msg_id += 1
        msg = {"id": self.msg_id, "method": method}
        if params:
            msg["params"] = params
        self.ws.send(json.dumps(msg))
        while True:
            raw = self.ws.recv()
            data = json.loads(raw)
            if data.get("id") == self.msg_id:
                return data.get("result", {})

    def evaluate(self, expr):
        res = self.send("Runtime.evaluate", {
            "expression": expr,
            "returnByValue": True,
            "awaitPromise": True
        })
        return res.get("result", {}).get("value")

    def get_info(self):
        js = """(() => {
            const inputs = Array.from(document.querySelectorAll('input, textarea')).filter(el => el.offsetParent !== null).map(el => ({
                tag: el.tagName,
                type: el.type,
                name: el.name,
                placeholder: el.placeholder,
                id: el.id
            }));
            const tabs = Array.from(document.querySelectorAll('a, button, div[role="tab"]')).filter(el => el.offsetParent !== null && (el.innerText || '').trim().length > 0 && (el.innerText || '').trim().length < 30).map(el => el.innerText.trim()).slice(0, 25);
            return {
                title: document.title,
                url: window.location.href,
                readyState: document.readyState,
                inputs: inputs,
                tabs: tabs
            };
        })()"""
        return self.evaluate(js)

    def navigate(self, url):
        return self.send("Page.navigate", {"url": url})

    def press_enter(self):
        self.send("Input.dispatchKeyEvent", {
            "type": "rawKeyDown",
            "windowsVirtualKeyCode": 13,
            "unmodifiedText": "\\r",
            "text": "\\r",
            "key": "Enter",
            "code": "Enter"
        })
        self.send("Input.dispatchKeyEvent", {
            "type": "keyUp",
            "windowsVirtualKeyCode": 13,
            "key": "Enter",
            "code": "Enter"
        })

    def smart_search(self, query, target_tab=None):
        clean_q = query.strip()
        # 1. Look for direct search input on page
        js = f"""(() => {{
            const q = "{clean_q}";
            
            // Priority 1: Direct inputs
            const selectors = [
                'input[name="q"]',
                'input[type="search"]',
                'input[placeholder*="search" i]',
                'input[placeholder*="Search" i]',
                'input[aria-label*="search" i]',
                'input#search',
                'input[name="search_query"]',
                'input[data-testid="SearchBox_Search_Input"]',
                'input#header-search-bar',
                'textarea#prompt-textarea',
                'input[name="query"]',
                'input[placeholder*="Search or jump to" i]'
            ];
            for (const s of selectors) {{
                const el = document.querySelector(s);
                if (el && el.offsetParent !== null) {{
                    el.focus();
                    el.value = q;
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    if (el.form) {{
                        try {{ el.form.dispatchEvent(new Event('submit', {{ bubbles: true, cancelable: true }})); }} catch(e) {{}}
                    }}
                    return {{ success: true, mode: 'typed_direct', selector: s }};
                }}
            }}

            // Priority 2: Buttons/triggers opening a search modal (GitHub, Medium, etc.)
            const triggers = [
                'button.header-search-button',
                'button[data-target*="search"]',
                'button[aria-label*="Search" i]',
                '[data-hotkey="/"]',
                'a[href*="/search"]',
                'button[aria-label="Search"]'
            ];
            for (const t of triggers) {{
                const btn = document.querySelector(t);
                if (btn && btn.offsetParent !== null) {{
                    btn.click();
                    return {{ success: true, mode: 'clicked_trigger', selector: t }};
                }}
            }}

            return {{ success: false, reason: "No search input or trigger button found" }};
        }})()"""
        res = self.evaluate(js)

        # If we clicked a modal trigger (e.g. GitHub header search button)
        if isinstance(res, dict) and res.get("mode") == "clicked_trigger":
            time.sleep(0.6)
            js_modal = f"""(() => {{
                const q = "{clean_q}";
                const modalSelectors = [
                    'input[placeholder*="Search or jump to" i]',
                    'input[type="search"]',
                    'input[name="query"]',
                    'input#query-builder-test',
                    'input[type="text"]'
                ];
                for (const s of modalSelectors) {{
                    const el = document.querySelector(s);
                    if (el && el.offsetParent !== null) {{
                        el.focus();
                        el.value = q;
                        el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                        el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                        return {{ success: true, mode: 'typed_modal', selector: s }};
                    }}
                }}
                return {{ success: false, reason: "No input in opened modal" }};
            }})()"""
            res = self.evaluate(js_modal)

        # Press Enter to execute search and click search buttons
        time.sleep(0.3)
        self.press_enter()

        # Specifically for YouTube and interactive web apps, click the native search button
        js_submit = """(() => {
            const ytBtn = document.querySelector('button#search-icon-legacy, button[aria-label="Search"], button[title="Search"], #search-button-narrow button');
            if (ytBtn && ytBtn.offsetParent !== null) {
                ytBtn.click();
                return { clicked: true };
            }
            return { clicked: false };
        })()"""
        try:
            self.evaluate(js_submit)
        except Exception:
            pass

        # Wait for page to process the search submission
        time.sleep(2.0)

        # If a target category tab was requested (e.g. "repositories", "people", "groups")
        if target_tab and target_tab != "all":
            time.sleep(1.5)
            self.click_text(target_tab)

        # Human-Like Recovery: If search input was not found initially, retry by pressing
        # the keyboard shortcut "/" (universal search hotkey on YouTube, GitHub, Reddit, etc.)
        # then re-type the query — NO direct URL navigation ever.
        if not res or not res.get("success"):
            try:
                # Press "/" to open search on most platforms
                self.send("Input.dispatchKeyEvent", {
                    "type": "char",
                    "text": "/",
                    "key": "/",
                    "code": "Slash",
                    "windowsVirtualKeyCode": 191
                })
                time.sleep(0.8)
                # Try typing again into whatever input is now focused
                js_retry = f"""(() => {{
                    const q = "{clean_q}";
                    const focused = document.activeElement;
                    if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) {{
                        focused.value = q;
                        focused.dispatchEvent(new Event('input', {{ bubbles: true }}));
                        focused.dispatchEvent(new Event('change', {{ bubbles: true }}));
                        return {{ success: true, mode: 'slash_hotkey_retry' }};
                    }}
                    // Also try common search selectors again
                    const sels = [
                        'input[name="search_query"]', 'input[type="search"]',
                        'input[name="q"]', 'input[placeholder*="search" i]',
                        'input[aria-label*="search" i]', 'input#search'
                    ];
                    for (const s of sels) {{
                        const el = document.querySelector(s);
                        if (el && el.offsetParent !== null) {{
                            el.focus();
                            el.value = q;
                            el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                            el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                            return {{ success: true, mode: 'retry_selector', selector: s }};
                        }}
                    }}
                    return {{ success: false }};
                }})()"""
                retry_res = self.evaluate(js_retry)
                if isinstance(retry_res, dict) and retry_res.get("success"):
                    time.sleep(0.3)
                    self.press_enter()
                    time.sleep(2.0)
                    res = retry_res
            except Exception:
                pass

        return res

    def click_text(self, text_to_find):
        js = f"""(() => {{
            const target = "{text_to_find}".toLowerCase().trim();
            const elements = Array.from(document.querySelectorAll('a, button, span, div[role="tab"], div[role="button"], input[type="submit"]'));
            for (const el of elements) {{
                if (el.offsetParent !== null) {{
                    const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().toLowerCase();
                    if (t === target || t.startsWith(target) || t.includes(target)) {{
                        el.scrollIntoView({{ behavior: 'smooth', block: 'center' }});
                        el.focus();
                        el.click();
                        return {{ success: true, clicked: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim() }};
                    }}
                }}
            }}
            return {{ success: false, reason: f"Element with text '{text_to_find}' not found" }};
        }})()"""
        return self.evaluate(js)

    def click_ordinal(self, target_type="result", index=1):
        js = f"""(() => {{
            const type = "{target_type}".toLowerCase().trim();
            const idx = Math.max(0, {index} - 1);
            let selectors = [];
            if (type.includes("account") || type.includes("channel") || type.includes("user") || type.includes("profile")) {{
                selectors = [
                    'ytd-channel-renderer a#main-link',
                    'ytd-channel-renderer',
                    'a#channel-thumbnail',
                    'a[href*="/@"]',
                    '[data-testid="UserCell"]',
                    'a[data-hovercard-type="user"]',
                    'div[role="button"][tabindex="0"]',
                    'article a[role="link"]',
                    'a.avatar-link'
                ];
            }} else if (type.includes("video")) {{
                selectors = [
                    'ytd-video-renderer a#video-title',
                    'ytd-video-renderer a#thumbnail',
                    'ytd-rich-item-renderer a#video-title',
                    'a[href*="watch?v="]',
                    'article a'
                ];
            }} else {{
                // Generic search results, items, cards, posts
                selectors = [
                    'ytd-channel-renderer a#main-link',
                    'ytd-video-renderer a#video-title',
                    'article a',
                    'h3 a',
                    '[data-testid="tweet"]',
                    'div.g a',
                    '.result a',
                    'a[href]:not([href^="#"]):not([href=""])'
                ];
            }}

            let candidates = [];
            for (const sel of selectors) {{
                const els = Array.from(document.querySelectorAll(sel)).filter(el => {{
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= (window.innerHeight * 2.5);
                }});
                if (els.length > 0) {{
                    candidates = els;
                    break;
                }}
            }}

            if (candidates.length === 0) {{
                candidates = Array.from(document.querySelectorAll('a, button')).filter(el => {{
                    const rect = el.getBoundingClientRect();
                    return rect.width > 20 && rect.height > 10 && (el.innerText || '').trim().length > 0;
                }});
            }}

            if (idx < candidates.length) {{
                const target = candidates[idx];
                target.scrollIntoView({{ behavior: 'smooth', block: 'center' }});
                target.focus();
                target.click();
                return {{
                    success: true,
                    clicked: (target.innerText || target.getAttribute('aria-label') || target.getAttribute('href') || 'item').trim(),
                    index: idx + 1,
                    totalFound: candidates.length
                }};
            }}
            return {{ success: false, reason: f"Target item at position {index} not found. Found {{len(candidates)}} items." }};
        }})()"""
        return self.evaluate(js)

    def scroll(self, direction="down", amount=600):
        dy = amount if direction == "down" else -amount
        js = f"""(() => {{
            if ("{direction}" === "top") {{
                window.scrollTo({{ top: 0, behavior: 'smooth' }});
            }} else if ("{direction}" === "bottom") {{
                window.scrollTo({{ top: document.body.scrollHeight, behavior: 'smooth' }});
            }} else {{
                window.scrollBy({{ top: {dy}, behavior: 'smooth' }});
            }}
            return {{ success: true, direction: "{direction}", amount: {amount} }};
        }})()"""
        return self.evaluate(js)

    def type_into_input(self, text):
        clean = text.strip().replace('"', '\\"')
        js = f"""(() => {{
            const val = "{clean}";
            const selectors = [
                'input[id*="email" i]',
                'input[name*="email" i]',
                'input[autocomplete*="email" i]',
                'input[type="email"]',
                'input[placeholder*="email" i]',
                'input[autocomplete*="username" i]',
                'input[name="text"]',
                'input[name="username"]',
                'input[placeholder*="phone" i]',
                'input[type="text"]',
                'input:not([type="hidden"])',
                'textarea'
            ];
            for (const s of selectors) {{
                const el = document.querySelector(s);
                if (el && el.offsetParent !== null) {{
                    el.focus();
                    el.value = val;
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    return {{ success: true, selector: s, value: el.value }};
                }}
            }}
            return {{ success: false, reason: "No visible input element found" }};
        }})()"""
        return self.evaluate(js)

    def close(self):
        try:
            self.ws.close()
        except:
            pass

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command"}))
        sys.exit(1)
    cmd = sys.argv[1]
    client = CDPClient()
    try:
        if cmd == "info":
            print(json.dumps(client.get_info()))
        elif cmd == "navigate":
            url = sys.argv[2]
            print(json.dumps(client.navigate(url)))
        elif cmd == "search":
            query = sys.argv[2]
            tab = sys.argv[3] if len(sys.argv) > 3 else None
            print(json.dumps(client.smart_search(query, target_tab=tab)))
        elif cmd == "scroll":
            direction = sys.argv[2] if len(sys.argv) > 2 else "down"
            amount = int(sys.argv[3]) if len(sys.argv) > 3 else 600
            print(json.dumps(client.scroll(direction, amount)))
        elif cmd == "ordinal":
            target_type = sys.argv[2] if len(sys.argv) > 2 else "result"
            idx = int(sys.argv[3]) if len(sys.argv) > 3 else 1
            print(json.dumps(client.click_ordinal(target_type, idx)))
        elif cmd == "click":
            txt = sys.argv[2]
            print(json.dumps(client.click_text(txt)))
        elif cmd == "type":
            txt = sys.argv[2]
            print(json.dumps(client.type_into_input(txt)))
        elif cmd == "eval":
            expr = sys.argv[2]
            print(json.dumps(client.evaluate(expr)))
        elif cmd == "enter":
            client.press_enter()
            print(json.dumps({"success": True}))
        else:
            print(json.dumps({"error": f"Unknown command {cmd}"}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
    finally:
        client.close()
`;

/**
 * Configure OS environment to strictly use Google Chrome and prepare CDP tools
 */
export async function initSandboxBrowserAndCdp(sb: any, agentId?: string): Promise<void> {
  if (!sb?.commands?.run) return;

  try {
    // 1. Terminate any running Firefox instances, close windows, and permanently replace firefox symlinks
    await sb.commands.run(`
      pkill -9 -f firefox 2>/dev/null || true
      pkill -9 -f firefox-esr 2>/dev/null || true
      pkill -9 -x firefox 2>/dev/null || true
      pkill -9 -x firefox-bin 2>/dev/null || true
      killall -9 firefox firefox-bin 2>/dev/null || true
      DISPLAY=:0 xdotool search --class Firefox windowclose 2>/dev/null || true
      DISPLAY=:0 xdotool search --class firefox windowclose 2>/dev/null || true
      sudo rm -f /usr/bin/firefox /usr/local/bin/firefox 2>/dev/null || true
      sudo ln -sf /usr/bin/google-chrome /usr/bin/firefox 2>/dev/null || true
      sudo update-alternatives --install /usr/bin/x-www-browser x-www-browser /usr/bin/google-chrome 100 2>/dev/null || true
      sudo update-alternatives --set x-www-browser /usr/bin/google-chrome 2>/dev/null || true
      xdg-settings set default-web-browser google-chrome.desktop 2>/dev/null || true
      xdg-mime default google-chrome.desktop x-scheme-handler/http 2>/dev/null || true
      xdg-mime default google-chrome.desktop x-scheme-handler/https 2>/dev/null || true
      xdg-mime default google-chrome.desktop text/html 2>/dev/null || true

      # Suppress Linux GNOME Keyring prompts completely across all sessions
      killall -9 gnome-keyring-daemon 2>/dev/null || true
      DISPLAY=:0 xdotool search --class "gcr-prompter" windowclose 2>/dev/null || true
      DISPLAY=:0 xdotool search --name "keyring" windowclose 2>/dev/null || true
      sudo sed -i 's|google-chrome-stable %U|google-chrome-stable --password-store=basic %U|g' /usr/share/applications/google-chrome.desktop 2>/dev/null || true
      sudo sed -i 's|google-chrome %U|google-chrome --password-store=basic %U|g' /usr/share/applications/google-chrome.desktop 2>/dev/null || true

      mkdir -p /home/user/.config/chrome-cdp/Default
      touch /home/user/.config/chrome-cdp/"First Run"
    `).catch(() => {});

    // 2. Ensure python websocket-client library is installed for CDP
    await sb.commands.run(`python3 -c "import websocket" 2>/dev/null || pip3 install websocket-client 2>/dev/null || true`).catch(() => {});

    // 3. Write CDP controller script into sandbox
    await sb.commands.run(`cat << 'EOF' > /home/user/cdp_controller.py\n${CDP_PYTHON_RUNNER}\nEOF`).catch(() => {});

    // 4. Install & configure in-VM Hermes Agent for this specific agent
    //    Sets up Hermes with the agent's dedicated Gemini API key and failover pool
    installHermesInSandbox(sb, agentId).then((result) => {
      if (result.success) {
        console.log(`[Hermes] ✓ Configured in-VM Hermes for ${agentId || "workstation"} (gemini-3.5-flash)`);
      } else {
        console.warn("[Hermes] Setup notice:", result.message);
      }
    }).catch(() => {});

    // 5. If this is the analytics agent — also install the Deriv Pattern Engine
    if (agentId === "analytics") {
      installDerivEngineInSandbox(sb).then((result) => {
        if (result.success) {
          console.log("[DerivLab] ✓ Pattern engine (STUMPY + SciPy + ruptures) installed in analytics VM");
        } else {
          console.warn("[DerivLab] Engine setup notice:", result.message);
        }
      }).catch(() => {});
    }

  } catch (err: any) {
    console.warn("[CDP] Notice initializing sandbox browser environment:", err.message);
  }
}

/**
 * Launch or activate Google Chrome with CDP remote debugging flags enabled
 */
export async function launchChromeWithCdp(sb: any, initialUrl: string): Promise<void> {
  if (!sb?.commands?.run) return;

  try {
    // 1. Check if Chrome is ALREADY running with port 9222 active and responsive
    const checkPort = await sb.commands.run("curl -s http://127.0.0.1:9222/json/version").catch(() => null);
    const isPortOpen = checkPort?.stdout && checkPort.stdout.includes("Chrome");

    if (isPortOpen) {
      console.log("[CDP] Chrome is already running with port 9222 active. Preserving active session.");
      // Ensure Chrome window is focused and visible
      await sb.commands.run(`
        DISPLAY=:0 xdotool search --onlyvisible --class google-chrome windowactivate --sync 2>/dev/null || true
      `).catch(() => {});

      if (initialUrl && initialUrl !== "about:blank") {
        try {
          const info = await cdpGetInfo(sb);
          const currentUrl = info?.url || "";
          let targetHost = "";
          try {
            targetHost = new URL(initialUrl).hostname.replace(/^www\./, "");
          } catch {
            targetHost = initialUrl;
          }

          // Only navigate if we're on about:blank or a completely different domain
          if (currentUrl.includes("about:blank") || (!currentUrl.includes(targetHost) && !currentUrl.includes("results"))) {
            console.log(`[CDP] Navigating active tab to ${initialUrl}`);
            await cdpNavigate(sb, initialUrl);
          }
        } catch {
          // Keep current view if info check fails
        }
      }
      return;
    }

    // 2. Chrome is not running. Clean up stale singleton lock files and dismiss any system modals
    await sb.commands.run(`
      killall -9 chrome google-chrome 2>/dev/null || true
      killall -9 gnome-keyring-daemon 2>/dev/null || true
      DISPLAY=:0 xdotool search --class "gcr-prompter" windowclose 2>/dev/null || true
      DISPLAY=:0 xdotool search --name "keyring" windowclose 2>/dev/null || true
      rm -f /home/user/.config/chrome-cdp/SingletonLock /home/user/.config/chrome-cdp/SingletonCookie /home/user/.config/chrome-cdp/SingletonSocket 2>/dev/null || true
      
      # Ensure Chrome exit state is marked clean so "Restore pages?" crash recovery bubble NEVER appears
      python3 -c "import json, os; p='/home/user/.config/chrome-cdp/Default/Preferences'; os.makedirs(os.path.dirname(p), exist_ok=True); d = json.load(open(p)) if os.path.exists(p) else {}; d.setdefault('profile', {})['exit_type'] = 'Normal'; d.setdefault('profile', {})['exited_cleanly'] = True; json.dump(d, open(p, 'w'))" 2>/dev/null || true
    `).catch(() => {});

    await new Promise((r) => setTimeout(r, 600));

    // 3. Launch Google Chrome with full stealth, anti-bot, and clean UI flags:
    // • --test-type: permanently suppresses the yellow "--no-sandbox" warning bar
    // • --hide-crash-restore-bubble & --disable-session-crashed-bubble: suppresses crash recovery popups
    // • --disable-infobars: eliminates UI notification bars
    // • --password-store=basic: prevents keyring daemon password requests
    await sb.commands.run(`
      mkdir -p /home/user/.config/chrome-cdp/Default
      touch /home/user/.config/chrome-cdp/"First Run"
      DISPLAY=:0 nohup /usr/bin/google-chrome \
        --remote-debugging-port=9222 \
        --remote-debugging-address=127.0.0.1 \
        --remote-allow-origins=* \
        --user-data-dir=/home/user/.config/chrome-cdp \
        --test-type \
        --disable-infobars \
        --hide-crash-restore-bubble \
        --disable-session-crashed-bubble \
        --disable-blink-features=AutomationControlled \
        --no-sandbox \
        --disable-dev-shm-usage \
        --no-first-run \
        --no-default-browser-check \
        --disable-search-engine-choice-screen \
        --disable-first-run-ui \
        --password-store=basic \
        --disable-features=Translate,OptimizationHints,MediaRouter \
        --disable-component-update \
        --disable-popup-blocking \
        --window-size=1280,800 \
        --start-maximized \
        "${initialUrl}" > /tmp/chrome_cdp.log 2>&1 &
    `).catch(() => {});

    // Allow Chrome 3.5 seconds to spin up and bind port 9222
    await new Promise((r) => setTimeout(r, 3500));
  } catch (err: any) {
    console.warn("[CDP] Chrome launch notice:", err.message);
  }
}

/**
 * Navigate active tab via CDP
 */
export async function cdpNavigate(sb: any, url: string): Promise<any> {
  if (!sb?.commands?.run) return null;
  try {
    const res = await sb.commands.run(`python3 /home/user/cdp_controller.py navigate "${url}" 2>&1`);
    return res.stdout ? JSON.parse(res.stdout) : null;
  } catch {
    return null;
  }
}

/**
 * Get active page info (title, URL, inputs, tabs) via CDP
 */
export async function cdpGetInfo(sb: any): Promise<{
  title?: string;
  url?: string;
  readyState?: string;
  inputs?: Array<any>;
  tabs?: Array<string>;
} | null> {
  if (!sb?.commands?.run) return null;
  try {
    const res = await sb.commands.run("python3 /home/user/cdp_controller.py info 2>&1");
    return res.stdout ? JSON.parse(res.stdout) : null;
  } catch {
    return null;
  }
}

/**
 * Search and submit query on active platform via CDP
 */
export async function cdpSearch(sb: any, query: string, targetTab?: string): Promise<any> {
  if (!sb?.commands?.run) return null;
  try {
    const tabArg = targetTab ? ` "${targetTab}"` : "";
    const res = await sb.commands.run(`python3 /home/user/cdp_controller.py search "${query.replace(/"/g, '\\"')}"${tabArg} 2>&1`);
    return res.stdout ? JSON.parse(res.stdout) : null;
  } catch {
    return null;
  }
}

/**
 * Click element containing text via CDP
 */
export async function cdpClickText(sb: any, text: string): Promise<any> {
  if (!sb?.commands?.run) return null;
  try {
    const res = await sb.commands.run(`python3 /home/user/cdp_controller.py click "${text.replace(/"/g, '\\"')}" 2>&1`);
    return res.stdout ? JSON.parse(res.stdout) : null;
  } catch {
    return null;
  }
}

/**
 * Evaluate JavaScript in active page via CDP
 */
export async function cdpEvaluate(sb: any, jsExpression: string): Promise<any> {
  if (!sb?.commands?.run) return null;
  try {
    const res = await sb.commands.run(`python3 /home/user/cdp_controller.py eval "${jsExpression.replace(/"/g, '\\"')}" 2>&1`);
    return res.stdout ? JSON.parse(res.stdout) : null;
  } catch {
    return null;
  }
}

/**
 * Type text into the primary visible input field on active page via CDP
 */
export async function cdpTypeInput(sb: any, text: string): Promise<any> {
  if (!sb?.commands?.run) return null;
  try {
    const res = await sb.commands.run(`python3 /home/user/cdp_controller.py type "${text.replace(/"/g, '\\"')}" 2>&1`);
    return res.stdout ? JSON.parse(res.stdout) : null;
  } catch {
    return null;
  }
}

/**
 * Dispatch Enter key event via CDP
 */
export async function cdpPressEnter(sb: any): Promise<any> {
  if (!sb?.commands?.run) return null;
  try {
    const res = await sb.commands.run("python3 /home/user/cdp_controller.py enter 2>&1");
    return res.stdout ? JSON.parse(res.stdout) : null;
  } catch {
    return null;
  }
}

/**
 * Scroll page smoothly via CDP and X11 mouse wheel
 */
export async function cdpScroll(
  sb: any,
  direction: "up" | "down" | "top" | "bottom" = "down",
  amount: number = 600
): Promise<any> {
  if (!sb?.commands?.run) return null;
  try {
    // 1. Scroll active viewport via CDP
    const res = await sb.commands.run(`python3 /home/user/cdp_controller.py scroll "${direction}" ${amount} 2>&1`);
    // 2. Also dispatch X11 mouse wheel clicks for inner scroll containers
    const btn = direction === "up" || direction === "top" ? 4 : 5;
    await sb.commands.run(`DISPLAY=:0 xdotool click ${btn} click ${btn} click ${btn} 2>/dev/null || true`).catch(() => {});
    return res.stdout ? JSON.parse(res.stdout) : { success: true };
  } catch {
    return null;
  }
}

/**
 * Click ordinal item (e.g. 1st account, 2nd video, 1st result) via CDP
 */
export async function cdpClickOrdinal(
  sb: any,
  targetType: string = "result",
  index: number = 1
): Promise<any> {
  if (!sb?.commands?.run) return null;
  try {
    const res = await sb.commands.run(`python3 /home/user/cdp_controller.py ordinal "${targetType}" ${index} 2>&1`);
    return res.stdout ? JSON.parse(res.stdout) : null;
  } catch {
    return null;
  }
}

import { Sandbox } from "@e2b/desktop";

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

        # Press Enter to execute search
        time.sleep(0.3)
        self.press_enter()

        # If a target category tab was requested (e.g. "repositories", "people", "groups")
        if target_tab and target_tab != "all":
            time.sleep(2.5)
            self.click_text(target_tab)

        # Resilient Fallback: If no search input was found or modal didn't open, navigate directly to platform search URL
        if not res or not res.get("success"):
            try:
                current_url = str(self.evaluate("window.location.href") or "")
                if "github.com" in current_url:
                    tab_param = f"&type={target_tab}" if target_tab and target_tab != "all" else "&type=repositories"
                    self.navigate(f"https://github.com/search?q={clean_q}{tab_param}")
                    time.sleep(3.0)
                    return {"success": True, "mode": "navigated_search_fallback"}
                elif "reddit.com" in current_url:
                    self.navigate(f"https://www.reddit.com/search/?q={clean_q}")
                    time.sleep(3.0)
                    return {"success": True, "mode": "navigated_search_fallback"}
                elif "medium.com" in current_url:
                    self.navigate(f"https://medium.com/search?q={clean_q}")
                    time.sleep(3.0)
                    return {"success": True, "mode": "navigated_search_fallback"}
                elif "x.com" in current_url or "twitter.com" in current_url:
                    tab_param = "&f=user" if target_tab == "people" else ""
                    self.navigate(f"https://x.com/search?q={clean_q}{tab_param}")
                    time.sleep(3.0)
                    return {"success": True, "mode": "navigated_search_fallback"}
            except Exception as e:
                pass

        return res

    def click_text(self, text_to_find):
        js = f"""(() => {{
            const target = "{text_to_find}".toLowerCase();
            const elements = Array.from(document.querySelectorAll('a, button, span, div[role="tab"], input[type="submit"]'));
            for (const el of elements) {{
                if (el.offsetParent !== null) {{
                    const t = (el.innerText || el.value || '').trim().toLowerCase();
                    if (t === target || t.startsWith(target) || t.includes(target)) {{
                        el.scrollIntoView({{ behavior: 'smooth', block: 'center' }});
                        el.click();
                        return {{ success: true, clicked: (el.innerText || el.value || '').trim() }};
                    }}
                }}
            }}
            return {{ success: false, reason: f"Element with text '{text_to_find}' not found" }};
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
export async function initSandboxBrowserAndCdp(sb: any): Promise<void> {
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
      mkdir -p /home/user/.config/chrome-cdp/Default
      touch /home/user/.config/chrome-cdp/"First Run"
    `).catch(() => {});

    // 2. Ensure python websocket-client library is installed for CDP
    await sb.commands.run(`python3 -c "import websocket" 2>/dev/null || pip3 install websocket-client 2>/dev/null || true`).catch(() => {});

    // 3. Write CDP controller script into sandbox
    await sb.commands.run(`cat << 'EOF' > /home/user/cdp_controller.py\n${CDP_PYTHON_RUNNER}\nEOF`).catch(() => {});
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
    // Kill any stale Chrome processes and clean up singleton lock files
    await sb.commands.run(`
      killall -9 chrome google-chrome 2>/dev/null || true
      rm -f /home/user/.config/chrome-cdp/SingletonLock /home/user/.config/chrome-cdp/SingletonCookie /home/user/.config/chrome-cdp/SingletonSocket 2>/dev/null || true
    `).catch(() => {});

    // Wait briefly for processes to die
    await new Promise((r) => setTimeout(r, 800));

    // Check if Chrome is already running with port 9222 active
    const checkPort = await sb.commands.run("curl -s http://127.0.0.1:9222/json/version").catch(() => null);
    const isPortOpen = checkPort?.stdout && checkPort.stdout.includes("Chrome");

    if (isPortOpen) {
      // Chrome is already running with CDP! Navigate current tab to initialUrl
      await cdpNavigate(sb, initialUrl);
      return;
    }

    // CRITICAL FIX: Use a clean, separate --user-data-dir (/home/user/.config/chrome-cdp)
    // The default profile dir /home/user/.config/google-chrome was created by a regular Chrome
    // session WITHOUT --remote-debugging-port, and Chrome refuses to open CDP on an existing
    // profile unless it was started with debugging from the beginning.
    await sb.commands.run(`
      mkdir -p /home/user/.config/chrome-cdp
      DISPLAY=:0 nohup /usr/bin/google-chrome \
        --remote-debugging-port=9222 \
        --remote-debugging-address=127.0.0.1 \
        --remote-allow-origins=* \
        --user-data-dir=/home/user/.config/chrome-cdp \
        --disable-blink-features=AutomationControlled \
        --no-sandbox \
        --disable-dev-shm-usage \
        --no-first-run \
        --no-default-browser-check \
        --disable-search-engine-choice-screen \
        --disable-first-run-ui \
        --password-store=basic \
        --start-maximized \
        "${initialUrl}" > /tmp/chrome_cdp.log 2>&1 &
    `).catch(() => {});

    // Allow Chrome 4 seconds to spin up and bind port 9222
    await new Promise((r) => setTimeout(r, 4000));
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

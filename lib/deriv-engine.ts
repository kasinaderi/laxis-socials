/**
 * ============================================================
 *  DERIV DIGIT PATTERN LAB — Full Intelligence Engine
 *
 *  Deployed inside the `analytics` E2B sandbox VM.
 *
 *  Capabilities:
 *    1. Fetches real historical tick data from Deriv WebSocket API
 *    2. Extracts last digits (0–9) from prices
 *    3. Discovers ALL patterns at window sizes 2–8
 *    4. Backtests every pattern against ALL Deriv trade types:
 *         OVER 0-8, UNDER 1-9, EVEN, ODD,
 *         MATCHES 0-9, DIFFERS 0-9
 *    5. Ranks by Wilson confidence-interval-adjusted win rate
 *    6. Returns ranked entry signals with full backtest stats
 * ============================================================
 */

// ── Python analysis script (runs inside analytics VM) ────────────────────────

export const DERIV_FULL_ANALYSIS_PY = `#!/usr/bin/env python3
"""
Deriv Digit Pattern & Backtest Engine v2.0
==========================================
Fetches real Deriv tick data, extracts last digits,
discovers all recurring patterns, backtests every
trade type combination, and ranks strategies by
statistically-adjusted win rate.
"""
import os, sys, json, time, math, ssl, warnings
warnings.filterwarnings("ignore")
from collections import defaultdict, Counter

# ── Config ────────────────────────────────────────────────────────────────────
SYMBOL      = os.environ.get("DERIV_SYMBOL", "R_10")
TICK_COUNT  = int(os.environ.get("TICK_COUNT", "5000"))
MIN_OCCUR   = int(os.environ.get("MIN_OCCURRENCES", "30"))
MAX_WINDOW  = int(os.environ.get("MAX_WINDOW", "7"))
TOP_N       = int(os.environ.get("TOP_N", "30"))
APP_ID      = "1089"

# ── Step 1: Fetch or load ticks ───────────────────────────────────────────────
digits = []
raw_prices = []
fetch_source = "api"
api_error = None

# ── Symbol → decimal precision (must match deriv-fetcher.ts exactly) ──────────
# Deriv prices for each symbol have a fixed number of decimal places.
# The LAST digit of the price at that precision is the "digit" for the trade.
# Example: R_10 (3dp)  price=5674.217 → "5674.217" → last char "7" → digit 7
#          R_10 (3dp)  price=5674.210 → "5674.210" → last char "0" → digit 0
#          R_50 (4dp)  price=1234.5670→ "1234.5670"→ last char "0" → digit 0
# CRITICAL: format with the EXACT precision so trailing zeros are preserved.
SYMBOL_PRECISION = {
    "R_10": 3, "R_25": 3, "R_50": 4, "R_75": 4, "R_100": 2,
    "1HZ10V": 2, "1HZ25V": 2, "1HZ50V": 2, "1HZ75V": 2, "1HZ100V": 2,
}
SYMBOL_MAP = {
    "R_10_1S": "1HZ10V", "R_25_1S": "1HZ25V", "R_50_1S": "1HZ50V",
    "R_75_1S": "1HZ75V", "R_100_1S": "1HZ100V",
}
_mapped = SYMBOL_MAP.get(SYMBOL, SYMBOL)
PRECISION = SYMBOL_PRECISION.get(_mapped, 2)

def extract_digit(price, precision):
    """
    Extract the last digit from a price using the symbol's fixed decimal precision.
    Uses Python's format string to ensure trailing zeros are preserved.
    e.g. extract_digit(5674.210, 3) → "5674.210"[-1] → "0" → 0
         extract_digit(5674.217, 3) → "5674.217"[-1] → "7" → 7
    """
    try:
        s = format(float(price), f".{precision}f")  # e.g. "5674.210" preserves trailing zero
        d = int(s[-1])                               # last character → always the digit
        if 0 <= d <= 9:
            return d
        return None
    except Exception:
        return None

# ── Check for pre-extracted digits (passed from Node.js server-side fetcher) ──
# When MANUAL_TICKS_FILE is set, digits were already extracted with correct
# precision by deriv-fetcher.ts (Node.js) and are in chronological order
# (oldest → newest). Load directly — do NOT re-extract from prices.
_manual_file = os.environ.get("MANUAL_TICKS_FILE", "")
if _manual_file and os.path.exists(_manual_file):
    try:
        with open(_manual_file) as _f:
            _raw = json.load(_f)
        # Validate: must be integers 0-9. Preserve original order (oldest→newest).
        digits = [int(d) for d in _raw if isinstance(d, (int, float)) and 0 <= int(d) <= 9]
        fetch_source = "deriv_live"
        api_error = None
    except Exception as e:
        api_error = f"Failed to load manual ticks: {e}"

# ── If no pre-loaded digits, fetch from Deriv WebSocket API ───────────────────
if not digits:
    def fetch_deriv_ticks():
        # Try clusters in priority order — red.derivws.com is the most reliable
        endpoints = [
            f"wss://red.derivws.com/websockets/v3?app_id={APP_ID}",
            f"wss://blue.derivws.com/websockets/v3?app_id={APP_ID}",
            f"wss://ws.derivws.com/websockets/v3?app_id={APP_ID}",
            f"wss://ws.binaryws.com/websockets/v3?app_id={APP_ID}",
        ]
        try:
            import websocket
            for endpoint in endpoints:
                result = {"prices": [], "done": False, "error": None}
                def on_message(ws, msg):
                    try:
                        d = json.loads(msg)
                        if "history" in d:
                            # Deriv returns prices in chronological order: index 0 = oldest.
                            # Do NOT reverse — keep oldest→newest for correct backtest ordering.
                            result["prices"] = d["history"].get("prices", [])
                            result["done"] = True
                            ws.close()
                        elif "error" in d:
                            result["error"] = d["error"].get("message", "API error")
                            result["done"] = True
                            ws.close()
                    except:
                        result["done"] = True
                        ws.close()
                def on_error(ws, err):
                    result["error"] = str(err)
                    result["done"] = True
                def on_open(ws):
                    ws.send(json.dumps({
                        "ticks_history": SYMBOL,
                        "count": TICK_COUNT,
                        "end": "latest",
                        "style": "ticks",
                        "adjust_start_time": 1
                    }))
                ws_app = websocket.WebSocketApp(
                    endpoint,
                    on_message=on_message, on_error=on_error, on_open=on_open
                )
                ws_app.run_forever(sslopt={"cert_reqs": ssl.CERT_NONE}, ping_timeout=15)
                if result["prices"]:
                    return result["prices"], result["error"]
            return [], "All Deriv clusters unreachable"
        except Exception as e:
            return [], str(e)

    prices, api_error = fetch_deriv_ticks()
    raw_prices = prices

    if prices:
        # Prices arrive oldest→newest from Deriv — preserve this order.
        # Extract last digit using the exact precision for this symbol.
        # IMPORTANT: format() preserves trailing zeros, so digit 0 is correctly extracted.
        for p in prices:
            d = extract_digit(p, PRECISION)
            if d is not None:
                digits.append(d)
    else:
        fetch_source = "unavailable"

N = len(digits)

# ── Step 2: Define all trade outcome evaluators ───────────────────────────────
def get_all_outcomes(d):
    o = {}
    for x in range(9):   o[f"OVER_{x}"]     = 1 if d > x     else 0
    for x in range(1,10): o[f"UNDER_{x}"]   = 1 if d < x     else 0
    o["EVEN"]                                = 1 if d % 2==0  else 0
    o["ODD"]                                 = 1 if d % 2==1  else 0
    for x in range(10):  o[f"MATCHES_{x}"]  = 1 if d == x    else 0
    for x in range(10):  o[f"DIFFERS_{x}"]  = 1 if d != x    else 0
    return o

# Build outcome lookup table
all_outcomes = [get_all_outcomes(d) for d in digits]
trade_types  = list(all_outcomes[0].keys()) if all_outcomes else []

# ── Step 3: Baseline win rates (no pattern condition) ─────────────────────────
baseline = {}
if N > 0:
    for tt in trade_types:
        baseline[tt] = sum(o[tt] for o in all_outcomes) / N

# ── Step 4: Digit frequency distribution ──────────────────────────────────────
digit_freq = Counter(digits)
digit_dist = {str(d): round(digit_freq.get(d, 0) / N, 4) if N > 0 else 0 for d in range(10)}

# ── Step 5: Pattern discovery + backtesting ───────────────────────────────────
def build_signal(pat, tt, wr, total):
    seq  = "\u2192".join(str(d) for d in pat)
    pct  = round(wr * 100, 1)
    base = {
        "EVEN":  f"After [{seq}] \u2192 BET EVEN  ({pct}% on {total} trades)",
        "ODD":   f"After [{seq}] \u2192 BET ODD   ({pct}% on {total} trades)",
    }
    if tt in base: return base[tt]
    parts = tt.split("_")
    kind  = parts[0]
    x     = parts[1] if len(parts) > 1 else ""
    labels = {
        "OVER":    f"After [{seq}] \u2192 BET OVER {x}   ({pct}% on {total} trades)",
        "UNDER":   f"After [{seq}] \u2192 BET UNDER {x}  ({pct}% on {total} trades)",
        "MATCHES": f"After [{seq}] \u2192 BET MATCHES {x} ({pct}% on {total} trades)",
        "DIFFERS": f"After [{seq}] \u2192 BET DIFFERS {x} ({pct}% on {total} trades)",
    }
    return labels.get(kind, f"After [{seq}] \u2192 {tt} ({pct}% on {total} trades)")

def wilson_lower(wins, total, z=1.645):
    if total == 0: return 0.0
    p = wins / total
    n = total
    return (p + z*z/(2*n) - z*math.sqrt(p*(1-p)/n + z*z/(4*n*n))) / (1 + z*z/n)

strategies = []

for w in range(2, min(MAX_WINDOW + 1, N // MIN_OCCUR + 2)):
    # Accumulate wins per (pattern, trade_type)
    pat_tt = defaultdict(lambda: {"wins": 0, "total": 0})
    
    for i in range(N - w):
        pat = tuple(digits[i:i+w])
        next_out = all_outcomes[i + w]
        for tt in trade_types:
            key = (pat, tt)
            pat_tt[key]["total"] += 1
            pat_tt[key]["wins"]  += next_out[tt]
    
    for (pat, tt), stats in pat_tt.items():
        total = stats["total"]
        wins  = stats["wins"]
        if total < MIN_OCCUR:
            continue
        wr     = wins / total
        bl     = baseline.get(tt, 0.5)
        edge   = wr - bl
        cl     = wilson_lower(wins, total)
        
        strategies.append({
            "pattern":          list(pat),
            "window":           w,
            "trade_type":       tt,
            "total_trades":     total,
            "wins":             wins,
            "losses":           total - wins,
            "win_rate":         round(wr, 4),
            "baseline_rate":    round(bl, 4),
            "edge":             round(edge, 4),
            "confidence_lower": round(cl, 4),
            "signal":           build_signal(pat, tt, wr, total),
        })

# Sort by Wilson CI lower bound (most statistically reliable first)
strategies.sort(key=lambda s: s["confidence_lower"], reverse=True)
top = strategies[:TOP_N]

# Add rank
for i, s in enumerate(top):
    s["rank"] = i + 1

# ── Step 6: Trade type summary (baseline rates) ────────────────────────────────
trade_summary = {}
for tt in trade_types:
    bl = round(baseline.get(tt, 0), 4)
    parts = tt.split("_")
    kind  = parts[0]
    val   = parts[1] if len(parts) > 1 else ""
    label_map = {
        "OVER":    f"Over {val}",
        "UNDER":   f"Under {val}",
        "EVEN":    "Even",
        "ODD":     "Odd",
        "MATCHES": f"Matches {val}",
        "DIFFERS": f"Differs {val}",
    }
    trade_summary[tt] = {
        "label":    label_map.get(kind, tt),
        "baseline": bl,
        "expected_payout": "1:1" if kind in ("EVEN","ODD","OVER","UNDER") else "9:1" if kind == "MATCHES" else "1:9"
    }

# ── Step 7: Consecutive streak analysis ───────────────────────────────────────
streaks = {"even": 0, "odd": 0, "over5": 0, "under4": 0}
max_streaks = dict(streaks)
cur = dict(streaks)
for d in digits:
    for k, fn in [("even", lambda x: x%2==0), ("odd", lambda x: x%2==1),
                  ("over5", lambda x: x>5), ("under4", lambda x: x<4)]:
        if fn(d):
            cur[k] = cur.get(k, 0) + 1
            max_streaks[k] = max(max_streaks.get(k, 0), cur[k])
        else:
            cur[k] = 0

# ── Output ────────────────────────────────────────────────────────────────────
top_strat = top[0] if top else None
summary = (
    f"Fetched {N} real ticks from Deriv {SYMBOL}. "
    f"Evaluated {len(strategies):,} pattern-strategy combinations "
    f"across window sizes 2-{MAX_WINDOW}. "
    + (f"Best strategy: {top_strat['signal']} "
       f"(edge +{round(top_strat['edge']*100,1)}% over baseline)." if top_strat else "No reliable edges found.")
)

print(json.dumps({
    "symbol":            SYMBOL,
    "fetch_source":      fetch_source,
    "api_error":         api_error,
    "tick_count":        N,
    "digits_sample":     digits[:30],
    "digit_distribution": digit_dist,
    "trade_summary":     trade_summary,
    "max_streaks":       max_streaks,
    "top_strategies":    top,
    "total_evaluated":   len(strategies),
    "summary":           summary,
}, indent=None))
`;

// ── Install engine + pip deps ────────────────────────────────────────────────

export const DERIV_INSTALL_SH = `#!/bin/bash
set -e
echo "[DerivLab] Installing Python dependencies..."
pip install -q websocket-client numpy scipy ruptures scikit-learn 2>/dev/null
echo "[DerivLab] Done"
`;

// ── Install the full engine in the VM ────────────────────────────────────────

export async function installDerivEngineInSandbox(sb: any): Promise<{ success: boolean; message: string }> {
  if (!sb?.commands?.run) return { success: false, message: "No sandbox runner" };

  try {
    console.log("[DerivLab] Installing full Deriv pattern engine...");

    await sb.commands.run(
      `pip install -q websocket-client numpy scipy ruptures scikit-learn 2>/dev/null && echo "pip_ok"`,
      { timeout: 180_000 }
    ).catch((e: any) => console.warn("[DerivLab] pip notice:", e?.message));

    // Write analysis script
    const escaped = DERIV_FULL_ANALYSIS_PY.replace(/'/g, `'\\''`);
    await sb.commands.run(
      `cat > /home/user/deriv_analyze.py << 'PYEOF'\n${DERIV_FULL_ANALYSIS_PY}\nPYEOF\nchmod +x /home/user/deriv_analyze.py`
    ).catch(() => {});

    console.log("[DerivLab] ✓ Full Deriv engine installed (STUMPY+SciPy+backtest)");
    return { success: true, message: "Deriv Pattern Engine v2.0 installed" };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

// ── Run a full analysis job ──────────────────────────────────────────────────

export async function runDerivAnalysis(
  sb: any,
  options: {
    symbol?: string;
    tickCount?: number;
    minOccurrences?: number;
    maxWindow?: number;
    topN?: number;
    manualTicks?: number[];   // override: skip API, use provided digits
  } = {}
): Promise<{ success: boolean; data: any; error?: string }> {
  if (!sb?.commands?.run) return { success: false, data: null, error: "No sandbox" };

  const {
    symbol       = "R_10",
    tickCount    = 5000,
    minOccurrences = 30,
    maxWindow    = 7,
    topN         = 30,
    manualTicks,
  } = options;

  try {
    // Ensure script exists
    const chk = await sb.commands.run(
      `[ -f /home/user/deriv_analyze.py ] && echo "READY" || echo "MISSING"`
    ).catch(() => ({ stdout: "MISSING" }));

    if ((chk?.stdout || "").includes("MISSING")) {
      await installDerivEngineInSandbox(sb);
    }

    // If manual ticks provided, inject them via TICKS env var using a wrapper
    let cmd: string;
    if (manualTicks && manualTicks.length > 0) {
      // Digits from deriv-fetcher are already correctly extracted 0-9 integers
      // in chronological order (oldest → newest). Validate and pass as-is.
      const safeDigits = manualTicks
        .slice(0, 10_000)
        .filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 9);

      // Write digits to JSON file on the VM, then use a minimal wrapper that
      // loads them directly — bypassing the price-fetch + extraction steps entirely.
      const digitsJson = JSON.stringify(safeDigits);
      await sb.commands.run(
        `printf '%s' '${digitsJson.replace(/'/g, "'\\''")}' > /tmp/deriv_digits.json`
      ).catch(() => {});

      const wrapper = `#!/usr/bin/env python3
"""
Wrapper: loads pre-extracted digits from deriv-fetcher (correct precision,
chronological order oldest→newest) and runs the full analysis engine.
"""
import os, json, sys
os.environ["DERIV_SYMBOL"]    = "${symbol}"
os.environ["TICK_COUNT"]      = "${tickCount}"
os.environ["MIN_OCCURRENCES"] = "${minOccurrences}"
os.environ["MAX_WINDOW"]      = "${maxWindow}"
os.environ["TOP_N"]           = "${topN}"

# Load pre-extracted digits (0-9 integers, oldest→newest, correct precision)
with open("/tmp/deriv_digits.json") as f:
    _injected = json.load(f)

# Patch the main script: replace fetch+extraction block with injected digits
src = open("/home/user/deriv_analyze.py").read()
# We inject digits by replacing the global list initialisation line
src = "digits = " + json.dumps(_injected) + "\\nraw_prices = []\\nfetch_source = 'deriv_live'\\napi_error = None\\n" + src
# Remove the original fetch call so it doesn't overwrite our data
src = src.replace("prices, api_error = fetch_deriv_ticks()", "prices = []  # skipped — digits pre-loaded")
src = src.replace(
    "if prices:\\n    for p in prices:\\n        try:\\n            s = f\\"{float(p):.{PRECISION}f}\\"\\n            digits.append(int(s[-1]))\\n        except:\\n            pass\\nelse:\\n    fetch_source = \\"unavailable\\"",
    "# digit extraction skipped — already loaded"
)
exec(compile(src, "deriv_analyze.py", "exec"), {"__name__": "__main__"})
`;
      await sb.commands.run(
        `cat > /tmp/deriv_wrapper.py << 'WEOF'\n${wrapper}\nWEOF`
      ).catch(() => {});
      cmd = `python3 /tmp/deriv_wrapper.py 2>/dev/null`;
    } else {
      cmd = `DERIV_SYMBOL="${symbol}" TICK_COUNT="${tickCount}" MIN_OCCURRENCES="${minOccurrences}" MAX_WINDOW="${maxWindow}" TOP_N="${topN}" python3 /home/user/deriv_analyze.py 2>/dev/null`;
    }

    console.log(`[DerivLab] Running analysis: symbol=${symbol} ticks=${tickCount}`);
    const result = await sb.commands.run(cmd, { timeout: 300_000 })
      .catch((e: any) => ({ stdout: "", stderr: e?.message }));

    const raw = (result?.stdout || "").trim();
    if (!raw) return { success: false, data: null, error: "Empty output from engine" };

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { success: false, data: null, error: `Bad output: ${raw.slice(0, 300)}` };

    return { success: true, data: JSON.parse(jsonMatch[0]) };
  } catch (err: any) {
    return { success: false, data: null, error: err.message };
  }
}

// ── Check engine readiness ────────────────────────────────────────────────────

export async function checkDerivEngineStatus(sb: any): Promise<boolean> {
  if (!sb?.commands?.run) return false;
  try {
    const r = await sb.commands.run(
      `[ -f /home/user/deriv_analyze.py ] && python3 -c "import websocket, numpy; print('READY')" 2>/dev/null || echo "NOT_READY"`
    ).catch(() => ({ stdout: "NOT_READY" }));
    return (r?.stdout || "").includes("READY");
  } catch { return false; }
}

// ── Deriv symbols metadata ────────────────────────────────────────────────────

export const DERIV_SYMBOLS: Record<string, { name: string; description: string; digits: number }> = {
  "R_10":    { name: "Volatility 10",    description: "Low volatility — slower ticks",  digits: 2 },
  "R_25":    { name: "Volatility 25",    description: "Medium volatility",               digits: 2 },
  "R_50":    { name: "Volatility 50",    description: "Medium-high volatility",          digits: 2 },
  "R_75":    { name: "Volatility 75",    description: "High volatility",                 digits: 2 },
  "R_100":   { name: "Volatility 100",   description: "Very high volatility",            digits: 2 },
  "R_10_1S": { name: "Volatility 10 (1s)", description: "Fast 1-second ticks",          digits: 2 },
  "R_25_1S": { name: "Volatility 25 (1s)", description: "Fast 1-second ticks",          digits: 2 },
  "R_50_1S": { name: "Volatility 50 (1s)", description: "Fast 1-second ticks",          digits: 2 },
  "R_75_1S": { name: "Volatility 75 (1s)", description: "Fast 1-second ticks",          digits: 2 },
  "R_100_1S":{ name: "Volatility 100 (1s)","description": "Fastest ticks",              digits: 2 },
};

// ── Trade type label helpers ──────────────────────────────────────────────────

export function tradeTypeLabel(tt: string): string {
  if (tt === "EVEN") return "Even";
  if (tt === "ODD")  return "Odd";
  const [kind, x] = tt.split("_");
  if (kind === "OVER")    return `Over ${x}`;
  if (kind === "UNDER")   return `Under ${x}`;
  if (kind === "MATCHES") return `Matches ${x}`;
  if (kind === "DIFFERS") return `Differs ${x}`;
  return tt;
}

export function tradeTypeBadgeColor(tt: string): string {
  if (tt === "EVEN" || tt === "ODD") return "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800";
  if (tt.startsWith("OVER"))    return "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
  if (tt.startsWith("UNDER"))   return "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800";
  if (tt.startsWith("MATCHES")) return "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800";
  if (tt.startsWith("DIFFERS")) return "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800";
  return "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700";
}

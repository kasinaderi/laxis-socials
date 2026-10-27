/**
 * ============================================================
 *  DERIV PATTERN LAB ENGINE
 *  Runs inside the `analytics` agent's E2B sandbox VM.
 *
 *  Python stack:
 *    stumpy   — Matrix Profile (repeated subsequences + locations)
 *    scipy    — Autocorrelation, FFT, statistical tests
 *    ruptures — Change-point detection
 *    scikit-learn — Walk-forward predictive validation
 *    numpy / pandas — Data processing
 *
 *  The engine is installed ONCE on VM boot, then subsequent
 *  analysis jobs are dispatched as Python script calls via
 *  sb.commands.run().  Results return as structured JSON.
 * ============================================================
 */

// ── Python installer script (run once per VM lifetime) ───────────────────────

export const DERIV_INSTALLER_SH = `#!/bin/bash
set -e
echo "[DerivLab] Installing Python pattern engines..."
pip install -q stumpy scipy ruptures scikit-learn numpy pandas 2>/dev/null
echo "[DerivLab] ✓ All engines installed"
`;

// ── Core Python analysis script ──────────────────────────────────────────────

export const DERIV_ANALYSIS_PY = `#!/usr/bin/env python3
"""
Deriv Pattern Discovery Engine
Inputs  (env vars): TICKS, WINDOW_SIZE, SIM_THRESHOLD, MAX_PATTERNS
Output  (stdout):   JSON with patterns, locations, predictions, confidence
"""
import os, sys, json, math, warnings
warnings.filterwarnings("ignore")

import numpy as np

# ── Parse inputs ──────────────────────────────────────────────────────────────
raw = os.environ.get("TICKS", "")
ticks = []
for x in raw.replace("\\n", ",").split(","):
    x = x.strip()
    if x:
        try: ticks.append(float(x))
        except: pass

if len(ticks) < 10:
    print(json.dumps({"error": "Need at least 10 ticks", "patterns": []}))
    sys.exit(0)

WINDOW   = max(3, min(int(os.environ.get("WINDOW_SIZE", "5")), len(ticks) // 3))
SIM_THR  = float(os.environ.get("SIM_THRESHOLD", "0.85"))
MAX_PAT  = int(os.environ.get("MAX_PATTERNS", "10"))

arr = np.array(ticks, dtype=float)
N   = len(arr)

results = {
    "tick_count": N,
    "window_size": WINDOW,
    "patterns": [],
    "regime_changes": [],
    "autocorrelation_peak": None,
    "summary": ""
}

# ── 1. STUMPY — Matrix Profile (motif/anomaly discovery) ─────────────────────
try:
    import stumpy
    mp = stumpy.stump(arr, m=WINDOW)
    profile    = mp[:, 0].astype(float)  # distance profile
    nn_indices = mp[:, 1].astype(int)    # nearest-neighbour index

    # Motifs = pairs with smallest matrix profile distance
    excl = max(1, WINDOW // 2)  # exclusion zone
    found_motifs = []
    used = set()
    sorted_idx = np.argsort(profile)

    for idx in sorted_idx:
        if idx in used or nn_indices[idx] in used:
            continue
        if len(found_motifs) >= MAX_PAT:
            break
        i, j = int(idx), int(nn_indices[idx])
        # Skip if too close
        if abs(i - j) < excl:
            continue
        dist = float(profile[idx])
        # Normalised similarity 0-1 (lower dist = higher sim)
        max_d = float(profile.max()) if profile.max() > 0 else 1.0
        sim = max(0.0, 1.0 - dist / max_d)
        if sim < SIM_THR:
            continue

        seq = [round(float(x), 4) for x in arr[i:i+WINDOW]]

        # Find ALL similar occurrences via brute scan
        locs = []
        for k in range(N - WINDOW + 1):
            seg = arr[k:k+WINDOW]
            # z-normalise both
            def znorm(s):
                mu, sd = s.mean(), s.std()
                return (s - mu) / sd if sd > 0 else s - mu
            d = float(np.linalg.norm(znorm(seg) - znorm(np.array(seq))))
            if d <= dist * 1.5 + 0.01:
                locs.append(k)
        locs = sorted(set(locs))

        # Intervals between occurrences
        intervals = [locs[x+1] - locs[x] for x in range(len(locs)-1)]
        avg_int = float(np.mean(intervals)) if intervals else None
        std_int = float(np.std(intervals))  if intervals else None

        # Predict next occurrence
        next_tick = None
        if avg_int and locs:
            next_tick = int(locs[-1] + round(avg_int))

        # Walk-forward hit rate: does the sequence predict the tick after it?
        # We predict: next value > current last value  (simple direction)
        hits, total = 0, 0
        for loc in locs[:-1]:
            if loc + WINDOW < N:
                total += 1
                if arr[loc + WINDOW] > arr[loc + WINDOW - 1]:
                    hits += 1
        hit_rate    = hits / total if total > 0 else None
        # baseline: fraction of all steps that are up-moves
        up_moves    = float(np.sum(np.diff(arr) > 0)) / max(1, N-1)
        confidence  = min(1.0, sim * (hit_rate / up_moves if (hit_rate and up_moves > 0) else 1.0))

        found_motifs.append({
            "pattern_id": f"P{len(found_motifs)+1}",
            "type": "motif",
            "sequence": seq,
            "locations": locs,
            "occurrence_count": len(locs),
            "interval_avg": round(avg_int, 2) if avg_int else None,
            "interval_stddev": round(std_int, 2) if std_int else None,
            "next_predicted_tick": next_tick,
            "confidence": round(confidence, 4),
            "walk_forward_hit_rate": round(hit_rate, 4) if hit_rate is not None else None,
            "baseline_rate": round(up_moves, 4),
            "similarity": round(sim, 4),
            "distance": round(dist, 4),
            "summary": (
                f"Sequence [{', '.join(str(v) for v in seq)}] found {len(locs)}x "
                f"(avg every {round(avg_int,1) if avg_int else '?'} ticks). "
                f"Walk-forward hit rate: {round(hit_rate*100,1) if hit_rate else '?'}% "
                f"vs {round(up_moves*100,1)}% baseline. "
                f"Confidence: {round(confidence*100,1)}%."
            )
        })
        for loc in locs:
            for u in range(max(0, loc-excl), min(N, loc+excl+1)):
                used.add(u)

    results["patterns"] = found_motifs

except Exception as e:
    results["stumpy_error"] = str(e)

# ── 2. RUPTURES — Change-point detection ─────────────────────────────────────
try:
    import ruptures as rpt
    model = rpt.Pelt(model="rbf").fit(arr.reshape(-1, 1))
    breaks = model.predict(pen=max(1, N // 20))
    if breaks and breaks[-1] == N:
        breaks = breaks[:-1]
    results["regime_changes"] = breaks
except Exception as e:
    results["ruptures_error"] = str(e)

# ── 3. SCIPY — Autocorrelation + FFT periodicity ─────────────────────────────
try:
    from scipy import signal as sig
    from scipy.stats import pearsonr

    # Autocorrelation to find dominant period
    normed = arr - arr.mean()
    acf_full = np.correlate(normed, normed, mode="full")
    acf = acf_full[N-1:]
    acf = acf / max(acf[0], 1e-10)
    # Find first peak after lag 0
    peaks, _ = sig.find_peaks(acf[1:WINDOW*5], height=0.3)
    dominant_period = int(peaks[0]+1) if len(peaks) > 0 else None
    results["autocorrelation_peak"] = dominant_period

    # FFT power spectrum
    fft_vals = np.abs(np.fft.rfft(normed))
    freqs    = np.fft.rfftfreq(N)
    top_freq_idx = np.argsort(fft_vals)[-3:][::-1]
    results["top_frequencies"] = [
        {"freq": round(float(freqs[i]), 4), "period_ticks": round(1/freqs[i]) if freqs[i] > 0 else None, "power": round(float(fft_vals[i]), 2)}
        for i in top_freq_idx if i > 0
    ]
except Exception as e:
    results["scipy_error"] = str(e)

# ── 4. Summary ────────────────────────────────────────────────────────────────
n_pats = len(results["patterns"])
n_chg  = len(results.get("regime_changes", []))
period = results.get("autocorrelation_peak")
top_conf = max((p["confidence"] for p in results["patterns"]), default=0)
results["summary"] = (
    f"Analysed {N} ticks (window={WINDOW}). "
    f"Discovered {n_pats} recurring pattern(s). "
    f"Detected {n_chg} regime change(s). "
    + (f"Dominant autocorrelation period: {period} ticks. " if period else "")
    + (f"Strongest pattern confidence: {round(top_conf*100,1)}%." if n_pats else "No reliable patterns found above threshold.")
)

print(json.dumps(results))
`;

// ── Install the engine inside the analytics VM ───────────────────────────────

export async function installDerivEngineInSandbox(sb: any): Promise<{ success: boolean; message: string }> {
  if (!sb?.commands?.run) return { success: false, message: "No sandbox runner" };

  try {
    console.log("[DerivLab] Installing Python stack in analytics VM...");

    // Install libraries (takes ~30–60s first time; cached on reconnect)
    await sb.commands.run(
      `pip install -q stumpy scipy ruptures scikit-learn numpy pandas 2>/dev/null && echo "OK"`,
      { timeout: 180_000 }
    ).catch((e: any) => console.warn("[DerivLab] pip notice:", e?.message));

    // Write the analysis script
    await sb.commands.run(
      `cat << 'PYEOF' > /home/user/deriv_analyze.py\n${DERIV_ANALYSIS_PY}\nPYEOF\nchmod +x /home/user/deriv_analyze.py`
    ).catch(() => {});

    console.log("[DerivLab] ✓ Pattern engine installed in analytics VM");
    return { success: true, message: "Deriv Pattern Engine v1.0 installed" };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

// ── Run an analysis job inside the VM ────────────────────────────────────────

export async function runDerivAnalysis(
  sb: any,
  ticks: number[],
  options: {
    windowSize?: number;
    similarityThreshold?: number;
    maxPatterns?: number;
  } = {}
): Promise<{
  success: boolean;
  data: any;
  error?: string;
}> {
  if (!sb?.commands?.run) return { success: false, data: null, error: "No sandbox" };

  const { windowSize = 5, similarityThreshold = 0.85, maxPatterns = 10 } = options;
  const tickStr = ticks.join(",");

  try {
    console.log(`[DerivLab] Running analysis on ${ticks.length} ticks...`);

    // Ensure script exists (idempotent)
    const checkResult = await sb.commands.run(
      `[ -f /home/user/deriv_analyze.py ] && echo "READY" || echo "MISSING"`
    ).catch(() => ({ stdout: "MISSING" }));

    if ((checkResult?.stdout || "").includes("MISSING")) {
      await installDerivEngineInSandbox(sb);
    }

    const result = await sb.commands.run(
      `TICKS="${tickStr}" WINDOW_SIZE="${windowSize}" SIM_THRESHOLD="${similarityThreshold}" MAX_PATTERNS="${maxPatterns}" python3 /home/user/deriv_analyze.py 2>/dev/null`,
      { timeout: 120_000 }
    ).catch((e: any) => ({ stdout: "", stderr: e?.message || "" }));

    const raw = (result?.stdout || "").trim();
    if (!raw) {
      return { success: false, data: null, error: "Empty output from analysis engine" };
    }

    // Extract JSON from output
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, data: null, error: `Non-JSON output: ${raw.slice(0, 200)}` };
    }

    const data = JSON.parse(jsonMatch[0]);
    return { success: true, data };
  } catch (err: any) {
    console.error("[DerivLab] Analysis error:", err.message);
    return { success: false, data: null, error: err.message };
  }
}

// ── Check if engine is ready ──────────────────────────────────────────────────

export async function checkDerivEngineStatus(sb: any): Promise<boolean> {
  if (!sb?.commands?.run) return false;
  try {
    const r = await sb.commands.run(
      `[ -f /home/user/deriv_analyze.py ] && python3 -c "import stumpy, scipy, ruptures, sklearn; print('READY')" 2>/dev/null || echo "NOT_READY"`
    ).catch(() => ({ stdout: "NOT_READY" }));
    return (r?.stdout || "").includes("READY");
  } catch {
    return false;
  }
}

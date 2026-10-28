"use strict";

/* Central Component Registry & Helpers */
if (typeof COMP === "undefined") {
  var COMP = {};
  var ORDER = [];
}
if (typeof def === "undefined") {
  var def = function(o) { COMP[o.type] = o; ORDER.push(o.type); };
}

/* Helper for switch state resolution */
const swState = (p, n) => {
  if (p.state === "open" || p.state === "0") return 0;
  const v = +p.state;
  return (isFinite(v) && v >= 1 && v <= n) ? Math.round(v) : 1;
};

/* Helper to parse frequency strings like "1.5 GHz", "500 MHz", "100 kHz", or numbers into Hz */
function parseFreqHz(val) {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return isFinite(val) ? val : null;
  const s = String(val).trim().toLowerCase();
  const m = s.match(/^([\d.]+)\s*(ghz|mhz|khz|hz|thz)?$/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (!isFinite(num)) return null;
  const u = m[2] || "ghz";
  const mult = (u === "ghz") ? 1e9 : (u === "mhz") ? 1e6 : (u === "khz") ? 1e3 : (u === "thz") ? 1e12 : 1.0;
  return num * mult;
}

/* Helper to resolve active upstream signal source frequency */
function getActiveSourceFreqHz() {
  try {
    const getBlks = typeof allBlocks === "function" ? allBlocks : (typeof globalThis !== "undefined" && typeof globalThis.allBlocks === "function" ? globalThis.allBlocks : null);
    const compRegistry = (typeof COMP !== "undefined" && Object.keys(COMP).length) ? COMP : (typeof globalThis !== "undefined" && globalThis.COMP ? globalThis.COMP : null);
    if (getBlks && compRegistry) {
      const blks = getBlks();
      if (Array.isArray(blks)) {
        for (const b of blks) {
          if (!b) continue;
          const c = compRegistry[b.type];
          const isSrc = c && (typeof c.isSource === "function" ? c.isSource(b.params) : c.isSource);
          if (isSrc && b.params && b.params.freq) {
            const f = parseFreqHz(b.params.freq);
            if (f !== null) return f;
          }
        }
      }
    }
  } catch (_) {}
  return null;
}

/* Helper to compute frequency-dependent equalizer loss */
function eqLoss(p) {
  const minLoss = Math.abs(+p.minLoss || 0);
  const slope = Math.abs(+p.slope || 0);
  const f1 = parseFreqHz(p.f1);
  const f2 = parseFreqHz(p.f2);

  // 1. Explicit operating frequency on component
  let fOp = parseFreqHz(p.opFreq || p.freq);

  // 2. Fallback to active source block frequency if available
  if (fOp === null) {
    fOp = getActiveSourceFreqHz();
  }

  // 3. Fallback to mid-band if f1 and f2 are valid, otherwise static mid-band
  if (f1 === null || f2 === null || f2 <= f1) {
    return minLoss + slope / 2;
  }

  if (fOp === null) {
    return minLoss + slope / 2;
  }

  // Clamp operating frequency to [f1, f2]
  const clampedF = Math.max(f1, Math.min(f2, fOp));
  const frac = (clampedF - f1) / (f2 - f1);

  const isNeg = (p.slopeType === "Negative");
  const loss = isNeg ? (minLoss + slope * frac) : (minLoss + slope * (1 - frac));
  return Math.max(0, loss);
}

if (typeof globalThis !== "undefined") {
  globalThis.parseFreqHz = parseFreqHz;
  globalThis.getActiveSourceFreqHz = getActiveSourceFreqHz;
  globalThis.eqLoss = eqLoss;
}

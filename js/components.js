"use strict";

/* Component Registry */
const COMP = {};
const ORDER = [];
function def(o) { COMP[o.type] = o; ORDER.push(o.type); }

/* Helper for switch state resolution */
const swState = (p, n) => {
  if (p.state === "open" || p.state === "0") return 0;
  const v = +p.state;
  return (isFinite(v) && v >= 1 && v <= n) ? Math.round(v) : 1;
};

/* --- Sources ------------------------------------------------------ */
def({
  type: "source", keys: "signal generator cw carrier input", name: "Source", group: "Sources", w: 80, h: 80,
  ports: [{ id: "out", side: "right", kind: "out", dx: 80, dy: 40 }],
  params: { label: "SRC", power: 0, primaryPower: 0, secondaryPower: 0, freq: "1 GHz", anaPort: "None" },
  fields: [{ key: "anaPort", label: "Analysis Port", type: "select", options: ["None", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"] },
           { key: "primaryPower", label: "Primary input level", unit: "dBm", step: 0.5 },
           { key: "secondaryPower", label: "Secondary input level", unit: "dBm", step: 0.5 },
           { key: "power", label: "Legacy input level", unit: "dBm", step: 0.5 },
           { key: "freq", label: "Frequency", type: "text" }],
  isSource: () => true, srcOut: () => "out", srcPower: (p, mode) => getSelectedSourcePower(p, mode), val: p => dbm(getSelectedSourcePower(p)),
  info: p => p.freq || "",
  sym() { return `<circle class="blk-shape" cx="40" cy="40" r="38"/><path class="blk-glyph" d="M20 40 q10 -14 20 0 t20 0"/>`; }
});

def({
  type: "lo", keys: "oscillator local synth vco source", name: "LO / Osc", group: "Frequency", w: 80, h: 80,
  ports: [{ id: "out", side: "top", kind: "out", dx: 40, dy: 0 }],
  params: { label: "LO", power: 10, primaryPower: 10, secondaryPower: 10, freq: "0.9 GHz", anaPort: "None" },
  fields: [{ key: "anaPort", label: "Analysis Port", type: "select", options: ["None", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"] },
           { key: "primaryPower", label: "Primary drive level", unit: "dBm", step: 0.5 },
           { key: "secondaryPower", label: "Secondary drive level", unit: "dBm", step: 0.5 },
           { key: "power", label: "Legacy drive level", unit: "dBm", step: 0.5 },
           { key: "freq", label: "Frequency", type: "text" }],
  isSource: () => true, srcOut: () => "out", srcPower: (p, mode) => getSelectedSourcePower(p, mode), val: p => dbm(getSelectedSourcePower(p)),
  info: p => p.freq || "",
  sym() { return `<circle class="blk-shape" cx="40" cy="40" r="38"/><path class="blk-glyph" d="M20 40 q10 -14 20 0 t20 0"/>`; }
});

/* --- Gain / Loss -------------------------------------------------- */
def({
  type: "amp", keys: "amplifier lna pa gain driver buffer", name: "Amplifier", group: "Gain / Loss", w: 80, h: 80,
  ports: [{ id: "in", side: "left", kind: "in", dx: 0, dy: 40 }, { id: "out", side: "right", kind: "out", dx: 80, dy: 40 }],
  params: { label: "AMP", gain: 15, nf: 2, p1db: 20, oip3: 30 },
  fields: [{ key: "gain", label: "Gain", unit: "dB", step: 0.5 }, { key: "nf", label: "Noise figure", unit: "dB", step: 0.1 },
           { key: "p1db", label: "Output P1dB", unit: "dBm", step: 0.5 }, { key: "oip3", label: "Output IP3", unit: "dBm", step: 0.5 }],
  out: p => ({ out: +p.gain }), val: p => { const nfv = Math.abs(p.nf || 0); return gsign(p.gain) + (nfv > 0 ? ' · NF ' + fmt(nfv) + ' dB' : ''); }, nf: p => Math.abs(p.nf || 0),
  p1db: p => num(p.p1db), oip3: p => num(p.oip3),
  sym() { return `<path class="blk-shape" d="M0 4L80 40L0 76Z"/>`; }
});

def({
  type: "bamp", keys: "bypass amplifier lna amp tsy-83ln+ switch bypass mode active passive by_amp", name: "Bypass Amplifier", group: "Gain / Loss", w: 80, h: 80,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 40 }, { id: "out", side: "right", kind: "inout", dx: 80, dy: 40 }],
  params: { label: "By_Amp", mode: "Amp Mode", gain: 18, nf: 1.2, bypLoss: 1.8, p1db: 20, oip3: 32 },
  fields: [{ key: "mode", label: "Mode", type: "select", options: ["Amp Mode", "Bypass Mode"] },
           { key: "gain", label: "Amp Gain", unit: "dB", step: 0.5 },
           { key: "nf", label: "Noise figure", unit: "dB", step: 0.1 },
           { key: "bypLoss", label: "Bypass loss", unit: "dB", step: 0.1, min: 0 },
           { key: "p1db", label: "Output P1dB", unit: "dBm", step: 0.5 },
           { key: "oip3", label: "Output IP3", unit: "dBm", step: 0.5 }],
  out: p => (p.mode === "Bypass Mode" ? { out: -Math.abs(+p.bypLoss || 0) } : { out: +p.gain }),
  nf: p => (p.mode === "Bypass Mode" ? Math.abs(+p.bypLoss || 0) : Math.abs(+p.nf || 0)),
  p1db: p => (p.mode === "Bypass Mode" ? undefined : num(p.p1db)),
  oip3: p => (p.mode === "Bypass Mode" ? undefined : num(p.oip3)),
  val: p => { const isByp = p.mode === 'Bypass Mode'; const gainStr = isByp ? ('BYP \u2212' + fmt(Math.abs(+p.bypLoss||0)) + ' dB') : gsign(p.gain); const nfv = isByp ? Math.abs(+p.bypLoss||0) : Math.abs(+p.nf||0); return gainStr + (nfv > 0 ? ' · NF ' + fmt(nfv) + ' dB' : ''); },
  sym(p) {
    const isByp = (p && p.mode === "Bypass Mode");
    const topSw = isByp ? `<path class="blk-line" d="M24 20H52"/>` : `<path class="blk-line" d="M24 20L48 8"/>`;
    const botSw = isByp ? `<path class="blk-line" d="M48 56L60 44"/>` : `<path class="blk-line" d="M48 56H64"/>`;
    return `<rect class="blk-shape" x="0" y="4" width="80" height="72" rx="8"/>` +
           `<path class="blk-line" d="M0 40H12V20H24M52 20H68V56M68 40H80"/>` +
           `<path class="blk-line" d="M12 40V56H20M44 56H48M64 56H68"/>` +
           `<path class="blk-glyph" d="M20 44L44 56L20 68Z"/>` +
           topSw +
           botSw;
  }
});

def({
  type: "atten", keys: "pad attenuation loss fixed step", name: "Attenuator", group: "Gain / Loss", w: 80, h: 80,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 40 }, { id: "out", side: "right", kind: "inout", dx: 80, dy: 40 }],
  params: { label: "ATT", loss: 10 },
  fields: [{ key: "loss", label: "Attenuation", unit: "dB", step: 0.5, min: 0 }], nf: p => Math.abs(p.loss),
  out: p => ({ out: -Math.abs(p.loss) }), val: p => "\u2212" + fmt(Math.abs(p.loss)) + " dB",
  bidi: (m, p) => rl(m, Math.abs(p.loss)),
  sym() {
    return `<rect class="blk-shape" x="0" y="8" width="80" height="64" rx="8"/>` +
           `<path class="blk-glyph" d="M40 16v6l-12 4.5 24 9-24 9 24 9-12 4.5v6"/>`;
  }
});

def({
  type: "dsa", keys: "dsa dat digital attenuator step variable control pad dca", name: "Digital Attenuator", group: "Gain / Loss", w: 80, h: 80,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 40 }, { id: "out", side: "right", kind: "inout", dx: 80, dy: 40 }],
  params: { label: "DSA", loss: 10 },
  fields: [{ key: "loss", label: "Attenuation", unit: "dB", step: 0.5, min: 0 }], nf: p => Math.abs(p.loss),
  out: p => ({ out: -Math.abs(p.loss) }), val: p => "\u2212" + fmt(Math.abs(p.loss)) + " dB",
  bidi: (m, p) => rl(m, Math.abs(p.loss)),
  sym() {
    return `<rect class="blk-shape" x="0" y="8" width="80" height="64" rx="8"/>` +
           `<path class="blk-glyph" d="M40 16v6l-12 4.5 24 9-24 9 24 9-12 4.5v6"/>` +
           `<path class="blk-glyph" d="M18 62L62 18"/>` +
           `<path class="blk-fillg" d="M62 18L46 26L54 34Z"/>`;
  }
});

def({
  type: "eq", keys: "equalizer equaliser slope cable compensation gain loss tilt pad", name: "Equalizer", group: "Gain / Loss", w: 80, h: 80,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 40 }, { id: "out", side: "right", kind: "inout", dx: 80, dy: 40 }],
  params: { label: "EQ", slope: 3, minLoss: 1 },
  fields: [{ key: "slope", label: "Slope compensation", unit: "dB", step: 0.5, min: 0 },
           { key: "minLoss", label: "Min insertion loss", unit: "dB", step: 0.1, min: 0 }],
  nf: p => Math.abs(+p.minLoss || 0) + Math.abs(+p.slope || 0) / 2,
  out: p => ({ out: -(Math.abs(+p.minLoss || 0) + Math.abs(+p.slope || 0) / 2) }),
  val: p => "IL \u2212" + fmt(Math.abs(+p.minLoss || 0) + Math.abs(+p.slope || 0) / 2) + " dB",
  info: p => "Slope " + fmt(Math.abs(+p.slope || 0)) + " dB",
  bidi: (m, p) => rl(m, Math.abs(+p.minLoss || 0) + Math.abs(+p.slope || 0) / 2),
  sym() {
    return `<rect class="blk-shape" x="0" y="8" width="80" height="64" rx="8"/>` +
           `<path class="blk-glyph" d="M16 56L64 24"/>` +
           `<path class="blk-fillg" d="M64 24L48 28L56 36Z"/>` +
           `<path class="blk-glyph" d="M20 28Q28 40 36 28"/>` +
           `<path class="blk-glyph" d="M44 52Q52 40 60 52"/>`;
  }
});

def({
  type: "limiter", keys: "clip clamp protection limit", name: "Limiter", group: "Gain / Loss", w: 80, h: 80,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 40 }, { id: "out", side: "right", kind: "inout", dx: 80, dy: 40 }],
  params: { label: "LIM", thresh: 10, il: 0.5 },
  fields: [{ key: "thresh", label: "Limit threshold", unit: "dBm", step: 0.5 }, { key: "il", label: "Insertion loss", unit: "dB", step: 0.1, min: 0 }], nf: p => Math.abs(p.il),
  out: p => ({ out: -Math.abs(p.il) }),
  xfer: (ref, p) => ({ out: Math.min(ref, +p.thresh) - Math.abs(p.il) }),
  bidi: (m, p) => {
    const th = +p.thresh, d = Math.abs(p.il), o = {};
    if (m.in !== undefined) o.out = Math.min(m.in, th) - d;
    if (m.out !== undefined) o.in = Math.min(m.out, th) - d;
    return o;
  },
  sym() {
    return `<rect class="blk-shape" x="0" y="8" width="80" height="64" rx="8"/>` +
           `<path class="blk-line" d="M0 40H80"/>` +
           `<path class="blk-fillg" d="M28 26L52 26L40 44Z"/>` +
           `<path class="blk-glyph" d="M28 44H52"/>` +
           `<path class="blk-glyph" d="M30 56H50M34 62H46"/>`;
  }
});

def({
  type: "trace", keys: "line cable coax microstrip length loss", name: "Line / Trace", group: "Gain / Loss", w: 80, h: 80,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 40 }, { id: "out", side: "right", kind: "inout", dx: 80, dy: 40 }],
  params: { label: "LINE", loss: 1 },
  fields: [{ key: "loss", label: "Trace loss", unit: "dB", step: 0.1, min: 0 }], nf: p => Math.abs(p.loss),
  out: p => ({ out: -Math.abs(p.loss) }), val: p => "\u2212" + fmt(Math.abs(p.loss)) + " dB",
  bidi: (m, p) => rl(m, Math.abs(p.loss)),
  sym() { return `<rect class="blk-shape" x="0" y="26" width="80" height="28" rx="14"/><path class="blk-glyph" d="M12 40H68" stroke-dasharray="2 3"/>`; }
});

/* --- Filtering ---------------------------------------------------- */
def({
  type: "filter", keys: "bpf lpf hpf bsf notch band pass reject cavity saw", name: "Filter", group: "Filtering", w: 80, h: 80,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 40 }, { id: "out", side: "right", kind: "inout", dx: 80, dy: 40 }],
  params: { label: "BPF", ftype: "BPF", il: 1.5, rej: 40, band: "passband", fc: "" },
  fields: [{ key: "ftype", label: "Response", type: "select", options: ["LPF", "HPF", "BPF", "BSF"] },
           { key: "band", label: "Signal is in", type: "select", options: ["passband", "stopband"] },
           { key: "il", label: "Passband IL", unit: "dB", step: 0.1, min: 0 },
           { key: "rej", label: "Stopband rejection", unit: "dB", step: 1, min: 0 },
           { key: "fc", label: "Corner / center", type: "text" }], nf: p => fLoss(p),
  out: p => ({ out: -fLoss(p) }), val: p => { const loss = fLoss(p); return (p.band === 'stopband') ? ('REJ \u2212' + fmt(loss) + ' dB') : ('\u2212' + fmt(Math.abs(p.il)) + ' dB'); },
  info: p => p.ftype ? (p.ftype + (p.fc ? ' · ' + p.fc : '')) : (p.fc || ''),
  bidi: (m, p) => rl(m, fLoss(p)),
  sym(p) {
    const ix = 16, iw = 48, iy = 20, ih = 34, yB = iy + ih, yT = iy + 6, m = f => ix + iw * f;
    const cv = {
      LPF: [[ix, yT], [m(.42), yT], [m(.7), yB], [ix + iw, yB]],
      HPF: [[ix, yB], [m(.3), yB], [m(.58), yT], [ix + iw, yT]],
      BPF: [[ix, yB], [m(.28), yB], [m(.42), yT], [m(.58), yT], [m(.72), yB], [ix + iw, yB]],
      BSF: [[ix, yT], [m(.3), yT], [m(.45), yB], [m(.55), yB], [m(.7), yT], [ix + iw, yT]]
    };
    const pts = (cv[p.ftype] || cv.BPF).map(a => a.join(" ")).join("L");
    return `<rect class="blk-shape" x="0" y="8" width="80" height="64" rx="8"/><path class="blk-glyph" d="M${pts}"/>${p.band === "stopband" ? `<path class="blk-glyph" d="M14 66L66 14" stroke-dasharray="3 2"/>` : ""}`;
  }
});

def({
  type: "tfilter", keys: "tunable filter bpf lpf hpf bsf varactor tracking agile band pass reject", name: "Tunable Filter", group: "Filtering", w: 80, h: 80,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 40 }, { id: "out", side: "right", kind: "inout", dx: 80, dy: 40 }],
  params: { label: "TFIL", ftype: "BPF", il: 2.0, rej: 40, band: "passband", fc: "1-2 GHz" },
  fields: [{ key: "ftype", label: "Response", type: "select", options: ["LPF", "HPF", "BPF", "BSF"] },
           { key: "band", label: "Signal is in", type: "select", options: ["passband", "stopband"] },
           { key: "il", label: "Passband IL", unit: "dB", step: 0.1, min: 0 },
           { key: "rej", label: "Stopband rejection", unit: "dB", step: 1, min: 0 },
           { key: "fc", label: "Tuning range / fc", type: "text" }], nf: p => fLoss(p),
  out: p => ({ out: -fLoss(p) }), val: p => { const loss = fLoss(p); return (p.band === 'stopband') ? ('REJ \u2212' + fmt(loss) + ' dB') : ('\u2212' + fmt(Math.abs(p.il)) + ' dB'); },
  info: p => p.ftype ? (p.ftype + (p.fc ? ' · ' + p.fc : '')) : (p.fc || ''),
  bidi: (m, p) => rl(m, fLoss(p)),
  sym(p) {
    const ix = 16, iw = 48, iy = 20, ih = 34, yB = iy + ih, yT = iy + 6, m = f => ix + iw * f;
    const cv = {
      LPF: [[ix, yT], [m(.42), yT], [m(.7), yB], [ix + iw, yB]],
      HPF: [[ix, yB], [m(.3), yB], [m(.58), yT], [ix + iw, yT]],
      BPF: [[ix, yB], [m(.28), yB], [m(.42), yT], [m(.58), yT], [m(.72), yB], [ix + iw, yB]],
      BSF: [[ix, yT], [m(.3), yT], [m(.45), yB], [m(.55), yB], [m(.7), yT], [ix + iw, yT]]
    };
    const pts = (cv[p.ftype] || cv.BPF).map(a => a.join(" ")).join("L");
    return `<rect class="blk-shape" x="0" y="8" width="80" height="64" rx="8"/>` +
           `<path class="blk-glyph" d="M${pts}"/>` +
           `<path class="blk-glyph" d="M16 64L64 16"/>` +
           `<path class="blk-fillg" d="M64 16L48 24L56 32Z"/>`;
  }
});

/* --- Frequency ---------------------------------------------------- */
def({
  type: "mixer", keys: "downconvert upconvert conversion image if rf lo", name: "Mixer", group: "Frequency", w: 80, h: 80, topLabel: true,
  ports: [{ id: "rf", side: "left", kind: "in", dx: 0, dy: 40 }, { id: "if", side: "right", kind: "out", dx: 80, dy: 40 }, { id: "lo", side: "bottom", kind: "in", dx: 40, dy: 80 }],
  params: { label: "MIX", cl: 7, p1db: 5, oip3: 15 },
  fields: [{ key: "cl", label: "Conversion loss", unit: "dB", step: 0.5, min: 0 },
           { key: "p1db", label: "Output P1dB", unit: "dBm", step: 0.5 }, { key: "oip3", label: "Output IP3", unit: "dBm", step: 0.5 }], nf: p => Math.abs(p.cl),
  p1db: p => num(p.p1db), oip3: p => num(p.oip3),
  ref: m => m.rf, refIn: "rf", out: p => ({ if: -Math.abs(p.cl) }), val: p => "CL " + fmt(Math.abs(p.cl)) + " dB",
  sym() { return `<circle class="blk-shape" cx="40" cy="40" r="38"/><path class="blk-glyph" d="M18 18L62 62M18 62L62 18"/>`; }
});

def({
  type: "multiplier", keys: "frequency multiplier doubler tripler quadrupler x2 x3 x4 comb xn", name: "Multiplier", group: "Frequency", w: 80, h: 80,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 40 }, { id: "out", side: "right", kind: "inout", dx: 80, dy: 40 }],
  params: { label: "MULT", factor: "2", il: 0 },
  fields: [{ key: "factor", label: "Factor (\u00d7N)", type: "text" },
           { key: "il", label: "Loss / Gain", unit: "dB", step: 0.5 }], nf: p => Math.max(0, +p.il || 0),
  out: p => ({ out: -(+p.il || 0) }), val: p => "\u00d7" + (p.factor || "2"),
  bidi: (m, p) => rl(m, +p.il || 0),
  sym(p) {
    const f = (p && p.factor) ? p.factor : "2";
    return `<rect class="blk-shape" x="0" y="8" width="80" height="64" rx="8"/>` +
           `<text class="ic-tag" x="40" y="48" text-anchor="middle">\u00d7${f}</text>`;
  }
});

def({
  type: "divider", keys: "frequency divider prescaler /2 /4 /8 div divide digital counter", name: "Divider", group: "Frequency", w: 80, h: 80,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 40 }, { id: "out", side: "right", kind: "inout", dx: 80, dy: 40 }],
  params: { label: "DIV", factor: "2", il: 1.0 },
  fields: [{ key: "factor", label: "Factor (\u00f7N)", type: "text" },
           { key: "il", label: "Insertion loss", unit: "dB", step: 0.1, min: 0 }], nf: p => Math.abs(p.il || 0),
  out: p => ({ out: -Math.abs(p.il || 0) }), val: p => "\u00f7" + (p.factor || "2"),
  bidi: (m, p) => rl(m, Math.abs(p.il || 0)),
  sym(p) {
    const f = (p && p.factor) ? p.factor : "2";
    return `<rect class="blk-shape" x="0" y="8" width="80" height="64" rx="8"/>` +
           `<text class="ic-tag" x="40" y="48" text-anchor="middle">\u00f7${f}</text>`;
  }
});

def({
  type: "pll", keys: "pll synthesizer phase locked loop frequency synth vco lo generator source reference ref", name: "PLL Synthesizer", group: "Frequency", w: 80, h: 80,
  ports: [{ id: "ref", side: "left", kind: "in", dx: 0, dy: 40 }, { id: "out", side: "right", kind: "out", dx: 80, dy: 40 }],
  params: { label: "PLL", power: 10, freq: "2.4 GHz", refFreq: "10 MHz" },
  fields: [{ key: "power", label: "Output level", unit: "dBm", step: 0.5 },
           { key: "freq", label: "RF Frequency", type: "text" },
           { key: "refFreq", label: "Ref Frequency", type: "text" }],
  isSource: () => true, srcOut: () => "out", srcPower: p => p.power, val: p => p.freq || "",
  sym() {
    return `<rect class="blk-shape" x="0" y="8" width="80" height="64" rx="8"/>` +
           `<text class="ic-tag" x="40" y="48" text-anchor="middle">PLL</text>`;
  }
});

/* --- Routing ------------------------------------------------------ */
def({
  type: "splitter", keys: "divider power divider wilkinson split fan-out 1:n way", name: "Splitter", group: "Routing", w: 160, h: 160,
  dynSize: p => ({ w: 80, h: 80 * cint(p.ways, 2, 8) }),
  dynPorts: p => {
    const n = cint(p.ways, 2, 8), h = 80 * n;
    const pts = [{ id: "in", side: "left", kind: "inout", dx: 0, dy: h / 2 }];
    for (let i = 1; i <= n; i++) pts.push({ id: "o" + i, side: "right", kind: "inout", dx: 80, dy: 80 * i - 40 });
    return pts;
  },
  params: { label: "SPLIT", ways: "2", exloss: 0.3 }, nf: p => 10 * Math.log10(cint(p.ways, 2, 8)) + Math.abs(p.exloss),
  fields: [{ key: "ways", label: "Ways (1 : n)", type: "select", options: ["2", "3", "4", "5", "6", "7", "8"] },
           { key: "exloss", label: "Excess loss", unit: "dB", step: 0.1, min: 0 }],
  out: p => {
    const n = cint(p.ways, 2, 8), d = 10 * Math.log10(n) + Math.abs(p.exloss);
    const o = {}; for (let i = 1; i <= n; i++) o["o" + i] = -d; return o;
  },
  bidi: (m, p) => {
    const n = cint(p.ways, 2, 8), ex = Math.abs(p.exloss || 0), d = 10 * Math.log10(n) + ex, o = {};
    if (m.in !== undefined && isFinite(m.in)) {
      for (let i = 1; i <= n; i++) o["o" + i] = m.in - d;
    }
    let vSum = 0, count = 0;
    for (let i = 1; i <= n; i++) {
      const v = m["o" + i];
      if (v !== undefined && isFinite(v)) {
        vSum += Math.sqrt(Math.pow(10, v / 10));
        count++;
      }
    }
    if (count > 0 && vSum > 0) {
      const pMw = (vSum * vSum / n) * Math.pow(10, -ex / 10);
      o.in = 10 * Math.log10(pMw);
    }
    return o;
  },
  val: p => { const n = cint(p.ways, 2, 8), loss = dsp(10 * Math.log10(n) + Math.abs(p.exloss || 0)); return "IL \u2212" + loss + " dB ea"; },
  info: p => "1:" + cint(p.ways, 2, 8),
  sym(p) {
    const n = cint(p.ways, 2, 8), h = 80 * n;
    let s = `<rect class="blk-shape" x="0" y="4" width="80" height="${h - 8}" rx="12"/>`;
    s += L(0, h / 2, 32, h / 2) + `<path class="blk-line" d="M32 40V${h - 40}"/>`;
    for (let i = 1; i <= n; i++) s += L(32, 80 * i - 40, 80, 80 * i - 40);
    return s + `<circle class="blk-fillg" cx="32" cy="${h / 2}" r="6"/>`;
  }
});

def({
  type: "combiner", keys: "sum adder power combiner n:1 merge", name: "Combiner", group: "Routing", w: 160, h: 160,
  dynSize: p => ({ w: 80, h: 80 * cint(p.ways, 2, 8) }),
  dynPorts: p => {
    const n = cint(p.ways, 2, 8), h = 80 * n, pts = [];
    for (let i = 1; i <= n; i++) pts.push({ id: "i" + i, side: "left", kind: "inout", dx: 0, dy: 80 * i - 40 });
    pts.push({ id: "out", side: "right", kind: "inout", dx: 80, dy: h / 2 }); return pts;
  },
  params: { label: "COMB", ways: "2", exloss: 0.3 }, nf: p => 10 * Math.log10(cint(p.ways, 2, 8)) + Math.abs(p.exloss),
  fields: [{ key: "ways", label: "Ways (n : 1)", type: "select", options: ["2", "3", "4", "5", "6", "7", "8"] },
           { key: "exloss", label: "Excess loss", unit: "dB", step: 0.1, min: 0 }],
  ref: (m, p) => {
    const n = cint(p.ways, 2, 8), ex = Math.abs(p.exloss || 0);
    let vSum = 0, count = 0;
    for (let i = 1; i <= n; i++) {
      const v = m["i" + i];
      if (v !== undefined && isFinite(v)) {
        vSum += Math.sqrt(Math.pow(10, v / 10));
        count++;
      }
    }
    if (!count || vSum <= 0) return undefined;
    return 10 * Math.log10((vSum * vSum / n) * Math.pow(10, -ex / 10));
  },
  out: p => ({ out: -(10 * Math.log10(cint(p.ways, 2, 8)) + Math.abs(p.exloss || 0)) }),
  val: p => { const n = cint(p.ways, 2, 8), loss = dsp(10 * Math.log10(n) + Math.abs(p.exloss || 0)); return "IL \u2212" + loss + " dB"; },
  info: p => cint(p.ways, 2, 8) + ":1",
  bidi: (m, p) => {
    const n = cint(p.ways, 2, 8), ex = Math.abs(p.exloss || 0), d = 10 * Math.log10(n) + ex, o = {};
    let vSum = 0, count = 0;
    for (let i = 1; i <= n; i++) {
      const v = m["i" + i];
      if (v !== undefined && isFinite(v)) {
        vSum += Math.sqrt(Math.pow(10, v / 10));
        count++;
      }
    }
    if (count > 0 && vSum > 0) {
      const pMw = (vSum * vSum / n) * Math.pow(10, -ex / 10);
      o.out = 10 * Math.log10(pMw);
    }
    if (m.out !== undefined && isFinite(m.out)) {
      for (let i = 1; i <= n; i++) o["i" + i] = m.out - d;
    }
    return o;
  },
  sym(p) {
    const n = cint(p.ways, 2, 8), h = 80 * n;
    let s = `<rect class="blk-shape" x="0" y="4" width="80" height="${h - 8}" rx="12"/>`;
    s += `<path class="blk-line" d="M48 40V${h - 40}"/>`;
    for (let i = 1; i <= n; i++) s += L(0, 80 * i - 40, 48, 80 * i - 40);
    return s + L(48, h / 2, 80, h / 2) + `<circle class="blk-fillg" cx="48" cy="${h / 2}" r="6"/>`;
  }
});

/* Couplers */
const CPL_KIND = ["Directional", "Power tap", "Bi-directional", "Resistive", "90\u00b0 hybrid", "180\u00b0 hybrid"];
const tapThruLoss = C => -10 * Math.log10(Math.max(1e-9, 1 - Math.pow(10, -Math.abs(C) / 10)));

function cplPorts(p) {
  const k = p.ctype || "Directional";
  const P = (id, side, dy) => ({ id, side, kind: "inout", dx: side === "left" ? 0 : 160, dy });
  if (k === "Power tap") return [P("in", "left", 40), P("thru", "right", 40), P("tap", "right", 120)];
  if (k === "Resistive") return [P("in", "left", 80), P("o1", "right", 40), P("o2", "right", 120)];
  if (k === "Bi-directional") return [P("in", "left", 40), P("fwd", "left", 120), P("thru", "right", 40), P("rev", "right", 120)];
  if (k === "90\u00b0 hybrid") return [P("in", "left", 40), P("iso", "left", 120), P("out0", "right", 40), P("out90", "right", 120)];
  if (k === "180\u00b0 hybrid") return [P("sum", "left", 40), P("dif", "left", 120), P("o1", "right", 40), P("o2", "right", 120)];
  return [P("in", "left", 40), P("cpl", "left", 120), P("thru", "right", 40), P("iso", "right", 120)];
}

function cplMatrix(p) {
  const k = p.ctype || "Directional";
  const il = Math.abs(+p.il || 0), C = Math.abs(+p.coupling || 10), iso = Math.abs(+p.iso || 30), ex = Math.abs(+p.exloss || 0);
  const M = {}, put = (a, b, d) => { (M[a] = M[a] || {})[b] = d; (M[b] = M[b] || {})[a] = d; };
  if (k === "Power tap") {
    const thru = il + tapThruLoss(C);
    put("in", "thru", thru); put("in", "tap", C); put("thru", "tap", C);
    return M;
  }
  if (k === "Resistive") { const half = 6.02 + ex; put("in", "o1", half); put("in", "o2", half); put("o1", "o2", half); return M; }
  if (k === "Bi-directional") {
    put("in", "thru", il); put("in", "fwd", C); put("thru", "rev", C);
    put("in", "rev", iso); put("thru", "fwd", iso); put("fwd", "rev", iso); return M;
  }
  if (k === "90\u00b0 hybrid" || k === "180\u00b0 hybrid") {
    const a = k === "90\u00b0 hybrid" ? ["in", "out0", "out90", "iso"] : ["sum", "o1", "o2", "dif"];
    const half = 3.01 + il;
    put(a[0], a[1], half); put(a[0], a[2], half); put(a[3], a[1], half); put(a[3], a[2], half);
    put(a[0], a[3], iso); put(a[1], a[2], iso); return M;
  }
  put("in", "thru", il); put("in", "cpl", C); put("thru", "iso", C);
  put("in", "iso", iso); put("thru", "cpl", iso); put("cpl", "iso", il);
  return M;
}

def({
  type: "coupler", keys: "tap power tap directional bidirectional resistive hybrid quadrature branch-line rat-race magic-tee monitor sample coupling", name: "Coupler", group: "Routing", w: 160, h: 160,
  dynPorts: cplPorts,
  params: { label: "CPLR", ctype: "Directional", coupling: 10, il: 0.5, iso: 30, exloss: 0 },
  fields: [{ key: "ctype", label: "Type", type: "select", options: CPL_KIND },
           { key: "coupling", label: p => ((p && p.ctype === "Power tap") ? "Tap ratio" : "Coupling"), unit: "dB", step: 0.5, min: 0, showIf: p => /Directional|Power tap/.test(p.ctype || "Directional") },
           { key: "il", label: "Insertion loss", unit: "dB", step: 0.1, min: 0, showIf: p => (p.ctype || "Directional") !== "Resistive" },
           { key: "exloss", label: "Excess loss", unit: "dB", step: 0.1, min: 0, showIf: p => p.ctype === "Resistive" },
           { key: "iso", label: "Isolation", unit: "dB", step: 1, min: 0, showIf: p => !/Resistive|Power tap/.test(p.ctype || "Directional") }],
  nf: p => {
    const k = p.ctype || "Directional";
    if (k === "Power tap") return Math.abs(+p.il || 0) + tapThruLoss(p.coupling);
    if (k === "Resistive") return 6.02 + Math.abs(+p.exloss || 0);
    if (/hybrid/.test(k)) return 3.01 + Math.abs(+p.il || 0);
    return Math.abs(+p.il || 0);
  },
  out: p => {
    const M = cplMatrix(p), k = p.ctype || "Directional";
    const src = (k === "180\u00b0 hybrid") ? "sum" : "in", o = {};
    for (const d in (M[src] || {})) o[d] = -M[src][d]; return o;
  },
  bidi: (m, p) => {
    const M = cplMatrix(p), o = {};
    for (const src in m) {
      const lv = m[src]; if (lv === undefined || !isFinite(lv)) continue;
      for (const dst in (M[src] || {})) {
        const v = lv - M[src][dst];
        o[dst] = (o[dst] === undefined) ? v : sumDbm([o[dst], v]);
      }
    }
    for (const src in m) delete o[src];
    return o;
  },
  val: p => {
    const k = p.ctype || "Directional";
    if (k === "Power tap") return "tap \u2212" + fmt(Math.abs(p.coupling)) + " dB";
    if (k === "Resistive") return "resistive \u22126 dB";
    if (/hybrid/.test(k)) return k.replace(" hybrid", "") + " \u22123 dB";
    return "C " + fmt(Math.abs(p.coupling)) + " dB";
  },
  sym(p) {
    const k = p.ctype || "Directional";
    let s = `<rect class="blk-shape" x="0" y="4" width="160" height="152" rx="12"/>`;
    if (k === "Power tap")
      return s + L(0, 40, 160, 40) + `<path class="blk-line" d="M80 40V120H160"/>`
          + `<circle class="blk-fillg" cx="80" cy="40" r="6"/>`
          + `<path class="blk-glyph" d="M96 88V108M88 100l8 10l8-10"/>`;
    if (k === "Resistive")
      return s + `<path class="blk-line" d="M0 80H36M76 80H80V48M80 112V80"/>`
          + `<path class="blk-glyph" d="M36 80h6l4-8 8 16 8-16 8 16 4-8h6"/>` 
          + `<path class="blk-glyph" d="M80 48v-6l-8-4 16-8-16-8 16-8-8-4v-6"/>` 
          + `<path class="blk-glyph" d="M80 112v6l-8 4 16 8-16 8 16 8-8 4v6"/>` 
          + `<path class="blk-line" d="M80 40H160M80 120H160"/>`
          + `<circle class="blk-fillg" cx="80" cy="80" r="5"/>`;
    if (k === "90\u00b0 hybrid")
      return s + L(0, 40, 160, 40) + L(0, 120, 160, 120) + `<path class="blk-line" d="M52 40V120M108 40V120"/>`
          + `<text class="ic-tag" x="80" y="88" text-anchor="middle" font-size="11">90°</text>`;
    if (k === "180\u00b0 hybrid")
      return s + L(0, 40, 46, 40) + L(0, 120, 46, 120) + L(114, 40, 160, 40) + L(114, 120, 160, 120)
          + `<circle class="blk-line" cx="80" cy="80" r="34"/>`
          + `<text class="ic-tag" x="56" y="64" font-size="10">Σ</text>`
          + `<text class="ic-tag" x="56" y="110" font-size="10">Δ</text>`
          + `<text class="ic-tag" x="100" y="88" font-size="9">180°</text>`;
    if (k === "Bi-directional")
      return s + L(0, 40, 160, 40) + L(0, 120, 160, 120)
          + `<path class="blk-glyph" d="M68 56L92 104M92 56L68 104"/>`;
    return s + L(0, 40, 160, 40) + L(0, 120, 160, 120)
      + `<path class="blk-glyph" d="M92 56L68 104"/>`;
  }
});

/* Switch definition with SP1T..SP8T and Open position state support */
def({
  type: "switch", keys: "spdt sp3t sp4t spnt select transfer path", name: "Switch", group: "Routing", w: 160, h: 160,
  dynSize: p => ({ w: 80, h: 80 * cint(p.throws, 1, 8) }),
  dynPorts: p => {
    const n = cint(p.throws, 1, 8), h = 80 * n;
    const pts = [{ id: "in", side: "left", kind: "inout", dx: 0, dy: h / 2 }];
    for (let i = 1; i <= n; i++) pts.push({ id: "o" + i, side: "right", kind: "inout", dx: 80, dy: 80 * i - 40 });
    return pts;
  },
  params: { label: "SW", throws: "2", state: "1", il: 0.4, iso: 60 }, nf: p => Math.abs(p.il),
  fields: [{ key: "throws", label: "Throws (SPnT)", type: "select", options: ["1", "2", "3", "4", "5", "6", "7", "8"] },
           { key: "state", label: "Position", type: "select", options: p => [{ value: "open", label: "Open (Off)" }, ...Array.from({ length: cint(p.throws, 1, 8) }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))] },
           { key: "il", label: "Insertion loss", unit: "dB", step: 0.1, min: 0 },
           { key: "iso", label: "Isolation", unit: "dB", step: 1, min: 0 }],
  out: p => {
    const n = cint(p.throws, 1, 8), st = swState(p, n), il = Math.abs(p.il), iso = (+p.iso >= 0) ? +p.iso : 60;
    const o = {}; for (let i = 1; i <= n; i++) o["o" + i] = (st === i ? -il : -iso); return o;
  },
  bidi: (m, p) => {
    const n = cint(p.throws, 1, 8), st = swState(p, n), il = Math.abs(p.il), iso = (+p.iso >= 0) ? +p.iso : 60; const o = {};
    if (m.in !== undefined) for (let i = 1; i <= n; i++) o["o" + i] = m.in - (st === i ? il : iso);
    if (st > 0 && m["o" + st] !== undefined) o.in = m["o" + st] - il;
    return o;
  },
  val: p => "IL " + fmt(Math.abs(p.il)) + " dB",
  sym(p) {
    const n = cint(p.throws, 1, 8), h = 80 * n, st = swState(p, n);
    const nx = (st > 0 ? 56 : 48), ny = (st > 0 ? 80 * st - 40 : h / 2 - 16);
    let s = `<rect class="blk-shape" x="0" y="4" width="80" height="${h - 8}" rx="12"/>`;
    s += L(0, h / 2, 28, h / 2) + `<circle class="blk-fillg" cx="28" cy="${h / 2}" r="6"/>`;
    s += `<path class="blk-line" d="M28 ${h / 2}L${nx} ${ny}"/>`;
    for (let i = 1; i <= n; i++) { const y = 80 * i - 40; s += L(56, y, 80, y) + `<circle class="blk-shape" cx="56" cy="${y}" r="4.8"/>`; }
    return s;
  }
});

def({
  type: "interconnect", keys: "off-page link tag jump sheet cross-reference send receive leaves enters goes to comes from", name: "Interconnect", group: "Routing", w: 80, h: 80,
  params: { label: "", tag: "A", role: "receive" },
  fields: [{ key: "role", label: "This connector", type: "select", options: [
             { value: "send", label: "Sends the signal away \u2192" },
             { value: "receive", label: "Brings the signal in \u2190" }] },
           { key: "tag", label: "Tag (the pair must match)", type: "text", max: 6 }],
  isInterconnect: true,
  dynPorts: p => icSend(p) ? [{ id: "p", side: "left", kind: "in", dx: 0, dy: 40 }]
                         : [{ id: "p", side: "right", kind: "out", dx: 80, dy: 40 }],
  val: () => "",
  sym(p) {
    return icSend(p)
      ? `<path class="blk-shape" d="M0 8H44L76 40L44 72H0Z"/>`
      : `<path class="blk-shape" d="M4 8H48L80 40L48 72H4L24 40Z"/>`;
  }
});

/* --- Passive ------------------------------------------------------ */
def({
  type: "isolator", keys: "one-way non-reciprocal ferrite", name: "Isolator", group: "Passive", w: 80, h: 80,
  ports: [{ id: "in", side: "left", kind: "in", dx: 0, dy: 40 }, { id: "out", side: "right", kind: "out", dx: 80, dy: 40 }],
  params: { label: "ISO", il: 0.6 },
  fields: [{ key: "il", label: "Insertion loss", unit: "dB", step: 0.1, min: 0 }], nf: p => Math.abs(p.il),
  out: p => ({ out: -Math.abs(p.il) }), val: p => "IL " + fmt(Math.abs(p.il)) + " dB",
  sym() { return `<circle class="blk-shape" cx="40" cy="40" r="38"/><path class="blk-glyph" d="M18 40H58M46 28L60 40L46 52"/>`; }
});

def({
  type: "circulator", keys: "ferrite three-port duplex", name: "Circulator", group: "Passive", w: 80, h: 80, topLabel: true,
  ports: [{ id: "p1", side: "left", kind: "in", dx: 0, dy: 40 }, { id: "p2", side: "right", kind: "out", dx: 80, dy: 40 }, { id: "p3", side: "bottom", kind: "out", dx: 40, dy: 80 }],
  params: { label: "CIRC", il: 0.5, iso: 20 },
  fields: [{ key: "il", label: "Insertion loss", unit: "dB", step: 0.1, min: 0 }, { key: "iso", label: "Isolation", unit: "dB", step: 1, min: 0 }], nf: p => Math.abs(p.il),
  ref: m => m.p1, refIn: "p1", out: p => ({ p2: -Math.abs(p.il), p3: -Math.abs(p.iso) }), val: p => "IL " + fmt(Math.abs(p.il)) + " dB",
  sym() { return `<circle class="blk-shape" cx="40" cy="40" r="38"/><path class="blk-glyph" d="M40 24 A16 16 0 1 1 24 40"/><path class="blk-fillg" d="M24 26L31 41L17 41Z"/>`; }
});

def({
  type: "phase", keys: "shifter delay trim degrees", name: "Phase shift", group: "Passive", w: 80, h: 80,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 40 }, { id: "out", side: "right", kind: "inout", dx: 80, dy: 40 }],
  params: { label: "\u03c6", phase: 0, il: 1 },
  fields: [{ key: "phase", label: "Phase", unit: "\u00b0", step: 5 }, { key: "il", label: "Insertion loss", unit: "dB", step: 0.1, min: 0 }], nf: p => Math.abs(p.il),
  out: p => ({ out: -Math.abs(p.il) }), val: p => fmt(p.phase) + "\u00b0",
  bidi: (m, p) => rl(m, Math.abs(p.il)),
  sym() { return `<rect class="blk-shape" x="0" y="8" width="80" height="64" rx="8"/><circle class="blk-glyph" cx="40" cy="40" r="18"/><path class="blk-glyph" d="M40 16V64"/>`; }
});

/* --- Terminals ---------------------------------------------------- */
def({
  type: "rfin", keys: "connector input port sma source", name: "In connector", group: "Terminals", w: 80, h: 80,
  ports: [{ id: "out", side: "right", kind: "out", dx: 80, dy: 40 }],
  params: { label: "RF IN", power: 0, primaryPower: 0, secondaryPower: 0, freq: "", anaPort: "P1" },
  fields: [{ key: "anaPort", label: "Analysis Port", type: "select", options: ["None", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"] },
           { key: "primaryPower", label: "Primary input level", unit: "dBm", step: 0.5 },
           { key: "secondaryPower", label: "Secondary input level", unit: "dBm", step: 0.5 },
           { key: "power", label: "Legacy input level", unit: "dBm", step: 0.5 },
           { key: "freq", label: "Frequency", type: "text" }],
  isSource: () => true, srcOut: () => "out", srcPower: (p, mode) => getSelectedSourcePower(p, mode), val: p => p.freq || dbm(getSelectedSourcePower(p)),
  sym() { return `<path class="blk-line" d="M44 40H80"/><circle class="blk-shape" cx="26" cy="40" r="18"/><circle class="blk-fillg" cx="26" cy="40" r="6"/>`; }
});

def({
  type: "rfout", keys: "connector output port sma sink", name: "Out connector", group: "Terminals", w: 80, h: 80,
  ports: [{ id: "in", side: "left", kind: "in", dx: 0, dy: 40 }],
  params: { label: "RF OUT", anaPort: "P2" },
  fields: [{ key: "anaPort", label: "Analysis Port", type: "select", options: ["None", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"] }],
  val: () => "output",
  sym() { return `<path class="blk-line" d="M0 40H36"/><circle class="blk-shape" cx="54" cy="40" r="18"/><circle class="blk-fillg" cx="54" cy="40" r="6"/>`; }
});

def({
  type: "detector", keys: "diode video log power meter", name: "Detector", group: "Terminals", w: 80, h: 80,
  ports: [{ id: "in", side: "left", kind: "in", dx: 0, dy: 40 }],
  params: { label: "DET", anaPort: "None" },
  fields: [{ key: "anaPort", label: "Analysis Port", type: "select", options: ["None", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"] }],
  val: () => "video",
  sym() { return `<rect class="blk-shape" x="0" y="12" width="80" height="56" rx="8"/><path class="blk-line" d="M8 40H24"/><path class="blk-fillg" d="M24 24L56 40L24 56Z"/><path class="blk-glyph" d="M56 24V56"/>`; }
});

def({
  type: "antenna", keys: "aerial radiator tx rx", name: "Antenna", group: "Terminals", w: 80, h: 80,
  params: { label: "ANT", role: "Tx", power: -80, primaryPower: -80, secondaryPower: -80, anaPort: "None" },
  fields: [{ key: "anaPort", label: "Analysis Port", type: "select", options: ["None", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"] },
           { key: "role", label: "Role", type: "select", options: ["Tx", "Rx"] },
           { key: "primaryPower", label: "Primary received level", unit: "dBm", step: 1, showIf: p => p.role === "Rx" },
           { key: "secondaryPower", label: "Secondary received level", unit: "dBm", step: 1, showIf: p => p.role === "Rx" },
           { key: "power", label: "Legacy received level", unit: "dBm", step: 1, showIf: p => p.role === "Rx" }],
  dynPorts: p => p.role === "Rx" ? [{ id: "ant", side: "right", kind: "out", dx: 80, dy: 40 }] : [{ id: "ant", side: "left", kind: "in", dx: 0, dy: 40 }],
  isSource: p => p.role === "Rx", srcOut: () => "ant", srcPower: (p, mode) => getSelectedSourcePower(p, mode), val: p => p.role === "Rx" ? "Rx" : "Tx",
  sym(p) {
    const feed = p.role === "Rx" ? L(80, 40, 40, 40) : L(0, 40, 40, 40);
    return feed + `<path class="blk-line" d="M40 40V10"/><path class="blk-line" d="M40 10L18 -6M40 10L62 -6"/><circle class="blk-fillg" cx="40" cy="40" r="5"/>`;
  }
});

def({
  type: "termination", keys: "load dummy 50 ohm match terminator", name: "Load 50\u03a9", group: "Terminals", w: 80, h: 80,
  ports: [{ id: "in", side: "left", kind: "in", dx: 0, dy: 40 }],
  params: { label: "LOAD", anaPort: "None" },
  fields: [{ key: "anaPort", label: "Analysis Port", type: "select", options: ["None", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"] }],
  val: () => "50 \u03a9",
  sym() { return `<path class="blk-glyph" d="M0 40l6 -12 12 24 12 -24 12 24 6 -12H60"/><path class="blk-line" d="M60 24V56"/><path class="blk-line" d="M68 30V50"/><path class="blk-line" d="M76 36V44"/>`; }
});

/* --- Hierarchy ----------------------------------------------------- */
def({
  type: "subsystem", keys: "subsystem group hierarchy module section sub-circuit page drill down fold", name: "Subsystem", group: "Hierarchy", w: 240, h: 160,
  dynSize: p => ({ w: 240, h: 80 * Math.max(2, cint(p.ins, 1, 6), cint(p.outs, 1, 6)) }),
  dynPorts: p => {
    const ni = cint(p.ins, 1, 6), no = cint(p.outs, 1, 6), m = Math.max(2, ni, no), h = 80 * m, pts = [];
    const pos = (k, i) => h / 2 + 80 * (i - (k - 1) / 2);
    for (let i = 0; i < ni; i++) pts.push({ id: "i" + (i + 1), side: "left", kind: "in", dx: 0, dy: pos(ni, i) });
    for (let i = 0; i < no; i++) pts.push({ id: "o" + (i + 1), side: "right", kind: "out", dx: 240, dy: pos(no, i) });
    return pts;
  },
  params: { label: "SECTION", ins: "1", outs: "1", sheet: "" },
  fields: [{ key: "ins", label: "Inputs", type: "select", options: ["1", "2", "3", "4", "5", "6"] },
           { key: "outs", label: "Outputs", type: "select", options: ["1", "2", "3", "4", "5", "6"] }],
  isSubsystem: true, portLabels: true,
  val: () => "double-click to open",
  sym(p) {
    const h = 80 * Math.max(2, cint(p.ins, 1, 6), cint(p.outs, 1, 6)), cy = h / 2;
    return `<rect class="blk-shape" x="0" y="4" width="240" height="${h - 8}" rx="16"/>`
      + `<rect class="blk-glyph" x="56" y="24" width="128" height="${h - 48}" rx="10" stroke-dasharray="4 3"/>`
      + `<rect class="blk-glyph" x="100" y="${cy - 18}" width="40" height="36" rx="6"/>`
      + `<path class="blk-glyph" d="M120 ${cy - 10}v16M112 ${cy - 2}h16"/>`;
  }
});

/* --- Custom ------------------------------------------------------- */
const cIn = p => cint(p.ins, 0, 4), cOut = p => cint(p.outs, 0, 4);
def({
  type: "custom", keys: "user block generic arbitrary source load sink terminator generator", name: "Custom block", group: "Custom", w: 160, h: 80,
  dynSize: p => ({ w: 160, h: 80 * Math.max(1, cIn(p), cOut(p)) }),
  dynPorts: p => {
    const ni = cIn(p), no = cOut(p), m = Math.max(1, ni, no), h = 80 * m, pts = [];
    const posn = (k, i) => h / 2 + 80 * (i - (k - 1) / 2);
    for (let i = 0; i < ni; i++) pts.push({ id: "i" + (i + 1), side: "left", kind: "in", dx: 0, dy: posn(ni, i) });
    for (let i = 0; i < no; i++) pts.push({ id: "o" + (i + 1), side: "right", kind: "out", dx: 160, dy: posn(no, i) });
    return pts;
  },
  params: { label: "CUSTOM", text: "FX", shape: "Box", ins: "1", outs: "1", gain: 0, power: 0, primaryPower: 0, secondaryPower: 0, nf: 0, p1db: "", oip3: "", path: "" },
  nf: p => Math.abs(p.nf || 0), p1db: p => num(p.p1db), oip3: p => num(p.oip3),
  fields: [{ key: "text", label: "Symbol text", type: "text" },
           { key: "shape", label: "Shape", type: "select", options: ["Box", "Circle", "Diamond", "Triangle"] },
           { key: "ins", label: "Inputs (0 = source)", type: "select", options: ["0", "1", "2", "3", "4"] },
           { key: "outs", label: "Outputs (0 = load)", type: "select", options: ["0", "1", "2", "3", "4"] },
           { key: "primaryPower", label: "Primary output level", unit: "dBm", step: 0.5, showIf: p => cIn(p) === 0 && cOut(p) > 0 },
           { key: "secondaryPower", label: "Secondary output level", unit: "dBm", step: 0.5, showIf: p => cIn(p) === 0 && cOut(p) > 0 },
           { key: "power", label: "Legacy output level", unit: "dBm", step: 0.5, showIf: p => cIn(p) === 0 && cOut(p) > 0 },
           { key: "gain", label: "Gain / loss per output", unit: "dB", step: 0.5, showIf: p => cIn(p) > 0 && cOut(p) > 0 },
           { key: "nf", label: "Noise figure", unit: "dB", step: 0.1, min: 0, showIf: p => cIn(p) > 0 && cOut(p) > 0 },
           { key: "p1db", label: "Output P1dB (blank = ideal)", unit: "dBm", step: 0.5, showIf: p => cOut(p) > 0 },
           { key: "oip3", label: "Output IP3 (blank = ideal)", unit: "dBm", step: 0.5, showIf: p => cOut(p) > 0 },
           { key: "path", label: "Custom SVG path (advanced)", type: "text" }],
  isSource: p => cIn(p) === 0 && cOut(p) > 0,
  srcOut: p => { const a = [], no = cOut(p); for (let i = 1; i <= no; i++) a.push("o" + i); return a; },
  srcPower: (p, mode) => getSelectedSourcePower(p, mode),
  out: p => { const no = cOut(p), g = +p.gain || 0; const o = {}; for (let i = 1; i <= no; i++) o["o" + i] = g; return o; },
  val: p => {
    const ni = cIn(p), no = cOut(p);
    if (!ni && !no) return "note";
    if (!ni) return dbm(+p.power || 0);
    if (!no) return "load";
    return gsign(+p.gain || 0);
  },
  upText: p => sanPath(p.path) ? "" : (p.text || ""),
  sym(p) {
    const h = 80 * Math.max(1, cIn(p), cOut(p));
    const shapes = {
      Box: `<rect class="blk-shape" x="0" y="4" width="160" height="${h - 8}" rx="12"/>`,
      Circle: `<ellipse class="blk-shape" cx="80" cy="${h / 2}" rx="80" ry="${h / 2 - 4}"/>`,
      Diamond: `<path class="blk-shape" d="M80 4L160 ${h / 2}L80 ${h - 4}L0 ${h / 2}Z"/>`,
      Triangle: `<path class="blk-shape" d="M0 4L160 ${h / 2}L0 ${h - 4}Z"/>`
    };
    let s = shapes[p.shape] || shapes.Box;
    const d = sanPath(p.path); if (d) s += `<path class="blk-glyph" d="${d}"/>`;
    return s;
  }
});

/* --- Annotation --------------------------------------------------- */
def({
  type: "label", name: "Text note", group: "Annotate", w: 240, h: 22,
  params: { label: "", text: "Label" }, fields: [{ key: "text", label: "Text", type: "text" }], isLabel: true, val: () => ""
});

const GROUPS = ["Terminals", "Sources", "Gain / Loss", "Filtering", "Frequency", "Routing", "Passive", "Hierarchy", "Custom", "Annotate"];


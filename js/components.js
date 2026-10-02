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
  type: "source", keys: "signal generator cw carrier input", name: "Source", group: "Sources", w: 60, h: 60,
  ports: [{ id: "out", side: "right", kind: "out", dx: 60, dy: 30 }],
  params: { label: "SRC", power: 0, primaryPower: 0, secondaryPower: 0, freq: "1 GHz", anaPort: "None" },
  fields: [{ key: "anaPort", label: "Analysis Port", type: "select", options: ["None", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"] },
           { key: "primaryPower", label: "Primary input level", unit: "dBm", step: 0.5 },
           { key: "secondaryPower", label: "Secondary input level", unit: "dBm", step: 0.5 },
           { key: "power", label: "Legacy input level", unit: "dBm", step: 0.5 },
           { key: "freq", label: "Frequency", type: "text" }],
  isSource: () => true, srcOut: () => "out", srcPower: (p, mode) => getSelectedSourcePower(p, mode), val: p => dbm(getSelectedSourcePower(p)),
  info: p => p.freq || "",
  sym() { return `<circle class="blk-shape" cx="30" cy="30" r="28.5"/><path class="blk-glyph" d="M15 30 q7.5 -10.5 15 0 t15 0"/>`; }
});

def({
  type: "lo", keys: "oscillator local synth vco source", name: "LO / Osc", group: "Frequency", w: 60, h: 60,
  ports: [{ id: "out", side: "top", kind: "out", dx: 30, dy: 0 }],
  params: { label: "LO", power: 10, primaryPower: 10, secondaryPower: 10, freq: "0.9 GHz", anaPort: "None" },
  fields: [{ key: "anaPort", label: "Analysis Port", type: "select", options: ["None", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"] },
           { key: "primaryPower", label: "Primary drive level", unit: "dBm", step: 0.5 },
           { key: "secondaryPower", label: "Secondary drive level", unit: "dBm", step: 0.5 },
           { key: "power", label: "Legacy drive level", unit: "dBm", step: 0.5 },
           { key: "freq", label: "Frequency", type: "text" }],
  isSource: () => true, srcOut: () => "out", srcPower: (p, mode) => getSelectedSourcePower(p, mode), val: p => dbm(getSelectedSourcePower(p)),
  info: p => p.freq || "",
  sym() { return `<circle class="blk-shape" cx="30" cy="30" r="28.5"/><path class="blk-glyph" d="M15 30 q7.5 -10.5 15 0 t15 0"/>`; }
});

/* --- Gain / Loss -------------------------------------------------- */
def({
  type: "amp", keys: "amplifier lna pa gain driver buffer", name: "Amplifier", group: "Gain / Loss", w: 60, h: 60,
  ports: [{ id: "in", side: "left", kind: "in", dx: 0, dy: 30 }, { id: "out", side: "right", kind: "out", dx: 60, dy: 30 }],
  params: { label: "AMP", gain: 15, nf: 2, p1db: 20, oip3: 30 },
  fields: [{ key: "gain", label: "Gain", unit: "dB", step: 0.5 }, { key: "nf", label: "Noise figure", unit: "dB", step: 0.1 },
           { key: "p1db", label: "Output P1dB", unit: "dBm", step: 0.5 }, { key: "oip3", label: "Output IP3", unit: "dBm", step: 0.5 }],
  out: p => ({ out: +p.gain }), val: p => { const nfv = Math.abs(p.nf || 0); return gsign(p.gain) + (nfv > 0 ? ' · NF ' + fmt(nfv) + ' dB' : ''); }, nf: p => Math.abs(p.nf || 0),
  p1db: p => num(p.p1db), oip3: p => num(p.oip3),
  sym() { return `<path class="blk-shape" d="M0 3L60 30L0 57Z"/>`; }
});

def({
  type: "bamp", keys: "bypass amplifier lna amp tsy-83ln+ switch bypass mode active passive by_amp", name: "Bypass Amplifier", group: "Gain / Loss", w: 60, h: 60,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 30 }, { id: "out", side: "right", kind: "out", dx: 60, dy: 30 }],
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
    const topSw = isByp ? `<path class="blk-line" d="M18 15H39"/>` : `<path class="blk-line" d="M18 15L36 6"/>`;
    const botSw = isByp ? `<path class="blk-line" d="M36 42L45 33"/>` : `<path class="blk-line" d="M36 42H48"/>`;
    return `<rect class="blk-shape" x="0" y="3" width="60" height="54" rx="6"/>` +
           `<path class="blk-line" d="M0 30H9V15H18M39 15H51V42M51 30H60"/>` +
           `<path class="blk-line" d="M9 30V42H15M33 42H36M48 42H51"/>` +
           `<path class="blk-glyph" d="M15 33L33 42L15 51Z"/>` +
           topSw +
           botSw;
  }
});

def({
  type: "atten", keys: "pad attenuation loss fixed step", name: "Attenuator", group: "Gain / Loss", w: 60, h: 60,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 30 }, { id: "out", side: "right", kind: "inout", dx: 60, dy: 30 }],
  params: { label: "ATT", loss: 10 },
  fields: [{ key: "loss", label: "Attenuation", unit: "dB", step: 0.5, min: 0 }], nf: p => Math.abs(p.loss),
  out: p => ({ out: -Math.abs(p.loss) }), val: p => "\u2212" + fmt(Math.abs(p.loss)) + " dB",
  bidi: (m, p) => rl(m, Math.abs(p.loss)),
  sym() {
    return `<rect class="blk-shape" x="0" y="6" width="60" height="48" rx="6"/>` +
           `<path class="blk-glyph" d="M30 12v4.5l-9 3.375 18 6.75-18 6.75 18 6.75-9 3.375v4.5"/>`;
  }
});

def({
  type: "dsa", keys: "dsa dat digital attenuator step variable control pad dca", name: "Digital Attenuator", group: "Gain / Loss", w: 60, h: 60,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 30 }, { id: "out", side: "right", kind: "inout", dx: 60, dy: 30 }],
  params: { label: "DSA", loss: 10 },
  fields: [{ key: "loss", label: "Attenuation", unit: "dB", step: 0.5, min: 0 }], nf: p => Math.abs(p.loss),
  out: p => ({ out: -Math.abs(p.loss) }), val: p => "\u2212" + fmt(Math.abs(p.loss)) + " dB",
  bidi: (m, p) => rl(m, Math.abs(p.loss)),
  sym() {
    return `<rect class="blk-shape" x="0" y="6" width="60" height="48" rx="6"/>` +
           `<path class="blk-glyph" d="M30 12v4.5l-9 3.375 18 6.75-18 6.75 18 6.75-9 3.375v4.5"/>` +
           `<path class="blk-glyph" d="M13.5 46.5L46.5 13.5"/>` +
           `<path class="blk-fillg" d="M46.5 13.5L34.5 19.5L40.5 25.5Z"/>`;
  }
});

def({
  type: "eq", keys: "equalizer equaliser slope cable compensation gain loss tilt pad", name: "Equalizer", group: "Gain / Loss", w: 60, h: 60,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 30 }, { id: "out", side: "right", kind: "inout", dx: 60, dy: 30 }],
  params: { label: "EQ", slope: 3, minLoss: 1 },
  fields: [{ key: "slope", label: "Slope compensation", unit: "dB", step: 0.5, min: 0 },
           { key: "minLoss", label: "Min insertion loss", unit: "dB", step: 0.1, min: 0 }],
  nf: p => Math.abs(+p.minLoss || 0) + Math.abs(+p.slope || 0) / 2,
  out: p => ({ out: -(Math.abs(+p.minLoss || 0) + Math.abs(+p.slope || 0) / 2) }),
  val: p => "IL \u2212" + fmt(Math.abs(+p.minLoss || 0) + Math.abs(+p.slope || 0) / 2) + " dB",
  info: p => "Slope " + fmt(Math.abs(+p.slope || 0)) + " dB",
  bidi: (m, p) => rl(m, Math.abs(+p.minLoss || 0) + Math.abs(+p.slope || 0) / 2),
  sym() {
    return `<rect class="blk-shape" x="0" y="6" width="60" height="48" rx="6"/>` +
           `<path class="blk-glyph" d="M12 42L48 18"/>` +
           `<path class="blk-fillg" d="M48 18L36 21L42 27Z"/>` +
           `<path class="blk-glyph" d="M15 21Q21 30 27 21"/>` +
           `<path class="blk-glyph" d="M33 39Q39 30 45 39"/>`;
  }
});

def({
  type: "limiter", keys: "clip clamp protection limit", name: "Limiter", group: "Gain / Loss", w: 60, h: 60,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 30 }, { id: "out", side: "right", kind: "inout", dx: 60, dy: 30 }],
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
    return `<rect class="blk-shape" x="0" y="6" width="60" height="48" rx="6"/>` +
           `<path class="blk-line" d="M0 30H60"/>` +
           `<path class="blk-fillg" d="M21 19.5L39 19.5L30 33Z"/>` +
           `<path class="blk-glyph" d="M21 33H39"/>` +
           `<path class="blk-glyph" d="M22.5 42H37.5M25.5 46.5H34.5"/>`;
  }
});

def({
  type: "trace", keys: "line cable coax microstrip length loss", name: "Line / Trace", group: "Gain / Loss", w: 60, h: 60,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 30 }, { id: "out", side: "right", kind: "inout", dx: 60, dy: 30 }],
  params: { label: "LINE", loss: 1 },
  fields: [{ key: "loss", label: "Trace loss", unit: "dB", step: 0.1, min: 0 }], nf: p => Math.abs(p.loss),
  out: p => ({ out: -Math.abs(p.loss) }), val: p => "\u2212" + fmt(Math.abs(p.loss)) + " dB",
  bidi: (m, p) => rl(m, Math.abs(p.loss)),
  sym() { return `<rect class="blk-shape" x="0" y="19.5" width="60" height="21" rx="10.5"/><path class="blk-glyph" d="M9 30H51" stroke-dasharray="2 3"/>`; }
});

/* --- Filtering ---------------------------------------------------- */
def({
  type: "filter", keys: "bpf lpf hpf bsf notch band pass reject cavity saw", name: "Filter", group: "Filtering", w: 60, h: 60,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 30 }, { id: "out", side: "right", kind: "inout", dx: 60, dy: 30 }],
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
    const ix = 12, iw = 36, iy = 15, ih = 25.5, yB = iy + ih, yT = iy + 4.5, m = f => ix + iw * f;
    const cv = {
      LPF: [[ix, yT], [m(.42), yT], [m(.7), yB], [ix + iw, yB]],
      HPF: [[ix, yB], [m(.3), yB], [m(.58), yT], [ix + iw, yT]],
      BPF: [[ix, yB], [m(.28), yB], [m(.42), yT], [m(.58), yT], [m(.72), yB], [ix + iw, yB]],
      BSF: [[ix, yT], [m(.3), yT], [m(.45), yB], [m(.55), yB], [m(.7), yT], [ix + iw, yT]]
    };
    const pts = (cv[p.ftype] || cv.BPF).map(a => a.join(" ")).join("L");
    return `<rect class="blk-shape" x="0" y="6" width="60" height="48" rx="6"/><path class="blk-glyph" d="M${pts}"/>${p.band === "stopband" ? `<path class="blk-glyph" d="M10.5 49.5L49.5 10.5" stroke-dasharray="3 2"/>` : ""}`;
  }
});

def({
  type: "tfilter", keys: "tunable filter bpf lpf hpf bsf varactor tracking agile band pass reject", name: "Tunable Filter", group: "Filtering", w: 60, h: 60,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 30 }, { id: "out", side: "right", kind: "inout", dx: 60, dy: 30 }],
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
    const ix = 12, iw = 36, iy = 15, ih = 25.5, yB = iy + ih, yT = iy + 4.5, m = f => ix + iw * f;
    const cv = {
      LPF: [[ix, yT], [m(.42), yT], [m(.7), yB], [ix + iw, yB]],
      HPF: [[ix, yB], [m(.3), yB], [m(.58), yT], [ix + iw, yT]],
      BPF: [[ix, yB], [m(.28), yB], [m(.42), yT], [m(.58), yT], [m(.72), yB], [ix + iw, yB]],
      BSF: [[ix, yT], [m(.3), yT], [m(.45), yB], [m(.55), yB], [m(.7), yT], [ix + iw, yT]]
    };
    const pts = (cv[p.ftype] || cv.BPF).map(a => a.join(" ")).join("L");
    return `<rect class="blk-shape" x="0" y="6" width="60" height="48" rx="6"/>` +
           `<path class="blk-glyph" d="M${pts}"/>` +
           `<path class="blk-glyph" d="M12 48L48 12"/>` +
           `<path class="blk-fillg" d="M48 12L36 18L42 24Z"/>`;
  }
});

/* --- Frequency ---------------------------------------------------- */
def({
  type: "mixer", keys: "downconvert upconvert conversion image if rf lo", name: "Mixer", group: "Frequency", w: 60, h: 60, topLabel: true,
  ports: [{ id: "rf", side: "left", kind: "in", dx: 0, dy: 30 }, { id: "if", side: "right", kind: "out", dx: 60, dy: 30 }, { id: "lo", side: "bottom", kind: "in", dx: 30, dy: 60 }],
  params: { label: "MIX", cl: 7, p1db: 5, oip3: 15 },
  fields: [{ key: "cl", label: "Conversion loss", unit: "dB", step: 0.5, min: 0 },
           { key: "p1db", label: "Output P1dB", unit: "dBm", step: 0.5 }, { key: "oip3", label: "Output IP3", unit: "dBm", step: 0.5 }], nf: p => Math.abs(p.cl),
  p1db: p => num(p.p1db), oip3: p => num(p.oip3),
  ref: m => m.rf, refIn: "rf", out: p => ({ if: -Math.abs(p.cl) }), val: p => "CL " + fmt(Math.abs(p.cl)) + " dB",
  sym() { return `<circle class="blk-shape" cx="30" cy="30" r="28.5"/><path class="blk-glyph" d="M13.5 13.5L46.5 46.5M13.5 46.5L46.5 13.5"/>`; }
});

def({
  type: "multiplier", keys: "frequency multiplier doubler tripler quadrupler x2 x3 x4 comb xn", name: "Multiplier", group: "Frequency", w: 60, h: 60,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 30 }, { id: "out", side: "right", kind: "inout", dx: 60, dy: 30 }],
  params: { label: "MULT", factor: "2", il: 0 },
  fields: [{ key: "factor", label: "Factor (\u00d7N)", type: "text" },
           { key: "il", label: "Loss / Gain", unit: "dB", step: 0.5 }], nf: p => Math.max(0, +p.il || 0),
  out: p => ({ out: -(+p.il || 0) }), val: p => "\u00d7" + (p.factor || "2"),
  bidi: (m, p) => rl(m, +p.il || 0),
  sym(p) {
    const f = (p && p.factor) ? p.factor : "2";
    return `<rect class="blk-shape" x="0" y="6" width="60" height="48" rx="6"/>` +
           `<text class="ic-tag" x="30" y="36" text-anchor="middle">\u00d7${f}</text>`;
  }
});

def({
  type: "divider", keys: "frequency divider prescaler /2 /4 /8 div divide digital counter", name: "Divider", group: "Frequency", w: 60, h: 60,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 30 }, { id: "out", side: "right", kind: "inout", dx: 60, dy: 30 }],
  params: { label: "DIV", factor: "2", il: 1.0 },
  fields: [{ key: "factor", label: "Factor (\u00f7N)", type: "text" },
           { key: "il", label: "Insertion loss", unit: "dB", step: 0.1, min: 0 }], nf: p => Math.abs(p.il || 0),
  out: p => ({ out: -Math.abs(p.il || 0) }), val: p => "\u00f7" + (p.factor || "2"),
  bidi: (m, p) => rl(m, Math.abs(p.il || 0)),
  sym(p) {
    const f = (p && p.factor) ? p.factor : "2";
    return `<rect class="blk-shape" x="0" y="6" width="60" height="48" rx="6"/>` +
           `<text class="ic-tag" x="30" y="36" text-anchor="middle">\u00f7${f}</text>`;
  }
});

def({
  type: "pll", keys: "pll synthesizer phase locked loop frequency synth vco lo generator source reference ref", name: "PLL Synthesizer", group: "Frequency", w: 60, h: 60,
  ports: [{ id: "ref", side: "left", kind: "in", dx: 0, dy: 30 }, { id: "out", side: "right", kind: "out", dx: 60, dy: 30 }],
  params: { label: "PLL", power: 10, freq: "2.4 GHz", refFreq: "10 MHz" },
  fields: [{ key: "power", label: "Output level", unit: "dBm", step: 0.5 },
           { key: "freq", label: "RF Frequency", type: "text" },
           { key: "refFreq", label: "Ref Frequency", type: "text" }],
  isSource: () => true, srcOut: () => "out", srcPower: p => p.power, val: p => p.freq || "",
  sym() {
    return `<rect class="blk-shape" x="0" y="6" width="60" height="48" rx="6"/>` +
           `<text class="ic-tag" x="30" y="36" text-anchor="middle">PLL</text>`;
  }
});

/* --- Routing ------------------------------------------------------ */
def({
  type: "splitter", keys: "divider power divider wilkinson split fan-out 1:n way", name: "Splitter", group: "Routing", w: 120, h: 120,
  dynSize: p => ({ w: 60, h: 60 * cint(p.ways, 2, 8) }),
  dynPorts: p => {
    const n = cint(p.ways, 2, 8), h = 60 * n;
    const pts = [{ id: "in", side: "left", kind: "inout", dx: 0, dy: h / 2 }];
    for (let i = 1; i <= n; i++) pts.push({ id: "o" + i, side: "right", kind: "inout", dx: 60, dy: 60 * i - 30 });
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
    const n = cint(p.ways, 2, 8), h = 60 * n;
    let s = `<rect class="blk-shape" x="0" y="3" width="60" height="${h - 6}" rx="9"/>`;
    s += L(0, h / 2, 24, h / 2) + `<path class="blk-line" d="M24 30V${h - 30}"/>`;
    for (let i = 1; i <= n; i++) s += L(24, 60 * i - 30, 60, 60 * i - 30);
    return s + `<circle class="blk-fillg" cx="24" cy="${h / 2}" r="4.5"/>`;
  }
});

def({
  type: "combiner", keys: "sum adder power combiner n:1 merge", name: "Combiner", group: "Routing", w: 120, h: 120,
  dynSize: p => ({ w: 60, h: 60 * cint(p.ways, 2, 8) }),
  dynPorts: p => {
    const n = cint(p.ways, 2, 8), h = 60 * n, pts = [];
    for (let i = 1; i <= n; i++) pts.push({ id: "i" + i, side: "left", kind: "inout", dx: 0, dy: 60 * i - 30 });
    pts.push({ id: "out", side: "right", kind: "inout", dx: 60, dy: h / 2 }); return pts;
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
    const n = cint(p.ways, 2, 8), h = 60 * n;
    let s = `<rect class="blk-shape" x="0" y="3" width="60" height="${h - 6}" rx="9"/>`;
    s += `<path class="blk-line" d="M36 30V${h - 30}"/>`;
    for (let i = 1; i <= n; i++) s += L(0, 60 * i - 30, 36, 60 * i - 30);
    return s + L(36, h / 2, 60, h / 2) + `<circle class="blk-fillg" cx="36" cy="${h / 2}" r="4.5"/>`;
  }
});

/* Couplers */
const CPL_KIND = ["Directional", "Power tap", "Bi-directional", "Resistive", "90\u00b0 hybrid", "180\u00b0 hybrid"];
const tapThruLoss = C => -10 * Math.log10(Math.max(1e-9, 1 - Math.pow(10, -Math.abs(C) / 10)));

function cplPorts(p) {
  const k = p.ctype || "Directional";
  const P = (id, side, dy) => ({ id, side, kind: "inout", dx: side === "left" ? 0 : 120, dy });
  if (k === "Power tap") return [P("in", "left", 30), P("thru", "right", 30), P("tap", "right", 90)];
  if (k === "Resistive") return [P("in", "left", 60), P("o1", "right", 30), P("o2", "right", 90)];
  if (k === "Bi-directional") return [P("in", "left", 30), P("fwd", "left", 90), P("thru", "right", 30), P("rev", "right", 90)];
  if (k === "90\u00b0 hybrid") return [P("in", "left", 30), P("iso", "left", 90), P("out0", "right", 30), P("out90", "right", 90)];
  if (k === "180\u00b0 hybrid") return [P("sum", "left", 30), P("dif", "left", 90), P("o1", "right", 30), P("o2", "right", 90)];
  return [P("in", "left", 30), P("cpl", "left", 90), P("thru", "right", 30), P("iso", "right", 90)];
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
  type: "coupler", keys: "tap power tap directional bidirectional resistive hybrid quadrature branch-line rat-race magic-tee monitor sample coupling", name: "Coupler", group: "Routing", w: 120, h: 120,
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
    let s = `<rect class="blk-shape" x="0" y="3" width="120" height="114" rx="9"/>`;
    if (k === "Power tap")
      return s + L(0, 30, 120, 30) + `<path class="blk-line" d="M60 30V90H120"/>`
          + `<circle class="blk-fillg" cx="60" cy="30" r="4.5"/>`
          + `<path class="blk-glyph" d="M72 66V81M66 75l6 7.5l6-7.5"/>`;
    if (k === "Resistive")
      return s + `<path class="blk-line" d="M0 60H27M57 60H60V36M60 84V60"/>`
          + `<path class="blk-glyph" d="M27 60h4.5l3-6 6 12 6-12 6 12 3-6h4.5"/>` 
          + `<path class="blk-glyph" d="M60 36v-4.5l-6-3 12-6-12-6 12-6-6-3v-4.5"/>` 
          + `<path class="blk-glyph" d="M60 84v4.5l-6 3 12 6-12 6 12 6-6 3v4.5"/>` 
          + `<path class="blk-line" d="M60 30H120M60 90H120"/>`
          + `<circle class="blk-fillg" cx="60" cy="60" r="3.75"/>`;
    if (k === "90\u00b0 hybrid")
      return s + L(0, 30, 120, 30) + L(0, 90, 120, 90) + `<path class="blk-line" d="M39 30V90M81 30V90"/>`
          + `<text class="ic-tag" x="60" y="66" text-anchor="middle" font-size="11">90°</text>`;
    if (k === "180\u00b0 hybrid")
      return s + L(0, 30, 34.5, 30) + L(0, 90, 34.5, 90) + L(85.5, 30, 120, 30) + L(85.5, 90, 120, 90)
          + `<circle class="blk-line" cx="60" cy="60" r="25.5"/>`
          + `<text class="ic-tag" x="42" y="48" font-size="10">Σ</text>`
          + `<text class="ic-tag" x="42" y="82.5" font-size="10">Δ</text>`
          + `<text class="ic-tag" x="75" y="66" font-size="9">180°</text>`;
    if (k === "Bi-directional")
      return s + L(0, 30, 120, 30) + L(0, 90, 120, 90)
          + `<path class="blk-glyph" d="M51 42L69 78M69 42L51 78"/>`;
    return s + L(0, 30, 120, 30) + L(0, 90, 120, 90)
      + `<path class="blk-glyph" d="M69 42L51 78"/>`;
  }
});

/* Switch definition with SP1T..SP8T and Open position state support */
def({
  type: "switch", keys: "spdt sp3t sp4t spnt select transfer path", name: "Switch", group: "Routing", w: 120, h: 120,
  dynSize: p => ({ w: 60, h: 60 * cint(p.throws, 1, 8) }),
  dynPorts: p => {
    const n = cint(p.throws, 1, 8), h = 60 * n;
    const pts = [{ id: "in", side: "left", kind: "inout", dx: 0, dy: h / 2 }];
    for (let i = 1; i <= n; i++) pts.push({ id: "o" + i, side: "right", kind: "inout", dx: 60, dy: 60 * i - 30 });
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
    const n = cint(p.throws, 1, 8), h = 60 * n, st = swState(p, n);
    const nx = (st > 0 ? 42 : 36), ny = (st > 0 ? 60 * st - 30 : h / 2 - 12);
    let s = `<rect class="blk-shape" x="0" y="3" width="60" height="${h - 6}" rx="9"/>`;
    s += L(0, h / 2, 21, h / 2) + `<circle class="blk-fillg" cx="21" cy="${h / 2}" r="4.5"/>`;
    s += `<path class="blk-line" d="M21 ${h / 2}L${nx} ${ny}"/>`;
    for (let i = 1; i <= n; i++) { const y = 60 * i - 30; s += L(42, y, 60, y) + `<circle class="blk-shape" cx="42" cy="${y}" r="3.6"/>`; }
    return s;
  }
});

def({
  type: "interconnect", keys: "off-page link tag jump sheet cross-reference send receive leaves enters goes to comes from", name: "Interconnect", group: "Routing", w: 60, h: 60,
  params: { label: "", tag: "A", role: "receive" },
  fields: [{ key: "role", label: "This connector", type: "select", options: [
             { value: "send", label: "Sends the signal away \u2192" },
             { value: "receive", label: "Brings the signal in \u2190" }] },
           { key: "tag", label: "Tag (the pair must match)", type: "text", max: 6 }],
  isInterconnect: true,
  dynPorts: p => icSend(p) ? [{ id: "p", side: "left", kind: "in", dx: 0, dy: 30 }]
                         : [{ id: "p", side: "right", kind: "out", dx: 60, dy: 30 }],
  val: () => "",
  sym(p) {
    return icSend(p)
      ? `<path class="blk-shape" d="M0 6H33L57 30L33 54H0Z"/>`
      : `<path class="blk-shape" d="M3 6H36L60 30L36 54H3L18 30Z"/>`;
  }
});

/* --- Passive ------------------------------------------------------ */
def({
  type: "isolator", keys: "one-way non-reciprocal ferrite", name: "Isolator", group: "Passive", w: 60, h: 60,
  ports: [{ id: "in", side: "left", kind: "in", dx: 0, dy: 30 }, { id: "out", side: "right", kind: "out", dx: 60, dy: 30 }],
  params: { label: "ISO", il: 0.6 },
  fields: [{ key: "il", label: "Insertion loss", unit: "dB", step: 0.1, min: 0 }], nf: p => Math.abs(p.il),
  out: p => ({ out: -Math.abs(p.il) }), val: p => "IL " + fmt(Math.abs(p.il)) + " dB",
  sym() { return `<circle class="blk-shape" cx="30" cy="30" r="28.5"/><path class="blk-glyph" d="M13.5 30H43.5M34.5 21L45 30L34.5 39"/>`; }
});

def({
  type: "circulator", keys: "ferrite three-port duplex", name: "Circulator", group: "Passive", w: 60, h: 60, topLabel: true,
  ports: [{ id: "p1", side: "left", kind: "in", dx: 0, dy: 30 }, { id: "p2", side: "right", kind: "out", dx: 60, dy: 30 }, { id: "p3", side: "bottom", kind: "out", dx: 30, dy: 60 }],
  params: { label: "CIRC", il: 0.5, iso: 20 },
  fields: [{ key: "il", label: "Insertion loss", unit: "dB", step: 0.1, min: 0 }, { key: "iso", label: "Isolation", unit: "dB", step: 1, min: 0 }], nf: p => Math.abs(p.il),
  ref: m => m.p1, refIn: "p1", out: p => ({ p2: -Math.abs(p.il), p3: -Math.abs(p.iso) }), val: p => "IL " + fmt(Math.abs(p.il)) + " dB",
  sym() { return `<circle class="blk-shape" cx="30" cy="30" r="28.5"/><path class="blk-glyph" d="M30 18 A12 12 0 1 1 18 30"/><path class="blk-fillg" d="M18 19.5L23.25 30.75L12.75 30.75Z"/>`; }
});

def({
  type: "phase", keys: "shifter delay trim degrees", name: "Phase shift", group: "Passive", w: 60, h: 60,
  ports: [{ id: "in", side: "left", kind: "inout", dx: 0, dy: 30 }, { id: "out", side: "right", kind: "inout", dx: 60, dy: 30 }],
  params: { label: "\u03c6", phase: 0, il: 1 },
  fields: [{ key: "phase", label: "Phase", unit: "\u00b0", step: 5 }, { key: "il", label: "Insertion loss", unit: "dB", step: 0.1, min: 0 }], nf: p => Math.abs(p.il),
  out: p => ({ out: -Math.abs(p.il) }), val: p => fmt(p.phase) + "\u00b0",
  bidi: (m, p) => rl(m, Math.abs(p.il)),
  sym() { return `<rect class="blk-shape" x="0" y="6" width="60" height="48" rx="6"/><circle class="blk-glyph" cx="30" cy="30" r="13.5"/><path class="blk-glyph" d="M30 12V48"/>`; }
});

/* --- Terminals ---------------------------------------------------- */
def({
  type: "rfin", keys: "connector input port sma source", name: "In connector", group: "Terminals", w: 60, h: 60,
  ports: [{ id: "out", side: "right", kind: "out", dx: 60, dy: 30 }],
  params: { label: "RF IN", power: 0, primaryPower: 0, secondaryPower: 0, freq: "", anaPort: "P1" },
  fields: [{ key: "anaPort", label: "Analysis Port", type: "select", options: ["None", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"] },
           { key: "primaryPower", label: "Primary input level", unit: "dBm", step: 0.5 },
           { key: "secondaryPower", label: "Secondary input level", unit: "dBm", step: 0.5 },
           { key: "power", label: "Legacy input level", unit: "dBm", step: 0.5 },
           { key: "freq", label: "Frequency", type: "text" }],
  isSource: () => true, srcOut: () => "out", srcPower: (p, mode) => getSelectedSourcePower(p, mode), val: p => p.freq || dbm(getSelectedSourcePower(p)),
  sym() { return `<path class="blk-line" d="M33 30H60"/><circle class="blk-shape" cx="19.5" cy="30" r="13.5"/><circle class="blk-fillg" cx="19.5" cy="30" r="4.5"/>`; }
});

def({
  type: "rfout", keys: "connector output port sma sink", name: "Out connector", group: "Terminals", w: 60, h: 60,
  ports: [{ id: "in", side: "left", kind: "in", dx: 0, dy: 30 }],
  params: { label: "RF OUT", anaPort: "P2" },
  fields: [{ key: "anaPort", label: "Analysis Port", type: "select", options: ["None", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"] }],
  val: () => "output",
  sym() { return `<path class="blk-line" d="M0 30H27"/><circle class="blk-shape" cx="40.5" cy="30" r="13.5"/><circle class="blk-fillg" cx="40.5" cy="30" r="4.5"/>`; }
});

def({
  type: "detector", keys: "diode video log power meter", name: "Detector", group: "Terminals", w: 60, h: 60,
  ports: [{ id: "in", side: "left", kind: "in", dx: 0, dy: 30 }],
  params: { label: "DET", anaPort: "None" },
  fields: [{ key: "anaPort", label: "Analysis Port", type: "select", options: ["None", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"] }],
  val: () => "video",
  sym() { return `<rect class="blk-shape" x="0" y="9" width="60" height="42" rx="6"/><path class="blk-line" d="M6 30H18"/><path class="blk-fillg" d="M18 18L42 30L18 42Z"/><path class="blk-glyph" d="M42 18V42"/>`; }
});

def({
  type: "antenna", keys: "aerial radiator tx rx", name: "Antenna", group: "Terminals", w: 60, h: 60,
  params: { label: "ANT", role: "Tx", power: -80, primaryPower: -80, secondaryPower: -80, anaPort: "None" },
  fields: [{ key: "anaPort", label: "Analysis Port", type: "select", options: ["None", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"] },
           { key: "role", label: "Role", type: "select", options: ["Tx", "Rx"] },
           { key: "primaryPower", label: "Primary received level", unit: "dBm", step: 1, showIf: p => p.role === "Rx" },
           { key: "secondaryPower", label: "Secondary received level", unit: "dBm", step: 1, showIf: p => p.role === "Rx" },
           { key: "power", label: "Legacy received level", unit: "dBm", step: 1, showIf: p => p.role === "Rx" }],
  dynPorts: p => p.role === "Rx" ? [{ id: "ant", side: "right", kind: "out", dx: 60, dy: 30 }] : [{ id: "ant", side: "left", kind: "in", dx: 0, dy: 30 }],
  isSource: p => p.role === "Rx", srcOut: () => "ant", srcPower: (p, mode) => getSelectedSourcePower(p, mode), val: p => p.role === "Rx" ? "Rx" : "Tx",
  sym(p) {
    const feed = p.role === "Rx" ? L(60, 30, 30, 30) : L(0, 30, 30, 30);
    return feed + `<path class="blk-line" d="M30 30V7.5"/><path class="blk-line" d="M30 7.5L13.5 -4.5M30 7.5L46.5 -4.5"/><circle class="blk-fillg" cx="30" cy="30" r="3.75"/>`;
  }
});

def({
  type: "termination", keys: "load dummy 50 ohm match terminator", name: "Load 50\u03a9", group: "Terminals", w: 60, h: 60,
  ports: [{ id: "in", side: "left", kind: "in", dx: 0, dy: 30 }],
  params: { label: "LOAD", anaPort: "None" },
  fields: [{ key: "anaPort", label: "Analysis Port", type: "select", options: ["None", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"] }],
  val: () => "50 \u03a9",
  sym() { return `<path class="blk-glyph" d="M0 30l4.5 -9 9 18 9 -18 9 18 4.5 -9H45"/><path class="blk-line" d="M45 18V42"/><path class="blk-line" d="M51 22.5V37.5"/><path class="blk-line" d="M57 27V33"/>`; }
});

/* --- Hierarchy ----------------------------------------------------- */
def({
  type: "subsystem", keys: "subsystem group hierarchy module section sub-circuit page drill down fold", name: "Subsystem", group: "Hierarchy", w: 180, h: 120,
  dynSize: p => ({ w: 180, h: 60 * Math.max(2, cint(p.ins, 1, 6), cint(p.outs, 1, 6)) }),
  dynPorts: p => {
    const ni = cint(p.ins, 1, 6), no = cint(p.outs, 1, 6), m = Math.max(2, ni, no), h = 60 * m, pts = [];
    const pos = (k, i) => h / 2 + 60 * (i - (k - 1) / 2);
    for (let i = 0; i < ni; i++) pts.push({ id: "i" + (i + 1), side: "left", kind: "in", dx: 0, dy: pos(ni, i) });
    for (let i = 0; i < no; i++) pts.push({ id: "o" + (i + 1), side: "right", kind: "out", dx: 180, dy: pos(no, i) });
    return pts;
  },
  params: { label: "SECTION", ins: "1", outs: "1", sheet: "" },
  fields: [{ key: "ins", label: "Inputs", type: "select", options: ["1", "2", "3", "4", "5", "6"] },
           { key: "outs", label: "Outputs", type: "select", options: ["1", "2", "3", "4", "5", "6"] }],
  isSubsystem: true, portLabels: true,
  val: () => "double-click to open",
  sym(p) {
    const h = 60 * Math.max(2, cint(p.ins, 1, 6), cint(p.outs, 1, 6)), cy = h / 2;
    return `<rect class="blk-shape" x="0" y="3" width="180" height="${h - 6}" rx="12"/>`
      + `<rect class="blk-glyph" x="42" y="18" width="96" height="${h - 36}" rx="7.5" stroke-dasharray="4 3"/>`
      + `<rect class="blk-glyph" x="75" y="${cy - 13.5}" width="30" height="27" rx="4.5"/>`
      + `<path class="blk-glyph" d="M90 ${cy - 7.5}v12M84 ${cy - 1.5}h12"/>`;
  }
});

/* --- Custom ------------------------------------------------------- */
const cIn = p => cint(p.ins, 0, 4), cOut = p => cint(p.outs, 0, 4);
def({
  type: "custom", keys: "user block generic arbitrary source load sink terminator generator", name: "Custom block", group: "Custom", w: 120, h: 60,
  dynSize: p => ({ w: 120, h: 60 * Math.max(1, cIn(p), cOut(p)) }),
  dynPorts: p => {
    const ni = cIn(p), no = cOut(p), m = Math.max(1, ni, no), h = 60 * m, pts = [];
    const posn = (k, i) => h / 2 + 60 * (i - (k - 1) / 2);
    for (let i = 0; i < ni; i++) pts.push({ id: "i" + (i + 1), side: "left", kind: "in", dx: 0, dy: posn(ni, i) });
    for (let i = 0; i < no; i++) pts.push({ id: "o" + (i + 1), side: "right", kind: "out", dx: 120, dy: posn(no, i) });
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
    const h = 60 * Math.max(1, cIn(p), cOut(p));
    const shapes = {
      Box: `<rect class="blk-shape" x="0" y="3" width="120" height="${h - 6}" rx="9"/>`,
      Circle: `<ellipse class="blk-shape" cx="60" cy="${h / 2}" rx="60" ry="${h / 2 - 3}"/>`,
      Diamond: `<path class="blk-shape" d="M60 3L120 ${h / 2}L60 ${h - 3}L0 ${h / 2}Z"/>`,
      Triangle: `<path class="blk-shape" d="M0 3L120 ${h / 2}L0 ${h - 3}Z"/>`
    };
    let s = shapes[p.shape] || shapes.Box;
    const d = sanPath(p.path); if (d) s += `<path class="blk-glyph" d="${d}"/>`;
    return s;
  }
});

/* --- Annotation --------------------------------------------------- */
def({
  type: "label", name: "Text note", group: "Annotate", w: 180, h: 22,
  params: { label: "", text: "Label" }, fields: [{ key: "text", label: "Text", type: "text" }], isLabel: true, val: () => ""
});

const GROUPS = ["Terminals", "Sources", "Gain / Loss", "Filtering", "Frequency", "Routing", "Passive", "Hierarchy", "Custom", "Annotate"];


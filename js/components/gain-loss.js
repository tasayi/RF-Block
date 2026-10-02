/* =====================================================================
 * RF Block Diagram Editor - Gain / Loss Components
 * ===================================================================== */

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

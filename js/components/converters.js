/* =====================================================================
 * RF Block Diagram Editor - Frequency / Converter Components
 * ===================================================================== */

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

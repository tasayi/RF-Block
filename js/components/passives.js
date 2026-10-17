/* =====================================================================
 * RF Block Diagram Editor - Passive Components
 * ===================================================================== */

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

/* =====================================================================
 * RF Block Diagram Editor - Routing Components
 * ===================================================================== */

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

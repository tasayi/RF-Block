/* =====================================================================
 * RF Block Diagram Editor - Hierarchy, Custom & Annotation Components
 * ===================================================================== */

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

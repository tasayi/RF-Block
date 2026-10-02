/* =====================================================================
 * RF Block Diagram Editor - Filtering Components
 * ===================================================================== */

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

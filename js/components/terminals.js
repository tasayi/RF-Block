/* =====================================================================
 * RF Block Diagram Editor - Terminal Components
 * ===================================================================== */

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

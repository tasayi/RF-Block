"use strict";

/* --- Sources & Signal Generators ---------------------------------- */
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

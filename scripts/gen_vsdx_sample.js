"use strict";

const fs = require("fs");
const path = require("path");

// Polyfill TextEncoder if missing
if (typeof TextEncoder === "undefined") {
  global.TextEncoder = require("util").TextEncoder;
}

// Load xlsx-exporter.js and zipStore
const xlsxCode = fs.readFileSync(path.join(__dirname, "../js/io/xlsx-exporter.js"), "utf8");
const vm = require("vm");
const context = vm.createContext({ global, TextEncoder, Uint32Array, Uint8Array, DataView, Blob, Buffer, console });
vm.runInContext(xlsxCode, context);
global.zipStore = context.zipStore;

// Load vsdx-exporter
const { buildVsdxBlob } = require("../js/io/vsdx-exporter.js");

// Load the real component registry in an isolated context and provide only the
// small formatting helpers needed by the sample components' sym/val methods.
const componentContext = vm.createContext({
  Math,
  isFinite,
  getSelectedSourcePower: p => Number(p.primaryPower ?? p.power ?? 0),
  dbm: value => `${Number(value).toFixed(1)} dBm`,
  gsign: value => `${Number(value) >= 0 ? "+" : "\u2212"}${Math.abs(Number(value))} dB`,
  fmt: value => String(Number(value)),
  num: value => Number(value),
  fLoss: p => p.band === "stopband" ? Number(p.rej) : Math.abs(Number(p.il)),
  L: (x1, y1, x2, y2) => `<path class="blk-line" d="M${x1} ${y1}L${x2} ${y2}"/>`,
  cint: (value, min, max) => Math.max(min, Math.min(max, parseInt(value, 10) || min)),
  sanPath: value => String(value || "").replace(/[^MmZzLlHhVvCcSsQqTtAa0-9,.\s-]/g, "").slice(0, 600),
  icSend: params => ["send", "in"].includes((params && params.role) || "receive"),
  isSubTag: value => String(value || "").startsWith("§"),
  subTagPort: value => String(value || "").slice(String(value || "").lastIndexOf(".") + 1),
  icTagText: value => String(value || "").slice(0, 6),
  icTagFont: value => String(value || "").length <= 2 ? 13 : 11
});
const componentsSource = fs.readFileSync(path.join(__dirname, "../js/components.js"), "utf8") + "\n;globalThis.exportedCOMP = COMP;";
vm.runInContext(componentsSource, componentContext);
const componentRegistry = componentContext.exportedCOMP;
const representativeTypes = new Set(["source", "amp", "mixer", "filter"]);
const exportRegistry = Object.fromEntries(Object.entries(componentRegistry).map(([type, component]) => [
  type,
  representativeTypes.has(type) ? component : { ...component, val: () => "" }
]));
global.footprint = block => {
  const component = componentRegistry[block.type];
  const dimensions = component.dynSize ? component.dynSize(block.params) : component;
  return { w: dimensions.w, h: dimensions.h };
};
global.DESIGN_TOKENS = { symbolScale: 1, exportPadding: 24, fontSizes: { normal: 14, large: 16 } };
global.blockFill = () => "#e9f3ea";
global.blockInk = () => "#0f172a";
global.settings = { showLabels: true, showNF: false, showPwr1: true, showPwr2: true, showNoiseFloor: false, gridSize: 10 };
global.key = (blockId, portId) => `${blockId}\u00b7${portId}`;
global.dbm = value => `${Number(value).toFixed(1)} dBm`;
global.fmt = value => String(Number(value));

const sampleBlocks = [
  { id: "b1", type: "source", x: 50, y: 100, params: { label: "Signal Generator", power: 0, primaryPower: 0, secondaryPower: 0 } },
  { id: "b2", type: "amp", x: 250, y: 100, rot: 90, flip: true, params: { label: "LNA 28GHz", gain: 20, nf: 2.5 } },
  { id: "b3", type: "mixer", x: 450, y: 100, params: { label: "Downconverter", cl: 6 } },
  { id: "b4", type: "filter", x: 650, y: 100, params: { label: "IF Filter", il: 2.0 } }
];

let nextBlockId = 5;
for (const [type, component] of Object.entries(exportRegistry)) {
  if (type === "label" || representativeTypes.has(type)) continue;
  const params = { ...(component.params || {}), label: (component.params && component.params.label) || component.name };
  sampleBlocks.push({
    id: `b${nextBlockId++}`,
    type,
    x: 50 + ((nextBlockId - 6) % 7) * 130,
    y: 280 + Math.floor((nextBlockId - 6) / 7) * 170,
    rot: 0,
    flip: false,
    params
  });
}

for (const shape of ["Circle", "Diamond", "Triangle"]) {
  sampleBlocks.push({
    id: `custom-${shape.toLowerCase()}`,
    type: "custom",
    x: 50 + sampleBlocks.length * 95,
    y: 680,
    params: { ...componentRegistry.custom.params, label: `Custom ${shape}`, shape, text: shape, ins: "1", outs: "1", path: "" }
  });
}
sampleBlocks.push({
  id: "custom-svg-path",
  type: "custom",
  x: 50,
  y: 780,
  params: { ...componentRegistry.custom.params, label: "Custom vector path", shape: "Box", text: "", ins: "1", outs: "1", path: "M8 20 C12 2 28 2 32 20 S28 38 20 30 A8 8 0 0 1 8 20 Z" }
});

const sampleConns = [
  { from: { block: "b1", port: "out" }, to: { block: "b2", port: "in" } },
  { from: { block: "b2", port: "out" }, to: { block: "b3", port: "in" } },
  { from: { block: "b3", port: "out" }, to: { block: "b4", port: "in" } }
];
sampleConns[0].pillPosition = { t: 0.25, dx: 8, dy: -19 };

const samplePowers = { "b1\u00b7out": 0, "b2\u00b7out": 20, "b3\u00b7out": 14, "b4\u00b7out": 12 };
const sampleSecondaryPowers = { "b1\u00b7out": -6, "b2\u00b7out": 14, "b3\u00b7out": 8, "b4\u00b7out": 6 };
const result = buildVsdxBlob(sampleBlocks, sampleConns, samplePowers, {}, sampleSecondaryPowers, exportRegistry);

async function main() {
  let buffer;
  if (typeof Blob !== "undefined" && result instanceof Blob) {
    const arrayBuffer = await result.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else if (Buffer.isBuffer(result)) {
    buffer = result;
  } else {
    buffer = Buffer.from(result);
  }

  const outPath = path.join(__dirname, "../dist/sample-rf-chain.vsdx");
  fs.writeFileSync(outPath, buffer);
  console.log(`Successfully generated ${outPath} (${buffer.length} bytes)`);
}

main().catch(err => {
  console.error("Error generating sample VSDX:", err);
  process.exit(1);
});

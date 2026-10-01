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

const sampleBlocks = [
  { id: "b1", type: "src", x: 50, y: 100, params: { label: "Signal Generator", power: 0 } },
  { id: "b2", type: "amp", x: 250, y: 100, params: { label: "LNA 28GHz", gain: 20, nf: 2.5 } },
  { id: "b3", type: "mixer", x: 450, y: 100, params: { label: "Downconverter", cl: 6 } },
  { id: "b4", type: "filter", x: 650, y: 100, params: { label: "IF Filter", il: 2.0 } }
];

const sampleConns = [
  { from: { block: "b1", port: "out" }, to: { block: "b2", port: "in" } },
  { from: { block: "b2", port: "out" }, to: { block: "b3", port: "in" } },
  { from: { block: "b3", port: "out" }, to: { block: "b4", port: "in" } }
];

const result = buildVsdxBlob(sampleBlocks, sampleConns, {}, {});

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

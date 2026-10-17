"use strict";
/**
 * RF Block Diagram Editor - Microsoft Visio (.vsdx) Exporter Facade
 *
 * For agentic maintainability and modular architecture, Visio export functionality
 * is separated into dedicated domain modules under js/io/vsdx/:
 *   - templates.js          (OPC XML packaging structures & validation)
 *   - geometry-converter.js (SVG path sampling, arcs, and vector transforms)
 *   - shape-builder.js      (Native Visio Shape and Text Sheet builders)
 *   - exporter.js           (Main pipeline assembling pages, connectors & indicator pills)
 */

if (typeof require !== "undefined") {
  const { buildVsdxBlob } = require("./vsdx/exporter.js");
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { buildVsdxBlob };
  }
}

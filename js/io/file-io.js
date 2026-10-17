"use strict";
/**
 * RF Block Diagram Editor - File I/O & Export Facade
 *
 * File handling and export pipelines are modularized into:
 *   - js/io/document-io.js  (Native file picker, JSON serialization, autosave state)
 *   - js/io/svg-exporter.js (High-resolution SVG block diagram export)
 */

if (typeof require !== "undefined") {
  const docIo = require("./document-io.js");
  const svgExp = require("./svg-exporter.js");
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ...docIo, ...svgExp };
  }
}

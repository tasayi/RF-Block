"use strict";
/**
 * RF Block Diagram Editor - S-Parameters UI Facade
 *
 * Multi-port S-parameter analysis UI and visualizers are modularized into:
 *   - js/ui/sparams/graph-chart.js       (SVG plotter, axis scaling, CSV/SVG/PNG/Touchstone export)
 *   - js/ui/sparams/trace-grid.js        (Trace marker readouts, global analyser settings drawer)
 *   - js/ui/sparams/modal-controller.js  (Analysis tab manager, Python backend cascade bridge)
 */

if (typeof require !== "undefined") {
  const chart = require("./sparams/graph-chart.js");
  const grid = require("./sparams/trace-grid.js");
  const modal = require("./sparams/modal-controller.js");
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ...chart, ...grid, ...modal };
  }
}

"use strict";
/**
 * RF Block Diagram Editor - Component Catalog Facade
 *
 * For modularity and agentic maintainability, individual component definitions
 * are separated into dedicated category files under js/components/:
 *   - helpers.js    (registry initialization & shared switch helpers)
 *   - sources.js    (RF source, LO / oscillator)
 *   - gain-loss.js  (amplifier, bypass amplifier, attenuators, equalizer, limiter, trace)
 *   - filters.js    (fixed filter, tunable filter)
 *   - converters.js (mixer, multiplier, divider, PLL)
 *   - routing.js    (splitter, combiner, directional/tap/hybrid couplers, switches, interconnect)
 *   - passives.js   (isolator, circulator, phase shifter)
 *   - terminals.js  (RF in, RF out, power detector, antenna, 50Ω load)
 *   - containers.js (subsystem hierarchical blocks, custom blocks, label annotations)
 */

if (typeof require !== "undefined" && typeof module !== "undefined" && module.exports) {
  const fs = require("fs");
  const path = require("path");
  global.COMP = global.COMP || {};
  global.ORDER = global.ORDER || [];
  global.GROUPS = global.GROUPS || [];
  global.def = global.def || function(o) { global.COMP[o.type] = o; global.ORDER.push(o.type); };
  const compFiles = [
    "helpers.js", "sources.js", "gain-loss.js", "filters.js",
    "converters.js", "routing.js", "passives.js", "terminals.js", "containers.js"
  ];
  compFiles.forEach(file => {
    const code = fs.readFileSync(path.join(__dirname, "components", file), "utf8");
    (new Function("COMP", "ORDER", "def", code))(
      global.COMP, global.ORDER, global.def
    );
  });
  module.exports = { COMP: global.COMP, ORDER: global.ORDER, GROUPS: global.GROUPS };
}

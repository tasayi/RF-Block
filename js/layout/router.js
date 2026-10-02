"use strict";
/**
 * RF Block Diagram Editor - Router & Layout Facade
 *
 * Layout and routing algorithms have been modularized into:
 *   - js/layout/manhattan-router.js  (Orthogonal path finding, jumper bridges, waypoints)
 *   - js/layout/pill-layout.js       (Indicator pill measurement, stack layout, clearance)
 */

if (typeof require !== "undefined") {
  const router = require("./manhattan-router.js");
  const pills = require("./pill-layout.js");
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ...router, ...pills };
  }
}

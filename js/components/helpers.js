"use strict";

/* Central Component Registry & Helpers */
if (typeof COMP === "undefined") {
  var COMP = {};
  var ORDER = [];
}
if (typeof def === "undefined") {
  var def = function(o) { COMP[o.type] = o; ORDER.push(o.type); };
}

/* Helper for switch state resolution */
const swState = (p, n) => {
  if (p.state === "open" || p.state === "0") return 0;
  const v = +p.state;
  return (isFinite(v) && v >= 1 && v <= n) ? Math.round(v) : 1;
};

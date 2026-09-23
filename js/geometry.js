"use strict";

/* Geometry & Rotation Helpers */
function dims(c, params) { return c.dynSize ? c.dynSize(params || c.params) : { w: c.w, h: c.h }; }

function footprint(b) {
  const c = COMP[b.type];
  if (c.isLabel) return { w: measureLabel(b), h: 22 };
  const D = dims(c, b.params);
  const rot = (b.rot || 0) % 360;
  return (rot === 90 || rot === 270) ? { w: D.h, h: D.w } : { w: D.w, h: D.h };
}

const sizeOf = footprint;

function measureLabel(b) { return Math.max(60, (String(b.params.text || "").length * 8) + 16); }

/* Maps native symbol point to footprint coords under rotation + optional horizontal flip */
function mapPt(px, py, rot, flip, Wn, Hn, fw, fh) {
  let x = px - Wn / 2, y = py - Hn / 2;
  if (flip) x = -x;
  let rx, ry;
  if (rot === 90) { rx = -y; ry = x; }
  else if (rot === 180) { rx = -x; ry = -y; }
  else if (rot === 270) { rx = y; ry = -x; }
  else { rx = x; ry = y; }
  return { x: fw / 2 + rx, y: fh / 2 + ry };
}

function mapSide(side, rot, flip) {
  if (flip) side = (side === "left") ? "right" : (side === "right") ? "left" : side;
  const seq = ["left", "top", "right", "bottom"];
  const i = seq.indexOf(side);
  if (i < 0) return side;
  return seq[(i + rot / 90) % 4];
}

function getPorts(b) {
  const c = COMP[b.type];
  const raw = c.dynPorts ? c.dynPorts(b.params) : (c.ports || []);
  const rot = (b.rot || 0) % 360, flip = !!b.flip;
  if (!rot && !flip) return raw.map(p => ({ id: p.id, kind: p.kind, side: p.side, dx: p.dx, dy: p.dy }));
  const D = dims(c, b.params), Wn = D.w, Hn = D.h, fw = (rot === 90 || rot === 270) ? Hn : Wn, fh = (rot === 90 || rot === 270) ? Wn : Hn;
  return raw.map(p => {
    const m = mapPt(p.dx, p.dy, rot, flip, Wn, Hn, fw, fh);
    return { id: p.id, kind: p.kind, side: mapSide(p.side, rot, flip), dx: m.x, dy: m.y };
  });
}

function rotTransform(b) {
  const c = COMP[b.type];
  const rot = (b.rot || 0) % 360, flip = !!b.flip;
  if ((!rot && !flip) || c.isLabel) return "";
  const f = footprint(b);
  const D = dims(c, b.params);
  const sc = flip ? "scale(-1 1) " : "";
  return `translate(${f.w / 2} ${f.h / 2}) rotate(${rot}) ${sc}translate(${-D.w / 2} ${-D.h / 2})`;
}

function portPt(b, pid) {
  if (!b) return null;
  const p = getPorts(b).find(p => p.id === pid);
  return p ? { x: b.x + p.dx, y: b.y + p.dy, side: p.side, kind: p.kind } : null;
}

const findBlock = id => blocks.find(b => b.id === id);

function markInside(p, w, h) {
  const o = 4;
  if (p.side === "left") return { x: o, y: p.dy };
  if (p.side === "right") return { x: w - o, y: p.dy };
  if (p.side === "top") return { x: p.dx, y: o };
  return { x: p.dx, y: h - o };
}

function bboxOf(b) {
  const c = COMP[b.type];
  if (c.isLabel) { return { x: b.x - 4, y: b.y - 18, w: measureLabel(b), h: 28 }; }
  const s = footprint(b);
  if (c.topLabel || c.lblPos === "top") {
    return { x: b.x, y: b.y - 32, w: s.w, h: s.h + 32 };
  }
  return { x: b.x, y: b.y, w: s.w, h: s.h + 40 };
}

function screenToWorld(cx, cy) {
  const r = svg.getBoundingClientRect();
  return { x: (cx - r.left - view.tx) / view.scale, y: (cy - r.top - view.ty) / view.scale };
}

const snap = v => settings.snap ? Math.round(v / settings.gridSize) * settings.gridSize : Math.round(v);


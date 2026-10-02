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
  const D = dims(c, b.params), Wn = D.w, Hn = D.h, fw = (rot === 90 || rot === 270) ? Hn : Wn, fh = (rot === 90 || rot === 270) ? Wn : Hn;
  const symbolScale = (typeof DESIGN_TOKENS !== "undefined" && DESIGN_TOKENS.symbolScale) || 1;
  return raw.map(p => {
    const m = (rot || flip) ? mapPt(p.dx, p.dy, rot, flip, Wn, Hn, fw, fh) : { x: p.dx, y: p.dy };
    return {
      id: p.id,
      kind: p.kind,
      side: mapSide(p.side, rot, flip),
      dx: fw / 2 + (m.x - fw / 2) * symbolScale,
      dy: fh / 2 + (m.y - fh / 2) * symbolScale
    };
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
  if (p.side === "left") return { x: p.dx + o, y: p.dy };
  if (p.side === "right") return { x: p.dx - o, y: p.dy };
  if (p.side === "top") return { x: p.dx, y: p.dy + o };
  return { x: p.dx, y: p.dy - o };
}

function bboxOf(b) {
  const c = COMP[b.type];
  if (c.isLabel) { return { x: b.x - 4, y: b.y - 18, w: measureLabel(b), h: 28 }; }
  const s = footprint(b);
  const symbolScale = (typeof DESIGN_TOKENS !== "undefined" && DESIGN_TOKENS.symbolScale) || 1;
  const extraX = Math.max(0, s.w * (symbolScale - 1) / 2);
  const extraY = Math.max(0, s.h * (symbolScale - 1) / 2);

  const p = b.params || {};
  const valOffX = Number(p._valOffX != null ? p._valOffX : p._lblOffX) || 0;
  const valOffY = Number(p._valOffY != null ? p._valOffY : p._lblOffY) || 0;
  const nameOffX = Number(p._nameOffX != null ? p._nameOffX : p._lblOffX) || 0;
  const nameOffY = Number(p._nameOffY != null ? p._nameOffY : p._lblOffY) || 0;
  const infoOffX = Number(p._infoOffX != null ? p._infoOffX : p._lblOffX) || 0;
  const infoOffY = Number(p._infoOffY != null ? p._infoOffY : p._lblOffY) || 0;

  const hasInfo = c.info && c.info(p);
  let minX = b.x - extraX;
  let maxX = b.x + s.w + extraX;
  let minY = b.y - extraY;
  let maxY = b.y + s.h + extraY;

  // Include top label (val)
  minX = Math.min(minX, b.x + s.w / 2 + valOffX - 40);
  maxX = Math.max(maxX, b.x + s.w / 2 + valOffX + 40);
  minY = Math.min(minY, b.y - 13 + valOffY - 12);

  // Include name label
  minX = Math.min(minX, b.x + s.w / 2 + nameOffX - 40);
  maxX = Math.max(maxX, b.x + s.w / 2 + nameOffX + 40);
  maxY = Math.max(maxY, b.y + s.h + 18 + nameOffY + 12);

  // Include info label if present
  if (hasInfo) {
    minX = Math.min(minX, b.x + s.w / 2 + infoOffX - 40);
    maxX = Math.max(maxX, b.x + s.w / 2 + infoOffX + 40);
    maxY = Math.max(maxY, b.y + s.h + 33 + infoOffY + 12);
  } else {
    maxY = Math.max(maxY, b.y + s.h + 38);
  }

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function screenToWorld(cx, cy) {
  const r = svg.getBoundingClientRect();
  return { x: (cx - r.left - view.tx) / view.scale, y: (cy - r.top - view.ty) / view.scale };
}

const snap = v => settings.snap ? Math.round(v / settings.gridSize) * settings.gridSize : Math.round(v);


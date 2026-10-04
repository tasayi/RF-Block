"use strict";

/* =====================================================================
 * RF Block Diagram Editor - Indicator Pill Layout & Geometry
 * ===================================================================== */

function measurePillText(text) {
  if (!text) return { text: "", w: 32, h: 20 };
  const charWidth = 7.6;
  const paddingH = 5; // 5px padding on each side
  const w = Math.max(text.length * charWidth + paddingH * 2, 32);
  return { text, w, h: 20 };
}

function pillDims(lvl, nf) {
  const full = dbm(lvl);
  const nrow = (nf === undefined || !isFinite(nf)) ? null : ("NF " + fmt(nf) + " dB");
  const charWidthMain = 7.6;
  const paddingH = 5;
  const wMain = full.length * charWidthMain + paddingH * 2;
  const wSub = nrow ? (nrow.length * charWidthMain + paddingH * 2) : 0;
  const w = Math.max(wMain, wSub, 32);
  const h = nrow ? 36 : 20;
  return { full, nrow, w, h };
}

function pointAtRouteFraction(points, fraction) {
  if (!points || !points.length) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  let total = 0;
  const lengths = [];
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    lengths.push(len);
    total += len;
  }
  if (!total) return { x: points[0].x, y: points[0].y };
  let target = Math.max(0, Math.min(1, Number(fraction) || 0)) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const segFraction = lengths[i] ? Math.max(0, Math.min(1, target / lengths[i])) : 0;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * segFraction,
        y: points[i].y + (points[i + 1].y - points[i].y) * segFraction
      };
    }
    target -= lengths[i];
  }
  return { x: points[points.length - 1].x, y: points[points.length - 1].y };
}

function positionOnRoute(points, x, y) {
  if (!points || points.length < 2) return { t: 0.5, dx: 0, dy: 0 };
  let total = 0;
  let best = { dist: Infinity, t: 0.5, x: points[0].x, y: points[0].y, along: 0 };
  let accumulated = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i], q = points[i + 1];
    const dx = q.x - p.x, dy = q.y - p.y;
    const len2 = dx * dx + dy * dy;
    const len = Math.sqrt(len2);
    if (!len) continue;
    let localT = ((x - p.x) * dx + (y - p.y) * dy) / len2;
    localT = Math.max(0, Math.min(1, localT));
    const projX = p.x + localT * dx;
    const projY = p.y + localT * dy;
    const dist = Math.hypot(x - projX, y - projY);
    if (dist < best.dist) {
      best = { dist, t: localT, x: projX, y: projY, along: accumulated + localT * len };
    }
    accumulated += len;
    total += len;
  }

  if (!total) return { t: 0.5, dx: x - points[0].x, dy: y - points[0].y };
  return { t: best.along / total, dx: x - best.x, dy: y - best.y };
}

function pickClear(cands, d, segs, rects) {
  for (const c of cands) {
    const rx1 = c.x - d.w / 2 - 2, rx2 = c.x + d.w / 2 + 2, ry1 = c.y - d.h / 2 - 2, ry2 = c.y + d.h / 2 + 2;
    const segHit = segs.some(s => typeof segHitsRect === "function" ? segHitsRect(s, rx1, ry1, rx2, ry2) : false);
    const rectHit = (rects || []).some(r => !(rx2 < r.x1 || rx1 > r.x2 || ry2 < r.y1 || ry1 > r.y2));
    if (!segHit && !rectHit) return c;
  }
  return cands[0];
}

function pillCenter(R, lvl, allSegs, rects, nf) {
  const d = pillDims(lvl, nf);
  let seg = R.seg, cx = R.mx, cy = R.my;
  if (seg && R.segs && R.segs.length) {
    const need = (seg.horiz ? d.w : d.h) + 20;
    if (seg.len < need) {
      const L = R.segs.reduce((a, b) => b.len > a.len ? b : a);
      if (L.len > seg.len) { seg = L; cx = (L.p.x + L.q.x) / 2; cy = (L.p.y + L.q.y) / 2; }
    }
  }
  if (!seg) return { x: cx, y: cy };
  if (seg.horiz) {
    const lo = Math.min(seg.p.x, seg.q.x) + d.w / 2 + 8, hi = Math.max(seg.p.x, seg.q.x) - d.w / 2 - 8;
    cx = lo <= hi ? Math.min(Math.max(cx, lo), hi) : (seg.p.x + seg.q.x) / 2;
    cy = seg.p.y - (d.h / 2 + 4);
  } else {
    const lo = Math.min(seg.p.y, seg.q.y) + d.h / 2 + 8, hi = Math.max(seg.p.y, seg.q.y) - d.h / 2 - 8;
    cy = lo <= hi ? Math.min(Math.max(cy, lo), hi) : (seg.p.y + seg.q.y) / 2;
    cx = seg.p.x + (d.w / 2 + 6);
  }
  return { x: cx, y: cy };
}

function pill(cx, cy, lvl, connId, nf) {
  const unk = (lvl === undefined || !isFinite(lvl));
  const d = pillDims(lvl, nf);
  const escapeFn = typeof esc === "function" ? esc : (s => String(s || ""));
  const rows = d.nrow
    ? `<text class="ptx" x="0" y="-7" dominant-baseline="central" text-anchor="middle">${escapeFn(d.full)}</text><text class="pun" x="0" y="8" dominant-baseline="central" text-anchor="middle">${escapeFn(d.nrow)}</text>`
    : `<text class="ptx" x="0" y="0" dominant-baseline="central" text-anchor="middle">${escapeFn(d.full)}</text>`;
  return `<g class="pill${unk ? " unk" : ""}"${connId ? ` data-conn="${connId}"` : ""} transform="translate(${cx} ${cy})"><rect class="pbg" x="${-d.w / 2}" y="${-d.h / 2}" width="${d.w}" height="${d.h}" rx="5"/>${rows}</g>`;
}

/* Shared pill dimensions and placement used by the canvas and VSDX export. */
function indicatorPillLayout(R, indicators) {
  if (!indicators) return { colWidth: 36, pillHeight: 20, entries: [], anchorX: R.mx ?? 0, anchorY: R.my ?? 0 };
  const aboveGroup = [];
  const belowGroup = [];

  if (indicators.nf) aboveGroup.push({ type: "nf", text: indicators.nf });
  if (indicators.pwr1) aboveGroup.push({ type: "pwr1", text: indicators.pwr1 });

  if (indicators.pwr2) belowGroup.push({ type: "pwr2", text: indicators.pwr2 });
  if (indicators.nfloor) belowGroup.push({ type: "nfloor", text: indicators.nfloor });

  const totalActive = aboveGroup.length + belowGroup.length;
  if (totalActive === 0) return { colWidth: 28, pillHeight: 20, entries: [], anchorX: R.mx ?? 0, anchorY: R.my ?? 0 };

  /* Calculate Uniform Column Width (max width across all active pills in stack) */
  let colWidth = 28;
  for (const item of [...aboveGroup, ...belowGroup]) {
    const m = measurePillText(item.text);
    if (m.w > colWidth) colWidth = m.w;
  }

  let seg = R.seg, cx = R.mx, cy = R.my;
  if (seg && R.segs && R.segs.length) {
    const need = colWidth + 20;
    if (seg.len < need) {
      const L = R.segs.reduce((a, b) => b.len > a.len ? b : a);
      if (L.len > seg.len) { seg = L; cx = (L.p.x + L.q.x) / 2; cy = (L.p.y + L.q.y) / 2; }
    }
  }

  const arrowSize = 12;
  const lastPt = R.pts && R.pts[R.pts.length - 1];
  const isTerm = !!(seg && lastPt && Math.hypot(seg.q.x - lastPt.x, seg.q.y - lastPt.y) < 1);

  let wireX = cx, wireY = cy;
  if (seg) {
    if (seg.horiz) {
      const dirX = seg.q.x >= seg.p.x ? 1 : -1;
      const arrowShiftX = isTerm ? (-dirX * arrowSize / 2) : 0;
      const clearMidX = (seg.p.x + seg.q.x) / 2 + arrowShiftX;
      const lo = Math.min(seg.p.x, seg.q.x) + colWidth / 2 + (isTerm && dirX < 0 ? (8 + arrowSize) : 8);
      const hi = Math.max(seg.p.x, seg.q.x) - colWidth / 2 - (isTerm && dirX > 0 ? (8 + arrowSize) : 8);
      wireX = lo <= hi ? Math.min(Math.max(clearMidX, lo), hi) : clearMidX;
      wireY = seg.p.y;
    } else {
      const dirY = seg.q.y >= seg.p.y ? 1 : -1;
      const arrowShiftY = isTerm ? (-dirY * arrowSize / 2) : 0;
      const clearMidY = (seg.p.y + seg.q.y) / 2 + arrowShiftY;
      const lo = Math.min(seg.p.y, seg.q.y) + (isTerm && dirY < 0 ? (18 + arrowSize) : 18);
      const hi = Math.max(seg.p.y, seg.q.y) - (isTerm && dirY > 0 ? (18 + arrowSize) : 18);
      wireY = lo <= hi ? Math.min(Math.max(clearMidY, lo), hi) : clearMidY;
      wireX = seg.p.x + (colWidth / 2 + 6);
    }
  }

  const pillH = 18;
  const gap = 3;
  const entries = [];

  /* Render Above-Wire Stack (stacked upwards starting directly above wire) */
  const nAbove = aboveGroup.length;
  for (let i = 0; i < nAbove; i++) {
    const distFromWire = nAbove - 1 - i;
    const py = wireY - (pillH / 2 + gap) - distFromWire * (pillH + gap);
    entries.push({ ...aboveGroup[i], x: wireX, y: py });
  }

  /* Render Below-Wire Stack (stacked downwards starting directly below wire) */
  const nBelow = belowGroup.length;
  for (let i = 0; i < nBelow; i++) {
    const py = wireY + (pillH / 2 + gap) + i * (pillH + gap);
    entries.push({ ...belowGroup[i], x: wireX, y: py });
  }

  return { colWidth, pillHeight: pillH, entries, anchorX: wireX, anchorY: wireY };
}

/* Symmetric 4-Indicator Pill Stack Renderer */
function pillStack(R, indicators, connId) {
  const layout = indicatorPillLayout(R, indicators);
  const { colWidth, pillHeight } = layout;
  const connection = connId ? conns.find(c => c.id === connId) : null;
  const legacyOffset = connection && connection.labelOff ? connection.labelOff : null;
  const legacyPillPosition = connection && connection.pillPositions
    ? Object.values(connection.pillPositions)[0]
    : null;
  const savedPosition = connection && (connection.pillPosition || legacyPillPosition);
  const savedAnchor = savedPosition ? pointAtRouteFraction(R.pts, savedPosition.t) : null;
  const shiftX = savedAnchor ? savedAnchor.x + (Number(savedPosition.dx) || 0) - layout.anchorX : (legacyOffset ? legacyOffset.dx : 0);
  const shiftY = savedAnchor ? savedAnchor.y + (Number(savedPosition.dy) || 0) - layout.anchorY : (legacyOffset ? legacyOffset.dy : 0);
  const escapeFn = typeof esc === "function" ? esc : (s => String(s || ""));
  let html = "";
  for (const item of layout.entries) {
    const x = item.x + shiftX, y = item.y + shiftY;
    html += `<g class="pill pill-${item.type}"${connId ? ` data-conn="${connId}" data-pill-type="${item.type}" data-pill-anchor-x="${layout.anchorX + shiftX}" data-pill-anchor-y="${layout.anchorY + shiftY}"` : ""} transform="translate(${x} ${y})">`
      + `<rect class="pbg" x="${-colWidth / 2}" y="${-pillHeight / 2}" width="${colWidth}" height="${pillHeight}" rx="5"/>`
      + `<text class="ptx" x="0" y="0" dominant-baseline="central" text-anchor="middle">${escapeFn(item.text)}</text></g>`;
  }
  return html;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    measurePillText,
    pillDims,
    pointAtRouteFraction,
    positionOnRoute,
    pickClear,
    pillCenter,
    pill,
    indicatorPillLayout,
    pillStack
  };
}

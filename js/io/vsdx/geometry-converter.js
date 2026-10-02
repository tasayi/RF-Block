"use strict";

/* =====================================================================
 * RF Block Diagram Editor - Visio VSDX Geometry & SVG Converter
 * ===================================================================== */

function svgNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function svgAttributes(source) {
  const attrs = {};
  const re = /([\w:-]+)\s*=\s*(["'])(.*?)\2/g;
  let match;
  while ((match = re.exec(source))) attrs[match[1]] = match[3];
  return attrs;
}

function sampleSvgPath(data) {
  const tokens = String(data || "").match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) || [];
  const paths = [];
  let points = [];
  let x = 0, y = 0, sx = 0, sy = 0, lastC = null, lastQ = null, command = "";
  let i = 0;
  const isCommand = t => /^[a-z]$/i.test(t);
  const has = n => i + n <= tokens.length && !tokens.slice(i, i + n).some(isCommand);
  const value = () => Number(tokens[i++]);
  const point = (px, py) => { x = px; y = py; points.push({ x, y }); };
  const start = (px, py) => { if (points.length > 1) paths.push(points); points = []; sx = px; sy = py; point(px, py); };
  const endSubpath = () => { if (points.length > 1) paths.push(points); points = []; };

  while (i < tokens.length) {
    if (isCommand(tokens[i])) command = tokens[i++];
    if (!command) break;
    const upper = command.toUpperCase(), relative = command !== upper;
    if (upper === "Z") { point(sx, sy); endSubpath(); x = sx; y = sy; lastC = lastQ = null; command = ""; continue; }
    let consumed = false;
    while (i < tokens.length && !isCommand(tokens[i])) {
      if (upper === "M" || upper === "L" || upper === "T") {
        if (!has(2)) break;
        let nx = value(), ny = value();
        if (relative) { nx += x; ny += y; }
        if (upper === "M" && !consumed) start(nx, ny);
        else if (upper === "T") {
          const q = lastQ ? { x: 2 * x - lastQ.x, y: 2 * y - lastQ.y } : { x, y };
          const ox = x, oy = y;
          for (let s = 1; s <= 8; s++) { const t = s / 8, u = 1 - t; point(u * u * ox + 2 * u * t * q.x + t * t * nx, u * u * oy + 2 * u * t * q.y + t * t * ny); }
          lastQ = q;
        } else point(nx, ny);
        if (upper !== "T") lastQ = null;
        lastC = null;
        consumed = true;
        if (upper === "M") command = relative ? "l" : "L";
      } else if (upper === "H" || upper === "V") {
        if (!has(1)) break;
        const n = value();
        point(upper === "H" ? (relative ? x + n : n) : x, upper === "V" ? (relative ? y + n : n) : y);
        lastC = lastQ = null; consumed = true;
      } else if (upper === "C") {
        if (!has(6)) break;
        let x1 = value(), y1 = value(), x2 = value(), y2 = value(), ex = value(), ey = value();
        if (relative) { x1 += x; y1 += y; x2 += x; y2 += y; ex += x; ey += y; }
        const ox = x, oy = y;
        for (let s = 1; s <= 10; s++) { const t = s / 10, u = 1 - t; point(u ** 3 * ox + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * ex, u ** 3 * oy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * ey); }
        lastC = { x: x2, y: y2 }; lastQ = null; consumed = true;
      } else if (upper === "S") {
        if (!has(4)) break;
        let x2 = value(), y2 = value(), ex = value(), ey = value();
        if (relative) { x2 += x; y2 += y; ex += x; ey += y; }
        const x1 = lastC ? 2 * x - lastC.x : x, y1 = lastC ? 2 * y - lastC.y : y;
        const ox = x, oy = y;
        for (let s = 1; s <= 10; s++) { const t = s / 10, u = 1 - t; point(u ** 3 * ox + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * ex, u ** 3 * oy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * ey); }
        lastC = { x: x2, y: y2 }; lastQ = null; consumed = true;
      } else if (upper === "Q") {
        if (!has(4)) break;
        let cx = value(), cy = value(), ex = value(), ey = value();
        if (relative) { cx += x; cy += y; ex += x; ey += y; }
        const ox = x, oy = y;
        for (let s = 1; s <= 8; s++) { const t = s / 8, u = 1 - t; point(u * u * ox + 2 * u * t * cx + t * t * ex, u * u * oy + 2 * u * t * cy + t * t * ey); }
        lastQ = { x: cx, y: cy }; lastC = null; consumed = true;
      } else if (upper === "A") {
        if (!has(7)) break;
        const rx0 = Math.abs(value()), ry0 = Math.abs(value()), rotation = value() * Math.PI / 180;
        const large = value() ? 1 : 0, sweep = value() ? 1 : 0;
        let ex = value(), ey = value();
        if (relative) { ex += x; ey += y; }
        const ox = x, oy = y;
        if (!rx0 || !ry0) { point(ex, ey); lastC = lastQ = null; consumed = true; continue; }
        const cos = Math.cos(rotation), sin = Math.sin(rotation);
        const dx = (ox - ex) / 2, dy = (oy - ey) / 2;
        let rx = rx0, ry = ry0;
        const xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy;
        const scale = xp * xp / (rx * rx || 1) + yp * yp / (ry * ry || 1);
        if (scale > 1) { rx *= Math.sqrt(scale); ry *= Math.sqrt(scale); }
        const sign = large === sweep ? -1 : 1;
        const denom = (rx * rx * yp * yp + ry * ry * xp * xp) || 1;
        const factor = sign * Math.sqrt(Math.max(0, (rx * rx * ry * ry - denom) / denom));
        const cxp = factor * rx * yp / ry, cyp = -factor * ry * xp / rx;
        const cx = cos * cxp - sin * cyp + (ox + ex) / 2, cy = sin * cxp + cos * cyp + (oy + ey) / 2;
        const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
        const ux = (xp - cxp) / rx, uy = (yp - cyp) / ry, vx = (-xp - cxp) / rx, vy = (-yp - cyp) / ry;
        let startA = Math.atan2(uy, ux), delta = angle(ux, uy, vx, vy);
        if (!sweep && delta > 0) delta -= 2 * Math.PI;
        if (sweep && delta < 0) delta += 2 * Math.PI;
        const steps = Math.max(6, Math.ceil(Math.abs(delta) / (Math.PI / 12)));
        for (let s = 1; s <= steps; s++) { const a = startA + delta * s / steps; point(cx + rx * cos * Math.cos(a) - ry * sin * Math.sin(a), cy + rx * sin * Math.cos(a) + ry * cos * Math.sin(a)); }
        lastC = lastQ = null; consumed = true;
      } else {
        return [];
      }
    }
    if (!consumed) break;
  }
  if (points.length > 1) paths.push(points);
  return paths;
}

function sampleEllipse(cx, cy, rx, ry, startAngle = 0, endAngle = Math.PI * 2) {
  const count = Math.max(16, Math.ceil(Math.abs(endAngle - startAngle) * 8));
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const a = startAngle + (endAngle - startAngle) * i / count;
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return [pts];
}

function roundedRectPath(x, y, width, height, rx, ry) {
  const rX = Math.min(Math.abs(rx), Math.abs(width) / 2), rY = Math.min(Math.abs(ry || rx), Math.abs(height) / 2);
  if (!rX || !rY) return [[{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }, { x, y }]];
  const pts = [];
  const corners = [
    [x + width - rX, y + rY, -Math.PI / 2, 0],
    [x + width - rX, y + height - rY, 0, Math.PI / 2],
    [x + rX, y + height - rY, Math.PI / 2, Math.PI],
    [x + rX, y + rY, Math.PI, Math.PI * 1.5]
  ];
  for (const [cx, cy, a0, a1] of corners) {
    const arc = sampleEllipse(cx, cy, rX, rY, a0, a1)[0];
    pts.push(...arc);
  }
  pts.push(pts[0]);
  return [pts];
}

function svgSymbolPrimitives(markup, naturalW, naturalH) {
  const result = [];
  const elementRe = /<(rect|circle|ellipse|line|polygon|polyline|path|text)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1\s*>)/gi;
  let match;
  while ((match = elementRe.exec(String(markup || "")))) {
    const tag = match[1].toLowerCase(), attrs = svgAttributes(match[2]);
    const classes = String(attrs.class || "").split(/\s+/);
    const style = {
      fill: classes.includes("blk-shape") || classes.includes("blk-fillg"),
      stroke: !classes.includes("blk-fillg"),
      fillColor: classes.includes("blk-shape") ? "block" : classes.includes("blk-fillg") ? "ink" : "none",
      strokeColor: "ink",
      linePattern: attrs["stroke-dasharray"] ? 2 : 1,
      lineWidth: classes.includes("blk-shape") || classes.includes("blk-line") ? 2 : 1.6
    };
    if (tag === "text") {
      result.push({ type: "text", text: match[3] || "", x: svgNumber(attrs.x), y: svgNumber(attrs.y), anchor: attrs["text-anchor"] || "start", fontSize: svgNumber(attrs["font-size"], 16), style });
      continue;
    }
    let paths = [];
    if (tag === "path") paths = sampleSvgPath(attrs.d || "");
    else if (tag === "line") paths = [[{ x: svgNumber(attrs.x1), y: svgNumber(attrs.y1) }, { x: svgNumber(attrs.x2), y: svgNumber(attrs.y2) }]];
    else if (tag === "polygon" || tag === "polyline") {
      const coords = String(attrs.points || "").match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) || [];
      const pts = [];
      for (let i = 0; i + 1 < coords.length; i += 2) pts.push({ x: Number(coords[i]), y: Number(coords[i + 1]) });
      if (tag === "polygon" && pts.length > 2) pts.push({ ...pts[0] });
      if (pts.length > 1) paths = [pts];
    }
    else if (tag === "rect") paths = roundedRectPath(svgNumber(attrs.x), svgNumber(attrs.y), svgNumber(attrs.width, 40), svgNumber(attrs.height, 40), svgNumber(attrs.rx), svgNumber(attrs.ry, svgNumber(attrs.rx)));
    else if (tag === "circle") paths = sampleEllipse(svgNumber(attrs.cx), svgNumber(attrs.cy), svgNumber(attrs.r), svgNumber(attrs.r));
    else if (tag === "ellipse") paths = sampleEllipse(svgNumber(attrs.cx), svgNumber(attrs.cy), svgNumber(attrs.rx), svgNumber(attrs.ry));
    if (!paths.length) throw new Error(`Unsupported or invalid SVG symbol element <${tag}>.`);
    result.push({ type: "geometry", paths, style });
  }
  return result;
}

function makeGeometrySection(points, sectionIndex, noFill, closed) {
  if (!points || points.length < 2) return "";
  let rows = `<Row T="MoveTo" IX="1"><Cell N="X" V="${points[0].x}"/><Cell N="Y" V="${points[0].y}"/></Row>`;
  for (let i = 1; i < points.length; i++) rows += `<Row T="LineTo" IX="${i + 1}"><Cell N="X" V="${points[i].x}"/><Cell N="Y" V="${points[i].y}"/></Row>`;
  if (closed && (points[0].x !== points[points.length - 1].x || points[0].y !== points[points.length - 1].y)) {
    rows += `<Row T="LineTo" IX="${points.length + 1}"><Cell N="X" V="${points[0].x}"/><Cell N="Y" V="${points[0].y}"/></Row>`;
  }
  return `<Section N="Geometry" IX="${sectionIndex}"><Cell N="NoFill" V="${noFill ? 1 : 0}"/><Cell N="NoLine" V="0"/>${rows}</Section>`;
}

function pointAlongPolyline(points, fraction) {
  if (!points || !points.length) return { x: 0, y: 0 };
  let total = 0;
  const lengths = [];
  for (let i = 0; i < points.length - 1; i++) {
    const length = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    lengths.push(length);
    total += length;
  }
  if (!total) return { x: points[0].x, y: points[0].y };
  let remaining = Math.max(0, Math.min(1, Number(fraction) || 0)) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] ? Math.max(0, Math.min(1, remaining / lengths[i])) : 0;
      return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t };
    }
    remaining -= lengths[i];
  }
  return { x: points[points.length - 1].x, y: points[points.length - 1].y };
}

function transformSymbolPoint(point, naturalW, naturalH, footprintW, footprintH, rotation, flip, symbolScale) {
  let x = (point.x / naturalW - 0.5) * naturalW * symbolScale;
  let y = (point.y / naturalH - 0.5) * naturalH * symbolScale;
  if (flip) x = -x;
  const r = ((rotation % 360) + 360) % 360;
  let rx = x, ry = y;
  if (r === 90) { rx = -y; ry = x; }
  else if (r === 180) { rx = -x; ry = -y; }
  else if (r === 270) { rx = y; ry = -x; }
  return { x: footprintW / 2 + rx, y: footprintH / 2 + ry };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    svgNumber,
    svgAttributes,
    sampleSvgPath,
    sampleEllipse,
    roundedRectPath,
    svgSymbolPrimitives,
    makeGeometrySection,
    pointAlongPolyline,
    transformSymbolPoint
  };
}

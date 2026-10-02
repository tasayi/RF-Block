"use strict";

/* Native Microsoft Visio (.vsdx) Binary Generator
   Generates native OpenXML Visio OPC zip package with vector shapes, text & dynamic connectors */

function vsdxEsc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

function vsdxColor(hex) {
  if (!hex || typeof hex !== "string") return "#ffffff";
  const h = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(h)) return h.toLowerCase();
  return "#ffffff";
}

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
        // Unknown SVG commands are rejected rather than replaced by a generic rectangle.
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

function buildShapeXml(id, name, pinX, pinY, widthIn, heightIn, geometry, style, text = "", connectionPoints = []) {
  const resolveColor = color => color === "block" ? style.blockFill : color === "ink" ? style.ink : (color || "#ffffff");
  const fill = style.fill ? resolveColor(style.fillColor) : "#ffffff";
  const stroke = style.stroke ? resolveColor(style.strokeColor) : "#ffffff";
  let xml = `    <Shape ID="${id}" NameU="${vsdxEsc(name)}" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">\n`
    + `      <Cell N="Width" V="${widthIn}"/><Cell N="Height" V="${heightIn}"/>\n`
    + `      <Cell N="PinX" V="${pinX}"/><Cell N="PinY" V="${pinY}"/>\n`
    + `      <Cell N="LocPinX" V="${widthIn / 2}"/><Cell N="LocPinY" V="${heightIn / 2}"/>\n`
    + `      <Cell N="FillForegnd" V="${fill}"/><Cell N="FillBkgnd" V="#ffffff"/><Cell N="FillPattern" V="${style.fill ? 1 : 0}"/>\n`
    + `      <Cell N="LineColor" V="${stroke}"/>\n`
    + `      <Cell N="LineWeight" V="${style.stroke ? style.lineWidth / 96 : 0}"/><Cell N="LinePattern" V="${style.linePattern || 1}"/>\n`
    + `      <Cell N="LeftMargin" V="0"/><Cell N="RightMargin" V="0"/><Cell N="TopMargin" V="0"/><Cell N="BottomMargin" V="0"/>\n`
    + geometry
    + (connectionPoints.length ? `<Section N="Connection" IX="0">${connectionPoints.map((point, index) => `<Row IX="${index}"><Cell N="X" V="${point.x}"/><Cell N="Y" V="${point.y}"/><Cell N="DirX" V="${point.dirX}"/><Cell N="DirY" V="${point.dirY}"/><Cell N="Type" V="0"/></Row>`).join("")}</Section>\n` : "")
    + (text ? `<Text><cp IX="0"/><pp IX="0"/>${vsdxEsc(text)}</Text>\n` : "")
    + `    </Shape>\n`;
  return xml;
}

function resolveExportPort(block, component, portId, footprintSize) {
  if (typeof portPt === "function") {
    const point = portPt(block, portId);
    if (point) return { ...point, dx: point.x - block.x, dy: point.y - block.y };
  }
  const params = block.params || component.params || {};
  const rawPorts = component.dynPorts ? component.dynPorts(params) : (component.ports || []);
  const port = rawPorts.find(item => item.id === portId);
  if (!port) return null;
  const dimensions = typeof dims === "function" ? dims(component, params) : (component.dynSize ? component.dynSize(params) : component);
  const naturalW = dimensions.w || component.w || footprintSize.w;
  const naturalH = dimensions.h || component.h || footprintSize.h;
  const rotation = ((block.rot || 0) % 360 + 360) % 360;
  let x = port.dx - naturalW / 2, y = port.dy - naturalH / 2;
  if (block.flip) x = -x;
  let rx = x, ry = y;
  if (rotation === 90) { rx = -y; ry = x; }
  else if (rotation === 180) { rx = -x; ry = -y; }
  else if (rotation === 270) { rx = y; ry = -x; }
  const unscaledX = footprintSize.w / 2 + rx, unscaledY = footprintSize.h / 2 + ry;
  const symbolScale = (typeof DESIGN_TOKENS !== "undefined" && DESIGN_TOKENS.symbolScale) || 1;
  const dx = footprintSize.w / 2 + (unscaledX - footprintSize.w / 2) * symbolScale;
  const dy = footprintSize.h / 2 + (unscaledY - footprintSize.h / 2) * symbolScale;
  let side = port.side;
  if (block.flip) side = side === "left" ? "right" : side === "right" ? "left" : side;
  const sides = ["left", "top", "right", "bottom"], sideIndex = sides.indexOf(side);
  if (sideIndex >= 0) side = sides[(sideIndex + rotation / 90) % 4];
  return { x: block.x + dx, y: block.y + dy, dx, dy, side, kind: port.kind };
}

function blockLabelY(b, f, appSettings) {
  const cfg = appSettings || (typeof settings !== "undefined" ? settings : {});
  const nAbove = (cfg.showNF ? 1 : 0) + (cfg.showPwr1 !== false ? 1 : 0);
  const nBelow = (cfg.showPwr2 ? 1 : 0) + (cfg.showNoiseFloor ? 1 : 0);

  const wireDy = (f && f.h != null) ? f.h / 2 : 30;
  const stackTopRel = wireDy - 21 * nAbove;
  const stackBtmRel = wireDy + 21 * nBelow;

  const defaultValY = Math.min(-13, stackTopRel - 10);
  const defaultNameY = Math.max((f && f.h != null ? f.h : 60) + 18, stackBtmRel + 18);
  const defaultInfoY = defaultNameY + 15;

  return { valY: defaultValY, nameY: defaultNameY, infoY: defaultInfoY };
}

function buildTextShapeXml(id, text, centerX, centerY, widthPx, heightPx, fontPx, color, bold, align, dpi, toInX, toInY, angleRadians = 0) {
  const widthIn = Math.max(0.01, widthPx / dpi), heightIn = Math.max(0.01, heightPx / dpi);
  const x = toInX(centerX), y = toInY(centerY);
  const alignVal = (align === "middle" || align === "center") ? 1 : (align === "end" || align === "right") ? 2 : 0;
  return `    <Shape ID="${id}" NameU="Text annotation" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">\n`
    + `      <Cell N="Width" V="${widthIn}"/><Cell N="Height" V="${heightIn}"/><Cell N="PinX" V="${x}"/><Cell N="PinY" V="${y}"/><Cell N="LocPinX" V="${widthIn / 2}"/><Cell N="LocPinY" V="${heightIn / 2}"/>\n`
    + `      <Cell N="Angle" V="${angleRadians}"/>\n`
    + `      <Cell N="LinePattern" V="0"/><Cell N="FillPattern" V="0"/>\n`
    + `      <Cell N="TxtPinX" V="${widthIn / 2}"/><Cell N="TxtPinY" V="${heightIn / 2}"/>\n`
    + `      <Cell N="TxtLocPinX" V="${widthIn / 2}"/><Cell N="TxtLocPinY" V="${heightIn / 2}"/>\n`
    + `      <Cell N="TxtWidth" V="${widthIn}"/><Cell N="TxtHeight" V="${heightIn}"/>\n`
    + `      <Cell N="LeftMargin" V="0"/><Cell N="RightMargin" V="0"/><Cell N="TopMargin" V="0"/><Cell N="BottomMargin" V="0"/>\n`
    + `      <Cell N="TxtMarginLeft" V="0"/><Cell N="TxtMarginRight" V="0"/><Cell N="TxtMarginTop" V="0"/><Cell N="TxtMarginBottom" V="0"/>\n`
    + `      <Section N="Paragraph" IX="0"><Row IX="0"><Cell N="HorzAlign" V="${alignVal}"/></Row></Section>\n`
    + `      <Section N="Character" IX="0"><Row IX="0"><Cell N="Font" V="1"/><Cell N="Size" V="${fontPx / 96}"/><Cell N="Color" V="${color}"/><Cell N="Style" V="${bold ? 1 : 0}"/></Row></Section>\n`
    + `      <Text><cp IX="0"/><pp IX="0"/>${vsdxEsc(text)}</Text>\n`
    + `    </Shape>\n`;
}

function validateVsdxPackage(entries) {
  const parts = (entries || []).map(e => e && e.name ? e.name : "").filter(Boolean);
  const required = [
    "[Content_Types].xml",
    "_rels/.rels",
    "docProps/app.xml",
    "docProps/core.xml",
    "visio/document.xml",
    "visio/_rels/document.xml.rels",
    "visio/pages/pages.xml",
    "visio/pages/_rels/pages.xml.rels",
    "visio/pages/page1.xml",
    "visio/masters/masters.xml",
    "visio/windows.xml"
  ];
  const missing = required.filter(name => !parts.includes(name));
  if (missing.length) throw new Error(`Invalid VSDX package: missing required part(s): ${missing.join(", ")}`);

  const partMap = new Map((entries || []).filter(Boolean).map(e => [e.name, String(e.data || "")]));
  const xmlTypes = partMap.get("[Content_Types].xml") || "";
  const docRels = partMap.get("visio/_rels/document.xml.rels") || "";
  const pageRels = partMap.get("visio/pages/_rels/pages.xml.rels") || "";
  const pageXml = partMap.get("visio/pages/page1.xml") || "";

  const need = [
    '/visio/document.xml',
    '/visio/pages/pages.xml',
    '/visio/pages/page1.xml',
    '/visio/windows.xml',
    '/docProps/core.xml',
    '/docProps/app.xml'
  ];
  for (const token of need) {
    if (!xmlTypes.includes(`PartName="${token}"`)) throw new Error(`Invalid VSDX package: missing Content_Types entry for ${token}`);
  }

  if (!/Relationship Id="rId1"[^>]*Target="visio\/document\.xml"/.test((partMap.get("_rels/.rels") || ""))) {
    throw new Error("Invalid VSDX package: package root relationship is missing or malformed.");
  }
  if (!/Relationship Id="rId1"[^>]*Target="pages\/pages\.xml"/.test(docRels)) {
    throw new Error("Invalid VSDX package: document relationships are missing the pages target.");
  }
  if (!/Relationship Id="rId1"[^>]*Target="page1\.xml"/.test(pageRels)) {
    throw new Error("Invalid VSDX package: page relationships are missing the page target.");
  }
  if (!/<Page\b[^>]*xmlns=/.test(pageXml)) {
    throw new Error("Invalid VSDX package: page XML must use a Visio Page root element.");
  }

  const xmlFiles = ["[Content_Types].xml", "_rels/.rels", "visio/document.xml", "visio/_rels/document.xml.rels", "visio/pages/pages.xml", "visio/pages/_rels/pages.xml.rels", "visio/pages/page1.xml", "visio/masters/masters.xml", "visio/windows.xml", "docProps/core.xml", "docProps/app.xml"];
  for (const name of xmlFiles) {
    const xml = partMap.get(name) || "";
    if (!xml.startsWith("<?xml")) throw new Error(`Invalid VSDX package: ${name} is not valid XML.`);
  }

  const shapeTags = [...pageXml.matchAll(/<Shape\b([^>]*)>/g)];
  const shapeIds = new Set();
  for (const match of shapeTags) {
    const id = (match[1].match(/\bID="(\d+)"/) || [])[1];
    if (!id) throw new Error("Invalid VSDX page: a Shape is missing its numeric ID.");
    if (shapeIds.has(id)) throw new Error(`Invalid VSDX page: duplicate Shape ID ${id}.`);
    shapeIds.add(id);
  }
  if (!shapeTags.length) throw new Error("Invalid VSDX page: no shapes were generated.");

  const masterXml = partMap.get("visio/masters/masters.xml") || "";
  const masterIds = new Set([...masterXml.matchAll(/<Master\b[^>]*\bID="(\d+)"/g)].map(match => match[1]));
  for (const match of pageXml.matchAll(/<Shape\b([^>]*)>/g)) {
    const masterId = (match[1].match(/\bMaster="(\d+)"/) || [])[1];
    if (masterId && !masterIds.has(masterId)) throw new Error(`Invalid VSDX page: Shape references missing Master ID ${masterId}.`);
  }
  for (const connect of pageXml.matchAll(/<Connect\b([^>]*)\/>/g)) {
    for (const attr of ["FromSheet", "ToSheet"]) {
      const id = (connect[1].match(new RegExp(`\\b${attr}="(\\d+)"`)) || [])[1];
      if (id && !shapeIds.has(id)) throw new Error(`Invalid VSDX page: connector references missing Shape ID ${id}.`);
    }
    const targetId = (connect[1].match(/\bToSheet="(\d+)"/) || [])[1];
    const targetCell = (connect[1].match(/\bToCell="([^"]+)"/) || [])[1];
    if (targetId && targetCell && targetCell.startsWith("Connections.X")) {
      const pointNo = Number(targetCell.slice("Connections.X".length));
      const targetShape = [...pageXml.matchAll(/<Shape\b([^>]*)>([\s\S]*?)<\/Shape>/g)]
        .find(shape => (shape[1].match(/\bID="(\d+)"/) || [])[1] === targetId);
      if (!targetShape || !new RegExp(`<Section N="Connection"[^>]*>[\\s\\S]*?<Row IX="${pointNo - 1}"`).test(targetShape[2])) {
        throw new Error(`Invalid VSDX page: connector target ${targetId}/${targetCell} does not resolve to a port connection point.`);
      }
    }
  }
  for (const match of pageXml.matchAll(/<Shape\b([^>]*)NameU="Dynamic connector"([^>]*)>([\s\S]*?)<\/Shape>/g)) {
    const attrs = `${match[1]} ${match[2]}`;
    if (!/\bOneD="1"/.test(attrs) || !/<Cell N="BeginX"/.test(match[3]) || !/<Cell N="EndX"/.test(match[3])) {
      throw new Error("Invalid VSDX page: a connector is missing 1D endpoint coordinates.");
    }
  }
  if (shapeTags.some(match => /\bNameU="[^"]+ symbol"/.test(match[1]))
      && !/<Shape\b[^>]*NameU="[^"]+ symbol"[^>]*>[\s\S]*?<Section N="Geometry"/.test(pageXml)) {
    throw new Error("Invalid VSDX page: component symbols are missing vector geometry.");
  }

  return true;
}

function buildVsdxBlob(blocksList, connsList, Pdict, NFdict, PSecondaryDict, componentRegistryOverride, settingsOverride) {
  const blks = blocksList || [];
  const cns = connsList || [];
  const componentRegistry = componentRegistryOverride || ((typeof COMP !== "undefined") ? COMP : {});
  const P = Pdict || (typeof computePowers === "function" ? computePowers("primary") : {});
  const PSecondary = PSecondaryDict || (typeof computePowers === "function" ? computePowers("secondary") : {});
  const effectiveSettings = settingsOverride || (typeof settings !== "undefined" ? settings : {});
  const needNoise = !!(effectiveSettings.showNF || effectiveSettings.showNoiseFloor);
  const NFm = NFdict || (needNoise && typeof computeNoise === "function" ? computeNoise(P) : null);

  /* Calculate canvas bounding box in pixels */
  const pad = (typeof DESIGN_TOKENS !== "undefined" && DESIGN_TOKENS.exportPadding) ? DESIGN_TOKENS.exportPadding : 24;
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  if (!blks.length) {
    minx = 0; miny = 0; maxx = 800; maxy = 600;
  } else {
    for (const b of blks) {
      const f = (typeof footprint === "function") ? footprint(b) : { w: 100, h: 60 };
      const bounds = typeof bboxOf === "function" ? bboxOf(b) : { x: b.x, y: b.y - 32, w: f.w, h: f.h + 40 };
      minx = Math.min(minx, bounds.x - pad);
      miny = Math.min(miny, bounds.y - pad);
      maxx = Math.max(maxx, bounds.x + bounds.w + pad);
      maxy = Math.max(maxy, bounds.y + bounds.h + pad);
    }
    for (const cn of cns) {
      if (cn.waypoints && cn.waypoints.length) {
        for (const wp of cn.waypoints) {
          minx = Math.min(minx, wp.x - pad);
          miny = Math.min(miny, wp.y - pad);
          maxx = Math.max(maxx, wp.x + pad);
          maxy = Math.max(maxy, wp.y + pad);
        }
      }
      const savedPillPosition = cn.pillPosition || Object.values(cn.pillPositions || {})[0];
      if (savedPillPosition) {
        const fromBlock = blks.find(block => block.id === cn.from.block);
        const toBlock = blks.find(block => block.id === cn.to.block);
        const fromComp = fromBlock && componentRegistry[fromBlock.type];
        const toComp = toBlock && componentRegistry[toBlock.type];
        if (fromBlock && toBlock && fromComp && toComp) {
          const fromFoot = typeof footprint === "function" ? footprint(fromBlock) : { w: fromComp.w || 100, h: fromComp.h || 60 };
          const toFoot = typeof footprint === "function" ? footprint(toBlock) : { w: toComp.w || 100, h: toComp.h || 60 };
          const a = resolveExportPort(fromBlock, fromComp, cn.from.port, fromFoot);
          const z = resolveExportPort(toBlock, toComp, cn.to.port, toFoot);
          const R = a && z && typeof route === "function" ? route(a, z, cn) : (a && z ? { pts: [a, z] } : null);
          if (R && R.pts) {
            const anchor = pointAlongPolyline(R.pts, savedPillPosition.t);
            const x = anchor.x + (Number(savedPillPosition.dx) || 0), y = anchor.y + (Number(savedPillPosition.dy) || 0);
            minx = Math.min(minx, x - 64 - pad);
            miny = Math.min(miny, y - 64 - pad);
            maxx = Math.max(maxx, x + 64 + pad);
            maxy = Math.max(maxy, y + 64 + pad);
          }
        }
      }
    }
  }

  const pxW = Math.max(300, maxx - minx);
  const pxH = Math.max(200, maxy - miny);
  const dpi = 96;
  const marginPx = 24;
  const pageWin = Math.ceil(((pxW + marginPx * 2) / dpi) * 100) / 100;
  const pageHin = Math.ceil(((pxH + marginPx * 2) / dpi) * 100) / 100;
  const toInX = px => Math.round(((px - minx + marginPx) / dpi) * 10000) / 10000;
  const toInY = py => Math.round((pageHin - ((py - miny + marginPx) / dpi)) * 10000) / 10000;
  const toInLen = len => Math.round((len / dpi) * 10000) / 10000;

  /* XML Headers */
  const XML_HDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  /* Content Types */
  const contentTypesXml = XML_HDR
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n`
    + `  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n`
    + `  <Default Extension="xml" ContentType="application/xml"/>\n`
    + `  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>\n`
    + `  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>\n`
    + `  <Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>\n`
    + `  <Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>\n`
    + `  <Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>\n`
    + `  <Override PartName="/visio/masters/masters.xml" ContentType="application/vnd.ms-visio.masters+xml"/>\n`
    + `  <Override PartName="/visio/windows.xml" ContentType="application/vnd.ms-visio.windows+xml"/>\n`
    + `</Types>`;

  const appXml = XML_HDR + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>RF Chain</Application></Properties>`;
  const coreXml = XML_HDR + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>RF Chain Block Diagram</dc:title><dc:creator>RF Chain Editor</dc:creator><cp:lastModifiedBy>RF Chain Editor</cp:lastModifiedBy></cp:coreProperties>`;

  /* Root Relationships */
  const rootRelsXml = XML_HDR
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n`
    + `  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/>\n`
    + `  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>\n`
    + `  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>\n`
    + `</Relationships>`;

  /* Visio Document */
  const docXml = XML_HDR
    + `<VisioDocument xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n`
    + `  <DocumentProperties>\n`
    + `    <Title>RF Chain Block Diagram</Title>\n`
    + `    <Creator>RF Chain Editor</Creator>\n`
    + `  </DocumentProperties>\n`
    + `  <FaceNames>\n`
    + `    <FaceName ID="1" Name="Calibri" Flags="0"/>\n`
    + `  </FaceNames>\n`
    + `  <StyleSheets>\n`
    + `    <StyleSheet ID="0" Name="Normal">\n`
    + `      <Cell N="Font" V="1"/>\n`
    + `    </StyleSheet>\n`
    + `  </StyleSheets>\n`
    + `</VisioDocument>`;

  /* Document Relationships */
  const docRelsXml = XML_HDR
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n`
    + `  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/>\n`
    + `  <Relationship Id="rId2" Type="http://schemas.microsoft.com/visio/2010/relationships/masters" Target="masters/masters.xml"/>\n`
    + `  <Relationship Id="rId3" Type="http://schemas.microsoft.com/visio/2010/relationships/windows" Target="windows.xml"/>\n`
    + `</Relationships>`;

  /* Pages Manifest */
  const pagesXml = XML_HDR
    + `<Pages xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n`
    + `  <Page ID="0" Name="Page-1" NameU="Page-1">\n`
    + `    <Rel r:id="rId1"/>\n`
    + `  </Page>\n`
    + `</Pages>`;

  /* Pages Relationships */
  const pagesRelsXml = XML_HDR
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n`
    + `  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/>\n`
    + `</Relationships>`;

  /* Masters Manifest */
  let mastersXml = XML_HDR
    + `<Masters xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`;

  /* Windows View */
  const windowsXml = XML_HDR
    + `<Windows xmlns="http://schemas.microsoft.com/office/visio/2012/main">\n`
    + `  <Window ID="0" WindowType="Drawing" WindowWidth="1600" WindowHeight="1000" ViewScale="1" Page="1"/>\n`
    + `</Windows>`;

  /* Build Page 1 Diagram Shapes & Connectors */
  let shapesXml = "";
  let connectsXml = "";
  let nextShapeId = 1;
  const blockShapeMap = new Map();
  const blockPortCellMap = new Map();

  /* 1. Map Blocks to Native Visio Shapes */
  for (const b of blks) {
    const c = componentRegistry[b.type];
    if (!c) throw new Error(`VSDX export has no component mapping for type "${b.type}".`);
    const f = (typeof footprint === "function") ? footprint(b) : { w: 100, h: 60 };
    const wIn = toInLen(f.w);
    const hIn = toInLen(f.h);
    const pinX = toInX(b.x + f.w / 2);
    const pinY = toInY(b.y + f.h / 2);
    const fillHex = vsdxColor(typeof blockFill === "function" ? blockFill(b) : "#ffffff");
    const inkHex = vsdxColor(typeof blockInk === "function" ? blockInk(fillHex, b.type) : "#0f172a");
    let blockAnchorId = 0;
    const rawPorts = c.dynPorts ? c.dynPorts(b.params || c.params || {}) : (c.ports || []);
    const portCellMap = new Map();
    const connectionPoints = rawPorts.map((port, index) => {
      const resolved = resolveExportPort(b, c, port.id, f);
      if (!resolved) return null;
      const dir = { left: [-1, 0], right: [1, 0], top: [0, 1], bottom: [0, -1] }[resolved.side] || [0, 0];
      const cellName = `Connections.X${index + 1}`;
      portCellMap.set(port.id, cellName);
      return { x: toInLen(resolved.dx), y: toInLen(f.h - resolved.dy), dirX: dir[0], dirY: dir[1] };
    }).filter(Boolean);
    blockPortCellMap.set(b.id, portCellMap);

    if (c.isLabel) {
      const text = String((b.params && b.params.text) || "Label");
      const textId = nextShapeId++;
      blockAnchorId = textId;
      const textWidth = Math.max(f.w, text.length * 8 + 16);
      shapesXml += buildTextShapeXml(textId, text, b.x + textWidth / 2, b.y, textWidth, 22, 18, "#000000", true, "start", dpi, toInX, toInY);
    } else {
      if (typeof c.sym !== "function") throw new Error(`Component "${b.type}" has no symbol mapping; refusing to export a generic placeholder.`);
      const natural = (typeof dims === "function") ? dims(c, b.params) : (c.dynSize ? c.dynSize(b.params || c.params) : { w: c.w || f.w, h: c.h || f.h });
      const naturalW = natural.w || f.w, naturalH = natural.h || f.h;
      const markup = c.sym(b.params || {});
      const primitives = svgSymbolPrimitives(markup, naturalW, naturalH);
      if (!primitives.length) throw new Error(`Component "${b.type}" produced no supported vector symbols.`);
      const rotation = ((b.rot || 0) % 360 + 360) % 360;
      const flip = !!b.flip;
      const symbolScale = (typeof DESIGN_TOKENS !== "undefined" && DESIGN_TOKENS.symbolScale) || 1;

      for (const primitive of primitives) {
        if (primitive.type === "text") {
          const pt = transformSymbolPoint({ x: primitive.x, y: primitive.y }, naturalW, naturalH, f.w, f.h, rotation, flip, symbolScale);
          const symbolFontSize = primitive.fontSize * symbolScale;
          const estimateW = Math.max(symbolFontSize, String(primitive.text).length * symbolFontSize * 0.65);
          const centerX = b.x + pt.x + (primitive.anchor === "middle" ? 0 : primitive.anchor === "end" ? -estimateW / 2 : estimateW / 2);
          const textId = nextShapeId++;
          if (!blockAnchorId) blockAnchorId = textId;
          shapesXml += buildTextShapeXml(textId, primitive.text, centerX, b.y + pt.y - symbolFontSize * 0.35, estimateW, symbolFontSize * 1.4, symbolFontSize, "#000000", true, primitive.anchor, dpi, toInX, toInY, -rotation * Math.PI / 180);
          continue;
        }

        const geometry = primitive.paths.map((path, index) => {
          const mapped = path.map(p => {
            const transformed = transformSymbolPoint(p, naturalW, naturalH, f.w, f.h, rotation, flip, symbolScale);
            return { x: toInLen(transformed.x), y: toInLen(f.h - transformed.y) };
          });
          const closed = mapped.length > 2 && Math.hypot(mapped[0].x - mapped[mapped.length - 1].x, mapped[0].y - mapped[mapped.length - 1].y) < 0.00001;
          return makeGeometrySection(mapped, index, !primitive.style.fill, closed || primitive.style.fill);
        }).join("");
        if (!geometry) continue;
        const style = { ...primitive.style, lineWidth: primitive.style.lineWidth * symbolScale, blockFill: fillHex, ink: inkHex };
        const shapeId = nextShapeId++;
        const isAnchor = !blockAnchorId;
        if (isAnchor) blockAnchorId = shapeId;
        shapesXml += buildShapeXml(shapeId, `${c.name || b.type} symbol`, pinX, pinY, wIn, hIn, geometry, style, "", isAnchor ? connectionPoints : []);
      }

      const addText = (text, centerX, centerY, width, height, font, color, bold, align) => {
        if (!text) return;
        const textId = nextShapeId++;
        if (!blockAnchorId) blockAnchorId = textId;
        shapesXml += buildTextShapeXml(textId, text, centerX, centerY, width, height, font, color, bold, align, dpi, toInX, toInY);
      };
      if (c.isInterconnect) {
        const tag = String((b.params && b.params.tag) || "?");
        const shown = typeof icTagText === "function" ? icTagText(typeof isSubTag === "function" && isSubTag(tag) ? subTagPort(tag) : tag) : tag.slice(0, 6);
        const font = typeof icTagFont === "function" ? icTagFont(shown) : 13;
        const tx = (b.rot || b.flip) ? f.w / 2 : (typeof icSend === "function" && icSend(b.params) ? 16 : 23);
        addText(shown, b.x + tx, b.y + f.h / 2, Math.max(18, shown.length * font * 0.7), font * 1.4, font, "#000000", true, "middle");
      }
      if (c.upText) addText(c.upText(b.params), b.x + f.w / 2, b.y + f.h / 2, f.w, 20, 16, "#000000", true, "middle");
      if (c.portLabels && typeof getPorts === "function") {
        for (const pt of getPorts(b)) {
          const dx = pt.side === "left" ? 14 : pt.side === "right" ? -14 : 0;
          const dy = pt.side === "top" ? 14 : pt.side === "bottom" ? -14 : 0;
          addText(pt.id, b.x + pt.dx + dx, b.y + pt.dy + dy, 24, 16, 13, "#000000", true, "middle");
        }
      }

      let name = c.isInterconnect ? "" : ((b.params && b.params.label) || c.name || "");
      if (c.isInterconnect && typeof isSubTag === "function" && isSubTag((b.params && b.params.tag) || "")) {
        const owner = typeof allBlocks === "function" ? allBlocks().find(x => componentRegistry[x.type] && componentRegistry[x.type].isSubsystem && String(b.params.tag).indexOf("§" + x.id + ".") === 0) : null;
        name = `${owner ? (owner.params.label || "Section") : "Section"} · ${subTagPort(b.params.tag)}`;
      }
      const value = typeof c.val === "function" ? c.val(b.params || {}) : "";
      const info = typeof c.info === "function" ? c.info(b.params || {}) : "";
      const fontSizes = (typeof DESIGN_TOKENS !== "undefined" && DESIGN_TOKENS.fontSizes) || { normal: 13.33, large: 14, small: 12 };

      const p = b.params || {};
      const valOffX = Number(p._valOffX != null ? p._valOffX : p._lblOffX) || 0;
      const valOffY = Number(p._valOffY != null ? p._valOffY : p._lblOffY) || 0;
      const nameOffX = Number(p._nameOffX != null ? p._nameOffX : p._lblOffX) || 0;
      const nameOffY = Number(p._nameOffY != null ? p._nameOffY : p._lblOffY) || 0;
      const infoOffX = Number(p._infoOffX != null ? p._infoOffX : p._lblOffX) || 0;
      const infoOffY = Number(p._infoOffY != null ? p._infoOffY : p._lblOffY) || 0;

      const lblY = (typeof blockLabelY === "function") ? blockLabelY(b, f, effectiveSettings) : { valY: -13, nameY: f.h + 18, infoY: f.h + 33 };
      if (value) {
        addText(value, b.x + f.w / 2 + valOffX, b.y + lblY.valY + valOffY, Math.max(f.w + 32, value.length * 9.5 + 16), 18, fontSizes.normal || 13.33, "#1e293b", true, "middle");
      }
      if (name) {
        addText(name, b.x + f.w / 2 + nameOffX, b.y + lblY.nameY + nameOffY, Math.max(f.w + 32, name.length * 10 + 16), 20, fontSizes.large || 14, "#000000", true, "middle");
      }
      if (info) {
        addText(info, b.x + f.w / 2 + infoOffX, b.y + lblY.infoY + infoOffY, Math.max(f.w + 32, info.length * 8.5 + 16), 18, fontSizes.small || 12, "#64748b", true, "middle");
      }
    }
    if (!blockAnchorId) throw new Error(`Component "${b.type}" did not produce an exportable shape.`);
    blockShapeMap.set(b.id, blockAnchorId);
  }

  /* 2. Map Connections to Native Visio Connectors & Indicator Pills */
  const ERS = [];
  for (const cn of cns) {
    const fb = (typeof findBlock === "function") ? findBlock(cn.from.block) : blks.find(b => b.id === cn.from.block);
    const tb = (typeof findBlock === "function") ? findBlock(cn.to.block) : blks.find(b => b.id === cn.to.block);
    if (!fb || !tb) continue;
    const fromComponent = componentRegistry[fb.type], toComponent = componentRegistry[tb.type];
    const fromFootprint = typeof footprint === "function" ? footprint(fb) : { w: fromComponent.w || 100, h: fromComponent.h || 60 };
    const toFootprint = typeof footprint === "function" ? footprint(tb) : { w: toComponent.w || 100, h: toComponent.h || 60 };
    const a = resolveExportPort(fb, fromComponent, cn.from.port, fromFootprint);
    const z = resolveExportPort(tb, toComponent, cn.to.port, toFootprint);
    if (!a || !z) continue;
    const R = (typeof route === "function") ? route(a, z, cn) : { pts: [a, z], mx: (a.x + z.x) / 2, my: (a.y + z.y) / 2 };
    ERS.push({ cn, R, fb, tb, a, z });
  }

  const allVerticalSegs = [];
  for (const { cn, R } of ERS) {
    for (const segment of R.segs || []) {
      if (!segment.horiz) allVerticalSegs.push({ ...segment, connId: cn.id });
    }
  }

  for (const { cn, R, fb, tb, a, z } of ERS) {
    const connShapeId = nextShapeId++;
    let pts = R.pts || [];
    if (pts.length > 1 && typeof buildPathWithJumpers === "function") {
      const jumperPath = buildPathWithJumpers(pts, allVerticalSegs, cn.id);
      const jumperPoints = sampleSvgPath(jumperPath)[0];
      if (jumperPoints && jumperPoints.length > 1) pts = jumperPoints;
    }
    if (!pts.length) continue;

    const minPxX = Math.min(...pts.map(p => p.x));
    const maxPxX = Math.max(...pts.map(p => p.x));
    const minPxY = Math.min(...pts.map(p => p.y));
    const maxPxY = Math.max(...pts.map(p => p.y));

    const rawWidthIn = toInLen(maxPxX - minPxX);
    const rawHeightIn = toInLen(maxPxY - minPxY);
    const connW = Math.max(0.001, rawWidthIn);
    const connH = Math.max(0.001, rawHeightIn);
    const connPinX = toInX((minPxX + maxPxX) / 2);
    const connPinY = toInY((minPxY + maxPxY) / 2);

    let connXml = `    <Shape ID="${connShapeId}" NameU="Dynamic connector" Type="Shape" OneD="1" LineStyle="0" FillStyle="0">\n`
      + `      <Cell N="Width" V="${connW}"/>\n`
      + `      <Cell N="Height" V="${connH}"/>\n`
      + `      <Cell N="PinX" V="${connPinX}"/>\n`
      + `      <Cell N="PinY" V="${connPinY}"/>\n`
      + `      <Cell N="LocPinX" V="${connW / 2}"/>\n`
      + `      <Cell N="LocPinY" V="${connH / 2}"/>\n`
      + `      <Cell N="BeginX" V="${toInX(pts[0].x)}"/><Cell N="BeginY" V="${toInY(pts[0].y)}"/>\n`
      + `      <Cell N="EndX" V="${toInX(pts[pts.length - 1].x)}"/><Cell N="EndY" V="${toInY(pts[pts.length - 1].y)}"/>\n`
      + `      <Cell N="LineColor" V="#0f172a"/>\n`
      + `      <Cell N="LineWeight" V="0.023"/>\n`
      + `      <Cell N="EndArrow" V="4"/>\n`
      + `      <Section N="Geometry" IX="0">\n`;

    pts.forEach((p, idx) => {
      const relX = rawWidthIn < 0.001 ? connW / 2 : toInLen(p.x - minPxX);
      const relY = rawHeightIn < 0.001 ? connH / 2 : toInLen(maxPxY - p.y);
      if (idx === 0) {
        connXml += `        <Row T="MoveTo" IX="1"><Cell N="X" V="${relX}"/><Cell N="Y" V="${relY}"/></Row>\n`;
      } else {
        connXml += `        <Row T="LineTo" IX="${idx + 1}"><Cell N="X" V="${relX}"/><Cell N="Y" V="${relY}"/></Row>\n`;
      }
    });

    connXml += `      </Section>\n`
      + `    </Shape>\n`;

    shapesXml += connXml;

    /* Anchor Connects in Visio */
    const fromShapeId = blockShapeMap.get(fb.id);
    const toShapeId = blockShapeMap.get(tb.id);
    const fromPortCell = blockPortCellMap.get(fb.id) && blockPortCellMap.get(fb.id).get(cn.from.port);
    const toPortCell = blockPortCellMap.get(tb.id) && blockPortCellMap.get(tb.id).get(cn.to.port);
    if (!fromShapeId || !toShapeId || !fromPortCell || !toPortCell) {
      throw new Error(`VSDX export cannot resolve connector ports ${fb.type}.${cn.from.port} → ${tb.type}.${cn.to.port}.`);
    }
    if (fromShapeId) {
      connectsXml += `    <Connect FromSheet="${connShapeId}" FromCell="BeginX" ToSheet="${fromShapeId}" ToCell="${fromPortCell}"/>\n`;
    }
    if (toShapeId) {
      connectsXml += `    <Connect FromSheet="${connShapeId}" FromCell="EndX" ToSheet="${toShapeId}" ToCell="${toPortCell}"/>\n`;
    }

    /* Export Active Signal Wire Indicator Pills as Native Visio Shapes */
    if (typeof settings !== "undefined" && settings.showLabels !== false && !cn.hidePill) {
      const lv = P[key(cn.from.block, cn.from.port)];
      const nnObj = NFm ? NFm[key(cn.from.block, cn.from.port)] : undefined;
      const nfVal = (typeof nfDb === "function") ? nfDb(nnObj) : undefined;
      const srcLvl = (typeof startBlocks === "function" && startBlocks().length && typeof COMP !== "undefined" && typeof srcPorts === "function") ? P[key(startBlocks()[0].id, srcPorts(COMP[startBlocks()[0].type], startBlocks()[0].params)[0])] : 0;
      const bwHz = (settings.bandwidthHz && settings.bandwidthHz > 0) ? settings.bandwidthHz : 1e6;
      const nflVal = (nnObj && typeof computeNoiseFloor === "function") ? computeNoiseFloor(nnObj, lv, srcLvl, bwHz) : undefined;

      const indicators = [];
      const lvPrimary = (P && P[key(cn.from.block, cn.from.port)] !== undefined) ? P[key(cn.from.block, cn.from.port)] : lv;
      const lvSecondary = (PSecondary && PSecondary[key(cn.from.block, cn.from.port)] !== undefined) ? PSecondary[key(cn.from.block, cn.from.port)] : lv;
      if (settings.showNF === true && nfVal !== undefined && isFinite(nfVal)) indicators.push({ type: "nf", text: `NF ${fmt(nfVal)} dB` });
      if (settings.showPwr1 !== false && lvPrimary !== undefined && isFinite(lvPrimary)) indicators.push({ type: "pwr1", text: dbm(lvPrimary) });
      if (settings.showPwr2 === true && lvSecondary !== undefined && isFinite(lvSecondary)) indicators.push({ type: "pwr2", text: dbm(lvSecondary) });
      if (settings.showNoiseFloor === true && nflVal !== undefined && isFinite(nflVal)) indicators.push({ type: "nfloor", text: dbm(nflVal) });

      if (indicators.length > 0) {
        const fallbackWidth = Math.max(32, ...indicators.map(ind => String(ind.text).length * 7.6 + 10));
        const fallbackAnchorX = R.mx ?? (a.x + z.x) / 2;
        const fallbackAnchorY = R.my ?? (a.y + z.y) / 2;
        const layout = typeof indicatorPillLayout === "function"
          ? indicatorPillLayout(R, Object.fromEntries(indicators.map(ind => [ind.type, ind.text])))
          : {
            colWidth: fallbackWidth,
            pillHeight: 20,
            anchorX: fallbackAnchorX,
            anchorY: fallbackAnchorY,
            entries: indicators.map(ind => ({
              ...ind,
              x: fallbackAnchorX,
              y: fallbackAnchorY + (ind.type === "pwr1" || ind.type === "nf" ? -14 : 14)
            }))
          };
        const { colWidth, pillHeight } = layout;
        const PILL_THEMES = {
          pwr1:   { fill: "#fef3c7", stroke: "#d97706", text: "#92400e" },
          pwr2:   { fill: "#e0f2fe", stroke: "#0284c7", text: "#0c4a6e" },
          nf:     { fill: "#d1fae5", stroke: "#059669", text: "#064e3b" },
          nfloor: { fill: "#ede9fe", stroke: "#7c3aed", text: "#4c1d95" }
        };
        const addPill = (ind, centerX, centerY) => {
          const pillShapeId = nextShapeId++;
          const pillWIn = toInLen(colWidth), pillHIn = toInLen(pillHeight);
          const pinX = toInX(centerX), pinY = toInY(centerY);
          const points = roundedRectPath(0, 0, colWidth, pillHeight, 5, 5)[0]
            .map(point => ({ x: toInLen(point.x), y: toInLen(pillHeight - point.y) }));
          const geometry = makeGeometrySection(points, 0, false, true);
          const theme = PILL_THEMES[ind.type] || { fill: "#fef3c7", stroke: "#d97706", text: "#92400e" };
          const pillStyle = {
            fill: true,
            fillColor: theme.fill,
            stroke: true,
            strokeColor: theme.stroke,
            linePattern: 1,
            lineWidth: 1.2,
            blockFill: theme.fill,
            ink: theme.stroke
          };
          shapesXml += buildShapeXml(pillShapeId, `IndicatorPill ${ind.type}`, pinX, pinY, pillWIn, pillHIn, geometry, pillStyle);
          const textShapeId = nextShapeId++;
          const safeTextWidth = Math.max(colWidth, String(ind.text).length * 7.8 + 10);
          const pillFontSize = (typeof DESIGN_TOKENS !== "undefined" && DESIGN_TOKENS.fontSizes && DESIGN_TOKENS.fontSizes.normal) || 13.33;
          shapesXml += buildTextShapeXml(textShapeId, ind.text, centerX, centerY, safeTextWidth, pillHeight, pillFontSize, theme.text, true, "middle", dpi, toInX, toInY);
        };
        const savedPosition = cn.pillPosition || Object.values(cn.pillPositions || {})[0];
        let stackShiftX = 0, stackShiftY = 0;
        if (savedPosition) {
          const anchor = typeof pointAtRouteFraction === "function"
            ? pointAtRouteFraction(R.pts, savedPosition.t)
            : pointAlongPolyline(R.pts, savedPosition.t);
          stackShiftX = anchor.x + (Number(savedPosition.dx) || 0) - layout.anchorX;
          stackShiftY = anchor.y + (Number(savedPosition.dy) || 0) - layout.anchorY;
        } else if (cn.labelOff) {
          stackShiftX = cn.labelOff.dx || 0;
          stackShiftY = cn.labelOff.dy || 0;
        }
        layout.entries.forEach(ind => {
          addPill(ind, ind.x + stackShiftX, ind.y + stackShiftY);
        });
      }
    }
  }

  /* Assemble Page 1 XML */
  mastersXml += "</Masters>";
  const page1Xml = XML_HDR
    + `<Page xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n`
    + `  <PageSheet LineStyle="0" FillStyle="0" TextStyle="0">\n`
    + `    <Cell N="PageWidth" V="${pageWin}"/>\n`
    + `    <Cell N="PageHeight" V="${pageHin}"/>\n`
    + `    <Cell N="DrawingScale" V="1" U="IN_F"/>\n`
    + `    <Cell N="PageScale" V="1" U="IN_F"/>\n`
    + `    <Cell N="DrawingSizeType" V="3"/>\n`
    + `  </PageSheet>\n`
    + `  <Shapes>\n`
    + shapesXml
    + `  </Shapes>\n`
    + `  <Connects>\n`
    + connectsXml
    + `  </Connects>\n`
    + `</Page>`;

  /* Pack OPC Zip Archive */
  if (typeof zipStore !== "function") {
    throw new Error("zipStore packager function is not available.");
  }

  const entries = [
    { name: "[Content_Types].xml", data: contentTypesXml },
    { name: "_rels/.rels", data: rootRelsXml },
    { name: "docProps/app.xml", data: appXml },
    { name: "docProps/core.xml", data: coreXml },
    { name: "visio/document.xml", data: docXml },
    { name: "visio/_rels/document.xml.rels", data: docRelsXml },
    { name: "visio/pages/pages.xml", data: pagesXml },
    { name: "visio/pages/_rels/pages.xml.rels", data: pagesRelsXml },
    { name: "visio/pages/page1.xml", data: page1Xml },
    { name: "visio/masters/masters.xml", data: mastersXml },
    { name: "visio/windows.xml", data: windowsXml }
  ];

  validateVsdxPackage(entries);

  const res = zipStore(entries);
  if (typeof Blob !== "undefined" && res instanceof Blob) return res;
  if (typeof Blob !== "undefined") return new Blob([res], { type: "application/vnd.ms-visio.drawing" });
  return res;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildVsdxBlob };
}

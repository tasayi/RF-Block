"use strict";

/* =====================================================================
 * RF Block Diagram Editor - Visio VSDX Shape & Text Builder
 * ===================================================================== */

function buildShapeXml(id, name, pinX, pinY, widthIn, heightIn, geometry, style, text = "", connectionPoints = []) {
  const esc = (typeof vsdxEsc === "function") ? vsdxEsc : (s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  const resolveColor = color => color === "block" ? style.blockFill : color === "ink" ? style.ink : (color || "#ffffff");
  const fill = style.fill ? resolveColor(style.fillColor) : "#ffffff";
  const stroke = style.stroke ? resolveColor(style.strokeColor) : "#ffffff";
  let xml = `    <Shape ID="${id}" NameU="${esc(name)}" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">\n`
    + `      <Cell N="Width" V="${widthIn}"/><Cell N="Height" V="${heightIn}"/>\n`
    + `      <Cell N="PinX" V="${pinX}"/><Cell N="PinY" V="${pinY}"/>\n`
    + `      <Cell N="LocPinX" V="${widthIn / 2}"/><Cell N="LocPinY" V="${heightIn / 2}"/>\n`
    + `      <Cell N="FillForegnd" V="${fill}"/><Cell N="FillBkgnd" V="#ffffff"/><Cell N="FillPattern" V="${style.fill ? 1 : 0}"/>\n`
    + `      <Cell N="LineColor" V="${stroke}"/>\n`
    + `      <Cell N="LineWeight" V="${style.stroke ? style.lineWidth / 96 : 0}"/><Cell N="LinePattern" V="${style.linePattern || 1}"/>\n`
    + `      <Cell N="LeftMargin" V="0"/><Cell N="RightMargin" V="0"/><Cell N="TopMargin" V="0"/><Cell N="BottomMargin" V="0"/>\n`
    + geometry
    + (connectionPoints.length ? `<Section N="Connection" IX="0">${connectionPoints.map((point, index) => `<Row IX="${index}"><Cell N="X" V="${point.x}"/><Cell N="Y" V="${point.y}"/><Cell N="DirX" V="${point.dirX}"/><Cell N="DirY" V="${point.dirY}"/><Cell N="Type" V="0"/></Row>`).join("")}</Section>\n` : "")
    + (text ? `<Text><cp IX="0"/><pp IX="0"/>${esc(text)}</Text>\n` : "")
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
  const esc = (typeof vsdxEsc === "function") ? vsdxEsc : (s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
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
    + `      <Text><cp IX="0"/><pp IX="0"/>${esc(text)}</Text>\n`
    + `    </Shape>\n`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildShapeXml,
    resolveExportPort,
    blockLabelY,
    buildTextShapeXml
  };
}

"use strict";

/* =====================================================================
 * RF Block Diagram Editor - Native Microsoft Visio (.vsdx) Exporter
 * ===================================================================== */

if (typeof require !== "undefined") {
  Object.assign(globalThis, require("./templates.js"), require("./geometry-converter.js"), require("./shape-builder.js"));
}

var XML_HDR = (typeof VSDX_XML_HDR !== "undefined") ? VSDX_XML_HDR : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

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

  const contentTypesXml = getVsdxContentTypesXml();
  const appXml = getVsdxAppXml();
  const coreXml = getVsdxCoreXml();
  const rootRelsXml = getVsdxRootRelsXml();
  const docXml = getVsdxDocXml();
  const docRelsXml = getVsdxDocRelsXml();
  const pagesXml = getVsdxPagesXml();
  const pagesRelsXml = getVsdxPagesRelsXml();
  const windowsXml = getVsdxWindowsXml();

  let mastersXml = XML_HDR
    + `<Masters xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`;

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

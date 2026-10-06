"use strict";

/* =====================================================================
 * RF Block Diagram Editor - SVG & Vector Drawing Exporter
 * Portable, Normalized & Flattened SVG 1.1 Standard
 * ===================================================================== */

const PILL_COLORS = {
  pwr1:   { fill: "#fef3c7", stroke: "#d97706" },
  pwr2:   { fill: "#e0f2fe", stroke: "#0284c7" },
  nf:     { fill: "#d1fae5", stroke: "#059669" },
  nfloor: { fill: "#ede9fe", stroke: "#7c3aed" }
};

/**
 * Inlines presentation attributes onto raw symbol SVG fragments, eliminating
 * reliance on external stylesheets and CSS variables (--blk-fill, --blk-stroke).
 */
function flattenSymbolSvg(svgStr, bFill, bStroke, fontSans) {
  if (!svgStr) return "";
  let res = svgStr;

  // Replace .blk-shape with inlined presentation attributes:
  res = res.replace(/class="blk-shape"/g, `fill="${bFill}" stroke="${bStroke}" stroke-width="2" stroke-linejoin="round"`);

  // Replace .blk-line with inlined presentation attributes:
  res = res.replace(/class="blk-line"/g, `fill="none" stroke="${bStroke}" stroke-width="2" stroke-linecap="round"`);

  // Replace .blk-glyph with inlined presentation attributes:
  res = res.replace(/class="blk-glyph"/g, `fill="none" stroke="${bStroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`);

  // Replace .blk-fillg with inlined presentation attributes:
  res = res.replace(/class="blk-fillg"/g, `fill="${bStroke}" stroke="none"`);

  // Replace .ic-tag on <text> elements: universal black typography with explicit font styling
  res = res.replace(/<text([^>]*?)class="ic-tag"([^>]*?)>/g, (m, p1, p2) => {
    const combined = p1 + p2;
    const hasFontSize = /font-size=/.test(combined);
    const sizeAttr = hasFontSize ? "" : ` font-size="${(DESIGN_TOKENS && DESIGN_TOKENS.fontSizes && DESIGN_TOKENS.fontSizes.large) || 14}px"`;
    return `<text${p1}fill="#000000" font-family="${fontSans}" font-weight="700"${sizeAttr}${p2}>`;
  });

  // Fallback cleanup for any other occurrence of class="ic-tag":
  res = res.replace(/class="ic-tag"/g, `fill="#000000" font-family="${fontSans}" font-weight="700"`);

  return res;
}

/**
 * Computes vector arrowhead geometry as a closed polygon path at the wire destination endpoint,
 * eliminating the need for SVG <marker> tags.
 */
function buildArrowheadPolygon(pts) {
  if (!pts || pts.length < 2) return "";
  const last = pts[pts.length - 1];
  let prev = null;
  for (let i = pts.length - 2; i >= 0; i--) {
    const dx = last.x - pts[i].x;
    const dy = last.y - pts[i].y;
    if (Math.hypot(dx, dy) > 0.1) {
      prev = pts[i];
      break;
    }
  }
  if (!prev) return "";

  const dx = last.x - prev.x;
  const dy = last.y - prev.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const L = 10;
  const W = 4.5;
  const baseX = last.x - L * ux;
  const baseY = last.y - L * uy;
  const leftX = baseX + W * nx;
  const leftY = baseY + W * ny;
  const rightX = baseX - W * nx;
  const rightY = baseY - W * ny;
  const r = n => Math.round(n * 100) / 100;
  return `<polygon points="${r(last.x)},${r(last.y)} ${r(leftX)},${r(leftY)} ${r(rightX)},${r(rightY)}" fill="#0f172a" stroke="none"/>`;
}

/**
 * Renders self-contained, flattened indicator pills for a connection wire with inlined styles
 * and solid black typography.
 */
function buildFlattenedPillStack(R, indicators, connId, fontSans, boundsUpdater) {
  if (typeof indicatorPillLayout !== "function") return "";
  const layout = indicatorPillLayout(R, indicators);
  if (!layout || !layout.entries || !layout.entries.length) return "";

  const { colWidth, pillHeight } = layout;
  const connection = (typeof conns !== "undefined" && connId) ? conns.find(c => c.id === connId) : null;
  const legacyOffset = connection && connection.labelOff ? connection.labelOff : null;
  const legacyPillPosition = connection && connection.pillPositions
    ? Object.values(connection.pillPositions)[0]
    : null;
  const savedPosition = connection && (connection.pillPosition || legacyPillPosition);
  const savedAnchor = (savedPosition && typeof pointAtRouteFraction === "function") ? pointAtRouteFraction(R.pts, savedPosition.t) : null;
  const shiftX = savedAnchor ? savedAnchor.x + (Number(savedPosition.dx) || 0) - layout.anchorX : (legacyOffset ? legacyOffset.dx : 0);
  const shiftY = savedAnchor ? savedAnchor.y + (Number(savedPosition.dy) || 0) - layout.anchorY : (legacyOffset ? legacyOffset.dy : 0);
  const escapeFn = typeof esc === "function" ? esc : (s => String(s || ""));
  const fontSize = (DESIGN_TOKENS && DESIGN_TOKENS.fontSizes && DESIGN_TOKENS.fontSizes.normal) || 13;

  let html = "";
  for (const item of layout.entries) {
    const x = Math.round((item.x + shiftX) * 100) / 100;
    const y = Math.round((item.y + shiftY) * 100) / 100;
    const colors = PILL_COLORS[item.type] || { fill: "#f1f5f9", stroke: "#94a3b8" };
    if (boundsUpdater) {
      boundsUpdater(x - colWidth / 2, y - pillHeight / 2, x + colWidth / 2, y + pillHeight / 2);
    }
    html += `<g transform="translate(${x} ${y})">`
      + `<rect x="${-colWidth / 2}" y="${-pillHeight / 2}" width="${colWidth}" height="${pillHeight}" rx="5" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="1.2"/>`
      + `<text x="0" y="0" dy="0.35em" text-anchor="middle" fill="#000000" font-family="${fontSans}" font-size="${fontSize}px" font-weight="600">${escapeFn(item.text)}</text>`
      + `</g>`;
  }
  return html;
}

function buildExportSVG(scale = 1) {
  if (!blocks.length) return null;

  const fontSans = ((typeof DESIGN_TOKENS !== "undefined" && DESIGN_TOKENS.fontFamily)
    ? DESIGN_TOKENS.fontFamily
    : 'Calibri, "Calibri Light", "Segoe UI", Arial, sans-serif').replace(/"/g, "'");
  const fontSizes = (typeof DESIGN_TOKENS !== "undefined" && DESIGN_TOKENS.fontSizes)
    ? DESIGN_TOKENS.fontSizes
    : { small: 12, normal: 13, large: 14, heading: 16, title: 18 };
  const symbolScale = (typeof DESIGN_TOKENS !== "undefined" && DESIGN_TOKENS.symbolScale != null)
    ? DESIGN_TOKENS.symbolScale
    : 1;
  const pad = (typeof DESIGN_TOKENS !== "undefined" && DESIGN_TOKENS.exportPadding != null)
    ? DESIGN_TOKENS.exportPadding
    : 24;

  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (const b of blocks) {
    const bb = bboxOf(b);
    minx = Math.min(minx, bb.x - pad); miny = Math.min(miny, bb.y - pad);
    maxx = Math.max(maxx, bb.x + bb.w + pad); maxy = Math.max(maxy, bb.y + bb.h + pad + 16);
  }

  // Pre-route all connection wires
  const ERS = [];
  for (const cn of conns) {
    const a = portPt(findBlock(cn.from.block), cn.from.port), z = portPt(findBlock(cn.to.block), cn.to.port);
    if (!a || !z) continue;
    const R = route(a, z, cn);
    ERS.push({ cn, R });
    if (cn.waypoints && cn.waypoints.length) {
      for (const wp of cn.waypoints) {
        minx = Math.min(minx, wp.x - pad); miny = Math.min(miny, wp.y - pad);
        maxx = Math.max(maxx, wp.x + pad); maxy = Math.max(maxy, wp.y + pad);
      }
    }
    if (R.pts && R.pts.length) {
      for (const pt of R.pts) {
        minx = Math.min(minx, pt.x - pad); miny = Math.min(miny, pt.y - pad);
        maxx = Math.max(maxx, pt.x + pad); maxy = Math.max(maxy, pt.y + pad);
      }
    }
  }

  const allVertSegs = [];
  for (const { cn, R } of ERS) {
    if (R.segs) {
      for (const s of R.segs) {
        if (!s.horiz) allVertSegs.push({ ...s, connId: cn.id });
      }
    }
  }

  const P = computePowers("primary");
  const PSecondary = computePowers("secondary");
  const needNoise = !!(settings && (settings.showNF || settings.showNoiseFloor));
  const eNF = needNoise ? computeNoise(P) : null;

  let wiresBody = "";
  let pillsBody = "";

  const updateBoundsFromBox = (bx1, by1, bx2, by2) => {
    minx = Math.min(minx, bx1 - pad);
    miny = Math.min(miny, by1 - pad);
    maxx = Math.max(maxx, bx2 + pad);
    maxy = Math.max(maxy, by2 + pad);
  };

  for (const { cn, R } of ERS) {
    const pathD = buildPathWithJumpers(R.pts, allVertSegs, cn.id);
    wiresBody += `<path d="${pathD}" fill="none" stroke="#0f172a" stroke-width="2.2"/>`;
    wiresBody += buildArrowheadPolygon(R.pts);

    if (settings && settings.showLabels === false) continue;
    if (cn.hidePill) continue;

    const lv = P[key(cn.from.block, cn.from.port)];
    const nnObj = eNF ? eNF[key(cn.from.block, cn.from.port)] : undefined;
    const nfVal = nfDb(nnObj);
    const srcLvl = (typeof startBlocks === "function" && startBlocks().length) ? P[key(startBlocks()[0].id, srcPorts(COMP[startBlocks()[0].type], startBlocks()[0].params)[0])] : 0;
    const nflVal = (nnObj && typeof computeNoiseFloor === "function") ? computeNoiseFloor(nnObj, lv, srcLvl, settings.bandwidthHz) : undefined;

    const lvlPrimary = P[key(cn.from.block, cn.from.port)];
    const lvlSecondary = PSecondary[key(cn.from.block, cn.from.port)];
    const indicators = {
      pwr1: ((!settings || settings.showPwr1 !== false) && lvlPrimary !== undefined && isFinite(lvlPrimary)) ? dbm(lvlPrimary) : null,
      pwr2: ((settings && settings.showPwr2 === true) && lvlSecondary !== undefined && isFinite(lvlSecondary)) ? dbm(lvlSecondary) : null,
      nfloor: ((settings && settings.showNoiseFloor === true) && nflVal !== undefined && isFinite(nflVal)) ? dbm(nflVal) : null,
      nf: ((settings && settings.showNF === true) && nfVal !== undefined && isFinite(nfVal)) ? ("NF " + fmt(nfVal) + " dB") : null
    };

    pillsBody += buildFlattenedPillStack(R, indicators, cn.id, fontSans, updateBoundsFromBox);
  }

  let blocksBody = "";
  for (const b of blocks) {
    const c = COMP[b.type], f = footprint(b);
    blocksBody += `<g transform="translate(${b.x} ${b.y})">`;
    if (c.isLabel) {
      blocksBody += `<text x="0" y="0" dy="0.35em" fill="#000000" font-family="${fontSans}" font-size="${fontSizes.heading}px" font-weight="600">${esc(b.params.text || "Label")}</text>`;
    } else {
      const bFill = (typeof blockFill === "function" && b) ? blockFill(b) : "#ffffff";
      let bStroke = (typeof blockInk === "function" && b) ? blockInk(bFill, b.type) : "#0f172a";
      if (!bStroke || bStroke === "#f8fafc") bStroke = "#0f172a";

      const rotTf = rotTransform(b);
      const symTf = (rotTf ? `${rotTf} ` : "") + `translate(${f.w / 2} ${f.h / 2}) scale(${symbolScale}) translate(${-f.w / 2} ${-f.h / 2})`;
      const symContent = flattenSymbolSvg(c.sym(b.params), bFill, bStroke, fontSans);
      blocksBody += `<g${symTf ? ` transform="${symTf}"` : ""}>${symContent}</g>`;

      if (c.isInterconnect) {
        const rt = (b.params.tag || "?"), disp = icTagText(isSubTag(rt) ? subTagPort(rt) : rt);
        const tx = (b.rot || b.flip) ? f.w / 2 : (icSend(b.params) ? 16 : 23);
        blocksBody += `<text x="${tx}" y="${f.h / 2}" dy="0.35em" font-size="${icTagFont(disp)}" font-family="${fontSans}" font-weight="700" fill="#000000" textLength="${Math.min(22, disp.length * icTagFont(disp) * 0.62)}" lengthAdjust="spacingAndGlyphs" text-anchor="middle">${esc(disp)}</text>`;
      }
      if (c.upText) {
        const ut = c.upText(b.params);
        if (ut) blocksBody += `<text x="${f.w / 2}" y="${f.h / 2}" dy="0.35em" text-anchor="middle" fill="#000000" font-family="${fontSans}" font-size="${fontSizes.large}px" font-weight="600">${esc(ut)}</text>`;
      }
      if (c.portLabels) for (const pt of getPorts(b)) {
        const inx = pt.side === "left" ? 14 : pt.side === "right" ? -14 : 0, iny = pt.side === "top" ? 14 : pt.side === "bottom" ? -14 : 0;
        blocksBody += `<text x="${pt.dx + inx}" y="${pt.dy + iny}" dy="0.35em" text-anchor="middle" fill="#000000" font-family="${fontSans}" font-size="${fontSizes.small}px" font-weight="600">${esc(pt.id)}</text>`;
      }
      const nm = c.isInterconnect ? "" : (b.params.label || c.name);
      const v = c.val ? c.val(b.params) : "";
      const lblY = (typeof blockLabelY === "function") ? blockLabelY(b, f, settings) : { valY: -13, nameY: f.h + 18, infoY: f.h + 33 };
      const valOffX = Number(b.params._valOffX != null ? b.params._valOffX : b.params._lblOffX) || 0;
      const valOffY = Number(b.params._valOffY != null ? b.params._valOffY : b.params._lblOffY) || 0;
      const nameOffX = Number(b.params._nameOffX != null ? b.params._nameOffX : b.params._lblOffX) || 0;
      const nameOffY = Number(b.params._nameOffY != null ? b.params._nameOffY : b.params._lblOffY) || 0;
      const infoOffX = Number(b.params._infoOffX != null ? b.params._infoOffX : b.params._lblOffX) || 0;
      const infoOffY = Number(b.params._infoOffY != null ? b.params._infoOffY : b.params._lblOffY) || 0;
      const info = c.info ? c.info(b.params) : "";
      if (v)    blocksBody += `<text x="${f.w / 2 + valOffX}" y="${lblY.valY + valOffY}" text-anchor="middle" fill="#000000" font-family="${fontSans}" font-size="${fontSizes.normal}px" font-weight="600">${esc(v)}</text>`;
      if (nm)   blocksBody += `<text x="${f.w / 2 + nameOffX}" y="${lblY.nameY + nameOffY}" text-anchor="middle" fill="#000000" font-family="${fontSans}" font-size="${fontSizes.large}px" font-weight="700">${esc(nm)}</text>`;
      if (info) blocksBody += `<text x="${f.w / 2 + infoOffX}" y="${lblY.infoY + infoOffY}" text-anchor="middle" fill="#000000" font-family="${fontSans}" font-size="${fontSizes.small}px" font-weight="500">${esc(info)}</text>`;
    }
    blocksBody += `</g>`;
  }

  minx = Math.floor(minx);
  miny = Math.floor(miny);
  maxx = Math.ceil(maxx);
  maxy = Math.ceil(maxy);
  const W = Math.max(200, maxx - minx);
  const H = Math.max(150, maxy - miny);

  const svgW = Math.round(W * scale);
  const svgH = Math.round(H * scale);

  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${W} ${H}" font-family="${fontSans}" text-rendering="geometricPrecision">\n`
    + `  <g id="diagram" transform="translate(${-minx} ${-miny})">\n`
    + `    ${wiresBody}\n`
    + `    ${blocksBody}\n`
    + `    ${pillsBody}\n`
    + `  </g>\n`
    + `</svg>`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildExportSVG,
    flattenSymbolSvg,
    buildArrowheadPolygon,
    buildFlattenedPillStack
  };
}

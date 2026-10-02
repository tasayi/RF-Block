"use strict";

/* =====================================================================
 * RF Block Diagram Editor - SVG & Vector Drawing Exporter
 * ===================================================================== */

function buildExportSVG(scale = 1) {
  if (!blocks.length) return null;

  const pad = DESIGN_TOKENS.exportPadding || 24;
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (const b of blocks) {
    const bb = bboxOf(b);
    minx = Math.min(minx, bb.x - pad); miny = Math.min(miny, bb.y - pad);
    maxx = Math.max(maxx, bb.x + bb.w + pad); maxy = Math.max(maxy, bb.y + bb.h + pad + 16);
  }
  for (const cn of conns) {
    if (cn.waypoints && cn.waypoints.length) {
      for (const wp of cn.waypoints) {
        minx = Math.min(minx, wp.x - pad); miny = Math.min(miny, wp.y - pad);
        maxx = Math.max(maxx, wp.x + pad); maxy = Math.max(maxy, wp.y + pad);
      }
    }
    const savedPosition = cn.pillPosition || Object.values(cn.pillPositions || {})[0];
    if (savedPosition) {
      const a = portPt(findBlock(cn.from.block), cn.from.port), z = portPt(findBlock(cn.to.block), cn.to.port);
      if (a && z) {
        const R = route(a, z, cn), anchor = pointAtRouteFraction(R.pts, savedPosition.t);
        const x = anchor.x + (Number(savedPosition.dx) || 0), y = anchor.y + (Number(savedPosition.dy) || 0);
        minx = Math.min(minx, x - 64 - pad); miny = Math.min(miny, y - 64 - pad);
        maxx = Math.max(maxx, x + 64 + pad); maxy = Math.max(maxy, y + 64 + pad);
      }
    }
  }

  const W = Math.max(200, maxx - minx), H = Math.max(150, maxy - miny);
  const fontSans = DESIGN_TOKENS.fontFamily;
  const isLight = (settings && settings.theme === "light");
  const pwr1Bg = isLight ? "#fef3c7" : "#1c1408", pwr1Bd = isLight ? "#d97706" : "#f59e0b", pwr1Tx = isLight ? "#92400e" : "#f59e0b";
  const pwr2Bg = isLight ? "#e0f2fe" : "#071828", pwr2Bd = isLight ? "#0284c7" : "#38bdf8", pwr2Tx = isLight ? "#0c4a6e" : "#38bdf8";
  const nfBg   = isLight ? "#d1fae5" : "#051810", nfBd   = isLight ? "#059669" : "#10b981", nfTx   = isLight ? "#064e3b" : "#10b981";
  const nflBg  = isLight ? "#ede9fe" : "#120c22", nflBd  = isLight ? "#7c3aed" : "#a78bfa", nflTx  = isLight ? "#4c1d95" : "#a78bfa";
  const css = `
    svg{font-family:${fontSans};background:#ffffff;text-rendering:geometricPrecision}
    .block-hit,.sel-ring,.port-hit,.port-mark{display:none}
    .blk-shape{fill:var(--blk-fill,#ffffff);stroke:var(--blk-stroke,#0f172a);stroke-width:2;stroke-linejoin:round}
    .blk-line{fill:none;stroke:var(--blk-stroke,#0f172a);stroke-width:2;stroke-linecap:round}
    .blk-glyph{fill:none;stroke:var(--blk-stroke,#0f172a);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
    .blk-fillg{fill:var(--blk-stroke,#0f172a);stroke:none}
    .lbl-name{fill:#000000;font-family:${fontSans};font-size:${DESIGN_TOKENS.fontSizes.large}px;font-weight:700;text-anchor:middle}
    .lbl-val{fill:#1e293b;font-family:${fontSans};font-size:${DESIGN_TOKENS.fontSizes.normal}px;font-weight:600;text-anchor:middle}
    .lbl-info{fill:#64748b;font-family:${fontSans};font-size:${DESIGN_TOKENS.fontSizes.small}px;font-weight:500;text-anchor:middle}
    .ic-tag{fill:#000000;font-family:${fontSans};font-size:${DESIGN_TOKENS.fontSizes.large}px;font-weight:700}
    .cust-tx{fill:#000000;font-family:${fontSans};font-size:${DESIGN_TOKENS.fontSizes.large}px;font-weight:600}
    .port-lbl{fill:#000000;opacity:.9;font-family:${fontSans};font-size:${DESIGN_TOKENS.fontSizes.small}px;font-weight:600}
    .free-label{fill:#000000;font-family:${fontSans};font-size:${DESIGN_TOKENS.fontSizes.heading}px;font-weight:600}
    .wire{fill:none;stroke:#0f172a;stroke-width:2.2}
    .pill .pbg{fill:#ffffff;stroke:#efd3a0;stroke-width:1.2;rx:5}
    .pill .ptx{fill:#b45309;font-family:${fontSans};font-size:${DESIGN_TOKENS.fontSizes.normal}px;font-weight:600;text-anchor:middle}
    .pill .pun{fill:#b45309;opacity:.9;font-family:${fontSans};font-size:${DESIGN_TOKENS.fontSizes.normal}px;font-weight:600;text-anchor:middle}
    .pill-pwr1 .pbg{fill:${pwr1Bg};stroke:${pwr1Bd}} .pill-pwr1 .ptx{fill:${pwr1Tx}}
    .pill-pwr2 .pbg{fill:${pwr2Bg};stroke:${pwr2Bd}} .pill-pwr2 .ptx{fill:${pwr2Tx}}
    .pill-nf .pbg{fill:${nfBg};stroke:${nfBd}} .pill-nf .ptx{fill:${nfTx}}
    .pill-nfloor .pbg{fill:${nflBg};stroke:${nflBd}} .pill-nfloor .ptx{fill:${nflTx}}
    .unk .pbg{fill:#f4f6f8;stroke:#d7dde3}.unk .ptx{fill:#64748b}.unk .pun{fill:#64748b}`;

  const P = computePowers("primary");
  const PSecondary = computePowers("secondary");
  let body = "", pillsBody = "";
  const ERS = [];
  for (const cn of conns) {
    const a = portPt(findBlock(cn.from.block), cn.from.port), z = portPt(findBlock(cn.to.block), cn.to.port);
    if (!a || !z) continue;
    ERS.push({ cn, R: route(a, z, cn) });
  }
  const allVertSegs = [];
  for (const { cn, R } of ERS) {
    if (R.segs) {
      for (const s of R.segs) {
        if (!s.horiz) allVertSegs.push({ ...s, connId: cn.id });
      }
    }
  }
  const esegs = [].concat(...ERS.map(r => r.R.segs || []));
  const erects = obstacleRects(0);
  const needNoise = !!(settings.showNF || settings.showNoiseFloor);
  const eNF = needNoise ? computeNoise(P) : null;
  for (const { cn, R } of ERS) {
    const pathD = buildPathWithJumpers(R.pts, allVertSegs, cn.id);
    body += `<path class="wire" d="${pathD}" marker-end="url(#ea)"/>`;
    if (settings.showLabels === false || cn.hidePill) continue;
    const lv = P[key(cn.from.block, cn.from.port)];
    const nnObj = eNF ? eNF[key(cn.from.block, cn.from.port)] : undefined;
    const nfVal = nfDb(nnObj);
    const srcLvl = (typeof startBlocks === "function" && startBlocks().length) ? P[key(startBlocks()[0].id, srcPorts(COMP[startBlocks()[0].type], startBlocks()[0].params)[0])] : 0;
    const nflVal = (nnObj && typeof computeNoiseFloor === "function") ? computeNoiseFloor(nnObj, lv, srcLvl, settings.bandwidthHz) : undefined;

    const lvlPrimary = P[key(cn.from.block, cn.from.port)];
    const lvlSecondary = PSecondary[key(cn.from.block, cn.from.port)];
    const indicators = {
      pwr1: (settings.showPwr1 !== false && lvlPrimary !== undefined && isFinite(lvlPrimary)) ? dbm(lvlPrimary) : null,
      pwr2: (settings.showPwr2 === true && lvlSecondary !== undefined && isFinite(lvlSecondary)) ? dbm(lvlSecondary) : null,
      nfloor: (settings.showNoiseFloor === true && nflVal !== undefined && isFinite(nflVal)) ? dbm(nflVal) : null,
      nf: (settings.showNF === true && nfVal !== undefined && isFinite(nfVal)) ? ("NF " + fmt(nfVal) + " dB") : null
    };

    pillsBody += pillStack(R, indicators, cn.id);
  }
  for (const b of blocks) {
    const c = COMP[b.type], f = footprint(b);
    body += `<g transform="translate(${b.x} ${b.y})" style="${blockStyle(b)}">`;
    if (c.isLabel) {
      body += `<text class="free-label" x="0" y="0" dominant-baseline="middle">${esc(b.params.text || "Label")}</text>`;
    } else {
      const rotTf = rotTransform(b);
      const symTf = (rotTf ? `${rotTf} ` : "") + `translate(${f.w / 2} ${f.h / 2}) scale(${DESIGN_TOKENS.symbolScale}) translate(${-f.w / 2} ${-f.h / 2})`;
      body += `<g${symTf ? ` transform="${symTf}"` : ""}>${c.sym(b.params)}</g>`;
      if (c.isInterconnect) {
        const rt = (b.params.tag || "?"), disp = icTagText(isSubTag(rt) ? subTagPort(rt) : rt);
        const tx = (b.rot || b.flip) ? f.w / 2 : (icSend(b.params) ? 16 : 23);
        body += `<text class="ic-tag" x="${tx}" y="${f.h / 2}" font-size="${icTagFont(disp)}" textLength="${Math.min(22, disp.length * icTagFont(disp) * 0.62)}" lengthAdjust="spacingAndGlyphs" text-anchor="middle" dominant-baseline="central">${esc(disp)}</text>`;
      }
      if (c.upText) {
        const ut = c.upText(b.params);
        if (ut) body += `<text class="cust-tx" x="${f.w / 2}" y="${f.h / 2}" text-anchor="middle" dominant-baseline="central">${esc(ut)}</text>`;
      }
      if (c.portLabels) for (const pt of getPorts(b)) {
        const inx = pt.side === "left" ? 14 : pt.side === "right" ? -14 : 0, iny = pt.side === "top" ? 14 : pt.side === "bottom" ? -14 : 0;
        body += `<text class="port-lbl" x="${pt.dx + inx}" y="${pt.dy + iny}" text-anchor="middle" dominant-baseline="central">${esc(pt.id)}</text>`;
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
      if (v)    body += `<text class="lbl-val"  x="${f.w / 2 + valOffX}" y="${lblY.valY + valOffY}">${esc(v)}</text>`;
      if (nm)   body += `<text class="lbl-name" x="${f.w / 2 + nameOffX}" y="${lblY.nameY + nameOffY}">${esc(nm)}</text>`;
      if (info) body += `<text class="lbl-info" x="${f.w / 2 + infoOffX}" y="${lblY.infoY + infoOffY}">${esc(info)}</text>`;
    }
    body += `</g>`;
  }
  body += pillsBody;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * scale)}" height="${Math.round(H * scale)}" viewBox="${minx} ${miny} ${W} ${H}">`
    + `<defs><marker id="ea" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#3c4756"/></marker><style>${css}</style></defs>`
    + `<rect x="${minx}" y="${miny}" width="${W}" height="${H}" fill="#ffffff"/>${body}</svg>`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildExportSVG };
}

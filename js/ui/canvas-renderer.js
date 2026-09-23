"use strict";

/* Canvas SVG Render Loop */
const layerPage = $("layerPage"), layerConn = $("layerConn"), layerBlock = $("layerBlock"), layerPill = $("layerPill"), overlay = $("overlay"), gridRect = $("gridRect");

function applyView() {
  world.setAttribute("transform", `translate(${view.tx} ${view.ty}) scale(${view.scale})`);
  const zlbl = $("zLabel");
  if (zlbl) zlbl.textContent = Math.round(view.scale * 100) + "%";
}

function renderCanvas() {
  gridRect.style.display = settings.grid ? "" : "none";

  /* Render Page Layout Frame for Document Presets */
  const curSheet = sheets[cur];
  const presetKey = (curSheet && curSheet.layoutPreset) || settings.layoutPreset || "free";
  const layoutObj = LAYOUT_PRESETS[presetKey] || LAYOUT_PRESETS.free;

  if (layerPage) {
    if (layoutObj && !layoutObj.isFree) {
      const margin = 40;
      const pxW = layoutObj.w, pxH = layoutObj.h;
      const x0 = margin, y0 = margin;
      const badgeText = `${layoutObj.name} · ${layoutObj.mmW} × ${layoutObj.mmH} mm`;
      const badgeWidth = badgeText.length * 8 + 24;

      layerPage.innerHTML = `<g class="page-frame-group">`
        + `<rect class="page-bg-frame" x="${x0}" y="${y0}" width="${pxW}" height="${pxH}" rx="6"/>`
        + `<rect class="page-boundary" x="${x0}" y="${y0}" width="${pxW}" height="${pxH}" rx="6"/>`
        + `<g transform="translate(${x0 + 16}, ${y0 + 26})">`
        + `<rect class="page-badge-bg" x="-8" y="-16" width="${badgeWidth}" height="24" rx="4"/>`
        + `<text class="page-badge" x="0" y="0" dominant-baseline="middle">${esc(badgeText)}</text>`
        + `</g></g>`;
    } else {
      layerPage.innerHTML = "";
    }
  }

  const P = computePowers();
  const hotSet = new Set();
  for (const b of blocks) {
    const c = COMP[b.type];
    if (!c.p1db) continue;
    const p1 = c.p1db(b.params);
    if (p1 === undefined) continue;
    for (const p of getPorts(b)) {
      const v = P[key(b.id, p.id)];
      if (v !== undefined && isFinite(v) && v >= p1) { hotSet.add(b.id); break; }
    }
  }

  let wireHtml = "", pillHtml = "";
  const RS = [];
  for (const cn of conns) {
    const a = portPt(findBlock(cn.from.block), cn.from.port), z = portPt(findBlock(cn.to.block), cn.to.port);
    if (!a || !z) continue;
    RS.push({ cn, R: route(a, z, cn), lvl: P[key(cn.from.block, cn.from.port)] });
  }

  const allVertSegs = [];
  for (const { cn, R } of RS) {
    if (R.segs) {
      for (const s of R.segs) {
        if (!s.horiz) allVertSegs.push({ ...s, connId: cn.id });
      }
    }
  }

  const segsAll = [].concat(...RS.map(r => r.R.segs || []));
  const rectsAll = obstacleRects(0);
  const NFm = settings.showNF ? computeNoise(P) : null;
  for (const { cn, R, lvl } of RS) {
    const selc = selConn === cn.id, mk = selc ? "arrowSel" : "arrow";
    const pathD = buildPathWithJumpers(R.pts, allVertSegs, cn.id);
    wireHtml += `<g class="conn${selc ? " sel" : ""}" data-conn="${cn.id}"><path class="conn-hit" d="${pathD}"/><path class="wire" d="${pathD}" marker-end="url(#${mk})"/>`;
    if (selc && cn.waypoints && cn.waypoints.length) {
      cn.waypoints.forEach((wp, idx) => {
        wireHtml += `<g class="wire-node-g" data-conn="${cn.id}" data-node="${idx}"><circle class="wire-node-hit" cx="${wp.x}" cy="${wp.y}" r="14"/><circle class="wire-node" cx="${wp.x}" cy="${wp.y}" r="6"/></g>`;
      });
    }
    wireHtml += `</g>`;

    if (settings.showLabels !== false && !cn.hidePill) {
      const nf = NFm ? nfDb(NFm[key(cn.from.block, cn.from.port)]) : undefined;
      const base = pillCenter(R, lvl, segsAll, rectsAll, nf), off = cn.labelOff || { dx: 0, dy: 0 };
      pillHtml += pill(base.x + off.dx, base.y + off.dy, lvl, cn.id, nf);
    }
  }
  layerConn.innerHTML = wireHtml;
  layerPill.innerHTML = pillHtml;

  let bh = "";
  for (const b of blocks) {
    const c = COMP[b.type];
    const f = footprint(b);
    const selb = selected.has(b.id);
    bh += `<g class="block${selb ? " sel" : ""}${hotSet.has(b.id) ? " hot" : ""}" data-block="${b.id}" transform="translate(${b.x} ${b.y})" style="${blockStyle(b)}">`;
    if (c.isLabel) {
      bh += `<rect class="sel-ring" x="-6" y="-18" width="${f.w + 4}" height="26" rx="5"/>`
        + `<rect class="block-hit" x="-4" y="-16" width="${f.w}" height="22" rx="4"/>`
        + `<text class="free-label" x="0" y="0" dominant-baseline="middle">${esc(b.params.text || "Label")}</text>`;
    } else {
      const rotTf = rotTransform(b);
      const symTf = (rotTf ? `${rotTf} ` : "") + `translate(${f.w / 2} ${f.h / 2}) scale(${DESIGN_TOKENS.symbolScale}) translate(${-f.w / 2} ${-f.h / 2})`;
      bh += `<rect class="sel-ring" x="-8" y="-8" width="${f.w + 16}" height="${f.h + 16}" rx="9"/>`
        + `<rect class="block-hit" x="0" y="0" width="${f.w}" height="${f.h}"/>`
        + `<g${symTf ? ` transform="${symTf}"` : ""}>${c.sym(b.params)}</g>`;
      if (c.isInterconnect) {
        const rt = (b.params.tag || "?"), disp = icTagText(isSubTag(rt) ? subTagPort(rt) : rt);
        const tx = (b.rot || b.flip) ? f.w / 2 : (icSend(b.params) ? 16 : 23);
        bh += `<text class="ic-tag" x="${tx}" y="${f.h / 2}" font-size="${icTagFont(disp)}" textLength="${Math.min(22, disp.length * icTagFont(disp) * 0.62)}" lengthAdjust="spacingAndGlyphs" text-anchor="middle" dominant-baseline="central">${esc(disp)}</text>`;
      }
      if (c.upText) {
        const ut = c.upText(b.params);
        if (ut) bh += `<text class="cust-tx" x="${f.w / 2}" y="${f.h / 2}" text-anchor="middle" dominant-baseline="central">${esc(ut)}</text>`;
      }
      if (c.portLabels) for (const pt of getPorts(b)) {
        const inx = pt.side === "left" ? 14 : pt.side === "right" ? -14 : 0, iny = pt.side === "top" ? 14 : pt.side === "bottom" ? -14 : 0;
        bh += `<text class="port-lbl" x="${pt.dx + inx}" y="${pt.dy + iny}" text-anchor="middle" dominant-baseline="central">${esc(pt.id)}</text>`;
      }
      let nm = c.isInterconnect ? "" : (b.params.label || c.name);
      if (c.isInterconnect && isSubTag(b.params.tag || "")) {
        const own = allBlocks().find(x => COMP[x.type].isSubsystem && (b.params.tag || "").indexOf("\u00a7" + x.id + ".") === 0);
        nm = (own ? (own.params.label || "Section") : "Section") + " \u00b7 " + subTagPort(b.params.tag);
      }
      if (c.isInterconnect && sheets.length > 1) {
        const t = (b.params.tag || "").trim(), wantSend = icRecv(b.params);
        const pb = allBlocks().find(x => COMP[x.type].isInterconnect && icSend(x.params) === wantSend && (x.params.tag || "").trim() === t);
        const psh = pb ? sheetOfBlock(pb.id) : null;
        if (psh && psh !== sheets[cur]) nm = (icRecv(b.params) ? "\u2190 " : "\u2192 ") + psh.name;
      }
      const v = c.val ? c.val(b.params) : "";
      if (c.topLabel || c.lblPos === "top") {
        if (nm && v) {
          bh += `<text class="lbl-name" x="${f.w / 2}" y="-28">${esc(nm)}</text>`;
          bh += `<text class="lbl-val" x="${f.w / 2}" y="-13">${esc(v)}</text>`;
        } else if (nm) {
          bh += `<text class="lbl-name" x="${f.w / 2}" y="-14">${esc(nm)}</text>`;
        } else if (v) {
          bh += `<text class="lbl-val" x="${f.w / 2}" y="-14">${esc(v)}</text>`;
        }
      } else {
        if (nm) bh += `<text class="lbl-name" x="${f.w / 2}" y="${f.h + 18}">${esc(nm)}</text>`;
        if (v) bh += `<text class="lbl-val" x="${f.w / 2}" y="${f.h + (nm ? 33 : 18)}">${esc(v)}</text>`;
      }
      for (const p of getPorts(b)) {
        const m = markInside(p, f.w, f.h);
        bh += `<g class="port ${p.kind}" data-block="${b.id}" data-port="${p.id}" data-kind="${p.kind}"><circle class="port-hit" cx="${p.dx}" cy="${p.dy}" r="10"/><circle class="port-mark" cx="${m.x}" cy="${m.y}" r="3"/></g>`;
      }
    }
    bh += `</g>`;
  }
  layerBlock.innerHTML = bh;

  const hintEl = $("emptyHint");
  if (hintEl) hintEl.style.display = blocks.length ? "none" : "";
  const statEl = $("stat");
  if (statEl) statEl.textContent = `${blocks.length} block${blocks.length !== 1 ? "s" : ""} · ${conns.length} link${conns.length !== 1 ? "s" : ""}`;
}

function renderAll() {
  pruneConns();
  syncSubsystems();
  renderCanvas();
  if (typeof renderInspector === "function") renderInspector();
  if (sheetBarDirty) {
    sheetBarDirty = false;
    if (typeof renderSheets === "function") renderSheets();
  }
  if (typeof budgetOpen === "function" && budgetOpen()) {
    if (typeof renderBudget === "function") renderBudget();
  }
}


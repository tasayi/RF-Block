"use strict";

/* =====================================================================
 * RF Block Diagram Editor - Dynamic Grid Snap & Auto Component Spacing
 * ===================================================================== */

let _measureCanvas = null;

/**
 * Accurately measures the rendered pixel dimensions of a parameter label.
 * Takes into account actual text, font-family, font-size, font-weight,
 * and pill background padding (rx=5, 5px on each side).
 */
function measureRenderedLabel(text, fontSpec) {
  if (!text) return { text: "", width: 32, height: 20 };
  const str = String(text);
  const font = fontSpec || "600 13px Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
  const paddingH = 10; // 5px left + 5px right padding in rect.pbg

  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    if (!_measureCanvas) {
      _measureCanvas = document.createElement("canvas");
    }
    const ctx = _measureCanvas.getContext("2d");
    if (ctx) {
      ctx.font = font;
      const textMetrics = ctx.measureText(str);
      const w = Math.max(Math.ceil(textMetrics.width + paddingH), 32);
      return { text: str, width: w, height: 20 };
    }
  }

  // Fallback measurement for headless / test environments
  const charWidth = 7.6;
  const w = Math.max(Math.ceil(str.length * charWidth + paddingH), 32);
  return { text: str, width: w, height: 20 };
}

/**
 * Identifies and measures all applicable parameter labels (PWR1, PWR2,
 * Noise Figure, Noise Floor) for the wires touching the given blocks.
 */
function getApplicableLabelsForSelection(selectedIds) {
  const ids = new Set(selectedIds || []);
  if (!ids.size) return [];

  // Compute power and noise calculations if available
  const P = (typeof computePowers === "function") ? computePowers("primary") : {};
  const PSecondary = (typeof computePowers === "function") ? computePowers("secondary") : {};
  const needNoise = !!(typeof settings !== "undefined" && (settings.showNF || settings.showNoiseFloor));
  const NFm = (needNoise && typeof computeNoise === "function") ? computeNoise(P) : null;
  const bwHz = (typeof settings !== "undefined" && settings.bandwidthHz) || 1e6;

  const relevantConns = (typeof conns !== "undefined" ? conns : []).filter(cn =>
    ids.has(cn.from.block) || ids.has(cn.to.block)
  );

  const results = [];
  for (const cn of relevantConns) {
    const k = (typeof key === "function") ? key(cn.from.block, cn.from.port) : `${cn.from.block}:${cn.from.port}`;
    const lvlPrimary = P[k];
    const lvlSecondary = PSecondary[k];
    const nnObj = NFm ? NFm[k] : undefined;
    const nfVal = (typeof nfDb === "function") ? nfDb(nnObj) : undefined;
    const srcLvl = (typeof startBlocks === "function" && startBlocks().length)
      ? P[key(startBlocks()[0].id, srcPorts(COMP[startBlocks()[0].type], startBlocks()[0].params)[0])]
      : 0;
    const nflVal = (nnObj && typeof computeNoiseFloor === "function")
      ? computeNoiseFloor(nnObj, lvlPrimary, srcLvl, bwHz)
      : undefined;

    // 1. PWR1
    if (lvlPrimary !== undefined && isFinite(lvlPrimary)) {
      const text = (typeof dbm === "function") ? dbm(lvlPrimary) : (lvlPrimary.toFixed(1) + " dBm");
      const m = measureRenderedLabel(text);
      results.push({ type: "pwr1", text, width: m.width, height: m.height, connId: cn.id });
    }
    // 2. PWR2
    if (lvlSecondary !== undefined && isFinite(lvlSecondary)) {
      const text = (typeof dbm === "function") ? dbm(lvlSecondary) : (lvlSecondary.toFixed(1) + " dBm");
      const m = measureRenderedLabel(text);
      results.push({ type: "pwr2", text, width: m.width, height: m.height, connId: cn.id });
    }
    // 3. Noise Figure (NF)
    if (nfVal !== undefined && isFinite(nfVal)) {
      const text = (typeof fmt === "function") ? ("NF " + fmt(nfVal) + " dB") : ("NF " + nfVal.toFixed(1) + " dB");
      const m = measureRenderedLabel(text);
      results.push({ type: "nf", text, width: m.width, height: m.height, connId: cn.id });
    }
    // 4. Noise Floor (NFloor)
    if (nflVal !== undefined && isFinite(nflVal)) {
      const text = (typeof dbm === "function") ? dbm(nflVal) : (nflVal.toFixed(1) + " dBm");
      const m = measureRenderedLabel(text);
      results.push({ type: "nfloor", text, width: m.width, height: m.height, connId: cn.id });
    }
  }

  return results;
}

/**
 * Snaps all currently selected components to the active configured grid.
 * Preserves connections, parameters, and relationships.
 */
function snapSelectionToGrid(targetGridSize) {
  const ids = [...(typeof selected !== "undefined" ? selected : [])].filter(id => findBlock(id));
  if (!ids.length) {
    if (typeof hint === "function") hint("Select one or more components to snap to grid.");
    return;
  }
  if (typeof pushHistory === "function") pushHistory();

  const gs = Number(targetGridSize || (typeof settings !== "undefined" && settings.gridSize)) || 10;
  const affectedBlocks = ids.map(id => findBlock(id));

  for (const b of affectedBlocks) {
    b.x = Math.round(b.x / gs) * gs;
    b.y = Math.round(b.y / gs) * gs;
  }

  // Snap jogs and waypoints on connections linked to selected blocks
  const affectedSet = new Set(ids);
  for (const cn of (typeof conns !== "undefined" ? conns : [])) {
    if (affectedSet.has(cn.from.block) || affectedSet.has(cn.to.block)) {
      if (cn.jog != null) {
        cn.jog = Math.round(cn.jog / gs) * gs;
      }
      if (cn.waypoints && Array.isArray(cn.waypoints)) {
        cn.waypoints.forEach(wp => {
          wp.x = Math.round(wp.x / gs) * gs;
          wp.y = Math.round(wp.y / gs) * gs;
        });
      }
    }
  }

  if (typeof commitSheet === "function") commitSheet();
  if (typeof markDirty === "function") markDirty();
  if (typeof renderAll === "function") renderAll();
  if (typeof hint === "function") {
    hint(`Snapped ${affectedBlocks.length} component${affectedBlocks.length > 1 ? "s" : ""} to ${gs}px grid.`);
  }
}

/**
 * Snaps ALL blocks and connections across the current sheet to the grid.
 */
function snapAllToGrid(targetGridSize) {
  if (typeof pushHistory === "function") pushHistory();
  const gs = Number(targetGridSize || (typeof settings !== "undefined" && settings.gridSize)) || 10;
  const blist = typeof blocks !== "undefined" ? blocks : [];
  for (const b of blist) {
    b.x = Math.round(b.x / gs) * gs;
    b.y = Math.round(b.y / gs) * gs;
  }
  for (const cn of (typeof conns !== "undefined" ? conns : [])) {
    if (cn.jog != null) {
      cn.jog = Math.round(cn.jog / gs) * gs;
    }
    if (cn.waypoints && Array.isArray(cn.waypoints)) {
      cn.waypoints.forEach(wp => {
        wp.x = Math.round(wp.x / gs) * gs;
        wp.y = Math.round(wp.y / gs) * gs;
      });
    }
  }

  if (typeof commitSheet === "function") commitSheet();
  if (typeof markDirty === "function") markDirty();
  if (typeof renderAll === "function") renderAll();
  if (typeof hint === "function") {
    hint(`Snapped entire diagram (${blist.length} blocks) to ${gs}px grid.`);
  }
}

/**
 * Automatically adjusts the spacing between selected components based on
 * the actual rendered size of applicable parameter labels (PWR1, PWR2, NF,
 * Noise Floor) plus configurable padding.
 */
function autoSpaceSelection(opts) {
  const ids = [...(typeof selected !== "undefined" ? selected : [])].filter(id => findBlock(id));
  if (ids.length < 2) {
    if (typeof hint === "function") hint("Select two or more components to auto space.");
    return;
  }
  if (typeof pushHistory === "function") pushHistory();

  const cfg = typeof settings !== "undefined" ? settings : {};
  const gs = Number((opts && opts.gridSize) || cfg.gridSize) || 10;
  const padding = Number((opts && opts.padding !== undefined) ? opts.padding : (cfg.autoSpacePadding !== undefined ? cfg.autoSpacePadding : 20));
  const minSpacing = Number((opts && opts.minSpacing !== undefined) ? opts.minSpacing : (cfg.minSpacing !== undefined ? cfg.minSpacing : 20));

  const bs = ids.map(id => findBlock(id));

  // Determine rendered size of applicable labels (PWR1, PWR2, NF, Noise Floor)
  const labels = getApplicableLabelsForSelection(ids);
  let largestLabelWidth = labels.reduce((max, item) => Math.max(max, item.width), 0);

  // If no calculated levels found on wire yet but labels are enabled in settings,
  // use nominal rendered dimension for the enabled indicators to ensure clearance
  if (largestLabelWidth === 0 && cfg.showLabels !== false) {
    const nominals = [];
    if (cfg.showPwr1 !== false) nominals.push(measureRenderedLabel("+0.0 dBm").width);
    if (cfg.showPwr2) nominals.push(measureRenderedLabel("+0.0 dBm").width);
    if (cfg.showNF) nominals.push(measureRenderedLabel("NF 0.0 dB").width);
    if (cfg.showNoiseFloor) nominals.push(measureRenderedLabel("-114.0 dBm").width);
    if (nominals.length) largestLabelWidth = Math.max(...nominals);
  }

  const arrowSize = Number((opts && opts.arrowSize !== undefined) ? opts.arrowSize : 12);
  // Required spacing = Maximum required label dimension + arrowSize + Padding
  // Clear wire length = wire_len - arrowSize, leaving (padding / 2) on the left and (padding / 2) on the right to the arrow
  const requiredSpacing = Math.max(minSpacing, largestLabelWidth + arrowSize + padding);
  const effectiveSpacing = Math.max(gs, Math.round(requiredSpacing / gs) * gs);

  // Determine layout orientation (horizontal signal flow vs vertical)
  const minX = Math.min(...bs.map(b => b.x)), maxX = Math.max(...bs.map(b => b.x));
  const minY = Math.min(...bs.map(b => b.y)), maxY = Math.max(...bs.map(b => b.y));
  const isHorizontal = (maxX - minX) >= (maxY - minY);

  // Sort components along the primary layout axis
  if (isHorizontal) {
    bs.sort((a, b) => a.x - b.x);
  } else {
    bs.sort((a, b) => a.y - b.y);
  }

  // Anchor the first block at its snapped position
  bs[0].x = Math.round(bs[0].x / gs) * gs;
  bs[0].y = Math.round(bs[0].y / gs) * gs;

  // Space subsequent components sequentially
  for (let i = 1; i < bs.length; i++) {
    const prev = bs[i - 1];
    const curr = bs[i];
    const prevFoot = (typeof footprint === "function") ? footprint(prev) : { w: 60, h: 60 };

    if (isHorizontal) {
      curr.x = prev.x + prevFoot.w + effectiveSpacing;
      curr.y = Math.round(curr.y / gs) * gs;
    } else {
      curr.y = prev.y + prevFoot.h + effectiveSpacing;
      curr.x = Math.round(curr.x / gs) * gs;
    }
  }

  // Clear manual jogs between spaced blocks so Manhattan router generates clean straight wires
  const selSet = new Set(ids);
  for (const cn of (typeof conns !== "undefined" ? conns : [])) {
    if (selSet.has(cn.from.block) && selSet.has(cn.to.block)) {
      delete cn.jog;
    }
  }

  if (typeof commitSheet === "function") commitSheet();
  if (typeof markDirty === "function") markDirty();
  if (typeof renderAll === "function") renderAll();
  if (typeof hint === "function") {
    const labelInfo = largestLabelWidth > 0 ? ` (max label: ${largestLabelWidth}px + pad: ${padding}px)` : "";
    hint(`Auto-spaced ${bs.length} components with ${effectiveSpacing}px clearance${labelInfo}.`);
  }
}

/**
 * Dynamically adjusts the visual SVG grid pattern (#gridm and #grid)
 * in real-time when gridSize changes.
 */
function updateCanvasGridVisual(gridSize) {
  const gs = Number(gridSize) || 10;
  if (typeof document === "undefined") return;
  const gridm = document.getElementById("gridm");
  const grid = document.getElementById("grid");
  if (gridm) {
    gridm.setAttribute("width", String(gs));
    gridm.setAttribute("height", String(gs));
    const path = gridm.querySelector("path");
    if (path) path.setAttribute("d", `M${gs} 0H0V${gs}`);
  }
  if (grid) {
    const maj = gs * 10;
    grid.setAttribute("width", String(maj));
    grid.setAttribute("height", String(maj));
    const rect = grid.querySelector("rect");
    if (rect) {
      rect.setAttribute("width", String(maj));
      rect.setAttribute("height", String(maj));
    }
    const path = grid.querySelector("path");
    if (path) path.setAttribute("d", `M${maj} 0H0V${maj}`);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    measureRenderedLabel,
    getApplicableLabelsForSelection,
    snapSelectionToGrid,
    snapAllToGrid,
    autoSpaceSelection,
    updateCanvasGridVisual
  };
}

"use strict";

/* Application Entry Point & Global Event Bindings */
function seedDemo() {
  const mk = (type, x, y, params = {}) => {
    const b = { id: uid(type), type, x, y, rot: 0, flip: false, params: { ...JSON.parse(JSON.stringify(COMP[type].params)), ...params } };
    blocks.push(b);
    return b;
  };
  const ant = mk("antenna", 60, 140, { label: "ANT", role: "Rx", power: -70 });
  const lna = mk("amp", 200, 140, { label: "LNA", gain: 18, nf: 1.2 });
  const bpf = mk("filter", 340, 140, { label: "RF BPF", ftype: "BPF", il: 1.5, fc: "2.4 GHz" });
  const mix = mk("mixer", 480, 140, { label: "MIX", cl: 7 });
  const lo = mk("lo", 480, 280, { label: "LO", power: 8, freq: "2.0 GHz" });
  const ifa = mk("amp", 620, 140, { label: "IF AMP", gain: 20, nf: 3 });
  const ifl = mk("filter", 760, 140, { label: "IF BPF", ftype: "BPF", il: 2, fc: "400 MHz" });
  const det = mk("detector", 900, 140, { label: "DET" });

  const C = (fb, fp, tb, tp) => conns.push({ id: uid("c"), from: { block: fb.id, port: fp }, to: { block: tb.id, port: tp } });
  C(ant, "ant", lna, "in"); C(lna, "out", bpf, "in"); C(bpf, "out", mix, "rf");
  C(lo, "out", mix, "lo"); C(mix, "if", ifa, "in"); C(ifa, "out", ifl, "in"); C(ifl, "out", det, "in");
}

function initEvents() {
  /* SVG Mouse Pointer events */
  svg.addEventListener("mousedown", e => {
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault();
      drag = { mode: "pan", sx: e.clientX, sy: e.clientY, tx0: view.tx, ty0: view.ty, moved: false };
      svg.classList.add("panning"); attachDrag(); return;
    }
    if (e.button !== 0) return;
    const pillEl = e.target.closest(".pill"); let portEl = e.target.closest(".port");
    const blockEl = e.target.closest(".block"), connEl = e.target.closest(".conn");

    if (portEl && blockEl) {
      const pb = findBlock(portEl.getAttribute("data-block"));
      const pp = pb ? portPt(pb, portEl.getAttribute("data-port")) : null;
      const wp = screenToWorld(e.clientX, e.clientY);
      if (pp && Math.hypot(wp.x - pp.x, wp.y - pp.y) > 9) portEl = null;
    }

    if (pillEl && pillEl.getAttribute("data-conn")) {
      e.preventDefault();
      const cid = pillEl.getAttribute("data-conn"); selConn = cid; selected = new Set(); renderAll();
      const base = connBase(cid), tip = pillTip(cid), w0 = screenToWorld(e.clientX, e.clientY);
      drag = { mode: "label", conn: cid, base, grabx: w0.x - tip.x, graby: w0.y - tip.y, moved: false, pre: snapState() };
      attachDrag(); return;
    }
    if (portEl) {
      e.preventDefault();
      const from = { block: portEl.getAttribute("data-block"), port: portEl.getAttribute("data-port") };
      const pp = portPt(findBlock(from.block), from.port);
      const sk = portKind(from), need = (sk === "in") ? ["out", "inout"] : (sk === "out") ? ["in", "inout"] : ["in", "out", "inout"];
      drag = { mode: "wire", from, need, pre: snapState() };
      svg.classList.add("connecting");
      overlay.innerHTML = `<path class="rubber" d="M${pp.x} ${pp.y}L${pp.x} ${pp.y}"/>`;
      attachDrag(); return;
    }
    if (blockEl) {
      const id = blockEl.getAttribute("data-block");
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        if (selected.has(id)) selected.delete(id); else selected.add(id);
        selConn = null; renderAll(); return;
      }
      const wasMulti = selected.size > 1 && selected.has(id);
      if (!selected.has(id)) selectOnly(id); else selConn = null;
      renderInspector(); markSelectionOnly();
      const w0 = screenToWorld(e.clientX, e.clientY);
      const items = [...selected].map(sid => { const b = findBlock(sid); return { id: sid, ox: b.x, oy: b.y }; });
      const moving = new Set(selected);
      const jogs = conns.filter(c => c.jog != null && (moving.has(c.from.block) || moving.has(c.to.block))).map(c => {
        const a = portPt(findBlock(c.from.block), c.from.port), z = portPt(findBlock(c.to.block), c.to.port);
        const hA = a && (a.side === "left" || a.side === "right"), hZ = z && (z.side === "left" || z.side === "right");
        return {
          c, jog: c.jog, axis: (a && z) ? ((hA && hZ) ? "x" : ((!hA && !hZ) ? "y" : null)) : null,
          both: moving.has(c.from.block) && moving.has(c.to.block)
        };
      });
      drag = { mode: "move", items, jogs, sx: w0.x, sy: w0.y, moved: false, reduce: wasMulti && !e.shiftKey, clickId: id, pre: snapState() };
      attachDrag(); return;
    }
    if (connEl) {
      const cid = connEl.getAttribute("data-conn"); selConn = cid; selected = new Set(); renderAll();
      drag = { mode: "wiredrag", conn: cid, moved: false, pre: snapState() }; attachDrag(); return;
    }

    const w = screenToWorld(e.clientX, e.clientY);
    drag = { mode: "marquee", sx: w.x, sy: w.y, cur: { x: w.x, y: w.y }, moved: false };
    attachDrag();
  });

  svg.addEventListener("dblclick", e => {
    const blkEl = e.target.closest(".block");
    if (blkEl) {
      const b = findBlock(blkEl.getAttribute("data-block"));
      if (b && COMP[b.type].isSubsystem) { e.preventDefault(); openSubsystem(b); return; }
    }
    const pillEl = e.target.closest(".pill"), connEl = e.target.closest(".conn");
    if (pillEl && pillEl.getAttribute("data-conn")) { const cn = conns.find(c => c.id === pillEl.getAttribute("data-conn")); if (cn && cn.labelOff) { delete cn.labelOff; renderCanvas(); hint("Label reset to default."); } return; }
    if (connEl) { const cn = conns.find(c => c.id === connEl.getAttribute("data-conn")); if (cn && cn.jog != null) { delete cn.jog; renderCanvas(); hint("Wire straightened."); } }
  });

  svg.addEventListener("wheel", e => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.1 : 1 / 1.1, ns = clamp(view.scale * f, 0.3, 3);
    const r = svg.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    view.tx = sx - (sx - view.tx) * (ns / view.scale); view.ty = sy - (sy - view.ty) * (ns / view.scale); view.scale = ns; applyView();
  }, { passive: false });

  /* Palette Sidebar drag / add listeners */
  const palBody = $("palBody");
  if (palBody) {
    palBody.addEventListener("dragstart", e => {
      const it = e.target.closest("[data-add]"); if (!it) return;
      e.dataTransfer.setData("text/rf-type", it.getAttribute("data-add"));
      e.dataTransfer.effectAllowed = "copy";
    });
    palBody.addEventListener("click", e => {
      const it = e.target.closest("[data-add]"); if (!it) return;
      const r = svg.getBoundingClientRect(); const c = screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
      addBlock(it.getAttribute("data-add"), c.x, c.y);
    });
  }

  svg.addEventListener("dragover", e => {
    if (e.dataTransfer.types.includes("text/rf-type")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
  });
  svg.addEventListener("drop", e => {
    const t = e.dataTransfer.getData("text/rf-type"); if (!t) return;
    e.preventDefault(); const w = screenToWorld(e.clientX, e.clientY); addBlock(t, w.x, w.y);
  });

  /* Context menu trigger */
  svg.addEventListener("contextmenu", e => {
    e.preventDefault();
    const blockEl = e.target.closest(".block"), connEl = e.target.closest(".conn"), pillCtx = e.target.closest(".pill");
    if (blockEl) {
      const id = blockEl.getAttribute("data-block"); if (!selected.has(id)) selectOnly(id); renderAll();
      const n = selected.size, m = n > 1;
      const cb = findBlock(id);
      const ckey = cb ? keyOfBlock(cb) : null;
      const items = [];
      if (cb && COMP[cb.type].isSubsystem) items.push(ctxItem("Open inside", "dbl-click", "sub-open"), "divider");
      if (m) items.push(ctxItem(`Fold ${n} blocks into a section\u2026`, "", "sub-group"), "divider");
      items.push(ctxItem("Mirror horizontal", "M", "mirror"), ctxItem("Rotate 90°", "R", "rotate"), ctxItem("Duplicate", "⌘D", "dup"),
        "divider", ctxItem(cb ? `Colour ${colorLabel(cb)}\u2026` : "Colour\u2026", "", "col"),
        ...(ckey && typeColor[ckey] !== undefined ? [ctxItem("Reset colour", "", "colrst")] : []));
      if (m) items.push("divider",
        ctxItem("Align tops", "", "al-top"), ctxItem("Align middles", "", "al-cy"), ctxItem("Align bottoms", "", "al-bottom"),
        ctxItem("Align lefts", "", "al-left"), ctxItem("Align centres", "", "al-cx"), ctxItem("Align rights", "", "al-right"),
        ctxItem("Space evenly across", "", "al-dx"), ctxItem("Space evenly down", "", "al-dy"));
      items.push("divider", ctxItem(m ? `Delete ${n} blocks` : "Delete", "Del", "del", "danger"));
      ctxItems(items); showCtx(e.clientX, e.clientY);
    }
    else if (connEl || pillCtx) {
      selConn = (connEl ? connEl.getAttribute("data-conn") : pillCtx.getAttribute("data-conn"));
      selected = new Set(); renderAll();
      const cn = conns.find(c => c.id === selConn);
      ctxItems([ctxItem(cn && cn.hidePill ? "Show the dBm label" : "Hide the dBm label on this wire", "", "pill"),
        "divider",
        ctxItem("Delete connection", "Del", "delc", "danger")]); showCtx(e.clientX, e.clientY);
    }
    else { ctxItems([ctxItem("Select all", "⌘A", "all"), ctxItem("Fit view", "", "fit")]); showCtx(e.clientX, e.clientY); }
  });

  /* Window keyboard shortcuts */
  window.addEventListener("keydown", e => {
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) { e.preventDefault(); saveDoc(e.shiftKey); return; }
    if (e.code === "Space" && !typing) { if (!spaceDown) { spaceDown = true; svg.classList.add("space"); } e.preventDefault(); return; }
    if (typing) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")) { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && ((e.key === "y" || e.key === "Y") || (e.shiftKey && (e.key === "z" || e.key === "Z")))) { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) { if (selected.size) { e.preventDefault(); copySelection(); } return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) {
      const t0 = ++pasteTick;
      setTimeout(() => {
        if (t0 !== pasteTick) return;
        (async () => {
          let txt = null;
          try { if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.readText) txt = await navigator.clipboard.readText(); } catch (err) {}
          if (!(txt && pasteFromText(txt))) pasteClipboard();
        })();
      }, 140);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) { e.preventDefault(); selectAll(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) { e.preventDefault(); duplicateSelection(); return; }
    if ((e.key === "r" || e.key === "R")) { if (e.ctrlKey || e.metaKey) e.preventDefault(); rotateSelection(); return; }
    if ((e.key === "m" || e.key === "M")) { if (e.ctrlKey || e.metaKey) e.preventDefault(); mirrorSelection(); return; }
    if (e.key.indexOf("Arrow") === 0 && selected.size) {
      e.preventDefault();
      const step = (e.shiftKey ? 5 : 1) * settings.gridSize;
      const dx = (e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0);
      const dy = (e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0);
      if (dx || dy) { pushHistory(); for (const id of selected) { const b = findBlock(id); if (b) { b.x = snap(b.x + dx); b.y = snap(b.y + dy); } } renderAll(); }
      return;
    }
    if ((e.key === "b" || e.key === "B") && !e.ctrlKey && !e.metaKey) { toggleBudget(); return; }
    if ((e.key === "s" || e.key === "S") && !e.ctrlKey && !e.metaKey) { toggleSParamsDrawer(); return; }
    if ((e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); deleteSelection(); return; }
    if (e.key === "Escape") { hideCtx(); if (drag && drag.mode === "wire") { overlay.innerHTML = ""; drag = null; svg.classList.remove("connecting"); } clearSel(); renderAll(); }
  });

  window.addEventListener("keyup", e => { if (e.code === "Space") { spaceDown = false; svg.classList.remove("space"); } });

  let pasteTick = 0;
  document.addEventListener("paste", e => {
    const ae = document.activeElement, tg = ae && ae.tagName;
    if (tg === "INPUT" || tg === "TEXTAREA" || tg === "SELECT") return;
    pasteTick++;
    const txt = e.clipboardData ? e.clipboardData.getData("text/plain") : "";
    e.preventDefault();
    if (!(txt && pasteFromText(txt))) pasteClipboard();
  });

  window.addEventListener("mousedown", e => {
    if (!e.target.closest || !e.target.closest(".ctxmenu")) hideCtx();
    if (cpEl() && cpEl().classList.contains("open")) {
      if (!e.target.closest || !e.target.closest("#colorPop")) cpCancel();
    }
  }, true);

  window.addEventListener("blur", hideCtx);
  svg.addEventListener("wheel", hideCtx, { passive: true });

  /* Toolbar buttons */
  if ($("tglSnap")) $("tglSnap").addEventListener("change", e => { settings.snap = e.target.checked; });
  if ($("tglGrid")) $("tglGrid").addEventListener("change", e => { settings.grid = e.target.checked; renderCanvas(); });
  if ($("tglLabels")) $("tglLabels").addEventListener("change", e => { settings.showLabels = e.target.checked; renderCanvas(); });
  if ($("tglNF")) $("tglNF").addEventListener("change", e => { settings.showNF = e.target.checked; renderCanvas(); renderInspector(); });
  if ($("tglColor")) $("tglColor").addEventListener("change", e => { settings.color = e.target.checked; renderPalette(); renderCanvas(); });
  if ($("tglTheme")) $("tglTheme").addEventListener("change", e => { applyTheme(e.target.checked ? "light" : "dark"); renderPalette(); renderCanvas(); });

  if ($("zIn")) $("zIn").onclick = () => zoomAt(1.15);
  if ($("zOut")) $("zOut").onclick = () => zoomAt(1 / 1.15);
  if ($("btnRotate")) $("btnRotate").onclick = rotateSelection;
  if ($("btnMirror")) $("btnMirror").onclick = mirrorSelection;
  if ($("btnFit")) $("btnFit").onclick = fitView;

  if ($("btnNew")) $("btnNew").onclick = () => {
    if (allBlocks().length && !confirm("Clear the file? Unsaved work will be lost.")) return;
    pushHistory(); fileHandle = null; fileName = "untitled.rfbd";
    sheets = [{ id: "s1", name: "Sheet 1", blocks: [], conns: [], view: { tx: 60, ty: 56, scale: 1 } }];
    adoptSheet(0); applyView(); renderAll(); renderSheets(); hint("Cleared.");
  };

  if ($("btnSave")) $("btnSave").onclick = () => saveDoc(false);
  if ($("btnSaveAs")) $("btnSaveAs").onclick = () => saveDoc(true);
  if ($("btnOpen")) $("btnOpen").onclick = openDoc;

  if ($("fileInput")) $("fileInput").addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { try { loadDoc(rd.result, f.name, null); } catch (err) { alert("That file isn't a valid RF Chain diagram."); } };
    rd.readAsText(f); e.target.value = "";
  });

  window.addEventListener("beforeunload", e => { if (dirty && blocks.length) { e.preventDefault(); e.returnValue = ""; } });

  if ($("btnSvg")) $("btnSvg").onclick = () => {
    const s = buildExportSVG(1); if (!s) { hint("Nothing to export yet."); return; }
    const blob = new Blob([s], { type: "image/svg+xml" }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "rf-chain.svg"; a.click(); URL.revokeObjectURL(url); hint("Exported rf-chain.svg");
  };

  if ($("btnPng")) $("btnPng").onclick = () => {
    const s = buildExportSVG(2); if (!s) { hint("Nothing to export yet."); return; }
    const img = new Image(), url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
    img.onload = () => {
      const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
      const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0);
      cv.toBlob(b => { const u = URL.createObjectURL(b), a = document.createElement("a"); a.href = u; a.download = "rf-chain.png"; a.click(); URL.revokeObjectURL(u); hint("Exported rf-chain.png"); });
    };
    img.onerror = () => hint("PNG export failed in this browser — try SVG."); img.src = url;
  };

  if ($("btnBom")) $("btnBom").onclick = () => {
    const rows = [["Ref", "Type", "MPN", "Sheet", "Parameters"]];
    const widths = [12, 18, 24, 14, 40];
    allBlocks().forEach(b => {
      const c = COMP[b.type]; if (c.isLabel) return;
      const sh = sheetOfBlock(b.id);
      const paramsText = Object.keys(b.params).map(k => `${k}=${b.params[k]}`).join("; ");
      rows.push([b.params.label || c.name, c.name, b.params.mpn || "", sh ? sh.name : "", paramsText]);
    });
    const blob = xlsxBlob(rows, widths, "BOM");
    const u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = u; a.download = "bom.xlsx"; a.click(); URL.revokeObjectURL(u);
    hint("Exported bom.xlsx");
  };

  if ($("btnBudget")) $("btnBudget").onclick = toggleBudget;
  if ($("bgClose")) $("bgClose").onclick = toggleBudget;
  if ($("bgCsv")) $("bgCsv").onclick = exportBudgetCsv;

  if ($("btnAnalyser")) $("btnAnalyser").onclick = toggleAnalyserDrawer;
  if ($("anClose")) $("anClose").onclick = toggleAnalyserDrawer;
  if ($("btnSParams")) $("btnSParams").onclick = toggleSParamsDrawer;
  if ($("spClose")) $("spClose").onclick = toggleSParamsDrawer;

  /* Color picker sliders & events */
  if ($("cpHue")) cpSliderKeys($("cpHue"), 0.25, 15);
  if ($("cpStr")) cpSliderKeys($("cpStr"), 0.25, 5);
  if ($("cpHue")) $("cpHue").addEventListener("input", () => cpPreview(cpFromSliders()));
  if ($("cpStr")) $("cpStr").addEventListener("input", () => cpPreview(cpFromSliders()));
  if ($("cpHex")) {
    $("cpHex").addEventListener("input", e => { const v = normHex(e.target.value); if (v) { cpSlidersFrom(v); cpPreview(v, true); } });
    $("cpHex").addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); cpApply(); } });
  }
  if ($("cpApply")) $("cpApply").onclick = cpApply;
  if ($("cpCancel")) $("cpCancel").onclick = cpCancel;
  if ($("cpReset")) $("cpReset").onclick = cpDefault;
}

function fitView() {
  if (!blocks.length) { view = { tx: 60, ty: 56, scale: 1 }; applyView(); return; }
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (const b of blocks) { const bb = bboxOf(b); minx = Math.min(minx, bb.x - 8); miny = Math.min(miny, bb.y - 8); maxx = Math.max(maxx, bb.x + bb.w + 8); maxy = Math.max(maxy, bb.y + bb.h + 30); }
  const r = svg.getBoundingClientRect(), pad = 40;
  const s = clamp(Math.min((r.width - pad * 2) / (maxx - minx), (r.height - pad * 2) / (maxy - miny)), 0.3, 2);
  view.scale = s; view.tx = pad - minx * s + (r.width - pad * 2 - (maxx - minx) * s) / 2; view.ty = pad - miny * s + (r.height - pad * 2 - (maxy - miny) * s) / 2; applyView();
}

function hint(t) {
  const el = $("hint");
  if (el) el.textContent = t;
}

/* Initialization */
window.addEventListener("DOMContentLoaded", () => {
  initEvents();
  const savedTheme = (function() { try { return localStorage.getItem("rfblock_theme"); } catch(e) { return null; } })() || settings.theme || "dark";
  applyTheme(savedTheme);
  if ($("tglTheme")) $("tglTheme").checked = (settings.theme === "light");
  if ($("palSearch")) $("palSearch").addEventListener("input", renderPalette);
  renderPalette();
  renderSheets();
  seedDemo();
  commitSheet();
  applyView();
  renderAll();
  renderSheets();
  hint("Loaded sample receiver front-end. R rotates · M mirrors · right-click a block for options.");
});


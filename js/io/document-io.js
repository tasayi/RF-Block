"use strict";

/* =====================================================================
 * RF Block Diagram Editor - Document I/O Engine (JSON, Native File System)
 * ===================================================================== */

let fileHandle = null, fileName = "untitled.rfbd", dirty = false;

const fsOK = (() => {
  try { return typeof window.showSaveFilePicker === "function"; } catch (e) { return false; }
})();

const PICK = {
  suggestedName: "rf-chain.rfbd",
  types: [{ description: "RF Chain diagram", accept: { "application/json": [".rfbd", ".json"] } }]
};

function docText() {
  commitSheet();
  return JSON.stringify({
    format: "rf-block-diagram", version: 4, settings: { ...settings }, typeColor: { ...typeColor }, cur,
    sheets: sheets.map(sh => ({ id: sh.id, name: sh.name, view: sh.view, layoutPreset: sh.layoutPreset || "free", parent: sh.parent || null, blocks: sh.blocks, connections: sh.conns }))
  }, null, 2);
}

function setFile(name, handle) {
  fileName = name || fileName;
  fileHandle = handle || fileHandle;
  markClean();
}

function markDirty() {
  if (!dirty) { dirty = true; paintFileStat(); }
}

function markClean() {
  dirty = false;
  paintFileStat();
}

function paintFileStat() {
  const el = $("fileStat");
  if (el) el.textContent = (dirty ? "\u2022 " : "") + fileName;
}

async function ensureWrite(h) {
  if (!h.queryPermission) return true;
  if (await h.queryPermission({ mode: "readwrite" }) === "granted") return true;
  return await h.requestPermission({ mode: "readwrite" }) === "granted";
}

async function writeTo(h, text) {
  const w = await h.createWritable();
  await w.write(text);
  await w.close();
}

function downloadFallback(text, name) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function saveDoc(forceSaveAs) {
  commitSheet();
  const text = docText();
  if (forceSaveAs || !fileHandle || !window.showSaveFilePicker) {
    if (window.showSaveFilePicker) {
      window.showSaveFilePicker(PICK).then(async h => {
        await writeTo(h, text);
        setFile(h.name, h);
        hint("Saved " + h.name);
      }).catch(err => { if (err.name !== "AbortError") downloadFallback(text, fileName); });
    } else {
      downloadFallback(text, fileName);
    }
  } else {
    ensureWrite(fileHandle).then(ok => {
      if (!ok) return;
      writeTo(fileHandle, text).then(() => { markClean(); hint("Saved " + fileName); });
    }).catch(() => downloadFallback(text, fileName));
  }
}

function loadDoc(text, name, handle) {
  let d;
  try {
    d = JSON.parse(text);
  } catch (err) {
    alert("That file isn't a valid JSON or RF Chain diagram.");
    return;
  }
  const multi = Array.isArray(d.sheets), single = Array.isArray(d.blocks);
  if (d.format !== "rf-block-diagram" || (!multi && !single)) {
    alert("That file isn't a valid RF Chain diagram format.");
    return;
  }
  pushHistory();
  const fileVer = Number(d.version) || 1;

  // Sanitize settings: legacy files often carried gridSize: 40 from 40x40 symbol era
  const loadedSettings = d.settings || {};
  let targetGrid = Number(loadedSettings.gridSize);
  if (!targetGrid || targetGrid === 40 || targetGrid < 2) targetGrid = 10;
  settings = { ...settings, ...loadedSettings, gridSize: targetGrid };
  if (settings.autoSpacePadding === undefined) settings.autoSpacePadding = 20;

  const fix = b => {
    let nb = { rot: 0, flip: false, ...b };
    if (fileVer < 4) {
      nb.x = (nb.x || 0) * 2;
      nb.y = (nb.y || 0) * 2;
    }
    // Snap block position to active grid
    nb.x = Math.round((nb.x || 0) / targetGrid) * targetGrid;
    nb.y = Math.round((nb.y || 0) / targetGrid) * targetGrid;
    return nb;
  };
  const fixConn = cn => {
    let ncn = { ...cn };
    if (fileVer < 4 && ncn.waypoints && Array.isArray(ncn.waypoints)) {
      ncn.waypoints = ncn.waypoints.map(w => ({ x: w.x * 2, y: w.y * 2 }));
    }
    if (ncn.waypoints && Array.isArray(ncn.waypoints)) {
      ncn.waypoints = ncn.waypoints.map(w => ({
        x: Math.round(w.x / targetGrid) * targetGrid,
        y: Math.round(w.y / targetGrid) * targetGrid
      }));
    }
    if (ncn.jog != null) {
      if (fileVer < 4) ncn.jog = ncn.jog * 2;
      ncn.jog = Math.round(ncn.jog / targetGrid) * targetGrid;
    }
    return ncn;
  };

  /* Security Sanitizer Fix: Validate typeColor values against normHex */
  typeColor = {};
  if (d.typeColor && typeof d.typeColor === "object") {
    for (const [k, v] of Object.entries(d.typeColor)) {
      const hex = normHex(v);
      if (hex) typeColor[k] = hex;
    }
  }

  if (multi) {
    sheets = d.sheets.map((sh, i) => ({
      id: sh.id || ("s" + (i + 1)),
      name: sh.name || ("Sheet " + (i + 1)),
      blocks: (sh.blocks || []).map(fix),
      conns: (sh.connections || sh.conns || []).map(fixConn),
      view: sh.view || { tx: 60, ty: 56, scale: 1 },
      parent: sh.parent || undefined
    }));
    if (!sheets.length) sheets = [{ id: "s1", name: "Sheet 1", blocks: [], conns: [], view: { tx: 60, ty: 56, scale: 1 } }];
    cur = Math.min(d.cur || 0, sheets.length - 1);
  } else {
    sheets = [{ id: "s1", name: "Sheet 1", blocks: d.blocks.map(fix), conns: (d.connections || []).map(fixConn), view: d.view || { tx: 60, ty: 56, scale: 1 } }];
    cur = 0;
  }
  if ($("tglColor")) $("tglColor").checked = settings.color !== false;
  if ($("tglTheme")) {
    $("tglTheme").checked = (settings.theme === "light");
    applyTheme(settings.theme || "dark");
  }
  adoptSheet(cur);
  renderSheets();
  clearSel();
  renderPalette();
  if ($("tglSnap")) $("tglSnap").checked = settings.snap;
  if ($("tglGrid")) $("tglGrid").checked = settings.grid;
  if ($("tglLabels")) $("tglLabels").checked = settings.showLabels !== false;
  if ($("tglPwr1")) $("tglPwr1").checked = settings.showPwr1 !== false;
  if ($("tglPwr2")) $("tglPwr2").checked = !!settings.showPwr2;
  if ($("selPowerBudget")) $("selPowerBudget").value = normalizePowerBudgetMode(settings.powerBudget);
  if ($("tglNFloor")) $("tglNFloor").checked = !!settings.showNoiseFloor;
  if ($("tglNF")) $("tglNF").checked = !!settings.showNF;
  if ($("tbBw")) $("tbBw").value = settings.bandwidthVal !== undefined ? settings.bandwidthVal : 1;
  if ($("tbBwUnit")) $("tbBwUnit").value = settings.bandwidthUnit || "MHz";
  if ($("tbGridSize")) $("tbGridSize").value = settings.gridSize !== undefined ? settings.gridSize : 10;
  if ($("tbAutoPadding")) $("tbAutoPadding").value = settings.autoSpacePadding !== undefined ? settings.autoSpacePadding : 20;
  if (typeof updateCanvasGridVisual === "function") updateCanvasGridVisual(settings.gridSize);
  if ($("selLayout")) $("selLayout").value = (sheets[cur] && sheets[cur].layoutPreset) || settings.layoutPreset || "free";
  applyView();
  renderAll();
  setFile(name, handle || null);
  hint("Opened " + name);
}

async function openDoc() {
  if (window.showOpenFilePicker) {
    try {
      const [h] = await window.showOpenFilePicker(PICK);
      const f = await h.getFile(), t = await f.text();
      loadDoc(t, f.name, h);
    } catch (err) {
      if (err.name !== "AbortError") console.error(err);
    }
  } else {
    $("fileInput").click();
  }
}

function exportVsdx() {
  commitSheet();
  if (!blocks.length) {
    hint("Can't export Visio VSDX — the diagram is empty.");
    return;
  }
  if (typeof buildVsdxBlob !== "function") {
    alert("VSDX Exporter module is not loaded.");
    return;
  }
  try {
    const P = computePowers("primary");
    const PSecondary = computePowers("secondary");
    const needNoise = !!(settings.showNF || settings.showNoiseFloor);
    const NFm = needNoise ? computeNoise(P) : null;
    const blob = buildVsdxBlob(blocks, conns, P, NFm, PSecondary, null, settings);
    const base = (fileName || "rf-chain").replace(/\.(rfbd|json|vsdx|png|svg)$/i, "");
    const name = `${base}.vsdx`;
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    hint(`Exported ${name}`);
  } catch (err) {
    console.error(err);
    alert("Error generating Visio VSDX file: " + (err.message || err));
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    docText,
    setFile,
    markDirty,
    markClean,
    paintFileStat,
    downloadFallback,
    saveDoc,
    loadDoc,
    openDoc,
    exportVsdx
  };
}

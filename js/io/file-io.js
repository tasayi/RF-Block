"use strict";

/* File I/O & Image Export Engine */
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
    format: "rf-block-diagram", version: 3, settings: { ...settings }, typeColor: { ...typeColor }, cur,
    sheets: sheets.map(sh => ({ id: sh.id, name: sh.name, view: sh.view, parent: sh.parent || null, blocks: sh.blocks, connections: sh.conns }))
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

async function saveDoc(asNew) {
  const text = docText();
  if (fsOK) {
    try {
      if (!asNew && fileHandle && await ensureWrite(fileHandle)) {
        await writeTo(fileHandle, text);
        markClean();
        hint(`Saved to ${fileName}`);
        return;
      }
      const h = await window.showSaveFilePicker({ ...PICK, suggestedName: (asNew ? fileName : PICK.suggestedName) });
      await writeTo(h, text);
      setFile(h.name, h);
      hint(`Saved to ${fileName}`);
      return;
    } catch (err) {
      if (err && err.name === "AbortError") { hint("Save cancelled."); return; }
    }
  }
  const nm = asNew ? (prompt("Save as file name:", fileName) || "").trim() : fileName;
  if (asNew && !nm) { hint("Save cancelled."); return; }
  const out = /\.(rfbd|json)$/i.test(nm || fileName) ? (nm || fileName) : (nm || fileName) + ".rfbd";
  downloadFallback(text, out);
  fileName = out;
  markClean();
  hint(fsOK ? `Downloaded ${out}` : `Downloaded ${out} (this browser can't pick a folder; Chrome or Edge can)`);
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
  const fix = b => ({ rot: 0, flip: false, ...b });

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
      conns: sh.connections || sh.conns || [],
      view: sh.view || { tx: 60, ty: 56, scale: 1 },
      parent: sh.parent || undefined
    }));
    if (!sheets.length) sheets = [{ id: "s1", name: "Sheet 1", blocks: [], conns: [], view: { tx: 60, ty: 56, scale: 1 } }];
    cur = Math.min(d.cur || 0, sheets.length - 1);
  } else {
    sheets = [{ id: "s1", name: "Sheet 1", blocks: d.blocks.map(fix), conns: d.connections || [], view: d.view || { tx: 60, ty: 56, scale: 1 } }];
    cur = 0;
  }
  settings = { ...settings, ...(d.settings || {}) };
  if ($("tglColor")) $("tglColor").checked = settings.color !== false;
  if ($("tglTheme")) {
    $("tglTheme").checked = (settings.theme === "light");
    applyTheme(settings.theme || "dark");
  }
  adoptSheet(cur);
  renderSheets();
  clearSel();
  renderPalette();
  $("tglSnap").checked = settings.snap;
  $("tglGrid").checked = settings.grid;
  if ($("tglLabels")) $("tglLabels").checked = settings.showLabels !== false;
  if ($("tglNF")) $("tglNF").checked = !!settings.showNF;
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

function saveDoc(forceSaveAs) {
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

/* SVG / PNG Export Generator */
function buildExportSVG(scale = 1) {
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  if (!blocks.length) return null;
  for (const b of blocks) {
    const bb = bboxOf(b);
    minx = Math.min(minx, bb.x - 16); miny = Math.min(miny, bb.y - 16);
    maxx = Math.max(maxx, bb.x + bb.w + 16); maxy = Math.max(maxy, bb.y + bb.h + 30);
  }
  const W = Math.max(200, maxx - minx), H = Math.max(150, maxy - miny);
  const css = `
    svg{font-family:ui-sans-serif,system-ui,sans-serif;background:#fff}
    .block-hit,.sel-ring,.port-hit,.port-mark{display:none}
    .blk-shape{fill:#fff;stroke:#2b3440;stroke-width:2;stroke-linejoin:round}
    .blk-line{fill:none;stroke:#2b3440;stroke-width:2;stroke-linecap:round}
    .blk-glyph{fill:none;stroke:#2b3440;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
    .blk-fillg{fill:#2b3440;stroke:none}
    .lbl-name{fill:#2b3440;font-family:monospace;font-size:11px;font-weight:600;text-anchor:middle}
    .lbl-val{fill:#6b7683;font-family:monospace;font-size:9.5px;text-anchor:middle}
    .ic-tag{fill:#2b3440;font-family:monospace;font-size:13px;font-weight:700}
    .cust-tx{fill:#2b3440;font-family:sans-serif;font-size:12.5px;font-weight:600}
    .port-lbl{fill:#2b3440;opacity:.62;font-family:monospace;font-size:8.5px;font-weight:600}
    .free-label{fill:#2b3440;font-family:monospace;font-size:14px;font-weight:600}
    .wire{fill:none;stroke:#3c4756;stroke-width:1.8}
    .pbg{fill:#fff;stroke:#efd3a0;stroke-width:1}
    .ptx{fill:#b45309;font-family:monospace;font-size:10.5px;font-weight:600;text-anchor:middle}
    .pun{fill:#b45309;opacity:.7;font-family:monospace;font-size:8px;font-weight:600;text-anchor:middle}
    .unk .pbg{fill:#f4f6f8;stroke:#d7dde3}.unk .ptx{fill:#94a1af}.unk .pun{fill:#94a1af}`;
  const P = computePowers();
  let body = "", pillsBody = "";
  const ERS = [];
  for (const cn of conns) {
    const a = portPt(findBlock(cn.from.block), cn.from.port), z = portPt(findBlock(cn.to.block), cn.to.port);
    if (!a || !z) continue;
    ERS.push({ cn, R: route(a, z, cn) });
  }
  const esegs = [].concat(...ERS.map(r => r.R.segs || []));
  const erects = obstacleRects(0);
  const eNF = settings.showNF ? computeNoise(P) : null;
  for (const { cn, R } of ERS) {
    body += `<path class="wire" d="${R.d}" marker-end="url(#ea)"/>`;
    if (settings.showLabels === false || cn.hidePill) continue;
    const lv = P[key(cn.from.block, cn.from.port)];
    const nf = eNF ? nfDb(eNF[key(cn.from.block, cn.from.port)]) : undefined;
    const bs = pillCenter(R, lv, esegs, erects, nf), of = cn.labelOff || { dx: 0, dy: 0 };
    pillsBody += pill(bs.x + of.dx, bs.y + of.dy, lv, null, nf);
  }
  for (const b of blocks) {
    const c = COMP[b.type], f = footprint(b);
    body += `<g transform="translate(${b.x} ${b.y})" style="${blockStyle(b)}">`;
    if (c.isLabel) {
      body += `<text class="free-label" x="0" y="0" dominant-baseline="middle">${esc(b.params.text || "Label")}</text>`;
    } else {
      const tf = rotTransform(b);
      body += `<g${tf ? ` transform="${tf}"` : ""}>${c.sym(b.params)}</g>`;
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
      if (c.topLabel || c.lblPos === "top") {
        if (nm && v) {
          body += `<text class="lbl-name" x="${f.w / 2}" y="-22">${esc(nm)}</text>`;
          body += `<text class="lbl-val" x="${f.w / 2}" y="-10">${esc(v)}</text>`;
        } else if (nm) {
          body += `<text class="lbl-name" x="${f.w / 2}" y="-10">${esc(nm)}</text>`;
        } else if (v) {
          body += `<text class="lbl-val" x="${f.w / 2}" y="-10">${esc(v)}</text>`;
        }
      } else {
        if (nm) body += `<text class="lbl-name" x="${f.w / 2}" y="${f.h + 13}">${esc(nm)}</text>`;
        if (v) body += `<text class="lbl-val" x="${f.w / 2}" y="${f.h + (nm ? 25 : 13)}">${esc(v)}</text>`;
      }
    }
    body += `</g>`;
  }
  body += pillsBody;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * scale)}" height="${Math.round(H * scale)}" viewBox="${minx} ${miny} ${W} ${H}">`
    + `<defs><marker id="ea" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#3c4756"/></marker><style>${css}</style></defs>`
    + `<rect x="${minx}" y="${miny}" width="${W}" height="${H}" fill="#ffffff"/>${body}</svg>`;
}


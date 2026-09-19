"use strict";

/* Application State */
let blocks = [];                 // {id, type, x, y, rot, flip, params}
let conns = [];                  // {id, from:{block,port}, to:{block,port}}
let selected = new Set();        // selected block ids
let selConn = null;              // selected connection id
let view = { tx: 60, ty: 56, scale: 1 };

/* Multi-sheet state */
let sheets = [{ id: "s1", name: "Sheet 1", blocks: [], conns: [], view: { tx: 60, ty: 56, scale: 1 } }];
let cur = 0;

function commitSheet() {
  const sh = sheets[cur];
  if (!sh) return;
  sh.blocks = blocks;
  sh.conns = conns;
  sh.view = { ...view };
}

function adoptSheet(i) {
  cur = Math.max(0, Math.min(sheets.length - 1, i));
  const sh = sheets[cur];
  blocks = sh.blocks;
  conns = sh.conns;
  view = { ...(sh.view || { tx: 60, ty: 56, scale: 1 }) };
  clearSel();
}

function allBlocks() {
  commitSheet();
  return [].concat(...sheets.map(s => s.blocks));
}

function allConns() {
  commitSheet();
  return [].concat(...sheets.map(s => s.conns));
}

function withAllSheets(fn) {
  commitSheet();
  const sb = blocks, sc = conns, ab = allBlocks(), ac = allConns();
  blocks = ab; conns = ac;
  try {
    return fn();
  } finally {
    blocks = sb; conns = sc;
  }
}

function sheetOfBlock(id) {
  for (const sh of sheets) if (sh.blocks.some(b => b.id === id)) return sh;
  return null;
}

function newSheetId() {
  let n = 1;
  const used = new Set(sheets.map(s => s.id));
  while (used.has("s" + n)) n++;
  return "s" + n;
}

function newSheetName() {
  let n = sheets.length + 1;
  const used = new Set(sheets.map(s => s.name));
  while (used.has("Sheet " + n)) n++;
  return "Sheet " + n;
}

let settings = { ...DEFAULT_SETTINGS };
let typeColor = {};                                   // type -> hex

function colorKey(type, params) {
  const c = COMP[type];
  if (!c) return type;
  if (type !== "custom") return type;
  const p = params || c.params;
  return ["custom", (p.label || "").trim(), (p.text || "").trim(), p.shape || "", p.ins || "", p.outs || "", (p.path || "").trim()].join("\u0001");
}

function keyOfBlock(b) { return colorKey(b.type, b.params); }

function colorOf(k, type) {
  const t = type || k;
  if (typeColor[k]) return typeColor[k];
  if (typeof TYPE_TINT !== "undefined" && TYPE_TINT[t]) return TYPE_TINT[t];
  const c = COMP[t];
  return (c && GROUP_TINT[c.group]) || "#ffffff";
}

function blockFill(b) { return settings.color ? colorOf(keyOfBlock(b), b.type) : "#ffffff"; }

function lumOf(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

const TERMINAL_TYPES = new Set(["rfin", "rfout", "antenna", "termination", "detector"]);

function blockInk(fill, type) {
  if (type && TERMINAL_TYPES.has(type)) return "#f8fafc";
  return lumOf(fill) >= 0.55 ? "#0f172a" : "#f8fafc";
}

function blockStyle(b) {
  const fill = blockFill(b), ink = blockInk(fill, b ? b.type : null);
  if (b && TERMINAL_TYPES.has(b.type)) {
    return `--blk-fill:${fill};--blk-stroke:#f8fafc;--lbl-ink:#f8fafc`;
  }
  return `--blk-fill:${fill};--blk-stroke:${ink};--lbl-ink:${ink}`;
}

function colorLabel(b) {
  const c = COMP[b.type];
  if (b.type !== "custom") return `all ${c.name} blocks`;
  const nm = (b.params.label || b.params.text || "").trim();
  return nm ? `"${nm}" blocks` : "blocks like this one";
}

let spaceDown = false;

function clearSel() { selected = new Set(); selConn = null; }
function selectOnly(id) { selected = new Set([id]); selConn = null; }

/* History Undo / Redo */
let undoStack = [], redoStack = [];
const snapState = () => {
  if (typeof commitSheet === "function") commitSheet();
  return JSON.stringify({ sheets, cur, typeColor: (typeof typeColor === "object" ? typeColor : {}) });
};

function pushHistory() {
  undoStack.push(snapState());
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
  if (typeof markDirty === "function") markDirty();
}

function pushHistoryState(st) {
  if (st == null) return;
  undoStack.push(st);
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
}

function applyState(st) {
  const d = JSON.parse(st);
  if (d.typeColor) {
    typeColor = { ...d.typeColor };
    if (typeof renderPalette === "function") renderPalette();
  }
  if (d.sheets) {
    sheets = d.sheets;
    adoptSheet(d.cur || 0);
    applyView();
    renderSheets();
  } else {
    blocks = d.blocks;
    conns = d.conns;
  }
  selected = new Set();
  selConn = null;
  renderAll();
  if (typeof markDirty === "function") markDirty();
}

function undo() {
  if (!undoStack.length) { hint("Nothing to undo."); return; }
  redoStack.push(snapState());
  applyState(undoStack.pop());
  hint("Undo.");
}

function redo() {
  if (!redoStack.length) { hint("Nothing to redo."); return; }
  undoStack.push(snapState());
  applyState(redoStack.pop());
  hint("Redo.");
}

/* Clipboard (Copy / Paste) */
let clipboard = null;

function copySelection() {
  if (!selected.size) { hint("Select blocks first, then Ctrl+C."); return; }
  const ids = selected;
  clipboard = {
    n: 0,
    blocks: blocks.filter(b => ids.has(b.id)).map(b => JSON.parse(JSON.stringify(b))),
    conns: conns.filter(c => ids.has(c.from.block) && ids.has(c.to.block)).map(c => JSON.parse(JSON.stringify(c)))
  };
  clipboard.sig = JSON.stringify({ app: "rfbd-clip", v: 1, blocks: clipboard.blocks, conns: clipboard.conns });
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(clipboard.sig).catch(() => {});
    }
  } catch (e) {}
  hint(`Copied ${clipboard.blocks.length} block${clipboard.blocks.length !== 1 ? "s" : ""}. Paste here or in another tab.`);
}

function parseClip(t) {
  if (!t || typeof t !== "string" || t.length > 2000000) return null;
  try {
    const d = JSON.parse(t);
    if (d && d.app === "rfbd-clip" && Array.isArray(d.blocks) && d.blocks.length) return d;
  } catch (e) {}
  return null;
}

function pasteFromText(t) {
  const d = parseClip(t);
  if (!d) return false;
  if (clipboard && clipboard.sig === t) { pasteClipboard(); return true; }
  const bl = d.blocks.filter(b => b && COMP[b.type]).map(b => ({
    id: String(b.id || uid(b.type)),
    type: b.type,
    x: +b.x || 0,
    y: +b.y || 0,
    rot: ((+b.rot || 0) % 360 + 360) % 360,
    flip: !!b.flip,
    params: (b.params && typeof b.params === "object") ? JSON.parse(JSON.stringify(b.params)) : JSON.parse(JSON.stringify(COMP[b.type].params))
  }));
  if (!bl.length) return false;
  const ids = new Set(bl.map(b => b.id));
  const cs = (Array.isArray(d.conns) ? d.conns : []).filter(c => c && c.from && c.to && ids.has(c.from.block) && ids.has(c.to.block))
    .map(c => ({
      id: String(c.id || uid("c")),
      from: { block: String(c.from.block), port: String(c.from.port) },
      to: { block: String(c.to.block), port: String(c.to.port) },
      ...(typeof c.jog === "number" && isFinite(c.jog) ? { jog: c.jog } : {}),
      ...(c.labelOff && isFinite(c.labelOff.dx) && isFinite(c.labelOff.dy) ? { labelOff: { dx: +c.labelOff.dx, dy: +c.labelOff.dy } } : {}),
      ...(c.hidePill ? { hidePill: true } : {})
    }));
  clipboard = { n: 0, sig: t, blocks: bl, conns: cs };
  pasteClipboard();
  return true;
}

function pasteClipboard() {
  if (!clipboard || !clipboard.blocks.length) { hint("Nothing to paste. Copy blocks with Ctrl+C first."); return; }
  pushHistory();
  const off = 20 * (++clipboard.n);
  const map = {}, news = [];
  const fresh = [];
  for (const ob of clipboard.blocks) {
    const nb = JSON.parse(JSON.stringify(ob));
    nb.id = uid(ob.type);
    nb.x = snap(ob.x + off);
    nb.y = snap(ob.y + off);
    map[ob.id] = nb.id;
    blocks.push(nb);
    news.push(nb.id);
    fresh.push(nb);
  }
  commitSheet();
  if (typeof detachSubsystems === "function") detachSubsystems(fresh, map, 0);
  for (const oc of clipboard.conns) {
    const nc = { id: uid("c"), from: { block: map[oc.from.block], port: oc.from.port }, to: { block: map[oc.to.block], port: oc.to.port } };
    if (oc.jog != null) nc.jog = oc.jog + off;
    if (oc.labelOff) nc.labelOff = { ...oc.labelOff };
    if (oc.hidePill) nc.hidePill = true;
    conns.push(nc);
  }
  selected = new Set(news);
  selConn = null;
  renderAll();
  if (typeof renderSheets === "function") renderSheets();
  const secs = fresh.filter(b => COMP[b.type] && COMP[b.type].isSubsystem && b.params.sheet).length;
  hint(`Pasted ${news.length} block${news.length !== 1 ? "s" : ""}${secs ? ` — ${secs} section${secs !== 1 ? "s" : "" } got their own page` : ""}.`);
}


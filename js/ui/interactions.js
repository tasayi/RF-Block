"use strict";

/* Canvas Operations & Interaction Handlers */
function addBlock(type, wx, wy) {
  pushHistory();
  const c = COMP[type];
  const params = JSON.parse(JSON.stringify(c.params));
  const f = c.isLabel ? { w: 120, h: 22 } : dims(c, params);
  const b = { id: uid(type), type, x: snap(wx - f.w / 2), y: snap(wy - f.h / 2), rot: 0, flip: false, params };
  if (c.isLabel) b.y = snap(wy);
  blocks.push(b);
  selectOnly(b.id);
  renderAll();
  hint(`Added ${c.name}.`);
  return b;
}

function deleteSelection() {
  if (selConn) {
    pushHistory();
    conns = conns.filter(c => c.id !== selConn);
    selConn = null;
    renderAll();
    return;
  }
  if (selected.size) {
    pushHistory();
    const ids = selected;
    blocks = blocks.filter(b => !ids.has(b.id));
    conns = conns.filter(c => !ids.has(c.from.block) && !ids.has(c.to.block));
    selected = new Set();
    renderAll();
  }
}

function rotateSelection() {
  const ids = [...selected].filter(id => { const b = findBlock(id); return b && !COMP[b.type].isLabel; });
  if (!ids.length) { hint("Select a block first, then press R to rotate."); return; }
  pushHistory();
  let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
  for (const id of ids) { const b = findBlock(id), f = footprint(b); x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + f.w); y2 = Math.max(y2, b.y + f.h); }
  const gx = (x1 + x2) / 2, gy = (y1 + y2) / 2, multi = ids.length > 1;
  for (const id of ids) {
    const b = findBlock(id); const before = footprint(b);
    const cx = b.x + before.w / 2, cy = b.y + before.h / 2;
    b.rot = ((b.rot || 0) + (b.flip ? 270 : 90)) % 360;
    const after = footprint(b);
    const ncx = multi ? gx - (cy - gy) : cx, ncy = multi ? gy + (cx - gx) : cy;
    b.x = snap(ncx - after.w / 2); b.y = snap(ncy - after.h / 2);
  }
  renderAll();
  hint("Rotated 90°.");
}

function mirrorSelection() {
  const ids = [...selected].filter(id => { const b = findBlock(id); return b && !COMP[b.type].isLabel; });
  if (!ids.length) { hint("Select a block first, then press M to mirror."); return; }
  pushHistory();
  let x1 = 1e9, x2 = -1e9;
  for (const id of ids) { const b = findBlock(id), f = footprint(b); x1 = Math.min(x1, b.x); x2 = Math.max(x2, b.x + f.w); }
  const gx = (x1 + x2) / 2, multi = ids.length > 1;
  for (const id of ids) {
    const b = findBlock(id); b.flip = !b.flip;
    if (multi) { const f = footprint(b); b.x = snap(2 * gx - b.x - f.w); }
  }
  renderAll();
  hint("Mirrored.");
}

function duplicateSelection() {
  const ids = [...selected]; if (!ids.length) return;
  pushHistory();
  const map = {}, news = [];
  const fresh = [];
  for (const id of ids) {
    const b = findBlock(id); if (!b) continue;
    const nb = { ...b, id: uid(b.type), x: b.x + 20, y: b.y + 20, params: JSON.parse(JSON.stringify(b.params)) };
    blocks.push(nb); map[id] = nb.id; news.push(nb.id); fresh.push(nb);
  }
  commitSheet();
  if (typeof detachSubsystems === "function") detachSubsystems(fresh, map, 0);
  for (const c of conns.slice()) {
    if (!(map[c.from.block] && map[c.to.block])) continue;
    const nc = { id: uid("c"), from: { block: map[c.from.block], port: c.from.port }, to: { block: map[c.to.block], port: c.to.port } };
    if (c.jog != null) nc.jog = c.jog + 20; if (c.labelOff) nc.labelOff = { ...c.labelOff }; if (c.hidePill) nc.hidePill = true;
    conns.push(nc);
  }
  selected = new Set(news); selConn = null; renderAll(); renderSheets();
  const secs = fresh.filter(b => COMP[b.type] && COMP[b.type].isSubsystem && b.params.sheet).length;
  hint(`Duplicated ${news.length} block${news.length !== 1 ? "s" : ""}${secs ? ` — ${secs} section${secs !== 1 ? "s" : ""} got their own page` : ""}.`);
}

function selectAll() { selected = new Set(blocks.map(b => b.id)); selConn = null; renderAll(); hint(`${selected.size} selected.`); }

function addConn(from, to) {
  const ka = portKind(from), kb = portKind(to);
  const aOut = ka === "out" || ka === "inout", bOut = kb === "out" || kb === "inout";
  const aIn = ka === "in" || ka === "inout", bIn = kb === "in" || kb === "inout";
  let f, t;
  if (aOut && bIn) { f = from; t = to; } else if (bOut && aIn) { f = to; t = from; } else return false;
  if (f.block === t.block) return false;
  if (conns.some(c => c.from.block === f.block && c.from.port === f.port && c.to.block === t.block && c.to.port === t.port)) return false;
  conns.push({ id: uid("c"), from: { block: f.block, port: f.port }, to: { block: t.block, port: t.port } });
  clearSel(); renderAll(); hint("Wired."); return true;
}

function portKind(pr) { const b = findBlock(pr.block); if (!b) return null; const p = getPorts(b).find(p => p.id === pr.port); return p ? p.kind : null; }

function alignSelection(mode) {
  const ids = [...selected].filter(id => findBlock(id));
  if (ids.length < 2) { hint("Select two or more blocks to align."); return; }
  pushHistory();
  const bs = ids.map(id => ({ b: findBlock(id), f: footprint(findBlock(id)) }));
  if (mode === "left") { const v = Math.min(...bs.map(o => o.b.x)); bs.forEach(o => o.b.x = snap(v)); }
  else if (mode === "right") { const v = Math.max(...bs.map(o => o.b.x + o.f.w)); bs.forEach(o => o.b.x = snap(v - o.f.w)); }
  else if (mode === "top") { const v = Math.min(...bs.map(o => o.b.y)); bs.forEach(o => o.b.y = snap(v)); }
  else if (mode === "bottom") { const v = Math.max(...bs.map(o => o.b.y + o.f.h)); bs.forEach(o => o.b.y = snap(v - o.f.h)); }
  else if (mode === "cy") { const v = bs.reduce((a, o) => a + o.b.y + o.f.h / 2, 0) / bs.length; bs.forEach(o => o.b.y = snap(v - o.f.h / 2)); }
  else if (mode === "cx") { const v = bs.reduce((a, o) => a + o.b.x + o.f.w / 2, 0) / bs.length; bs.forEach(o => o.b.x = snap(v - o.f.w / 2)); }
  else if (mode === "dx" || mode === "dy") {
    if (bs.length < 3) { hint("Select three or more blocks to distribute."); return; }
    const hz = mode === "dx";
    bs.sort((p, q) => hz ? (p.b.x - q.b.x) : (p.b.y - q.b.y));
    const first = bs[0], last = bs[bs.length - 1];
    const a = hz ? first.b.x + first.f.w / 2 : first.b.y + first.f.h / 2;
    const z = hz ? last.b.x + last.f.w / 2 : last.b.y + last.f.h / 2;
    const raw = (z - a) / (bs.length - 1), g = settings.gridSize;
    const step = Math.max(g, Math.round(raw / g) * g);
    bs.forEach((o, i) => { const c = a + step * i; if (hz) o.b.x = snap(c - o.f.w / 2); else o.b.y = snap(c - o.f.h / 2); });
  }
  renderAll(); hint("Aligned.");
}

/* Pointer drag state machine */
let drag = null;

function attachDrag() { window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp); }

function onMove(e) {
  if (!drag) return;
  if (drag.mode === "pan") {
    view.tx = drag.tx0 + (e.clientX - drag.sx); view.ty = drag.ty0 + (e.clientY - drag.sy);
    if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 3) drag.moved = true;
    applyView(); return;
  }
  if (drag.mode === "nodedrag") {
    const w = screenToWorld(e.clientX, e.clientY);
    const cn = conns.find(c => c.id === drag.conn);
    if (!cn || !cn.waypoints || drag.index == null) return;
    const wx = settings.snap ? snap(w.x) : w.x;
    const wy = settings.snap ? snap(w.y) : w.y;
    cn.waypoints[drag.index] = { x: wx, y: wy };
    drag.moved = true;
    renderCanvas(); return;
  }
  if (drag.mode === "move") {
    const w = screenToWorld(e.clientX, e.clientY);
    let dx = w.x - drag.sx, dy = w.y - drag.sy;
    if (settings.snap) { dx = Math.round(dx / settings.gridSize) * settings.gridSize; dy = Math.round(dy / settings.gridSize) * settings.gridSize; }
    for (const it of drag.items) { const b = findBlock(it.id); b.x = it.ox + dx; b.y = it.oy + dy; }
    for (const j of (drag.jogs || [])) {
      if (j.axis === null) continue;
      if (j.both) j.c.jog = j.jog + (j.axis === "x" ? dx : dy);
      else if (j.c.jog != null) delete j.c.jog;
    }
    if (Math.abs(w.x - drag.sx) + Math.abs(w.y - drag.sy) > 3) drag.moved = true;
    if (drag.items.length === 1) { const b = findBlock(drag.items[0].id); const g = alignGuides(b, b.x, b.y); b.x = g.x; b.y = g.y; overlay.innerHTML = g.svg; } else overlay.innerHTML = "";
    renderCanvas(); markSelectionOnly(); return;
  }
  if (drag.mode === "wire") {
    const w = screenToWorld(e.clientX, e.clientY);
    const pp = portPt(findBlock(drag.from.block), drag.from.port);
    overlay.innerHTML = `<path class="rubber" d="M${pp.x} ${pp.y}L${w.x} ${w.y}"/>`;
    clearTgt();
    const tb = blockUnder(e.clientX, e.clientY);
    if (tb && tb !== drag.from.block) { const np = nearestPort(tb, w, drag.need); if (np) { const el = portElem({ block: tb, port: np }); if (el) el.classList.add("tgt-ok"); } }
    return;
  }
  if (drag.mode === "label") {
    const w = screenToWorld(e.clientX, e.clientY); const cn = conns.find(c => c.id === drag.conn); if (!cn) return;
    cn.labelOff = { dx: (w.x - drag.grabx) - drag.base.x, dy: (w.y - drag.graby) - drag.base.y };
    if (Math.abs(w.x - drag.base.x) + Math.abs(w.y - drag.base.y) > 3) drag.moved = true;
    renderCanvas(); return;
  }
  if (drag.mode === "wiredrag") {
    const w = screenToWorld(e.clientX, e.clientY); const cn = conns.find(c => c.id === drag.conn); if (!cn) return;
    const a = portPt(findBlock(cn.from.block), cn.from.port), z = portPt(findBlock(cn.to.block), cn.to.port); if (!a || !z) return;
    const R = route(a, z, cn);
    if (R.jogAxis === "x") { cn.jog = Math.round(w.x / settings.gridSize) * settings.gridSize; drag.moved = true; }
    else if (R.jogAxis === "y") { cn.jog = Math.round(w.y / settings.gridSize) * settings.gridSize; drag.moved = true; }
    renderCanvas(); return;
  }
  if (drag.mode === "marquee") {
    const w = screenToWorld(e.clientX, e.clientY); drag.cur = w;
    const x = Math.min(drag.sx, w.x), y = Math.min(drag.sy, w.y), ww = Math.abs(w.x - drag.sx), hh = Math.abs(w.y - drag.sy);
    if (ww + hh > 3) drag.moved = true;
    overlay.innerHTML = `<rect class="marquee" x="${x}" y="${y}" width="${ww}" height="${hh}"/>`;
    return;
  }
}

function onUp(e) {
  window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp);
  svg.classList.remove("panning", "connecting");
  if (!drag) return;
  if (drag.mode === "pan") {
    if (!drag.moved) { clearSel(); renderAll(); }
  }
  if (drag.mode === "nodedrag") {
    if (drag.moved) { pushHistoryState(drag.pre); hint("Waypoint moved."); }
  }
  if (drag.mode === "move") {
    overlay.innerHTML = "";
    if (!drag.moved && drag.reduce) { selectOnly(drag.clickId); renderAll(); }
    else if (drag.moved) { pushHistoryState(drag.pre); hint("Moved."); }
  }
  if (drag.mode === "wire") {
    overlay.innerHTML = ""; clearTgt();
    const tb = blockUnder(e.clientX, e.clientY);
    if (tb && tb !== drag.from.block) {
      const w = screenToWorld(e.clientX, e.clientY); let np = nearestPort(tb, w, drag.need);
      if (!np) {
        const blk = findBlock(tb);
        if (blk && COMP[blk.type].isInterconnect) { blk.params.role = drag.need.includes("in") ? "send" : "receive"; np = nearestPort(tb, w, drag.need); }
      }
      if (np) { if (addConn(drag.from, { block: tb, port: np })) pushHistoryState(drag.pre); else hint("Those ports can't be joined."); }
      else hint("That block has no matching " + (drag.need.includes("in") ? "input" : "output") + ".");
    } else renderAll();
  }
  if (drag.mode === "marquee") {
    overlay.innerHTML = "";
    if (!drag.moved) { clearSel(); renderAll(); }
    else {
      const x = Math.min(drag.sx, drag.cur.x), y = Math.min(drag.sy, drag.cur.y), ww = Math.abs(drag.cur.x - drag.sx), hh = Math.abs(drag.cur.y - drag.sy);
      selected = new Set(); selConn = null;
      for (const b of blocks) { const bb = bboxOf(b); if (bb.x < x + ww && bb.x + bb.w > x && bb.y < y + hh && bb.y + bb.h > y) selected.add(b.id); }
      renderAll(); hint(selected.size ? `${selected.size} selected.` : "Empty selection.");
    }
  }
  if (drag.mode === "label") {
    const cn = conns.find(c => c.id === drag.conn);
    if (cn && cn.labelOff && Math.hypot(cn.labelOff.dx, cn.labelOff.dy) < 10) { delete cn.labelOff; pushHistoryState(drag.pre); renderCanvas(); hint("Label reset to default."); }
    else if (drag.moved) { pushHistoryState(drag.pre); hint("Label moved. Drop it near the wire to reset."); }
  }
  if (drag.mode === "wiredrag") { if (drag.moved) { pushHistoryState(drag.pre); hint("Wire re-routed. Double-click it to straighten."); } }
  drag = null;
}

function allWireSegs() {
  const out = [];
  for (const cn of conns) {
    const a = portPt(findBlock(cn.from.block), cn.from.port), z = portPt(findBlock(cn.to.block), cn.to.port);
    if (!a || !z) continue;
    const R = route(a, z, cn);
    if (R.segs) out.push(...R.segs);
  }
  return out;
}

function connBase(cid) {
  const cn = conns.find(c => c.id === cid); if (!cn) return { x: 0, y: 0 };
  const a = portPt(findBlock(cn.from.block), cn.from.port), z = portPt(findBlock(cn.to.block), cn.to.port); if (!a || !z) return { x: 0, y: 0 };
  const P = computePowers(), R = route(a, z, cn);
  const nf = settings.showNF ? nfDb(computeNoise(P)[key(cn.from.block, cn.from.port)]) : undefined;
  return pillCenter(R, P[key(cn.from.block, cn.from.port)], allWireSegs(), obstacleRects(0), nf);
}

function pillTip(cid) { const cn = conns.find(c => c.id === cid); const b = connBase(cid); const o = (cn && cn.labelOff) || { dx: 0, dy: 0 }; return { x: b.x + o.dx, y: b.y + o.dy }; }

function blockUnder(cx, cy) { const el = document.elementFromPoint(cx, cy); if (!el || !el.closest) return null; const g = el.closest(".block"); return g ? g.getAttribute("data-block") : null; }

function nearestPort(blockId, wpt, kinds) {
  const b = findBlock(blockId); if (!b) return null; let best = null, bd = Infinity;
  for (const p of getPorts(b)) { if (!kinds.includes(p.kind)) continue; const dx = (b.x + p.dx) - wpt.x, dy = (b.y + p.dy) - wpt.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = p.id; } } return best;
}

function portElem(pr) { return svg.querySelector(`.port[data-block="${pr.block}"][data-port="${pr.port}"]`); }
function clearTgt() { svg.querySelectorAll(".port.tgt-ok").forEach(el => el.classList.remove("tgt-ok")); }

function markSelectionOnly() {
  svg.querySelectorAll(".block.sel").forEach(el => el.classList.remove("sel"));
  for (const id of selected) { const el = svg.querySelector(`.block[data-block="${id}"]`); if (el) el.classList.add("sel"); }
}

function alignGuides(b, nx, ny) {
  const { w, h } = footprint(b); const cx = nx + w / 2, cy = ny + h / 2, tol = 7; let gx = nx, gy = ny, lines = "";
  for (const o of blocks) {
    if (o.id === b.id) continue; const s = footprint(o); const ocx = o.x + s.w / 2, ocy = o.y + s.h / 2;
    if (Math.abs(cy - ocy) <= tol) { gy = Math.round(ocy - h / 2); lines += `<path class="guide" d="M-4000 ${ocy}H5000"/>`; }
    if (Math.abs(cx - ocx) <= tol) { gx = Math.round(ocx - w / 2); lines += `<path class="guide" d="M${ocx} -4000V5000"/>`; }
  }
  return { x: gx, y: gy, svg: lines };
}

function zoomAt(f) {
  const ns = clamp(view.scale * f, 0.3, 3); const r = svg.getBoundingClientRect(), cx = r.width / 2, cy = r.height / 2;
  view.tx = cx - (cx - view.tx) * (ns / view.scale); view.ty = cy - (cy - view.ty) * (ns / view.scale); view.scale = ns; applyView();
}


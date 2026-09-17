"use strict";

/* Subsystem Hierarchy & Multi-Sheet Operations */
function sheetById(id) { return sheets.find(sh => sh.id === id) || null; }

function childSheetOf(b) { return b && b.params.sheet ? sheetById(b.params.sheet) : null; }

function ensureChildSheet(b) {
  let sh = childSheetOf(b);
  if (!sh) {
    sh = {
      id: newSheetId(), name: (b.params.label || "Section"), blocks: [], conns: [],
      view: { tx: 60, ty: 56, scale: 1 }, parent: b.id
    };
    sheets.push(sh);
    b.params.sheet = sh.id;
  }
  sh.parent = b.id;

  const want = getPorts(b);
  const have = new Set(sh.blocks.filter(x => COMP[x.type].isInterconnect).map(x => (x.params.tag || "")));
  const usedIn = new Set(), usedOut = new Set();

  for (const x of sh.blocks)
    if (COMP[x.type].isInterconnect && isSubTag(x.params.tag || ""))
      (icRecv(x.params) ? usedIn : usedOut).add(x.y);

  const freeRow = set => { let y = 80; while (set.has(y)) y += 80; set.add(y); return y; };

  for (const pt of want) {
    const tag = subTag(b.id, pt.id);
    if (have.has(tag)) continue;
    const inbound = pt.kind === "in";
    sh.blocks.push({
      id: uid("interconnect"), type: "interconnect",
      x: inbound ? 60 : 480, y: freeRow(inbound ? usedIn : usedOut), rot: 0, flip: false,
      params: { label: "", tag, role: inbound ? "receive" : "send" }
    });
  }

  const live = new Set(want.map(pt => subTag(b.id, pt.id)));
  const gone = sh.blocks.filter(x => COMP[x.type].isInterconnect && isSubTag(x.params.tag || "") && !live.has(x.params.tag));
  if (gone.length) {
    const ids = new Set(gone.map(x => x.id));
    for (let i = sh.blocks.length - 1; i >= 0; i--) if (ids.has(sh.blocks[i].id)) sh.blocks.splice(i, 1);
    for (let i = sh.conns.length - 1; i >= 0; i--) {
      const c = sh.conns[i];
      if (ids.has(c.from.block) || ids.has(c.to.block)) sh.conns.splice(i, 1);
    }
  }
  return sh;
}

function detachSubsystems(newBlocks, idMap, depth) {
  if ((depth || 0) > 8) return;
  for (const nb of newBlocks) {
    const c = COMP[nb.type];
    if (!c || !c.isSubsystem) continue;
    const srcId = nb.params.sheet, src = srcId ? sheetById(srcId) : null;
    if (!src) { nb.params.sheet = ""; continue; }
    const sh = {
      id: newSheetId(), name: (nb.params.label || src.name || "Section"),
      blocks: [], conns: [], view: { ...(src.view || { tx: 60, ty: 56, scale: 1 }) }, parent: nb.id
    };
    const bmap = {};
    for (const ob of src.blocks) {
      const cp = JSON.parse(JSON.stringify(ob));
      cp.id = uid(ob.type);
      bmap[ob.id] = cp.id;
      const oc = COMP[ob.type];
      if (oc && oc.isInterconnect && isSubTag(ob.params.tag || ""))
        cp.params.tag = subTag(nb.id, subTagPort(ob.params.tag));
      sh.blocks.push(cp);
    }
    for (const cc of src.conns) {
      if (!bmap[cc.from.block] || !bmap[cc.to.block]) continue;
      const nc = JSON.parse(JSON.stringify(cc));
      nc.id = uid("c");
      nc.from = { block: bmap[cc.from.block], port: cc.from.port };
      nc.to = { block: bmap[cc.to.block], port: cc.to.port };
      sh.conns.push(nc);
    }
    sheets.push(sh);
    nb.params.sheet = sh.id;
    const nested = sh.blocks.filter(x => COMP[x.type] && COMP[x.type].isSubsystem);
    if (nested.length) detachSubsystems(nested, bmap, (depth || 0) + 1);
  }
}

function syncSubsystemNames() {
  for (const b of allBlocks()) {
    const c = COMP[b.type];
    if (!c || !c.isSubsystem) continue;
    const sh = b.params.sheet ? sheetById(b.params.sheet) : null;
    if (!sh) continue;
    const want = (b.params.label || "Section").trim();
    if (want && sh.name !== want) { sh.name = want; sheetBarDirty = true; }
  }
}

function openSubsystem(b) {
  if (!b || !COMP[b.type].isSubsystem) return;
  pushHistory();
  commitSheet();
  const sh = ensureChildSheet(b);
  gotoSheet(sheets.indexOf(sh));
  hint(`Inside "${b.params.label || "Section"}" — the tab bar shows where you are.`);
}

function goToParent() {
  const sh = sheets[cur];
  if (!sh || !sh.parent) { hint("This sheet is not inside a subsystem."); return; }
  const pb = allBlocks().find(x => x.id === sh.parent);
  const psh = pb ? sheetOfBlock(pb.id) : null;
  if (!psh) { hint("The parent block no longer exists."); return; }
  gotoSheet(sheets.indexOf(psh));
  if (pb) { selectOnly(pb.id); renderAll(); }
}

function groupIntoSubsystem() {
  const ids = [...selected].filter(id => findBlock(id));
  if (ids.length < 2) { hint("Select two or more blocks to fold into a section."); return; }
  const inside = new Set(ids);
  const name = (prompt("Name for the section:", "SECTION") || "").trim();
  if (!name) { hint("Cancelled."); return; }
  pushHistory();
  commitSheet();

  const bs = ids.map(findBlock);
  const minX = Math.min(...bs.map(b => b.x)), minY = Math.min(...bs.map(b => b.y));
  const maxX = Math.max(...bs.map(b => b.x + footprint(b).w)), maxY = Math.max(...bs.map(b => b.y + footprint(b).h));

  const incoming = conns.filter(c => !inside.has(c.from.block) && inside.has(c.to.block));
  const outgoing = conns.filter(c => inside.has(c.from.block) && !inside.has(c.to.block));
  const nIn = Math.max(1, Math.min(6, incoming.length)), nOut = Math.max(1, Math.min(6, outgoing.length));

  const sub = {
    id: uid("subsystem"), type: "subsystem", rot: 0, flip: false,
    x: snap((minX + maxX) / 2 - 60), y: snap((minY + maxY) / 2 - 40),
    params: { label: name, ins: String(nIn), outs: String(nOut), sheet: "" }
  };

  const inner = bs.map(b => b), innerIds = new Set(inner.map(b => b.id));
  const innerConns = conns.filter(c => innerIds.has(c.from.block) && innerIds.has(c.to.block));
  const dx = snap(120 - minX), dy = snap(120 - minY);
  for (const b of inner) { b.x = snap(b.x + dx); b.y = snap(b.y + dy); }
  const child = { id: newSheetId(), name, blocks: inner, conns: innerConns, view: { tx: 60, ty: 56, scale: 1 }, parent: sub.id };
  sheets.push(child);
  sub.params.sheet = child.id;

  blocks = blocks.filter(b => !innerIds.has(b.id));
  conns = conns.filter(c => !innerIds.has(c.from.block) && !innerIds.has(c.to.block));
  blocks.push(sub);

  const subPorts = getPorts(sub);
  const inPorts = subPorts.filter(p => p.kind === "in"), outPorts = subPorts.filter(p => p.kind === "out");
  const place = (kind, i) => ({ x: kind === "in" ? 60 : 520, y: 80 + i * 80 });

  incoming.slice(0, nIn).forEach((c, i) => {
    const pt = inPorts[i]; if (!pt) return;
    conns.push({ id: uid("c"), from: { block: c.from.block, port: c.from.port }, to: { block: sub.id, port: pt.id } });
    const pos = place("in", i);
    const ic = {
      id: uid("interconnect"), type: "interconnect", x: pos.x, y: pos.y, rot: 0, flip: false,
      params: { label: "", tag: subTag(sub.id, pt.id), role: "receive" }
    };
    child.blocks.push(ic);
    child.conns.push({ id: uid("c"), from: { block: ic.id, port: "p" }, to: { block: c.to.block, port: c.to.port } });
  });

  outgoing.slice(0, nOut).forEach((c, i) => {
    const pt = outPorts[i]; if (!pt) return;
    conns.push({ id: uid("c"), from: { block: sub.id, port: pt.id }, to: { block: c.to.block, port: c.to.port } });
    const pos = place("out", i);
    const ic = {
      id: uid("interconnect"), type: "interconnect", x: pos.x, y: pos.y, rot: 0, flip: false,
      params: { label: "", tag: subTag(sub.id, pt.id), role: "send" }
    };
    child.blocks.push(ic);
    child.conns.push({ id: uid("c"), from: { block: c.from.block, port: c.from.port }, to: { block: ic.id, port: "p" } });
  });

  selectOnly(sub.id);
  commitSheet();
  renderAll();
  renderSheets();
  hint(`Folded ${ids.length} blocks into "${name}". Double-click it to look inside.`);
}


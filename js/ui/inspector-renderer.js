"use strict";

/* Property Inspector UI Renderer */
function renderInspector() {
  const box = $("inspBody");
  if (!box) return;

  if (selConn) {
    const cn = conns.find(c => c.id === selConn);
    if (!cn) { selConn = null; return renderInspector(); }
    const P = computePowers(), lvl = P[key(cn.from.block, cn.from.port)];
    const nfv = nfDb(computeNoise(P)[key(cn.from.block, cn.from.port)]);
    const fb = findBlock(cn.from.block), tb = findBlock(cn.to.block);
    box.innerHTML = `<div class="insp-title"><span class="chip">Link</span><h3>Connection</h3></div>
      <div class="readout"><div class="r big"><span>Level on wire</span><span>${esc(dbm(lvl))}</span></div>
        <div class="r"><span>Cascade NF</span><span>${nfv === undefined ? "\u2014" : esc(fmt(nfv) + " dB")}</span></div>
        <div class="r"><span>From</span><span>${esc((fb && fb.params.label) || (fb && COMP[fb.type].name) || "?")}·${esc(cn.from.port)}</span></div>
        <div class="r"><span>To</span><span>${esc((tb && tb.params.label) || (tb && COMP[tb.type].name) || "?")}·${esc(cn.to.port)}</span></div></div>
      <label class="insp-check"><input type="checkbox" id="ibPill"${cn.hidePill ? "" : " checked"}/> Show the dBm label on this wire</label>
      <button class="btn btn-del" id="ibDelC">Delete connection</button>`;
    const ibP = $("ibPill");
    if (ibP) ibP.onchange = e => {
      pushHistory();
      if (e.target.checked) delete cn.hidePill; else cn.hidePill = true;
      renderCanvas();
      hint(cn.hidePill ? "Label hidden on this wire." : "Label shown.");
    };
    const ibD = $("ibDelC");
    if (ibD) ibD.onclick = () => { pushHistory(); conns = conns.filter(c => c.id !== cn.id); selConn = null; renderAll(); };
    return;
  }

  if (selected.size > 1) {
    box.innerHTML = `<div class="insp-title"><span class="chip">Multi</span><h3>${selected.size} blocks</h3></div>
      <div class="insp-note" style="margin-bottom:12px">Move them together by dragging any one. Rotate or delete the whole set below.</div>
      <button class="btn ins-btn" id="ibRot">⟳ Rotate 90° &nbsp;(R)</button>
      <button class="btn btn-del" id="ibDel">Delete ${selected.size} blocks</button>`;
    const ibR = $("ibRot"), ibD = $("ibDel");
    if (ibR) ibR.onclick = rotateSelection;
    if (ibD) ibD.onclick = deleteSelection;
    return;
  }

  if (selected.size === 0) { box.innerHTML = emptyInspector(); return; }

  const b = findBlock([...selected][0]);
  if (!b) { clearSel(); return renderInspector(); }
  const c = COMP[b.type];
  const P = computePowers();
  let h = `<div class="insp-title"><span class="chip">${esc(c.group.split(" ")[0])}</span><h3>${esc(c.name)}</h3></div>`;
  const outs = getPorts(b).filter(p => p.kind === "out" || p.kind === "inout").map(p => ({ p, v: P[key(b.id, p.id)] }));

  if (!c.isLabel) {
    h += `<div class="readout">`;
    if (c.isSource && c.isSource(b.params)) h += `<div class="r big"><span>Output level</span><span>${esc(dbm(P[key(b.id, srcPorts(c, b.params)[0])]))}</span></div>`;
    else if (outs.length) {
      if (outs.length === 1) h += `<div class="r big"><span>Output level</span><span>${esc(dbm(outs[0].v))}</span></div>`;
      else outs.forEach(o => h += `<div class="r"><span>Out · ${esc(o.p.id)}</span><span>${esc(dbm(o.v))}</span></div>`);
    }
    else h += `<div class="r"><span>Type</span><span>terminal</span></div>`;
    h += `</div>`;
  }

  if (!c.isLabel && !c.isInterconnect) h += field({ key: "label", label: "Name / label", type: "text" }, b.params.label);
  if (!c.isLabel && !c.isInterconnect && !c.isSubsystem)
    h += field({ key: "mpn", label: "Part number (for the BOM)", type: "text" }, b.params.mpn || "");

  for (const f of (c.fields || [])) {
    if (f.showIf && !f.showIf(b.params)) continue;
    h += field(f, b.params[f.key], b.params);
  }

  if (!c.isLabel) h += `<button class="btn ins-btn" id="ibRot1">⟳ Rotate 90° &nbsp;(R)</button>`;
  h += `<button class="btn btn-del" id="ibDel1">Delete block</button>`;
  box.innerHTML = h;

  box.querySelectorAll("[data-fkey]").forEach(inp => {
    const k = inp.getAttribute("data-fkey"), isNum = inp.getAttribute("data-num") === "1";
    if (inp.tagName === "SELECT") {
      inp.addEventListener("change", () => { pushHistory(); b.params[k] = inp.value; renderAll(); });
    } else {
      const fdef = (c.fields || []).find(x => x.key === k);
      inp.addEventListener("focus", pushHistory);
      inp.addEventListener("input", () => {
        let v = inp.value;
        if (isNum) { v = parseFloat(v); if (isNaN(v)) v = 0; }
        else if (fdef && fdef.max && v.length > fdef.max) { v = v.slice(0, fdef.max); inp.value = v; }
        b.params[k] = v;
        renderCanvas();
        if (isNum) refreshReadouts(b);
      });
    }
  });

  const rb = $("ibRot1"), db = $("ibDel1");
  if (rb) rb.onclick = rotateSelection;
  if (db) db.onclick = deleteSelection;
}

function field(f, val, params) {
  const isNum = f.type !== "text" && f.type !== "select";
  let inner;
  if (f.type === "select") {
    const opts = (typeof f.options === "function") ? f.options(params || {}) : f.options;
    inner = `<select data-fkey="${f.key}">${opts.map(o => {
      const v = (o && o.value !== undefined) ? o.value : o, t = (o && o.label !== undefined) ? o.label : o;
      return `<option value="${esc(v)}"${String(v) === String(val) ? " selected" : ""}>${esc(t)}</option>`;
    }).join("")}</select>`;
  } else if (f.type === "text") {
    inner = `<input data-fkey="${f.key}" type="text"${f.max ? ` maxlength="${f.max}"` : ""} value="${esc(val == null ? "" : val)}"/>`;
  } else {
    inner = `<input data-fkey="${f.key}" data-num="1" type="number" step="${f.step || 1}"${f.min != null ? ` min="${f.min}"` : ""} value="${val == null ? 0 : val}"/>`;
  }
  const lbl = (typeof f.label === "function") ? f.label(params || {}) : f.label;
  return `<div class="field"><label>${esc(lbl)}</label><div class="inrow">${inner}${f.unit ? `<span class="unit">${esc(f.unit)}</span>` : ""}</div></div>`;
}

function refreshReadouts(b) {
  const box = $("inspBody"), c = COMP[b.type], P = computePowers();
  const ro = box ? box.querySelector(".readout") : null;
  if (!ro) return;
  const outs = getPorts(b).filter(p => p.kind === "out" || p.kind === "inout").map(p => ({ p, v: P[key(b.id, p.id)] }));
  const spans = ro.querySelectorAll(".r span:last-child");
  if (c.isSource && c.isSource(b.params) && spans[0]) spans[0].textContent = dbm(P[key(b.id, srcPorts(c, b.params)[0])]);
  else if (outs.length === 1 && spans[0]) spans[0].textContent = dbm(outs[0].v);
  else outs.forEach((o, i) => { if (spans[i]) spans[i].textContent = dbm(o.v); });
}

function emptyInspector() {
  return `<div class="insp-note">
    <p style="margin:8px 0 0;color:#8b96a2">Nothing selected. Pick a block to edit it, or a wire to inspect its level.</p>
    <h4>Draw a chain</h4>
    <ol><li>Drag a component from the left onto the grid.</li>
      <li>Wire blocks by dragging from one's edge <span class="k">onto</span> another.</li>
      <li>Set each block's gain / loss — every wire shows the running <span class="k">dBm</span>.</li></ol>
    <h4>Arrange</h4>
    <ol><li>Drag a box over the grid to <span class="k">select</span> several.</li>
      <li>Drag any selected block to move the group.</li>
      <li><span class="k">R</span> rotate · <span class="k">M</span> mirror · <span class="k">Del</span> remove · right-click for a menu · Space/middle-drag pans.</li></ol>
    <h4>Continue on a new line</h4>
    <ol><li>End a row with an <span class="k">Interconnect</span> set to <b>in</b>, tag it (e.g. A).</li>
      <li>Start the next row with an Interconnect set to <b>out</b>, same tag — the level carries across.</li></ol>
    <h4>Keep &amp; share</h4>
    <ol><li><span class="k">Save</span>/<span class="k">Open</span> a <span class="k">.rfbd</span> file · <span class="k">SVG</span>/<span class="k">PNG</span> export a clean picture.</li></ol></div>`;
}

function pruneConns() {
  const before = conns.length;
  conns = conns.filter(cn => {
    const fb = findBlock(cn.from.block), tb = findBlock(cn.to.block);
    if (!fb || !tb) return false;
    const fp = getPorts(fb).find(p => p.id === cn.from.port), tp = getPorts(tb).find(p => p.id === cn.to.port);
    if (!fp || !tp) return false;
    return (fp.kind === "out" || fp.kind === "inout") && (tp.kind === "in" || tp.kind === "inout");
  });
  if (conns.length !== before && selConn && !conns.some(c => c.id === selConn)) selConn = null;
}

function syncSubsystems() {
  if (typeof ensureChildSheet !== "function") return;
  if (typeof syncSubsystemNames === "function") syncSubsystemNames();
  for (const b of allBlocks()) {
    const c = COMP[b.type];
    if (c && c.isSubsystem && b.params.sheet && sheetById(b.params.sheet)) ensureChildSheet(b);
  }
}

let sheetBarDirty = false;


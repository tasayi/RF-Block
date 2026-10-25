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
    const hasCustom = (cn.jog != null) || (cn.waypoints && cn.waypoints.length > 0);
    const wpCount = cn.waypoints ? cn.waypoints.length : 0;
    box.innerHTML = `<div class="insp-title"><span class="chip">Link</span><h3>Connection</h3></div>
      <div class="readout"><div class="r big"><span>Level on wire</span><span>${esc(dbm(lvl))}</span></div>
        <div class="r"><span>Cascade NF</span><span>${nfv === undefined ? "\u2014" : esc(fmt(nfv) + " dB")}</span></div>
        <div class="r"><span>From</span><span>${esc((fb && fb.params.label) || (fb && COMP[fb.type].name) || "?")}·${esc(cn.from.port)}</span></div>
        <div class="r"><span>To</span><span>${esc((tb && tb.params.label) || (tb && COMP[tb.type].name) || "?")}·${esc(cn.to.port)}</span></div>
        ${wpCount ? `<div class="r"><span>Waypoints</span><span>${wpCount} node${wpCount > 1 ? "s" : ""}</span></div>` : ""}</div>
      <label class="insp-check"><input type="checkbox" id="ibPill"${cn.hidePill ? "" : " checked"}/> Show the dBm label on this wire</label>
      ${hasCustom ? `<button class="btn ins-btn" id="ibClearWp" style="margin-bottom:8px">⟲ Straighten wire</button>` : ""}
      <button class="btn btn-del" id="ibDelC">Delete connection</button>`;
    const ibP = $("ibPill");
    if (ibP) ibP.onchange = e => {
      pushHistory();
      if (e.target.checked) delete cn.hidePill; else cn.hidePill = true;
      renderCanvas();
      hint(cn.hidePill ? "Label hidden on this wire." : "Label shown.");
    };
    const ibClr = $("ibClearWp");
    if (ibClr) ibClr.onclick = () => {
      pushHistory();
      delete cn.jog;
      delete cn.waypoints;
      renderAll();
      hint("Wire straightened.");
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

  if (!c.isLabel && !c.isInterconnect && !c.isSubsystem && !c.isSource && c.type !== "rfin" && c.type !== "rfout" && c.type !== "antenna" && c.type !== "termination") {
    if (b.type === "bamp") {
      // Per-state upload for Bypass Amplifier (Amp Mode vs Bypass Mode)
      h += `<div class="insp-sec" style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border,#e2e8f0)">
        <label style="font-weight:600; font-size:12px; display:block; margin-bottom:6px">Per-Mode Touchstone Files (.s2p)</label>
        
        <div style="margin-bottom:8px">
          <div style="font-size:11px; font-weight:600; color:var(--txt2,#64748b)">Amp Mode S2P:</div>
          <div style="display:flex; gap:6px; align-items:center; margin-top:2px">
            <button class="btn btn-sm" id="ibS2pAmpBtn" style="flex:1">${b.params.s2pFileName_amp ? "📄 " + esc(b.params.s2pFileName_amp) : "📁 Attach Amp Mode (.s2p)"}</button>
            ${b.params.s2pFileName_amp ? `<button class="btn btn-sm btn-del" id="ibS2pAmpClr">✕</button>` : ""}
          </div>
          <input type="file" id="ibS2pAmpFile" accept=".s1p,.s2p,.snp,.ts" style="display:none"/>
        </div>

        <div>
          <div style="font-size:11px; font-weight:600; color:var(--txt2,#64748b)">Bypass Mode S2P:</div>
          <div style="display:flex; gap:6px; align-items:center; margin-top:2px">
            <button class="btn btn-sm" id="ibS2pBypBtn" style="flex:1">${b.params.s2pFileName_byp ? "📄 " + esc(b.params.s2pFileName_byp) : "📁 Attach Bypass Mode (.s2p)"}</button>
            ${b.params.s2pFileName_byp ? `<button class="btn btn-sm btn-del" id="ibS2pBypClr">✕</button>` : ""}
          </div>
          <input type="file" id="ibS2pBypFile" accept=".s1p,.s2p,.snp,.ts" style="display:none"/>
        </div>
      </div>`;
    } else if (b.type === "switch") {
      // Positional .sNp Touchstone upload for SPnT Switch (Total ports = throws + 1)
      const numThrows = parseInt(b.params.throws) || 2;
      const numPorts = (typeof getPorts === "function") ? getPorts(b).length : (numThrows + 1);
      const fnOpen = b.params.snpFileName_pos_open || b.params.s3pFileName_st0 || b.params.snpFileName_st0;

      h += `<div class="insp-sec" style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border,#e2e8f0)">
        <label style="font-weight:600; font-size:12px; display:block; margin-bottom:6px">Positional Touchstone Files (.s${numPorts}p)</label>
        
        <div style="margin-bottom:8px">
          <div style="font-size:11px; font-weight:600; color:var(--txt2,#64748b)">Position: Open (Off) (.s${numPorts}p):</div>
          <div style="display:flex; gap:6px; align-items:center; margin-top:2px">
            <button class="btn btn-sm ib-sw-pos-btn" data-pos="open" style="flex:1">${fnOpen ? "📄 " + esc(fnOpen) : `📁 Attach Open State (.s${numPorts}p)`}</button>
            ${fnOpen ? `<button class="btn btn-sm btn-del ib-sw-pos-clr" data-pos="open">✕</button>` : ""}
          </div>
          <input type="file" class="ib-sw-pos-file" data-pos="open" accept=".s${numPorts}p,.snp,.ts" style="display:none"/>
        </div>`;

      for (let t = 1; t <= numThrows; t++) {
        const fn = b.params[`snpFileName_pos_${t}`] || b.params[`s3pFileName_st${t}`] || b.params[`snpFileName_st${t}`] || b.params[`s2pFileName_st${t}`];
        h += `<div style="margin-bottom:6px">
          <div style="font-size:11px; font-weight:600; color:var(--txt2,#64748b)">Position ${t} (.s${numPorts}p):</div>
          <div style="display:flex; gap:6px; align-items:center; margin-top:2px">
            <button class="btn btn-sm ib-sw-pos-btn" data-pos="${t}" style="flex:1">${fn ? "📄 " + esc(fn) : `📁 Attach Position ${t} (.s${numPorts}p)`}</button>
            ${fn ? `<button class="btn btn-sm btn-del ib-sw-pos-clr" data-pos="${t}">✕</button>` : ""}
          </div>
          <input type="file" class="ib-sw-pos-file" data-pos="${t}" accept=".s${numPorts}p,.snp,.ts" style="display:none"/>
        </div>`;
      }
      h += `</div>`;
    } else {
      // Component Touchstone upload: .sNp for >2 ports, .s2p for 2 ports
      const numPorts = (typeof getPorts === "function") ? getPorts(b).length : ((c.ports && c.ports.length) || 2);
      const isMulti = numPorts > 2;
      const fn = b.params.snpFileName || (isMulti ? (b.params[`s${numPorts}pFileName`] || b.params.s3pFileName || b.params.s4pFileName || b.params.s2pFileName) : b.params.s2pFileName);
      const fileLabel = isMulti ? `${numPorts}-Port Touchstone File (.s${numPorts}p)` : "S-Parameter File (.s2p)";
      const btnLabel = fn ? "📄 Change File" : (isMulti ? `📁 Attach Touchstone (.s${numPorts}p)` : "📁 Attach Touchstone (.s2p)");

      h += `<div class="insp-sec" style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border,#e2e8f0)">
        <label style="font-weight:600; font-size:12px; display:block; margin-bottom:4px">${fileLabel}</label>
        <div style="display:flex; gap:6px; align-items:center">
          <button class="btn btn-sm" id="ibS2pBtn" style="flex:1">${btnLabel}</button>
          ${fn ? `<button class="btn btn-sm btn-del" id="ibS2pClr" title="Clear Touchstone">✕</button>` : ""}
        </div>
        <div style="font-size:11px; color:var(--txt2,#64748b); margin-top:4px">
          ${fn ? `File: <b>${esc(fn)}</b>` : (isMulti ? "No file attached (using behavioral parameters)" : "No file attached (using gain/loss fallback)")}
        </div>
        <input type="file" id="ibS2pFile" accept="${isMulti ? `.s${numPorts}p,.snp,.ts` : `.s2p,.snp,.ts`}" style="display:none"/>
      </div>`;
    }
  }

  if (!c.isLabel) h += `<button class="btn ins-btn" id="ibRot1">⟳ Rotate 90° &nbsp;(R)</button>`;
  h += `<button class="btn btn-del" id="ibDel1">Delete block</button>`;
  box.innerHTML = h;

  // Bind Per-State File Event Handlers
  if (b.type === "bamp") {
    const bindS2pSlot = (btnId, fileId, clrId, fnKey, dataKey) => {
      const btn = $(btnId), fileEl = $(fileId), clr = $(clrId);
      if (btn && fileEl) {
        btn.onclick = () => fileEl.click();
        fileEl.onchange = e => {
          const f = e.target.files && e.target.files[0];
          if (!f) return;
          const rd = new FileReader();
          rd.onload = ev => {
            pushHistory();
            b.params[fnKey] = f.name;
            b.params[dataKey] = ev.target.result;
            renderAll();
            if (typeof renderLinearAnalysis === "function") renderLinearAnalysis();
            hint(`Attached '${f.name}' for ${btnId.includes("Amp")?"Amp Mode":"Bypass Mode"}`);
          };
          rd.readAsText(f);
        };
      }
      if (clr) {
        clr.onclick = () => {
          pushHistory();
          delete b.params[fnKey];
          delete b.params[dataKey];
          renderAll();
          if (typeof renderLinearAnalysis === "function") renderLinearAnalysis();
          hint("Removed Touchstone file.");
        };
      }
    };
    bindS2pSlot("ibS2pAmpBtn", "ibS2pAmpFile", "ibS2pAmpClr", "s2pFileName_amp", "s2pData_amp");
    bindS2pSlot("ibS2pBypBtn", "ibS2pBypFile", "ibS2pBypClr", "s2pFileName_byp", "s2pData_byp");
  } else if (b.type === "switch") {
    box.querySelectorAll(".ib-sw-pos-btn").forEach(btn => {
      const pos = btn.getAttribute("data-pos");
      const fileEl = box.querySelector(`.ib-sw-pos-file[data-pos="${pos}"]`);
      if (btn && fileEl) {
        btn.onclick = () => fileEl.click();
        fileEl.onchange = e => {
          const f = e.target.files && e.target.files[0];
          if (!f) return;
          const rd = new FileReader();
          rd.onload = ev => {
            pushHistory();
            const content = ev.target.result;
            if (pos === "open") {
              b.params.snpFileName_pos_open = f.name;
              b.params.snpData_pos_open = content;
              b.params.s3pFileName_st0 = f.name;
              b.params.s3pData_st0 = content;
              b.params.snpFileName_st0 = f.name;
              b.params.snpData_st0 = content;
            } else {
              b.params[`snpFileName_pos_${pos}`] = f.name;
              b.params[`snpData_pos_${pos}`] = content;
              b.params[`s3pFileName_st${pos}`] = f.name;
              b.params[`s3pData_st${pos}`] = content;
              b.params[`snpFileName_st${pos}`] = f.name;
              b.params[`snpData_st${pos}`] = content;
              b.params[`s2pFileName_st${pos}`] = f.name;
              b.params[`s2pData_st${pos}`] = content;
            }
            renderAll();
            if (typeof sparamsTabs !== "undefined" && sparamsTabs.length) {
              const curTab = sparamsTabs[typeof activeTabIdx !== "undefined" ? activeTabIdx : 0];
              if (curTab) {
                curTab.res = null;
                curTab.selectedPathIdx = null;
              }
            }
            if (typeof renderLinearAnalysis === "function") renderLinearAnalysis();
            hint(`Attached '${f.name}' for Position ${pos === "open" ? "Open" : pos}`);
          };
          rd.readAsText(f);
        };
      }
    });
    box.querySelectorAll(".ib-sw-pos-clr").forEach(clr => {
      clr.onclick = () => {
        const pos = clr.getAttribute("data-pos");
        pushHistory();
        if (pos === "open") {
          delete b.params.snpFileName_pos_open;
          delete b.params.snpData_pos_open;
          delete b.params.s3pFileName_st0;
          delete b.params.s3pData_st0;
          delete b.params.snpFileName_st0;
          delete b.params.snpData_st0;
        } else {
          delete b.params[`snpFileName_pos_${pos}`];
          delete b.params[`snpData_pos_${pos}`];
          delete b.params[`s3pFileName_st${pos}`];
          delete b.params[`s3pData_st${pos}`];
          delete b.params[`snpFileName_st${pos}`];
          delete b.params[`snpData_st${pos}`];
          delete b.params[`s2pFileName_st${pos}`];
          delete b.params[`s2pData_st${pos}`];
        }
        renderAll();
        if (typeof sparamsTabs !== "undefined" && sparamsTabs.length) {
          const curTab = sparamsTabs[typeof activeTabIdx !== "undefined" ? activeTabIdx : 0];
          if (curTab) {
            curTab.res = null;
            curTab.selectedPathIdx = null;
          }
        }
        if (typeof renderLinearAnalysis === "function") renderLinearAnalysis();
        hint(`Removed Touchstone file for Position ${pos === "open" ? "Open" : pos}.`);
      };
    });
  } else {
    const s2pBtn = $("ibS2pBtn"), s2pFile = $("ibS2pFile"), s2pClr = $("ibS2pClr");
    const numPorts = (typeof getPorts === "function") ? getPorts(b).length : ((c.ports && c.ports.length) || 2);
    if (s2pBtn && s2pFile) {
      s2pBtn.onclick = () => s2pFile.click();
      s2pFile.onchange = e => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          pushHistory();
          b.params.snpFileName = file.name;
          b.params.snpData = ev.target.result;
          b.params.s2pFileName = file.name;
          b.params.s2pData = ev.target.result;
          if (numPorts === 3) {
            b.params.s3pFileName = file.name;
            b.params.s3pData = ev.target.result;
          } else if (numPorts === 4) {
            b.params.s4pFileName = file.name;
            b.params.s4pData = ev.target.result;
          }
          renderAll();
          if (typeof sparamsTabs !== "undefined" && sparamsTabs.length) {
            const curTab = sparamsTabs[typeof activeTabIdx !== "undefined" ? activeTabIdx : 0];
            if (curTab) {
              curTab.res = null;
              curTab.selectedPathIdx = null;
            }
          }
          if (typeof renderLinearAnalysis === "function") renderLinearAnalysis();
          hint(`Attached Touchstone file '${file.name}' to ${b.params.label || c.name}`);
        };
        reader.readAsText(file);
      };
    }
    if (s2pClr) {
      s2pClr.onclick = () => {
        pushHistory();
        delete b.params.snpFileName;
        delete b.params.snpData;
        delete b.params.s2pFileName;
        delete b.params.s2pData;
        delete b.params.s3pFileName;
        delete b.params.s3pData;
        delete b.params.s4pFileName;
        delete b.params.s4pData;
        renderAll();
        if (typeof sparamsTabs !== "undefined" && sparamsTabs.length) {
          const curTab = sparamsTabs[typeof activeTabIdx !== "undefined" ? activeTabIdx : 0];
          if (curTab) {
            curTab.res = null;
            curTab.selectedPathIdx = null;
          }
        }
        if (typeof renderLinearAnalysis === "function") renderLinearAnalysis();
        hint("Removed Touchstone S-parameter file.");
      };
    }
  }

  box.querySelectorAll("[data-fkey]").forEach(inp => {
    const k = inp.getAttribute("data-fkey"), isNum = inp.getAttribute("data-num") === "1";
    if (inp.tagName === "SELECT") {
      inp.addEventListener("change", () => {
        pushHistory();
        b.params[k] = inp.value;
        renderAll();
        const panel = $("spStagePanel");
        if (panel && panel.style.display !== "none" && typeof renderLinearAnalysis === "function") {
          if (typeof sparamsTabs !== "undefined" && sparamsTabs.length) {
            const curTab = sparamsTabs[typeof activeTabIdx !== "undefined" ? activeTabIdx : 0];
            if (curTab) {
              curTab.res = null;
              curTab.selectedPathIdx = null;
            }
          }
          renderLinearAnalysis();
        }
      });
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


"use strict";

/* =====================================================================
 * RF Block Diagram Editor - S-Parameters Modal Controller & Tab Manager
 * ===================================================================== */

let sparamsTabs = []; // Array of { id, name, band, res }
let activeTabIdx = 0;
let linearMarkers = [{ id: "M1", f: 0 }];
let invokedTraces = new Set(["S21", "S12"]); // Default to Forward Gain S21 and Reverse Isolation S12
let isPanelDocked = false;

/* Canvas Signal Path Highlighting */
function highlightSignalPath(path) {
  if (!path || !path.block_ids || !path.block_ids.length) {
    clearSignalPathHighlight();
    return;
  }
  const bSet = new Set(path.block_ids);

  // Highlight blocks in layerBlock
  const blockEls = document.querySelectorAll("#layerBlock .block");
  blockEls.forEach(el => {
    const bid = el.getAttribute("data-block");
    if (bSet.has(bid)) {
      el.classList.add("sp-path-block-active");
      el.classList.remove("sp-path-dimmed");
    } else {
      el.classList.remove("sp-path-block-active");
      el.classList.add("sp-path-dimmed");
    }
  });

  // Highlight wires in layerConn
  const connEls = document.querySelectorAll("#layerConn .conn");
  if (typeof conns !== "undefined") {
    const pairs = new Set();
    for (let i = 0; i < path.block_ids.length - 1; i++) {
      pairs.add(`${path.block_ids[i]}->${path.block_ids[i+1]}`);
      pairs.add(`${path.block_ids[i+1]}->${path.block_ids[i]}`);
    }

    connEls.forEach(el => {
      const cid = el.getAttribute("data-conn");
      const cn = conns.find(c => c.id === cid);
      if (cn && (pairs.has(`${cn.from.block}->${cn.to.block}`) || pairs.has(`${cn.to.block}->${cn.from.block}`))) {
        el.classList.add("sp-path-wire-active");
        el.classList.remove("sp-path-dimmed");
      } else {
        el.classList.remove("sp-path-wire-active");
        el.classList.add("sp-path-dimmed");
      }
    });
  }
}

function clearSignalPathHighlight() {
  document.querySelectorAll("#layerBlock .block").forEach(el => {
    el.classList.remove("sp-path-block-active", "sp-path-dimmed");
  });
  document.querySelectorAll("#layerConn .conn").forEach(el => {
    el.classList.remove("sp-path-wire-active", "sp-path-dimmed");
  });
}

/* --- Full-Stage Multi-Port S-Params Panel & Tab Management --- */
function toggleSParamsDrawer() {
  const panel = $("spStagePanel");
  if (!panel) return;
  const isHidden = panel.style.display === "none";
  panel.style.display = isHidden ? "block" : "none";
  const btn = $("btnSParams");
  if (btn) btn.style.borderColor = isHidden ? "var(--accent)" : "";

  if (!isHidden) {
    clearSignalPathHighlight();
  } else {
    if (!sparamsTabs.length) {
      const band = settings.analysisBand || { startFreq: 1, startUnit: "GHz", stopFreq: 10, stopUnit: "GHz", points: 101, sweepType: "lin" };
      runNewSParamSweep(band, "Sweep 1");
    } else {
      const activeTab = sparamsTabs[activeTabIdx];
      if (activeTab) {
        activeTab.res = null;
        activeTab.selectedPathIdx = null;
      }
      renderLinearAnalysis();
    }
  }
}

async function fetchBackendSParams(band) {
  try {
    const payload = {
      band: band,
      blocks: typeof blocks !== "undefined" ? blocks : [],
      conns: typeof conns !== "undefined" ? conns : []
    };
    if (typeof EngineClient !== "undefined") {
      return await EngineClient.solveSParams(payload);
    }
    const res = await fetch("/api/v1/analyze/sparams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    // Backend offline or fallback to JS solver
  }
  return null;
}

function runNewSParamSweep(band, tabName) {
  const name = tabName || `Sweep ${sparamsTabs.length + 1}`;
  const newTab = { id: "sp_tab_" + Date.now(), name, band: { ...band }, res: null, selectedPathIdx: null, activeMetric: "mag", yScale: "auto" };
  sparamsTabs.push(newTab);
  activeTabIdx = sparamsTabs.length - 1;

  // Evaluate async backend analysis or JS solver
  fetchBackendSParams(band).then(backendRes => {
    const localRes = withAllSheets(() => computeLinearAnalysis(band));
    if (backendRes && backendRes.status === "success" && backendRes.paths && backendRes.paths.length) {
      if (!backendRes.portsList || !backendRes.portsList.length) {
        backendRes.portsList = localRes.portsList || [];
      }
      if (backendRes.freq_hz) backendRes.freqs = new Float64Array(backendRes.freq_hz);
      const activeIdx = backendRes.paths.findIndex(p => p.is_active || p.isActive);
      const selIdx = activeIdx >= 0 ? activeIdx : 0;
      newTab.selectedPathIdx = selIdx;
      const curPath = backendRes.paths[selIdx] || backendRes.paths[0];

      // Retain global multi-port matrix! Only fallback to curPath if matrix is empty
      if (!backendRes.matrix) {
        backendRes.matrix = curPath.matrix || {};
      }
      if (curPath) {
        if (!backendRes.matrix.S21 && curPath.s21_db) backendRes.matrix.S21 = curPath.s21_db;
        if (!backendRes.matrix.S12 && curPath.s12_db) backendRes.matrix.S12 = curPath.s12_db;
        if (!backendRes.matrix.S11 && curPath.s11_db) backendRes.matrix.S11 = curPath.s11_db;
        if (!backendRes.matrix.S22 && curPath.s22_db) backendRes.matrix.S22 = curPath.s22_db;
        if (curPath.fwdKey && !backendRes.matrix[curPath.fwdKey] && curPath.s21_db) {
          backendRes.matrix[curPath.fwdKey] = curPath.s21_db;
        }
      }
      newTab.res = backendRes;
    } else {
      newTab.res = localRes;
    }
    renderLinearAnalysis();
  });
}

function renderLinearAnalysis() {
  const box = $("spStagePanel");
  if (!box) return;

  if (isPanelDocked) {
    box.classList.add("docked");
  } else {
    box.classList.remove("docked");
  }

  if (!sparamsTabs.length || activeTabIdx >= sparamsTabs.length) activeTabIdx = Math.max(0, sparamsTabs.length - 1);
  const activeTab = sparamsTabs[activeTabIdx];
  const activeMetric = (activeTab && activeTab.activeMetric) || "mag";
  const yScale = (activeTab && activeTab.yScale) || "auto";

  // Data persistence: evaluate for current state if not cached
  const band = (activeTab && activeTab.band) || settings.analysisBand || { startFreq: 1, startUnit: "GHz", stopFreq: 10, stopUnit: "GHz", points: 101, sweepType: "lin" };
  if (activeTab && !activeTab.res) {
    activeTab.res = withAllSheets(() => computeLinearAnalysis(band));
    if (activeTab.res && activeTab.res.paths && (activeTab.selectedPathIdx === null || activeTab.selectedPathIdx === undefined)) {
      const activeIdx = activeTab.res.paths.findIndex(p => p.isActive || p.is_active);
      activeTab.selectedPathIdx = activeIdx >= 0 ? activeIdx : 0;
    }
  }
  const res = (activeTab && activeTab.res) || withAllSheets(() => computeLinearAnalysis(band));

  // Sync selected path: allow user to select and KEEP any path without forcing it back
  if (res && res.paths && res.paths.length) {
    if (activeTab.selectedPathIdx === null || activeTab.selectedPathIdx === undefined || activeTab.selectedPathIdx >= res.paths.length) {
      const activeIdx = res.paths.findIndex(p => p.isActive || p.is_active);
      activeTab.selectedPathIdx = activeIdx >= 0 ? activeIdx : 0;
    }
    const selIdx = activeTab.selectedPathIdx;
    const curPath = res.paths[selIdx];
    if (curPath) {
      if (curPath.matrix) {
        // Merge without overwriting existing global matrix keys
        for (const k in curPath.matrix) {
          if (!res.matrix[k]) res.matrix[k] = curPath.matrix[k];
        }
      }
      if (curPath.fwdKey) {
        if (!res.matrix[curPath.fwdKey] && curPath.s21_db) {
          res.matrix[curPath.fwdKey] = new Float64Array(curPath.s21_db);
        }
        invokedTraces.add(curPath.fwdKey);
      }
      highlightSignalPath(curPath);
    }
  }

  let html = `<div style="max-width:1240px; margin:0 auto; font-family:var(--sans); color:var(--ink,#f8fafc)">`;

  // Top Header Bar
  html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid var(--line,#334155); padding-bottom:12px">
    <div style="display:flex; align-items:center; gap:12px">
      <h3 style="margin:0; font-size:16px; font-weight:700; display:flex; align-items:center; gap:8px; color:#f8fafc">
        <span>📈</span> Multi-Port S-Parameter Analysis & Matrix Cascade
      </h3>
      <button class="btn btn-sm primary" id="spRerunSweep" title="Re-evaluate sweep for current schematic state">⚡ Re-run Sweep</button>
      <button class="btn btn-sm" id="spOpenSettings" title="Open Analyser Settings">⚙️ Analyser Settings</button>
      <button class="btn btn-sm" id="spToggleDock" title="Toggle Docked to Bottom or Fullscreen">${isPanelDocked ? "⛶ Maximize View" : "⬍ Dock to Bottom"}</button>
    </div>
    <button class="btn btn-sm" id="spClosePanel">✕ Close Analysis View</button>
  </div>`;

  // --- Results Tabs Bar ---
  html += `<div style="display:flex; align-items:center; gap:6px; margin-bottom:14px; overflow-x:auto; border-bottom:2px solid var(--line,#334155); padding-bottom:6px">`;
  sparamsTabs.forEach((tb, idx) => {
    const isCur = idx === activeTabIdx;
    html += `<div class="sp-tab-item" style="display:flex; align-items:center; gap:6px; padding:7px 16px; border-radius:6px 6px 0 0; background:${isCur?'var(--accent,#f59e0b)':'var(--chrome-2,#1f2937)'}; color:${isCur?'#0f172a':'var(--ink-dim,#94a3b8)'}; font-size:12px; font-weight:${isCur?'700':'500'}; cursor:pointer" data-tidx="${idx}">
      <span class="sp-tab-name" data-tidx="${idx}" title="Double-click to rename">${esc(tb.name)}</span>
      ${sparamsTabs.length > 1 ? `<span class="sp-tab-del" data-tidx="${idx}" style="opacity:0.7; font-size:11px; margin-left:4px">✕</span>` : ""}
    </div>`;
  });
  html += `<button class="btn btn-sm" id="spNewTab" style="margin-left:6px">+ New Sweep Tab</button>`;
  html += `</div>`;

  // Ports List Status Header
  const portsList = res.portsList || [];
  const portsStr = portsList.length ? portsList.map(p => `<b style="color:var(--accent)">${p.tag} (${esc(p.label)})</b>`).join(", ") : "None";

  html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:12px">
    <div style="font-size:12.5px; color:var(--ink-dim,#94a3b8)">
      Defined Ports (${portsList.length}): ${portsStr} | Active Tab: <b style="color:#f8fafc">${esc(activeTab ? activeTab.name : "Sweep")}</b>
    </div>

    <!-- Export Action Buttons -->
    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
      ${sparamsTabs.length > 1 ? `<label style="font-size:12px; font-weight:600; cursor:pointer"><input type="checkbox" id="chkCompare" /> Compare with Benchmark Overlay</label>` : ""}
      <button class="btn btn-sm" id="spExportCsv">📄 Export CSV</button>
      <button class="btn btn-sm" id="spExportSvg">📊 Export SVG</button>
      <button class="btn btn-sm" id="spExportPng">🖼️ Export PNG</button>
      <button class="btn btn-sm" id="spExportS2p">📁 Export Touchstone (.sNp)</button>
    </div>
  </div>`;

  // Path Selector Bar (if multi-path results are available)
  if (res.paths && res.paths.length > 0) {
    html += `<div style="background:var(--chrome-2,#1f2937); border:1px solid var(--line,#374151); border-radius:8px; padding:10px 14px; margin-bottom:14px; display:flex; align-items:center; gap:12px; flex-wrap:wrap">
      <div style="display:flex; align-items:center; gap:8px; flex:1">
        <label style="font-size:12.5px; font-weight:700; color:var(--accent,#f59e0b); display:flex; align-items:center; gap:6px">
          <span>📍</span> Signal Path:
        </label>
        <select id="spPathSelect" style="flex:1; padding:6px 10px; font-size:12.5px; border-radius:6px; border:1px solid var(--line); background:var(--chrome); color:var(--ink); font-weight:600">
          ${res.paths.map((p, pIdx) => `<option value="${pIdx}" ${pIdx === (activeTab.selectedPathIdx || 0) ? "selected" : ""}>${esc(p.name || ("Path " + (pIdx + 1)))}</option>`).join("")}
        </select>
      </div>
      <div style="font-size:11.5px; color:var(--ink-dim,#94a3b8)">
        Discovered Paths: <b>${res.paths.length}</b>
      </div>
    </div>`;
  }

  // Metric Switcher & Y-Scale Controls
  html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px; background:var(--chrome-2,#1f2937); border:1px solid var(--line,#374151); border-radius:8px; padding:8px 14px">
    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap">
      <span style="font-size:12px; font-weight:700; color:var(--ink-dim,#94a3b8)">Display Metric:</span>
      <button class="sp-metric-pill ${activeMetric==='mag'?'active':''}" data-metric="mag">📈 Magnitude (dB)</button>
      <button class="sp-metric-pill ${activeMetric==='phase'?'active':''}" data-metric="phase">∿ Phase (°)</button>
      <button class="sp-metric-pill ${activeMetric==='delay'?'active':''}" data-metric="delay">⏱️ Group Delay (ns)</button>
      <button class="sp-metric-pill ${activeMetric==='k'?'active':''}" data-metric="k">🛡️ Stability (K)</button>
    </div>
    <div style="display:flex; align-items:center; gap:6px">
      <label style="font-size:11.5px; font-weight:600; color:var(--ink-dim)">Y-Scale:</label>
      <select id="spYScaleSelect" style="padding:4px 8px; font-size:11.5px; border-radius:5px; border:1px solid var(--line); background:var(--chrome-2); color:var(--ink)">
        <option value="auto" ${yScale==='auto'?'selected':''}>Auto-Scale</option>
        <option value="pos20_to_neg60" ${yScale==='pos20_to_neg60'?'selected':''}>+20 to -60 dB</option>
        <option value="0_to_neg100" ${yScale==='0_to_neg100'?'selected':''}>0 to -100 dB</option>
        <option value="0_to_neg40" ${yScale==='0_to_neg40'?'selected':''}>0 to -40 dB</option>
      </select>
    </div>
  </div>`;

  // Warning Alerts Banner
  if (res.error) {
    html += `<div style="background:#3f1717; color:#fca5a5; padding:12px 16px; border-radius:8px; margin-bottom:14px; font-size:12.5px; border:1px solid #991b1b">
      <b>⚠️ Notice:</b> ${esc(res.error)}
      <div style="margin-top:4px; font-size:11.5px; opacity:0.85">To resolve: Select schematic terminals in the Inspector and assign Analysis Ports (P1 through P8).</div>
    </div>`;
  } else if (res.warnings && res.warnings.length) {
    html += `<div style="background:#3a2007; color:#fcd34d; padding:10px 14px; border-radius:8px; margin-bottom:14px; font-size:12px; border:1px solid #92400e">
      ${res.warnings.map(w => `<div>⚠️ ${esc(w)}</div>`).join("")}
    </div>`;
  }

  // Interactive N x N Matrix Grid Container
  html += `<div id="spMatrixTableContainer"></div>`;

  if (!res.error && (portsList.length >= 2 || (res.paths && res.paths.length > 0))) {
    const P = Math.max(2, portsList.length);

    // Build Contextual Port-Aware Trace List
    const availableTraces = [];
    for (let i = 1; i <= P; i++) {
      const pOutObj = portsList.find(p => p.num === i);
      const pOutName = pOutObj && pOutObj.label ? pOutObj.label : `P${i}`;
      for (let j = 1; j <= P; j++) {
        const pInObj = portsList.find(p => p.num === j);
        const pInName = pInObj && pInObj.label ? pInObj.label : `P${j}`;
        const sKey = `S${i}${j}`;
        let label = sKey;
        if (i === j) label += ` (Match at ${pInName})`;
        else label += ` (${pOutName} ← ${pInName})`;
        availableTraces.push({ key: sKey, label });
      }
      if (res.matrix && res.matrix[`S${i}Σ`]) {
        availableTraces.push({ key: `S${i}Σ`, label: `S${i}Σ (Total Linear Combined Power at P${i})` });
      }
    }

    let hasValidActive = false;
    invokedTraces.forEach(sk => {
      if (res.matrix && res.matrix[sk] && res.matrix[sk].some(v => v > -110)) hasValidActive = true;
    });
    if (!hasValidActive && res.matrix) {
      for (const sk in res.matrix) {
        if (res.matrix[sk] && res.matrix[sk].some(v => v > -110)) {
          invokedTraces.add(sk);
        }
      }
    }
    if (invokedTraces.size === 0) {
      invokedTraces.add("S21");
      if (P >= 3) {
        for (let i = 3; i <= P; i++) invokedTraces.add(`S${i}1`);
      } else {
        invokedTraces.add("S12");
      }
    }

    html += `<div style="background:var(--chrome-2,#1f2937); border:1px solid var(--line,#374151); border-radius:8px; padding:14px; margin-bottom:16px">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px">
        <h4 style="margin:0; font-size:13px; font-weight:700; color:var(--ink,#f8fafc); display:flex; align-items:center; gap:6px">
          <span>🎛️</span> S-Parameter Trace Selection
        </h4>
        <div style="display:flex; gap:6px; flex-wrap:wrap">
          <button class="btn btn-sm" id="spPrePrimary">All Gains (${P >= 3 ? "S21, S31..." : "S21"})</button>
          <button class="btn btn-sm" id="spPreGainIso">Gain & Iso</button>
          <button class="btn btn-sm" id="spPreFull2Port">All ${P}×${P} S-Params</button>
          <button class="btn btn-sm" id="spPreMatch">Match (Snn)</button>
          <button class="btn btn-sm" id="spPreClearAll">Clear</button>
        </div>
      </div>

      <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap">
        <div style="display:flex; align-items:center; gap:6px">
          <label style="font-size:12px; font-weight:600; color:var(--ink-dim)">Add Trace:</label>
          <select id="spTraceSelect" style="padding:6px 10px; font-size:12px; border-radius:6px; border:1px solid var(--line); background:var(--chrome-2); color:var(--ink); min-width:260px">
            <option value="">-- Select S-Parameter Trace --</option>`;

    availableTraces.forEach(tr => {
      const isInv = invokedTraces.has(tr.key);
      html += `<option value="${tr.key}"${isInv ? " disabled" : ""}>${esc(tr.label)}${isInv ? " (Active)" : ""}</option>`;
    });

    html += `</select>
        </div>

        <div style="font-size:12px; font-weight:600; color:var(--ink-dim)">Active:</div>
        <div id="spActiveTraceChips" style="display:flex; gap:6px; flex-wrap:wrap; align-items:center">`;

    let chipIdx = 0;
    invokedTraces.forEach(sKey => {
      const col = getTraceColor(sKey, chipIdx++);
      html += `<div style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:5px; background:${col}; color:#ffffff; font-size:12px; font-weight:700; box-shadow:0 2px 4px rgba(0,0,0,0.2)">
        <span>${sKey}</span>
        <span class="sp-chip-del" data-skey="${sKey}" style="cursor:pointer; opacity:0.85; font-size:11px; margin-left:2px" title="Remove trace">✕</span>
      </div>`;
    });

    html += `</div>
      </div>
    </div>`;

    // --- Chart Area ---
    html += `<div style="position:relative; background:var(--chrome-2); border:1px solid var(--line); border-radius:8px; padding:16px; margin-bottom:16px; box-shadow:var(--shadow-md)">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; font-size:12px; flex-wrap:wrap; gap:8px">
        <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap">
          <span style="font-weight:700; color:var(--ink)">Active Traces (${invokedTraces.size}):</span>`;
    invokedTraces.forEach(sKey => {
      const col = getTraceColor(sKey);
      html += `<span style="color:${col}; font-weight:700; font-size:12px">■ ${sKey}</span>`;
    });
    html += `</div>
        <div>
          <button class="btn btn-sm" id="spAddMarker">+ Add Marker</button>
        </div>
      </div>

      <!-- SVG Chart -->
      <div id="spChartContainer" style="width:100%; height:360px; position:relative"></div>
    </div>`;

    // Markers Table
    html += `<div style="background:var(--chrome-2); border:1px solid var(--line); border-radius:8px; padding:16px">
      <h4 style="margin:0 0 12px 0; font-size:13px; font-weight:700; color:var(--ink)">📌 Frequency Markers & Readouts</h4>
      <div id="spMarkerTable"></div>
    </div>`;
  }

  html += `</div>`;
  box.innerHTML = html;

  // Render Interactive N x N Matrix Table
  if (!res.error && (portsList.length >= 2 || (res.paths && res.paths.length > 0))) {
    renderSParamMatrixTable(res, "spMatrixTableContainer", () => {
      renderLinearAnalysis();
    });
    renderSvgPlot(res, activeMetric, yScale);
    renderMarkerTable(res, activeMetric);
  }

  // Bind Path Selector
  const selPath = $("spPathSelect");
  if (selPath && activeTab && res && res.paths) {
    selPath.onchange = e => {
      const pIdx = parseInt(e.target.value) || 0;
      activeTab.selectedPathIdx = pIdx;
      const pData = res.paths[pIdx];
      if (pData) {
        if (pData.matrix) {
          for (const k in pData.matrix) {
            if (!res.matrix[k]) res.matrix[k] = pData.matrix[k];
          }
        }
        if (pData.fwdKey) invokedTraces.add(pData.fwdKey);
        highlightSignalPath(pData);
      }
      renderLinearAnalysis();
    };
  }

  // Bind Dock Toggle
  if ($("spToggleDock")) {
    $("spToggleDock").onclick = () => {
      isPanelDocked = !isPanelDocked;
      renderLinearAnalysis();
    };
  }

  // Bind Metric Switcher Pills
  box.querySelectorAll(".sp-metric-pill").forEach(pill => {
    pill.onclick = () => {
      const m = pill.getAttribute("data-metric");
      if (m && activeTab) {
        activeTab.activeMetric = m;
        renderLinearAnalysis();
      }
    };
  });

  // Bind Y-Scale Select
  if ($("spYScaleSelect")) {
    $("spYScaleSelect").onchange = e => {
      if (activeTab) {
        activeTab.yScale = e.target.value;
        renderSvgPlot(res, activeMetric, activeTab.yScale);
      }
    };
  }

  // Bind Header Action Buttons
  if ($("spClosePanel")) $("spClosePanel").onclick = toggleSParamsDrawer;
  if ($("spOpenSettings")) $("spOpenSettings").onclick = toggleAnalyserDrawer;
  if ($("spRerunSweep")) {
    $("spRerunSweep").onclick = () => {
      if (activeTab) {
        fetchBackendSParams(activeTab.band).then(backendRes => {
          const localRes = withAllSheets(() => computeLinearAnalysis(activeTab.band));
          if (backendRes && backendRes.status === "success" && backendRes.paths && backendRes.paths.length) {
            if (!backendRes.portsList || !backendRes.portsList.length) {
              backendRes.portsList = localRes.portsList || [];
            }
            if (backendRes.freq_hz) backendRes.freqs = new Float64Array(backendRes.freq_hz);
            const selIdx = activeTab.selectedPathIdx || 0;
            const curPath = backendRes.paths[selIdx] || backendRes.paths[0];

            if (!backendRes.matrix) backendRes.matrix = {};
            if (curPath) {
              if (!backendRes.matrix.S21 && curPath.s21_db) backendRes.matrix.S21 = curPath.s21_db;
              if (!backendRes.matrix.S12 && curPath.s12_db) backendRes.matrix.S12 = curPath.s12_db;
              if (!backendRes.matrix.S11 && curPath.s11_db) backendRes.matrix.S11 = curPath.s11_db;
              if (!backendRes.matrix.S22 && curPath.s22_db) backendRes.matrix.S22 = curPath.s22_db;
              if (curPath.fwdKey && !backendRes.matrix[curPath.fwdKey] && curPath.s21_db) {
                backendRes.matrix[curPath.fwdKey] = curPath.s21_db;
              }
            }
            activeTab.res = backendRes;
          } else {
            activeTab.res = localRes;
          }
          renderLinearAnalysis();
          if (typeof hint === "function") hint(`Re-evaluated sweep for '${activeTab.name}'`);
        });
      }
    };
  }

  // Bind Combobox Dropdown & Chip Event Listeners
  const selTrace = $("spTraceSelect");
  if (selTrace) {
    selTrace.onchange = e => {
      const val = e.target.value;
      if (val) {
        invokedTraces.add(val);
        renderLinearAnalysis();
      }
    };
  }

  box.querySelectorAll(".sp-chip-del").forEach(chip => {
    chip.onclick = () => {
      const sk = chip.getAttribute("data-skey");
      invokedTraces.delete(sk);
      renderLinearAnalysis();
    };
  });

  if ($("spPrePrimary")) {
    $("spPrePrimary").onclick = () => {
      invokedTraces = new Set();
      for (let i = 2; i <= P; i++) invokedTraces.add(`S${i}1`);
      if (invokedTraces.size === 0) invokedTraces.add("S21");
      renderLinearAnalysis();
    };
  }
  if ($("spPreGainIso")) {
    $("spPreGainIso").onclick = () => {
      invokedTraces = new Set();
      for (let i = 2; i <= P; i++) {
        invokedTraces.add(`S${i}1`);
        invokedTraces.add(`S1${i}`);
      }
      if (invokedTraces.size === 0) {
        invokedTraces.add("S21");
        invokedTraces.add("S12");
      }
      renderLinearAnalysis();
    };
  }
  if ($("spPreFull2Port")) {
    $("spPreFull2Port").onclick = () => {
      invokedTraces = new Set();
      for (let i = 1; i <= P; i++) {
        for (let j = 1; j <= P; j++) {
          invokedTraces.add(`S${i}${j}`);
        }
      }
      renderLinearAnalysis();
    };
  }
  if ($("spPreMatch")) {
    $("spPreMatch").onclick = () => {
      invokedTraces = new Set();
      for (let i = 1; i <= P; i++) invokedTraces.add(`S${i}${i}`);
      renderLinearAnalysis();
    };
  }
  if ($("spPreClearAll")) {
    $("spPreClearAll").onclick = () => {
      invokedTraces.clear();
      renderLinearAnalysis();
    };
  }

  // Bind Tab Bar Event Listeners
  box.querySelectorAll(".sp-tab-item").forEach(item => {
    item.onclick = e => {
      if (e.target.classList.contains("sp-tab-del")) return;
      activeTabIdx = parseInt(item.getAttribute("data-tidx"));
      renderLinearAnalysis();
    };
  });

  box.querySelectorAll(".sp-tab-name").forEach(span => {
    span.ondblclick = () => {
      const idx = parseInt(span.getAttribute("data-tidx"));
      const newName = prompt("Rename Analysis Tab:", sparamsTabs[idx].name);
      if (newName && newName.trim()) {
        sparamsTabs[idx].name = newName.trim();
        renderLinearAnalysis();
      }
    };
  });

  box.querySelectorAll(".sp-tab-del").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute("data-tidx"));
      sparamsTabs.splice(idx, 1);
      activeTabIdx = Math.max(0, activeTabIdx - 1);
      renderLinearAnalysis();
    };
  });

  const btnNewTab = $("spNewTab");
  if (btnNewTab) {
    btnNewTab.onclick = () => {
      const band = settings.analysisBand || { startFreq: 1, startUnit: "GHz", stopFreq: 10, stopUnit: "GHz", points: 101, sweepType: "lin" };
      runNewSParamSweep(band);
    };
  }

  if (!res.error && (portsList.length >= 2 || (res.paths && res.paths.length > 0))) {
    const btnAddM = $("spAddMarker");
    if (btnAddM) {
      btnAddM.onclick = () => {
        if (linearMarkers.length >= 5) return;
        const midIdx = Math.floor(res.freqs.length / 2);
        linearMarkers.push({ id: "M" + (linearMarkers.length + 1), f: res.freqs[midIdx] });
        renderSvgPlot(res, activeMetric, yScale);
        renderMarkerTable(res, activeMetric);
        if ($("spMatrixTableContainer")) renderSParamMatrixTable(res, "spMatrixTableContainer");
      };
    }

    if ($("spExportCsv")) $("spExportCsv").onclick = () => exportSParamsCsv(res);
    if ($("spExportSvg")) $("spExportSvg").onclick = () => exportSParamsSvg();
    if ($("spExportPng")) $("spExportPng").onclick = () => exportSParamsPng();
    if ($("spExportS2p")) $("spExportS2p").onclick = () => exportTouchstoneS2p(res);

    if ($("chkCompare")) $("chkCompare").onchange = () => renderSvgPlot(res, activeMetric, yScale);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    toggleSParamsDrawer,
    fetchBackendSParams,
    runNewSParamSweep,
    renderLinearAnalysis,
    highlightSignalPath,
    clearSignalPathHighlight
  };
}

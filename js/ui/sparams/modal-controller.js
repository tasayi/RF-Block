"use strict";

/* =====================================================================
 * RF Block Diagram Editor - S-Parameters Modal Controller & Tab Manager
 * ===================================================================== */

let sparamsTabs = []; // Array of { id, name, band, res }
let activeTabIdx = 0;
let linearMarkers = [{ id: "M1", f: 0 }];
let invokedTraces = new Set(["S21", "S11", "S22"]); // Currently invoked S-parameter trace keys

/* --- Full-Stage Multi-Port S-Params Panel & Tab Management --- */
function toggleSParamsDrawer() {
  const panel = $("spStagePanel");
  if (!panel) return;
  const isHidden = panel.style.display === "none";
  panel.style.display = isHidden ? "block" : "none";
  const btn = $("btnSParams");
  if (btn) btn.style.borderColor = isHidden ? "var(--accent)" : "";

  if (isHidden) {
    if (!sparamsTabs.length) {
      const band = settings.analysisBand || { startFreq: 1, startUnit: "GHz", stopFreq: 10, stopUnit: "GHz", points: 101, sweepType: "lin" };
      runNewSParamSweep(band, "Sweep 1");
    } else {
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
  const newTab = { id: "sp_tab_" + Date.now(), name, band: { ...band }, res: null, selectedPathIdx: 0, activeMetric: "mag" };
  sparamsTabs.push(newTab);
  activeTabIdx = sparamsTabs.length - 1;

  // Evaluate async backend analysis or JS solver
  fetchBackendSParams(band).then(backendRes => {
    const localRes = withAllSheets(() => computeLinearAnalysis(band));
    if (backendRes && backendRes.status === "success" && backendRes.paths && backendRes.paths.length) {
      // Merge portsList from local solver for UI compatibility
      backendRes.portsList = localRes.portsList || [];
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

  if (!sparamsTabs.length || activeTabIdx >= sparamsTabs.length) activeTabIdx = Math.max(0, sparamsTabs.length - 1);
  const activeTab = sparamsTabs[activeTabIdx];

  // Data persistence: use stored snapshot result if present, or evaluate once if missing
  const band = (activeTab && activeTab.band) || settings.analysisBand || { startFreq: 1, startUnit: "GHz", stopFreq: 10, stopUnit: "GHz", points: 101, sweepType: "lin" };
  if (activeTab && !activeTab.res) {
    activeTab.res = withAllSheets(() => computeLinearAnalysis(band));
  }
  const res = (activeTab && activeTab.res) || withAllSheets(() => computeLinearAnalysis(band));

  let html = `<div style="max-width:1240px; margin:0 auto; font-family:var(--sans); color:var(--ink,#f8fafc)">`;

  // Top Header Bar
  html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid var(--line,#334155); padding-bottom:12px">
    <div style="display:flex; align-items:center; gap:12px">
      <h3 style="margin:0; font-size:16px; font-weight:700; display:flex; align-items:center; gap:8px; color:#f8fafc">
        <span>📈</span> Multi-Port Transmission Analysis & Benchmark View
      </h3>
      <button class="btn btn-sm primary" id="spRerunSweep" title="Re-evaluate sweep for current schematic state">⚡ Re-run Sweep</button>
      <button class="btn btn-sm" id="spOpenSettings" title="Open Analyser Settings">⚙️ Analyser Settings</button>
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

  if (!res.error && portsList.length >= 2) {
    const P = portsList.length;

    const availableTraces = [];
    for (let i = 1; i <= P; i++) {
      for (let j = 1; j <= P; j++) {
        if (i === j) continue;
        const sKey = `S${i}${j}`;
        let label = sKey;
        if (j === 1) label += ` (Forward Transmission P1 → P${i})`;
        else label += ` (Transmission P${j} → P${i})`;
        availableTraces.push({ key: sKey, label });
      }
      if (res.matrix && res.matrix[`S${i}Σ`]) {
        availableTraces.push({ key: `S${i}Σ`, label: `S${i}Σ (Total Linear Combined Power at P${i})` });
      }
    }

    invokedTraces.forEach(k => {
      if (/^S(\d+)\1$/.test(k)) invokedTraces.delete(k);
    });
    let hasValidActive = false;
    invokedTraces.forEach(sk => {
      if (res.matrix[sk] && res.matrix[sk].some(v => v > -110)) hasValidActive = true;
    });
    if (!hasValidActive) {
      for (const sk in res.matrix) {
        if (res.matrix[sk].some(v => v > -110)) {
          invokedTraces.add(sk);
        }
      }
    }
    if (invokedTraces.size === 0) {
      availableTraces.forEach(tr => invokedTraces.add(tr.key));
    }

    html += `<div style="background:var(--chrome-2,#1f2937); border:1px solid var(--line,#374151); border-radius:8px; padding:14px; margin-bottom:16px">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px">
        <h4 style="margin:0; font-size:13px; font-weight:700; color:var(--ink,#f8fafc); display:flex; align-items:center; gap:6px">
          <span>🎛️</span> Transmission Parameter Selection (${P}-Port System)
        </h4>
        <div style="display:flex; gap:6px; flex-wrap:wrap">
          <button class="btn btn-sm" id="spPrePrimary">Preset: Primary (S21)</button>
          <button class="btn btn-sm" id="spPreAllOutputs">Preset: All Outputs (S_j1)</button>
          <button class="btn btn-sm" id="spPreAllTrans">Preset: All Transmission (S_ij)</button>
          <button class="btn btn-sm" id="spPreClearAll">Clear All</button>
        </div>
      </div>

      <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap">
        <div style="display:flex; align-items:center; gap:6px">
          <label style="font-size:12px; font-weight:600; color:var(--ink-dim)">Add Trace:</label>
          <select id="spTraceSelect" style="padding:6px 10px; font-size:12px; border-radius:6px; border:1px solid var(--line); background:var(--chrome-2); color:var(--ink); min-width:240px">
            <option value="">-- Select Transmission Trace --</option>`;

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
          <span style="font-weight:700; color:var(--ink)">Transmission Traces (${invokedTraces.size}):</span>`;
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

  // Bind Header Action Buttons
  if ($("spClosePanel")) $("spClosePanel").onclick = toggleSParamsDrawer;
  if ($("spOpenSettings")) $("spOpenSettings").onclick = toggleAnalyserDrawer;
  if ($("spRerunSweep")) {
    $("spRerunSweep").onclick = () => {
      if (activeTab) {
        activeTab.res = withAllSheets(() => computeLinearAnalysis(activeTab.band));
        renderLinearAnalysis();
        if (typeof hint === "function") hint(`Re-evaluated sweep for '${activeTab.name}'`);
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
      invokedTraces = new Set(["S21"]);
      renderLinearAnalysis();
    };
  }
  if ($("spPreAllOutputs")) {
    $("spPreAllOutputs").onclick = () => {
      invokedTraces.clear();
      for (let p = 2; p <= portsList.length; p++) invokedTraces.add(`S${p}1`);
      renderLinearAnalysis();
    };
  }
  if ($("spPreAllTrans")) {
    $("spPreAllTrans").onclick = () => {
      invokedTraces.clear();
      for (let i = 1; i <= portsList.length; i++) {
        for (let j = 1; j <= portsList.length; j++) {
          if (i !== j) invokedTraces.add(`S${i}${j}`);
        }
      }
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

  if (!res.error && portsList.length >= 2) {
    renderSvgPlot(res);
    renderMarkerTable(res);

    const btnAddM = $("spAddMarker");
    if (btnAddM) {
      btnAddM.onclick = () => {
        if (linearMarkers.length >= 5) return;
        const midIdx = Math.floor(res.freqs.length / 2);
        linearMarkers.push({ id: "M" + (linearMarkers.length + 1), f: res.freqs[midIdx] });
        renderSvgPlot(res);
        renderMarkerTable(res);
      };
    }

    if ($("spExportCsv")) $("spExportCsv").onclick = () => exportSParamsCsv(res);
    if ($("spExportSvg")) $("spExportSvg").onclick = () => exportSParamsSvg();
    if ($("spExportPng")) $("spExportPng").onclick = () => exportSParamsPng();
    if ($("spExportS2p")) $("spExportS2p").onclick = () => exportTouchstoneS2p(res);

    if ($("chkCompare")) $("chkCompare").onchange = () => renderSvgPlot(res);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    toggleSParamsDrawer,
    fetchBackendSParams,
    runNewSParamSweep,
    renderLinearAnalysis
  };
}

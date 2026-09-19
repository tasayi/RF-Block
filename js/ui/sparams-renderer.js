"use strict";

/* ====================================================================
   RF Analyser Settings & Multi-Port S-Parameter Invocation Grid Panel
   ==================================================================== */

let sparamsTabs = []; // Array of { id, name, band, res }
let activeTabIdx = 0;
let linearMarkers = [{ id: "M1", f: 0 }];
let invokedTraces = new Set(["S21", "S11", "S22"]); // Currently invoked S-parameter trace keys

// Vibrant distinct colors for multi-port traces
const TRACE_COLORS = {
  S21: "#2563eb", S11: "#dc2626", S22: "#16a34a", S31: "#9333ea",
  S12: "#0d9488", S32: "#ea580c", S41: "#ca8a04", S23: "#db2777",
  S33: "#059669", S44: "#e11d48", S51: "#7c3aed", S61: "#4f46e5"
};
const FALLBACK_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#0d9488", "#ea580c", "#ca8a04", "#db2777"];

function getTraceColor(key, idx = 0) {
  return TRACE_COLORS[key] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

/* --- Analyser Settings Drawer Toggle & Renderer --- */
function toggleAnalyserDrawer() {
  const drawer = $("analyserDrawer");
  if (!drawer) return;
  const open = drawer.classList.toggle("open");
  if (open) renderAnalyserSettings();
  const btn = $("btnAnalyser");
  if (btn) btn.style.borderColor = open ? "var(--accent)" : "";
}

function renderAnalyserSettings() {
  const box = $("analyserDrawerBody");
  if (!box) return;

  const band = settings.analysisBand || { startFreq: 1, startUnit: "GHz", stopFreq: 10, stopUnit: "GHz", points: 101, sweepType: "lin", z0: 50 };

  let html = `<div style="padding:16px; font-family:sans-serif; max-width:600px; margin:0 auto; color:var(--txt,#1e293b)">
    <h3 style="margin:0 0 12px 0; font-size:15px; display:flex; align-items:center; gap:8px">
      <span>⚙️</span> Global Analyser & Frequency Sweep Parameters
    </h3>
    <div style="font-size:12px; color:var(--txt2,#64748b); margin-bottom:16px">
      Configure global frequency sweep range, resolution, and reference impedance for multi-port (up to 8 ports P1–P8) S-parameter linear analysis.
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:var(--bg2,#f8fafc); padding:16px; border-radius:8px; border:1px solid var(--border,#e2e8f0); margin-bottom:16px">
      <div>
        <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px">Start Frequency</label>
        <div style="display:flex; gap:6px">
          <input type="number" id="anStartFreq" value="${band.startFreq}" style="flex:1; padding:6px 8px; border:1px solid #cbd5e1; border-radius:4px"/>
          <select id="anStartUnit" style="padding:6px; border-radius:4px"><option ${band.startUnit==="MHz"?"selected":""}>MHz</option><option ${band.startUnit==="GHz"?"selected":""}>GHz</option></select>
        </div>
      </div>

      <div>
        <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px">Stop Frequency</label>
        <div style="display:flex; gap:6px">
          <input type="number" id="anStopFreq" value="${band.stopFreq}" style="flex:1; padding:6px 8px; border:1px solid #cbd5e1; border-radius:4px"/>
          <select id="anStopUnit" style="padding:6px; border-radius:4px"><option ${band.stopUnit==="MHz"?"selected":""}>MHz</option><option ${band.stopUnit==="GHz"?"selected":""}>GHz</option></select>
        </div>
      </div>

      <div>
        <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px">Sweep Points (N)</label>
        <input type="number" id="anPoints" value="${band.points}" style="width:100%; box-sizing:border-box; padding:6px 8px; border:1px solid #cbd5e1; border-radius:4px"/>
      </div>

      <div>
        <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px">Sweep Scale</label>
        <select id="anSweepType" style="width:100%; padding:6px; border-radius:4px">
          <option value="lin" ${band.sweepType==="lin"?"selected":""}>Linear</option>
          <option value="log" ${band.sweepType==="log"?"selected":""}>Logarithmic</option>
        </select>
      </div>

      <div>
        <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px">System Reference Impedance (Z₀)</label>
        <select id="anZ0" style="width:100%; padding:6px; border-radius:4px">
          <option value="50" ${(band.z0||50)==50?"selected":""}>50 Ω (Standard)</option>
          <option value="75" ${(band.z0||50)==75?"selected":""}>75 Ω (Cable/CATV)</option>
          <option value="100" ${(band.z0||50)==100?"selected":""}>100 Ω (Differential)</option>
        </select>
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end; gap:8px">
      <button class="btn" id="anSaveOnly">Save Settings</button>
      <button class="btn btn-pri" id="anRunSweep">⚡ Run Sweep & Open Results</button>
    </div>
  </div>`;

  box.innerHTML = html;

  const saveSettings = () => {
    const b = settings.analysisBand || {};
    b.startFreq = parseFloat($("anStartFreq").value) || 1;
    b.startUnit = $("anStartUnit").value;
    b.stopFreq = parseFloat($("anStopFreq").value) || 10;
    b.stopUnit = $("anStopUnit").value;
    b.points = parseInt($("anPoints").value) || 101;
    b.sweepType = $("anSweepType").value;
    b.z0 = parseInt($("anZ0").value) || 50;
    settings.analysisBand = b;
    return b;
  };

  if ($("anSaveOnly")) {
    $("anSaveOnly").onclick = () => {
      saveSettings();
      hint("Global Analyser settings saved.");
      toggleAnalyserDrawer();
    };
  }

  if ($("anRunSweep")) {
    $("anRunSweep").onclick = () => {
      const b = saveSettings();
      toggleAnalyserDrawer();
      runNewSParamSweep(b);
      const panel = $("spStagePanel");
      if (panel && panel.style.display === "none") toggleSParamsDrawer();
    };
  }
}


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

function runNewSParamSweep(band, tabName) {
  const res = withAllSheets(() => computeLinearAnalysis(band));
  const name = tabName || `Sweep ${sparamsTabs.length + 1}`;
  const newTab = { id: "sp_tab_" + Date.now(), name, band: { ...band }, res };
  sparamsTabs.push(newTab);
  activeTabIdx = sparamsTabs.length - 1;
  renderLinearAnalysis();
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

  let html = `<div style="max-width:1200px; margin:0 auto; font-family:sans-serif; color:var(--ink,#e2e8f0)">`;

  // Top Header Bar
  html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid var(--line,#334155); padding-bottom:10px">
    <div style="display:flex; align-items:center; gap:12px">
      <h3 style="margin:0; font-size:16px; display:flex; align-items:center; gap:8px">
        <span>📈</span> Multi-Port Transmission Analysis & Benchmark View
      </h3>
      <button class="btn btn-sm btn-pri" id="spRerunSweep" title="Re-evaluate sweep for current schematic state">⚡ Re-run Sweep</button>
      <button class="btn btn-sm" id="spOpenSettings" title="Open Analyser Settings">⚙️ Analyser Settings</button>
    </div>
    <button class="btn btn-sm" id="spClosePanel">✕ Close Analysis View</button>
  </div>`;

  // --- Results Tabs Bar ---
  html += `<div style="display:flex; align-items:center; gap:6px; margin-bottom:14px; overflow-x:auto; border-bottom:2px solid var(--border,#334155); padding-bottom:6px">`;
  sparamsTabs.forEach((tb, idx) => {
    const isCur = idx === activeTabIdx;
    html += `<div class="sp-tab-item" style="display:flex; align-items:center; gap:6px; padding:6px 14px; border-radius:6px 6px 0 0; background:${isCur?'var(--accent,#2563eb)':'var(--chrome,#1e293b)'}; color:${isCur?'#fff':'var(--ink-dim,#94a3b8)'}; font-size:12px; font-weight:${isCur?'600':'normal'}; cursor:pointer" data-tidx="${idx}">
      <span class="sp-tab-name" data-tidx="${idx}" title="Double-click to rename">${esc(tb.name)}</span>
      ${sparamsTabs.length > 1 ? `<span class="sp-tab-del" data-tidx="${idx}" style="opacity:0.7; font-size:11px; margin-left:4px">✕</span>` : ""}
    </div>`;
  });
  html += `<button class="btn btn-sm" id="spNewTab" style="margin-left:6px">+ New Sweep Tab</button>`;
  html += `</div>`;

  // Ports List Status Header
  const portsList = res.portsList || [];
  const portsStr = portsList.length ? portsList.map(p => `<b>${p.tag} (${esc(p.label)})</b>`).join(", ") : "None";

  html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:12px">
    <div style="font-size:12.5px; color:var(--ink-dim,#94a3b8)">
      Defined Ports (${portsList.length}): ${portsStr} | Active Tab: <b>${esc(activeTab ? activeTab.name : "Sweep")}</b>
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
    html += `<div style="background:#451a1a; color:#fca5a5; padding:12px; border-radius:6px; margin-bottom:14px; font-size:12.5px; border:1px solid #7f1d1d">
      <b>⚠️ Notice:</b> ${esc(res.error)}
      <div style="margin-top:4px; font-size:11.5px; opacity:0.85">To resolve: Select schematic terminals in the Inspector and assign Analysis Ports (P1 through P8).</div>
    </div>`;
  } else if (res.warnings && res.warnings.length) {
    html += `<div style="background:#451a03; color:#fcd34d; padding:10px; border-radius:6px; margin-bottom:14px; font-size:12px; border:1px solid #78350f">
      ${res.warnings.map(w => `<div>⚠️ ${esc(w)}</div>`).join("")}
    </div>`;
  }

  if (!res.error && portsList.length >= 2) {
    // --- Interactive Transmission Trace Selector ---
    const P = portsList.length;

    // Build list of valid transmission S_ij (i != j) combinations
    const availableTraces = [];
    for (let i = 1; i <= P; i++) {
      for (let j = 1; j <= P; j++) {
        if (i === j) continue; // Focus strictly on transmission parameters
        const sKey = `S${i}${j}`;
        let label = sKey;
        if (j === 1) label += ` (Forward Transmission P1 → P${i})`;
        else label += ` (Transmission P${j} → P${i})`;
        availableTraces.push({ key: sKey, label });
      }
    }

    // Clean out old S_ii return loss keys if present
    invokedTraces.forEach(k => {
      if (/^S(\d+)\1$/.test(k)) invokedTraces.delete(k);
    });
    // Auto-invoke traces with active data (> -110 dB) if current selection is empty or isolated
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

    html += `<div style="background:var(--chrome,#1e293b); border:1px solid var(--line,#334155); border-radius:8px; padding:12px; margin-bottom:14px">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px">
        <h4 style="margin:0; font-size:13px; color:var(--ink,#e2e8f0); display:flex; align-items:center; gap:6px">
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
          <label style="font-size:12px; font-weight:600; color:#94a3b8">Add Trace:</label>
          <select id="spTraceSelect" style="padding:6px 10px; font-size:12px; border-radius:6px; border:1px solid #334155; background:#0f172a; color:#e2e8f0; min-width:240px">
            <option value="">-- Select Transmission Trace --</option>`;

    availableTraces.forEach(tr => {
      const isInv = invokedTraces.has(tr.key);
      html += `<option value="${tr.key}"${isInv ? " disabled" : ""}>${esc(tr.label)}${isInv ? " (Active)" : ""}</option>`;
    });

    html += `</select>
        </div>

        <div style="font-size:12px; font-weight:600; color:#94a3b8">Active:</div>
        <div id="spActiveTraceChips" style="display:flex; gap:6px; flex-wrap:wrap; align-items:center">`;

    let chipIdx = 0;
    invokedTraces.forEach(sKey => {
      const col = getTraceColor(sKey, chipIdx++);
      html += `<div style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:4px; background:${col}; color:#ffffff; font-size:12px; font-weight:600; box-shadow:0 1px 2px rgba(0,0,0,0.2)">
        <span>${sKey}</span>
        <span class="sp-chip-del" data-skey="${sKey}" style="cursor:pointer; opacity:0.85; font-size:11px; margin-left:2px" title="Remove trace">✕</span>
      </div>`;
    });

    html += `</div>
      </div>
    </div>`;

    // --- Chart Area ---
    html += `<div style="position:relative; background:#ffffff; border:1px solid var(--border,#334155); border-radius:8px; padding:14px; margin-bottom:16px">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; font-size:12px; flex-wrap:wrap; gap:8px">
        <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap">
          <span style="font-weight:600; color:#334155">Transmission Traces (${invokedTraces.size}):</span>`;
    invokedTraces.forEach(sKey => {
      const col = getTraceColor(sKey);
      html += `<span style="color:${col}; font-weight:600; font-size:12px">■ ${sKey}</span>`;
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
    html += `<div style="background:var(--chrome,#1e293b); border:1px solid var(--line,#334155); border-radius:8px; padding:14px">
      <h4 style="margin:0 0 10px 0; font-size:13px; color:var(--ink,#e2e8f0)">📌 Frequency Markers & Readouts</h4>
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

/* Render SVG Plotter for All Invoked Traces with Dynamic Y-Axis Auto-Scaling */
function renderSvgPlot(res) {
  const container = $("spChartContainer");
  if (!container || !res || !res.freqs || !res.matrix) return;

  const showCompare = $("chkCompare") && $("chkCompare").checked;
  const freqs = res.freqs;
  const N = freqs.length;
  const fMin = freqs[0], fMax = freqs[N - 1];

  const useGhz = fMax >= 1e8;
  const fDiv = useGhz ? 1e9 : 1e6;
  const fUnit = useGhz ? "GHz" : "MHz";

  const W = container.clientWidth || 900;
  const H = 360;
  const margin = { top: 20, right: 30, bottom: 35, left: 50 };
  const pw = W - margin.left - margin.right;
  const ph = H - margin.top - margin.bottom;

  // Compute dynamic Y-axis auto-scaling from active data (> -110 dB)
  let dMin = Infinity, dMax = -Infinity;
  invokedTraces.forEach(sKey => {
    const arr = res.matrix[sKey];
    if (arr) {
      for (let k = 0; k < N; k++) {
        const v = arr[k];
        if (isFinite(v) && v > -110) {
          if (v < dMin) dMin = v;
          if (v > dMax) dMax = v;
        }
      }
    }
  });

  let yMin, yMax;
  if (!isFinite(dMin) || !isFinite(dMax)) {
    yMin = -60; yMax = 30;
  } else {
    const span = Math.max(1, dMax - dMin);
    yMin = Math.floor((dMin - Math.max(1, span * 0.2)) / 5) * 5;
    yMax = Math.ceil((dMax + Math.max(1, span * 0.2)) / 5) * 5;
    if (yMin >= yMax) { yMin = -60; yMax = 30; }
  }

  const getX = f => margin.left + ((f - fMin) / (fMax - fMin || 1)) * pw;
  const getY = val => margin.top + (1 - (val - yMin) / (yMax - yMin || 1)) * ph;

  let svgHtml = `<svg id="spSvgPlot" width="100%" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="user-select:none; font-family:sans-serif; background:#fff">`;

  // Grid Lines & Axis Labels
  svgHtml += `<rect x="${margin.left}" y="${margin.top}" width="${pw}" height="${ph}" fill="#fafafa" stroke="#cbd5e1"/>`;

  const yStep = Math.max(2, Math.ceil((yMax - yMin) / 6 / 2) * 2);
  for (let db = yMin; db <= yMax; db += yStep) {
    const y = getY(db);
    if (y >= margin.top && y <= H - margin.bottom) {
      svgHtml += `<line x1="${margin.left}" y1="${y}" x2="${W - margin.right}" y2="${y}" stroke="${db===0?'#94a3b8':'#e2e8f0'}" stroke-width="${db===0?1.5:1}"/>`;
      svgHtml += `<text x="${margin.left - 6}" y="${y + 4}" font-size="10" fill="#64748b" text-anchor="end">${db} dB</text>`;
    }
  }

  for (let i = 0; i <= 5; i++) {
    const fVal = fMin + (i / 5) * (fMax - fMin);
    const x = getX(fVal);
    svgHtml += `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${H - margin.bottom}" stroke="#e2e8f0" stroke-width="1"/>`;
    svgHtml += `<text x="${x}" y="${H - margin.bottom + 16}" font-size="10" fill="#64748b" text-anchor="middle">${(fVal / fDiv).toFixed(2)} ${fUnit}</text>`;
  }

  const makePath = arr => {
    let d = "";
    for (let k = 0; k < N; k++) {
      const x = getX(freqs[k]);
      const y = Math.max(margin.top, Math.min(H - margin.bottom, getY(arr[k])));
      d += (k === 0 ? "M" : "L") + `${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  };

  // Comparative Overlays for Benchmark Saved Tabs
  if (showCompare && sparamsTabs.length > 1) {
    sparamsTabs.forEach((tb, idx) => {
      if (idx === activeTabIdx || !tb.res || !tb.res.matrix) return;
      invokedTraces.forEach(sKey => {
        if (tb.res.matrix[sKey]) {
          svgHtml += `<path d="${makePath(tb.res.matrix[sKey])}" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4 3"/>`;
        }
      });
    });
  }

  // Active Invoked Traces
  let traceIdx = 0;
  invokedTraces.forEach(sKey => {
    if (res.matrix[sKey]) {
      const col = getTraceColor(sKey, traceIdx++);
      svgHtml += `<path d="${makePath(res.matrix[sKey])}" fill="none" stroke="${col}" stroke-width="2.2"/>`;
    }
  });

  // Frequency Markers
  if (linearMarkers.length) {
    if (linearMarkers[0].f === 0) linearMarkers[0].f = (fMin + fMax) / 2;

    linearMarkers.forEach(m => {
      const mx = getX(m.f);
      svgHtml += `<line x1="${mx}" y1="${margin.top}" x2="${mx}" y2="${H - margin.bottom}" stroke="#0f172a" stroke-width="1.5" stroke-dasharray="4 3"/>`;
      svgHtml += `<polygon points="${mx-6},${margin.top} ${mx+6},${margin.top} ${mx},${margin.top+10}" fill="#0f172a"/>`;
      svgHtml += `<text x="${mx}" y="${margin.top - 4}" font-size="11" font-weight="bold" fill="#0f172a" text-anchor="middle">${m.id}</text>`;
    });
  }

  svgHtml += `</svg>`;
  container.innerHTML = svgHtml;
}

/* Render Table for Markers and Invoked S-Parameters */
function renderMarkerTable(res) {
  const box = $("spMarkerTable");
  if (!box || !res || !res.freqs || !res.matrix) return;

  const freqs = res.freqs;
  const fMin = freqs[0], fMax = freqs[freqs.length - 1];
  const useGhz = fMax >= 1e8;
  const fDiv = useGhz ? 1e9 : 1e6;
  const fUnit = useGhz ? "GHz" : "MHz";

  const invKeys = Array.from(invokedTraces);

  const getValAt = (arr, targetF) => {
    if (!arr) return "-";
    let idx = 0;
    while (idx < freqs.length - 1 && freqs[idx + 1] < targetF) idx++;
    const v = arr[idx];
    return isFinite(v) ? v.toFixed(2) + " dB" : "-";
  };

  let h = `<table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left; color:var(--ink,#e2e8f0)">
    <thead>
      <tr style="border-bottom:1px solid #334155; color:#94a3b8">
        <th style="padding:6px">Marker</th>
        <th style="padding:6px">Frequency (${fUnit})</th>`;

  invKeys.forEach(sKey => {
    const col = getTraceColor(sKey);
    h += `<th style="padding:6px; color:${col}">${sKey}</th>`;
  });

  h += `<th style="padding:6px">Action</th>
      </tr>
    </thead>
    <tbody>`;

  const m1F = linearMarkers.length ? linearMarkers[0].f : fMin;

  linearMarkers.forEach((m, idx) => {
    const deltaF = ((m.f - m1F) / fDiv).toFixed(3);

    h += `<tr style="border-bottom:1px solid #334155">
      <td style="padding:6px; font-weight:bold">${m.id}</td>
      <td style="padding:6px">
        <input type="number" step="0.01" value="${(m.f / fDiv).toFixed(3)}" data-midx="${idx}" class="sp-mkr-input" style="width:75px; padding:3px 6px; background:#0f172a; color:#e2e8f0; border:1px solid #334155; border-radius:4px"/>
        ${idx > 0 ? `<span style="font-size:10px; color:#94a3b8; margin-left:4px">(Δ ${deltaF > 0 ? '+'+deltaF : deltaF})</span>` : ""}
      </td>`;

    invKeys.forEach(sKey => {
      const v = getValAt(res.matrix[sKey], m.f);
      const col = getTraceColor(sKey);
      h += `<td style="padding:6px; color:${col}; font-weight:600">${v}</td>`;
    });

    h += `<td style="padding:6px">
        ${idx > 0 ? `<button class="btn btn-sm btn-del sp-del-mkr" data-midx="${idx}">✕</button>` : `<span style="color:#64748b">Ref</span>`}
      </td>
    </tr>`;
  });

  h += `</tbody></table>`;
  box.innerHTML = h;

  box.querySelectorAll(".sp-mkr-input").forEach(inp => {
    inp.onchange = e => {
      const idx = parseInt(e.target.getAttribute("data-midx"));
      const newF = parseFloat(e.target.value) * fDiv;
      if (isFinite(newF) && newF >= fMin && newF <= fMax) {
        linearMarkers[idx].f = newF;
        renderSvgPlot(res);
        renderMarkerTable(res);
      }
    };
  });

  box.querySelectorAll(".sp-del-mkr").forEach(btn => {
    btn.onclick = e => {
      const idx = parseInt(e.target.getAttribute("data-midx"));
      linearMarkers.splice(idx, 1);
      renderSvgPlot(res);
      renderMarkerTable(res);
    };
  });
}

/* Export Multi-Port Graph Data to CSV */
function exportSParamsCsv(res) {
  if (!res || !res.freqs || !res.matrix) return;
  const freqs = res.freqs;
  const invKeys = Array.from(invokedTraces);
  let csv = "Frequency_Hz," + invKeys.join(",") + "\n";

  for (let k = 0; k < freqs.length; k++) {
    const row = [freqs[k].toFixed(0)];
    invKeys.forEach(sKey => {
      const arr = res.matrix[sKey];
      row.push(arr ? arr[k].toFixed(4) : "-120.0000");
    });
    csv += row.join(",") + "\n";
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rf_multi_port_linear_analysis.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/* Export SVG Vector Graph File */
function exportSParamsSvg() {
  const container = $("spChartContainer");
  if (!container) return;
  const svgEl = container.querySelector("svg");
  if (!svgEl) return;
  const svgText = new XMLSerializer().serializeToString(svgEl);
  const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "multi_port_s_parameters.svg";
  a.click();
  URL.revokeObjectURL(url);
}

/* Export PNG Raster Graph Image File */
function exportSParamsPng() {
  const container = $("spChartContainer");
  if (!container) return;
  const svgEl = container.querySelector("svg");
  if (!svgEl) return;
  const svgText = new XMLSerializer().serializeToString(svgEl);
  const img = new Image();
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
  img.onload = () => {
    const cv = document.createElement("canvas");
    cv.width = 1800; cv.height = 720;
    const g = cv.getContext("2d");
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(img, 0, 0, cv.width, cv.height);
    cv.toBlob(blob => {
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = "multi_port_s_parameters.png";
      a.click();
      URL.revokeObjectURL(u);
    });
  };
  img.src = url;
}

/* Export System Touchstone (.s2p / .sNp) File */
function exportTouchstoneS2p(res) {
  if (!res || !res.freqs || !res.matrix) return;
  const freqs = res.freqs;
  const P = (res.portsList && res.portsList.length) || 2;
  let sNp = `! RF Chain System Multi-Port S-Parameters (${P}-Port Export)\n`;
  sNp += `! Date: ${new Date().toISOString()}\n`;
  sNp += `# Hz S DB R 50\n`;

  for (let k = 0; k < freqs.length; k++) {
    let line = `${freqs[k].toFixed(0)}`;
    for (let i = 1; i <= P; i++) {
      for (let j = 1; j <= P; j++) {
        const arr = res.matrix[`S${i}${j}`];
        const db = arr ? arr[k].toFixed(3) : "-120.000";
        line += ` ${db} 0.00`;
      }
    }
    sNp += line + "\n";
  }

  const ext = P === 2 ? ".s2p" : `.s${P}p`;
  const blob = new Blob([sNp], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `system_linear_analysis${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

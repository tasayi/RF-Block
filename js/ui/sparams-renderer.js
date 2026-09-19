"use strict";

/* ====================================================================
   RF Analyser Settings & Full-Stage S-Parameter Analysis Panel
   ==================================================================== */

let sparamsTabs = []; // Array of { id, name, band, res }
let activeTabIdx = 0;
let linearMarkers = [{ id: "M1", f: 0 }];

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
      Configure the global frequency sweep range, step resolution, and reference impedance for system-level linear S-parameter analysis.
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


/* --- Full-Stage S-Params Panel & Tab Management --- */
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

  // DYNAMICALLY RE-RUN LINEAR SOLVER ON CURRENT DIAGRAM STATE
  // Ensures newly added ports (P1, P2, P3) or block edits are instantly evaluated!
  const band = (activeTab && activeTab.band) || settings.analysisBand || { startFreq: 1, startUnit: "GHz", stopFreq: 10, stopUnit: "GHz", points: 101, sweepType: "lin" };
  const res = withAllSheets(() => computeLinearAnalysis(band));
  if (activeTab) activeTab.res = res;

  let html = `<div style="max-width:1200px; margin:0 auto; font-family:sans-serif; color:var(--ink,#e2e8f0)">`;

  // Top Header Bar
  html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid var(--line,#334155); padding-bottom:10px">
    <div style="display:flex; align-items:center; gap:12px">
      <h3 style="margin:0; font-size:16px; display:flex; align-items:center; gap:8px">
        <span>📈</span> Linear S-Parameter Analysis & Comparison View
      </h3>
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

  // Status & Port Indicators
  html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:12px">
    <div style="font-size:12.5px; color:var(--ink-dim,#94a3b8)">
      Analysis Ports: <b>P1 (${esc(res.p1 || "None")})</b> ➔ <b>P2 (${esc(res.p2 || "None")})</b> ${res.p3 ? `& <b>P3 (${esc(res.p3)})</b>` : ""} | Active: <b>${esc(activeTab.name)}</b>
    </div>

    <!-- Export Action Buttons -->
    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
      ${sparamsTabs.length > 1 ? `<label style="font-size:12px; font-weight:600; cursor:pointer"><input type="checkbox" id="chkCompare" /> Compare with Benchmark Overlay</label>` : ""}
      <button class="btn btn-sm" id="spExportCsv">📄 Export CSV</button>
      <button class="btn btn-sm" id="spExportSvg">📊 Export SVG</button>
      <button class="btn btn-sm" id="spExportPng">🖼️ Export PNG</button>
      <button class="btn btn-sm" id="spExportS2p">📁 Export .s2p</button>
    </div>
  </div>`;

  // Warning Alerts Banner
  if (res.error) {
    html += `<div style="background:#451a1a; color:#fca5a5; padding:12px; border-radius:6px; margin-bottom:14px; font-size:12.5px; border:1px solid #7f1d1d">
      <b>⚠️ Notice:</b> ${esc(res.error)}
      <div style="margin-top:4px; font-size:11.5px; opacity:0.85">To resolve: Select your input connector/antenna in the Inspector and set 'Analysis Port' to <b>P1</b>, then select your output connector and set 'Analysis Port' to <b>P2</b>.</div>
    </div>`;
  } else if (res.warnings && res.warnings.length) {
    html += `<div style="background:#451a03; color:#fcd34d; padding:10px; border-radius:6px; margin-bottom:14px; font-size:12px; border:1px solid #78350f">
      ${res.warnings.map(w => `<div>⚠️ ${esc(w)}</div>`).join("")}
    </div>`;
  }

  if (!res.error) {
    // Chart Area (Full Height & Width)
    html += `<div style="position:relative; background:#ffffff; border:1px solid var(--border,#334155); border-radius:8px; padding:14px; margin-bottom:16px">
      <!-- Trace Visibility Toggles & Marker Actions -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; font-size:12px; flex-wrap:wrap; gap:8px">
        <div style="display:flex; gap:16px; align-items:center">
          <label style="color:#2563eb; font-weight:600; cursor:pointer"><input type="checkbox" id="chkS21" checked/> S21 (Gain)</label>
          ${res.path13 ? `<label style="color:#9333ea; font-weight:600; cursor:pointer"><input type="checkbox" id="chkS31" checked/> S31 (Coupled)</label>` : ""}
          <label style="color:#dc2626; font-weight:600; cursor:pointer"><input type="checkbox" id="chkS11" checked/> S11 (P1 Match)</label>
          <label style="color:#16a34a; font-weight:600; cursor:pointer"><input type="checkbox" id="chkS22" checked/> S22 (P2 Match)</label>
        </div>
        <div>
          <button class="btn btn-sm" id="spAddMarker">+ Add Marker</button>
        </div>
      </div>

      <!-- SVG Chart -->
      <div id="spChartContainer" style="width:100%; height:360px; position:relative"></div>
    </div>`;

    // Markers Table
    html += `<div style="background:var(--chrome,#1e293b); border:1px solid var(--line,#334155); border-radius:8px; padding:14px">
      <h4 style="margin:0 0 10px 0; font-size:13px; color:var(--ink,#e2e8f0)">📌 Frequency Markers & Delta Readouts</h4>
      <div id="spMarkerTable"></div>
    </div>`;
  }

  html += `</div>`;
  box.innerHTML = html;

  // Bind Header Action Buttons
  if ($("spClosePanel")) $("spClosePanel").onclick = toggleSParamsDrawer;
  if ($("spOpenSettings")) $("spOpenSettings").onclick = toggleAnalyserDrawer;

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

  if (!res.error) {
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

    ["chkS21", "chkS31", "chkS11", "chkS22", "chkCompare"].forEach(id => {
      const el = $(id);
      if (el) el.onchange = () => renderSvgPlot(res);
    });
  }
}

/* Render SVG Plotter with Traces and Optional Benchmark Comparison Overlay */
function renderSvgPlot(res) {
  const container = $("spChartContainer");
  if (!container || !res || !res.freqs || !res.path12) return;

  const showS21 = $("chkS21") && $("chkS21").checked;
  const showS31 = $("chkS31") && $("chkS31").checked;
  const showS11 = $("chkS11") && $("chkS11").checked;
  const showS22 = $("chkS22") && $("chkS22").checked;
  const showCompare = $("chkCompare") && $("chkCompare").checked;

  const freqs = res.freqs;
  const N = freqs.length;
  const fMin = freqs[0], fMax = freqs[N - 1];

  const useGhz = fMax >= 1e8;
  const fDiv = useGhz ? 1e9 : 1e6;
  const fUnit = useGhz ? "GHz" : "MHz";

  const W = container.clientWidth || 900;
  const H = 360;
  const margin = { top: 20, right: 30, bottom: 35, left: 45 };
  const pw = W - margin.left - margin.right;
  const ph = H - margin.top - margin.bottom;

  let yMin = -60, yMax = 30;

  const getX = f => margin.left + ((f - fMin) / (fMax - fMin || 1)) * pw;
  const getY = val => margin.top + (1 - (val - yMin) / (yMax - yMin)) * ph;

  let svgHtml = `<svg id="spSvgPlot" width="100%" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="user-select:none; font-family:sans-serif; background:#fff">`;

  // Grid Lines & Labels
  svgHtml += `<rect x="${margin.left}" y="${margin.top}" width="${pw}" height="${ph}" fill="#fafafa" stroke="#cbd5e1"/>`;

  for (let db = -60; db <= 30; db += 15) {
    const y = getY(db);
    svgHtml += `<line x1="${margin.left}" y1="${y}" x2="${W - margin.right}" y2="${y}" stroke="${db===0?'#94a3b8':'#e2e8f0'}" stroke-width="${db===0?1.5:1}"/>`;
    svgHtml += `<text x="${margin.left - 6}" y="${y + 4}" font-size="10" fill="#64748b" text-anchor="end">${db} dB</text>`;
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

  // Optional Comparative Benchmark Overlays
  if (showCompare && sparamsTabs.length > 1) {
    sparamsTabs.forEach((tb, idx) => {
      if (idx === activeTabIdx || !tb.res || !tb.res.path12) return;
      if (showS21 && tb.res.path12.s21) {
        svgHtml += `<path d="${makePath(tb.res.path12.s21)}" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4 3"/>`;
      }
    });
  }

  // Active Tab Traces
  if (showS11 && res.path12.s11) svgHtml += `<path d="${makePath(res.path12.s11)}" fill="none" stroke="#dc2626" stroke-width="1.8"/>`;
  if (showS22 && res.path12.s22) svgHtml += `<path d="${makePath(res.path12.s22)}" fill="none" stroke="#16a34a" stroke-width="1.8"/>`;
  if (showS31 && res.path13 && res.path13.s21) svgHtml += `<path d="${makePath(res.path13.s21)}" fill="none" stroke="#9333ea" stroke-width="2"/>`;
  if (showS21 && res.path12.s21) svgHtml += `<path d="${makePath(res.path12.s21)}" fill="none" stroke="#2563eb" stroke-width="2.2"/>`;

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

/* Render Table for Markers and Delta Comparisons */
function renderMarkerTable(res) {
  const box = $("spMarkerTable");
  if (!box || !res || !res.freqs) return;

  const freqs = res.freqs;
  const fMin = freqs[0], fMax = freqs[freqs.length - 1];
  const useGhz = fMax >= 1e8;
  const fDiv = useGhz ? 1e9 : 1e6;
  const fUnit = useGhz ? "GHz" : "MHz";

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
        <th style="padding:6px">Frequency (${fUnit})</th>
        <th style="padding:6px">S21 (Gain)</th>
        ${res.path13 ? `<th style="padding:6px">S31 (Coupled)</th>` : ""}
        <th style="padding:6px">S11 (Return Loss)</th>
        <th style="padding:6px">S22 (Output RL)</th>
        <th style="padding:6px">Action</th>
      </tr>
    </thead>
    <tbody>`;

  const m1F = linearMarkers.length ? linearMarkers[0].f : fMin;

  linearMarkers.forEach((m, idx) => {
    const s21Val = getValAt(res.path12.s21, m.f);
    const s31Val = res.path13 ? getValAt(res.path13.s21, m.f) : "-";
    const s11Val = getValAt(res.path12.s11, m.f);
    const s22Val = getValAt(res.path12.s22, m.f);

    const deltaF = ((m.f - m1F) / fDiv).toFixed(3);

    h += `<tr style="border-bottom:1px solid #334155">
      <td style="padding:6px; font-weight:bold">${m.id}</td>
      <td style="padding:6px">
        <input type="number" step="0.01" value="${(m.f / fDiv).toFixed(3)}" data-midx="${idx}" class="sp-mkr-input" style="width:75px; padding:3px 6px; background:#0f172a; color:#e2e8f0; border:1px solid #334155; border-radius:4px"/>
        ${idx > 0 ? `<span style="font-size:10px; color:#94a3b8; margin-left:4px">(Δ ${deltaF > 0 ? '+'+deltaF : deltaF})</span>` : ""}
      </td>
      <td style="padding:6px; color:#60a5fa; font-weight:600">${s21Val}</td>
      ${res.path13 ? `<td style="padding:6px; color:#c084fc">${s31Val}</td>` : ""}
      <td style="padding:6px; color:#f87171">${s11Val}</td>
      <td style="padding:6px; color:#4ade80">${s22Val}</td>
      <td style="padding:6px">
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

/* Export Graph Data as CSV */
function exportSParamsCsv(res) {
  if (!res || !res.freqs || !res.path12) return;
  const freqs = res.freqs;
  let csv = "Frequency_Hz,S21_dB,S11_dB,S22_dB";
  if (res.path13) csv += ",S31_dB";
  csv += "\n";

  for (let k = 0; k < freqs.length; k++) {
    csv += `${freqs[k].toFixed(0)},${res.path12.s21[k].toFixed(4)},${res.path12.s11[k].toFixed(4)},${res.path12.s22[k].toFixed(4)}`;
    if (res.path13) csv += `,${res.path13.s21[k].toFixed(4)}`;
    csv += "\n";
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rf_linear_analysis_sparams.csv";
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
  a.download = "s_parameters_chart.svg";
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
      a.download = "s_parameters_chart.png";
      a.click();
      URL.revokeObjectURL(u);
    });
  };
  img.src = url;
}

/* Export System Touchstone (.s2p) File */
function exportTouchstoneS2p(res) {
  if (!res || !res.freqs || !res.path12) return;
  const freqs = res.freqs;
  let s2p = `! RF Chain System S-Parameters Export\n`;
  s2p += `! Date: ${new Date().toISOString()}\n`;
  s2p += `# Hz S DB R 50\n`;
  s2p += `! Freq_Hz    S11_dB S11_deg  S21_dB S21_deg  S12_dB S12_deg  S22_dB S22_deg\n`;

  for (let k = 0; k < freqs.length; k++) {
    const f = freqs[k].toFixed(0);
    const s11 = res.path12.s11[k].toFixed(3);
    const s21 = res.path12.s21[k].toFixed(3);
    const s12 = res.path12.s12 ? res.path12.s12[k].toFixed(3) : "-120.000";
    const s22 = res.path12.s22[k].toFixed(3);
    s2p += `${f} ${s11} 0.00 ${s21} 0.00 ${s12} 0.00 ${s22} 0.00\n`;
  }

  const blob = new Blob([s2p], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "system_linear_analysis.s2p";
  a.click();
  URL.revokeObjectURL(url);
}

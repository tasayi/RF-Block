"use strict";

/* =====================================================================
 * RF Block Diagram Editor - S-Parameters Trace Grid & Analyser Settings
 * ===================================================================== */

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

  let html = `<div style="padding:16px; font-family:var(--sans); max-width:600px; margin:0 auto; color:var(--ink,#f8fafc)">
    <h3 style="margin:0 0 12px 0; font-size:15px; display:flex; align-items:center; gap:8px; color:var(--accent,#f59e0b)">
      <span>⚙️</span> Global Analyser & Frequency Sweep Parameters
    </h3>
    <div style="font-size:12px; color:var(--ink-dim,#94a3b8); margin-bottom:16px">
      Configure global frequency sweep range, resolution, and reference impedance for multi-port (up to 8 ports P1–P8) S-parameter linear analysis.
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:var(--chrome); padding:16px; border-radius:8px; border:1px solid var(--line); margin-bottom:16px">
      <div>
        <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:var(--ink-dim); display:block; margin-bottom:5px">Start Frequency</label>
        <div style="display:flex; gap:6px">
          <input type="number" id="anStartFreq" value="${band.startFreq}" style="flex:1; padding:7px 10px; background:var(--chrome-2); border:1px solid var(--line); color:var(--ink); border-radius:6px; font-family:var(--mono)"/>
          <select id="anStartUnit" style="padding:7px; background:var(--chrome-2); border:1px solid var(--line); color:var(--ink); border-radius:6px"><option ${band.startUnit==="MHz"?"selected":""}>MHz</option><option ${band.startUnit==="GHz"?"selected":""}>GHz</option></select>
        </div>
      </div>

      <div>
        <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:var(--ink-dim); display:block; margin-bottom:5px">Stop Frequency</label>
        <div style="display:flex; gap:6px">
          <input type="number" id="anStopFreq" value="${band.stopFreq}" style="flex:1; padding:7px 10px; background:var(--chrome-2); border:1px solid var(--line); color:var(--ink); border-radius:6px; font-family:var(--mono)"/>
          <select id="anStopUnit" style="padding:7px; background:var(--chrome-2); border:1px solid var(--line); color:var(--ink); border-radius:6px"><option ${band.stopUnit==="MHz"?"selected":""}>MHz</option><option ${band.stopUnit==="GHz"?"selected":""}>GHz</option></select>
        </div>
      </div>

      <div>
        <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:var(--ink-dim); display:block; margin-bottom:5px">Sweep Points (N)</label>
        <input type="number" id="anPoints" value="${band.points}" style="width:100%; box-sizing:border-box; padding:7px 10px; background:var(--chrome-2); border:1px solid var(--line); color:var(--ink); border-radius:6px; font-family:var(--mono)"/>
      </div>

      <div>
        <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:var(--ink-dim); display:block; margin-bottom:5px">Sweep Scale</label>
        <select id="anSweepType" style="width:100%; padding:7px; background:var(--chrome-2); border:1px solid var(--line); color:var(--ink); border-radius:6px">
          <option value="lin" ${band.sweepType==="lin"?"selected":""}>Linear</option>
          <option value="log" ${band.sweepType==="log"?"selected":""}>Logarithmic</option>
        </select>
      </div>

      <div>
        <label style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:var(--ink-dim); display:block; margin-bottom:5px">System Reference Impedance (Z₀)</label>
        <select id="anZ0" style="width:100%; padding:7px; background:var(--chrome-2); border:1px solid var(--line); color:var(--ink); border-radius:6px">
          <option value="50" ${(band.z0||50)==50?"selected":""}>50 Ω (Standard)</option>
          <option value="75" ${(band.z0||50)==75?"selected":""}>75 Ω (Cable/CATV)</option>
          <option value="100" ${(band.z0||50)==100?"selected":""}>100 Ω (Differential)</option>
        </select>
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end; gap:8px">
      <button class="btn" id="anSaveOnly">Save Settings</button>
      <button class="btn primary" id="anRunSweep">⚡ Run Sweep & Open Results</button>
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

/* Render Table for Markers and Invoked S-Parameters */
function renderMarkerTable(res, activeMetric = "mag") {
  const box = $("spMarkerTable");
  if (!box || !res || !res.freqs || !res.matrix) return;

  const freqs = res.freqs;
  const fMin = freqs[0], fMax = freqs[freqs.length - 1];
  const useGhz = fMax >= 1e8;
  const fDiv = useGhz ? 1e9 : 1e6;
  const fUnit = useGhz ? "GHz" : "MHz";

  const invKeys = Array.from(invokedTraces);

  const getMetricData = (sKey) => {
    if (activeMetric === "phase") return res.matrix_phase && res.matrix_phase[sKey];
    if (activeMetric === "delay") return res.matrix_gd && res.matrix_gd[sKey];
    if (activeMetric === "k") return res.k_factor;
    return res.matrix[sKey];
  };

  const getUnitSuffix = () => {
    if (activeMetric === "phase") return "°";
    if (activeMetric === "delay") return " ns";
    if (activeMetric === "k") return "";
    return " dB";
  };

  const getValAt = (arr, targetF) => {
    if (!arr) return "-";
    let idx = 0;
    while (idx < freqs.length - 1 && freqs[idx + 1] < targetF) idx++;
    const v = arr[idx];
    return isFinite(v) ? v.toFixed(2) + getUnitSuffix() : "-";
  };

  let h = `<table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left; color:var(--ink)">
    <thead>
      <tr style="border-bottom:1px solid var(--line); color:var(--ink-dim)">
        <th style="padding:6px">Marker</th>
        <th style="padding:6px">Frequency (${fUnit})</th>`;

  if (activeMetric === "k") {
    h += `<th style="padding:6px; color:#10b981">Stability Factor K</th>`;
  } else {
    invKeys.forEach(sKey => {
      const col = getTraceColor(sKey);
      h += `<th style="padding:6px; color:${col}">${sKey}</th>`;
    });
  }

  h += `<th style="padding:6px">Action</th>
      </tr>
    </thead>
    <tbody>`;

  const m1F = linearMarkers.length ? linearMarkers[0].f : fMin;

  linearMarkers.forEach((m, idx) => {
    const deltaF = ((m.f - m1F) / fDiv).toFixed(3);

    h += `<tr style="border-bottom:1px solid var(--line)">
      <td style="padding:6px; font-weight:bold">${m.id}</td>
      <td style="padding:6px">
        <input type="number" step="0.01" value="${(m.f / fDiv).toFixed(3)}" data-midx="${idx}" class="sp-mkr-input" style="width:75px; padding:3px 6px; background:var(--chrome-2); color:var(--ink); border:1px solid var(--line); border-radius:4px"/>
        ${idx > 0 ? `<span style="font-size:10px; color:var(--ink-dim); margin-left:4px">(Δ ${deltaF > 0 ? '+'+deltaF : deltaF})</span>` : ""}
      </td>`;

    if (activeMetric === "k") {
      const v = getValAt(res.k_factor, m.f);
      h += `<td style="padding:6px; color:#10b981; font-weight:600">${v}</td>`;
    } else {
      invKeys.forEach(sKey => {
        const dArr = getMetricData(sKey);
        const v = getValAt(dArr, m.f);
        const col = getTraceColor(sKey);
        h += `<td style="padding:6px; color:${col}; font-weight:600">${v}</td>`;
      });
    }

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
        if (typeof renderSvgPlot === "function") renderSvgPlot(res, activeMetric);
        renderMarkerTable(res, activeMetric);
        if ($("spMatrixTableContainer")) renderSParamMatrixTable(res, "spMatrixTableContainer");
      }
    };
  });

  box.querySelectorAll(".sp-del-mkr").forEach(btn => {
    btn.onclick = e => {
      const idx = parseInt(e.target.getAttribute("data-midx"));
      linearMarkers.splice(idx, 1);
      if (typeof renderSvgPlot === "function") renderSvgPlot(res, activeMetric);
      renderMarkerTable(res, activeMetric);
      if ($("spMatrixTableContainer")) renderSParamMatrixTable(res, "spMatrixTableContainer");
    };
  });
}

/* Render Interactive N x N S-Parameter Matrix Table at Active Marker Frequency */
function renderSParamMatrixTable(res, boxId = "spMatrixTableContainer", onToggleTrace = null) {
  const box = $(boxId);
  if (!box || !res || !res.freqs || !res.matrix) return;

  const freqs = res.freqs;
  const portsList = res.portsList || [];
  let P = portsList.length;
  if (P < 2) {
    let maxP = 2;
    for (const k in res.matrix) {
      if (k.startsWith("S") && k.length >= 3) {
        const outP = parseInt(k[1]), inP = parseInt(k[2]);
        if (outP > maxP) maxP = outP;
        if (inP > maxP) maxP = inP;
      }
    }
    P = maxP;
  }

  // Find index corresponding to M1
  const m1 = (typeof linearMarkers !== "undefined" && linearMarkers.length) ? linearMarkers[0] : null;
  const targetF = m1 ? m1.f : freqs[Math.floor(freqs.length / 2)];
  let k = 0;
  while (k < freqs.length - 1 && freqs[k + 1] < targetF) k++;

  const useGhz = freqs[freqs.length - 1] >= 1e8;
  const fDiv = useGhz ? 1e9 : 1e6;
  const fUnit = useGhz ? "GHz" : "MHz";
  const curFStr = `${(targetF / fDiv).toFixed(3)} ${fUnit}`;

  let html = `<div style="background:var(--chrome); border:1px solid var(--line); border-radius:8px; padding:12px 14px; margin-bottom:14px">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px">
      <div style="display:flex; align-items:center; gap:8px">
        <h4 style="margin:0; font-size:12.5px; font-weight:700; color:var(--accent,#f59e0b); display:flex; align-items:center; gap:6px">
          <span>🔢</span> Global ${P}×${P} Scattering Matrix at Marker M₁ (${curFStr})
        </h4>
        <span style="font-size:11px; color:var(--ink-dim); opacity:0.85">(Click cell to toggle trace on plot)</span>
      </div>
    </div>
    <div style="overflow-x:auto">
      <table class="sp-mat-table" style="margin:0 auto">
        <thead>
          <tr>
            <th class="sp-mat-th" style="background:transparent; border:none; color:var(--ink-dim); font-size:10px">Out \\ In</th>`;

  for (let j = 1; j <= P; j++) {
    const pObj = portsList.find(p => p.num === j);
    const pName = pObj && pObj.label ? pObj.label : `Port ${j}`;
    html += `<th class="sp-mat-th" title="Input Port ${j}: ${pName}">P${j}<br/><span style="font-size:9.5px; font-weight:500; opacity:0.85; max-width:80px; display:inline-block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${pName}</span></th>`;
  }
  html += `</tr></thead><tbody>`;

  for (let i = 1; i <= P; i++) {
    const pOutObj = portsList.find(p => p.num === i);
    const pOutName = pOutObj && pOutObj.label ? pOutObj.label : `Port ${i}`;
    html += `<tr><th class="sp-mat-th" title="Output Port ${i}: ${pOutName}">P${i}<br/><span style="font-size:9.5px; font-weight:500; opacity:0.85; max-width:80px; display:inline-block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${pOutName}</span></th>`;

    for (let j = 1; j <= P; j++) {
      const sKey = `S${i}${j}`;
      const arr = res.matrix[sKey];
      const valStr = arr && arr[k] !== undefined && isFinite(arr[k]) ? `${arr[k].toFixed(2)} dB` : "—";
      const phArr = res.matrix_phase && res.matrix_phase[sKey];
      const phStr = phArr && phArr[k] !== undefined && isFinite(phArr[k]) ? `${phArr[k].toFixed(0)}°` : "";
      const isActive = typeof invokedTraces !== "undefined" && invokedTraces.has(sKey);
      const traceCol = isActive ? getTraceColor(sKey) : "";

      html += `<td class="sp-mat-cell ${isActive ? "active-trace" : ""}" data-skey="${sKey}" style="${isActive ? `border-color:${traceCol}; background:${traceCol}22;` : ""}" title="Click to toggle ${sKey}">
        <div style="font-weight:700; font-size:11px; ${isActive ? `color:${traceCol}` : "color:var(--ink)"}">${sKey}</div>
        <div style="font-size:11.5px; font-weight:600; color:${isActive ? "#ffffff" : "var(--ink)"}">${valStr}</div>
        ${phStr ? `<div style="font-size:9.5px; color:var(--ink-dim)">${phStr}</div>` : ""}
      </td>`;
    }
    html += `</tr>`;
  }

  html += `</tbody></table></div></div>`;
  box.innerHTML = html;

  box.querySelectorAll(".sp-mat-cell").forEach(td => {
    td.onclick = () => {
      const sKey = td.getAttribute("data-skey");
      if (sKey && typeof invokedTraces !== "undefined") {
        if (invokedTraces.has(sKey)) {
          invokedTraces.delete(sKey);
        } else {
          invokedTraces.add(sKey);
        }
        if (typeof onToggleTrace === "function") {
          onToggleTrace(sKey);
        }
      }
    };
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    toggleAnalyserDrawer,
    renderAnalyserSettings,
    renderMarkerTable,
    renderSParamMatrixTable
  };
}

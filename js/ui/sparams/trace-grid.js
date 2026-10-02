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

  let h = `<table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left; color:var(--ink)">
    <thead>
      <tr style="border-bottom:1px solid var(--line); color:var(--ink-dim)">
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

    h += `<tr style="border-bottom:1px solid var(--line)">
      <td style="padding:6px; font-weight:bold">${m.id}</td>
      <td style="padding:6px">
        <input type="number" step="0.01" value="${(m.f / fDiv).toFixed(3)}" data-midx="${idx}" class="sp-mkr-input" style="width:75px; padding:3px 6px; background:var(--chrome-2); color:var(--ink); border:1px solid var(--line); border-radius:4px"/>
        ${idx > 0 ? `<span style="font-size:10px; color:var(--ink-dim); margin-left:4px">(Δ ${deltaF > 0 ? '+'+deltaF : deltaF})</span>` : ""}
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    toggleAnalyserDrawer,
    renderAnalyserSettings,
    renderMarkerTable
  };
}

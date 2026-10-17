"use strict";

/* =====================================================================
 * RF Block Diagram Editor - S-Parameters SVG Graph Chart & Exporters
 * ===================================================================== */

// Vibrant distinct colors for multi-port traces (dark theme optimized)
const TRACE_COLORS = {
  S21: "#38bdf8", S11: "#f43f5e", S22: "#10b981", S31: "#a855f7",
  S12: "#14b8a6", S32: "#f97316", S41: "#eab308", S23: "#ec4899",
  S33: "#059669", S44: "#f43f5e", S51: "#8b5cf6", S61: "#6366f1",
  "S1Σ": "#f59e0b", "S2Σ": "#f59e0b", "S3Σ": "#f59e0b", "S4Σ": "#f59e0b"
};
const FALLBACK_COLORS = ["#38bdf8", "#f43f5e", "#10b981", "#a855f7", "#14b8a6", "#f97316", "#eab308", "#ec4899"];

function getTraceColor(key, idx = 0) {
  return TRACE_COLORS[key] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

/* Render SVG Plotter for All Invoked Traces with Dynamic Y-Axis Auto-Scaling and Multi-Metric Support */
function renderSvgPlot(res, metric = "mag", yScaleChoice = "auto") {
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
  const margin = { top: 24, right: 36, bottom: 40, left: 60 };
  const pw = Math.max(100, W - margin.left - margin.right);
  const ph = Math.max(100, H - margin.top - margin.bottom);

  // Check logarithmic frequency sweep
  const isLogSweep = (res.band && String(res.band.sweepType).toLowerCase() === "log") ||
    (N > 4 && (freqs[N - 1] / freqs[0] > 5) && (Math.abs((freqs[2] - freqs[1]) - (freqs[1] - freqs[0])) > (freqs[1] - freqs[0]) * 0.1));
  const logMin = isLogSweep ? Math.log10(Math.max(1, fMin)) : 0;
  const logMax = isLogSweep ? Math.log10(Math.max(1, fMax)) : 1;

  const getX = f => {
    if (isLogSweep) {
      const lf = Math.log10(Math.max(1, f));
      return margin.left + ((lf - logMin) / (logMax - logMin || 1)) * pw;
    }
    return margin.left + ((f - fMin) / (fMax - fMin || 1)) * pw;
  };

  const getFFromX = x => {
    const ratio = Math.max(0, Math.min(1, (x - margin.left) / pw));
    if (isLogSweep) {
      return Math.pow(10, logMin + ratio * (logMax - logMin));
    }
    return fMin + ratio * (fMax - fMin);
  };

  // Determine active metric properties
  let yUnit = "dB";
  let yAxisLabel = "Magnitude (dB)";
  let isStability = metric === "k";

  if (metric === "phase") {
    yUnit = "°";
    yAxisLabel = "Phase (deg)";
  } else if (metric === "delay") {
    yUnit = "ns";
    yAxisLabel = "Group Delay (ns)";
  } else if (metric === "k") {
    yUnit = "";
    yAxisLabel = "Stability Factor (K)";
  }

  // Extract arrays to plot
  const tracesToPlot = [];
  if (isStability) {
    const kArr = res.k_factor || (res.paths && res.paths[0] ? res.paths[0].k_factor : null);
    if (kArr) {
      tracesToPlot.push({ key: "K-Factor", arr: kArr, color: "#10b981" });
    }
  } else {
    let tIdx = 0;
    invokedTraces.forEach(sKey => {
      let arr = null;
      if (metric === "phase") {
        arr = res.matrix_phase && res.matrix_phase[sKey];
      } else if (metric === "delay") {
        arr = res.matrix_gd && res.matrix_gd[sKey];
        if (!arr && res.paths && res.paths[0]) arr = res.paths[0].group_delay_ns;
      } else {
        arr = res.matrix[sKey];
      }
      if (arr) {
        tracesToPlot.push({ key: sKey, arr, color: getTraceColor(sKey, tIdx++) });
      }
    });
  }

  // Compute dynamic Y-axis range
  let dMin = Infinity, dMax = -Infinity;
  tracesToPlot.forEach(t => {
    for (let k = 0; k < N; k++) {
      const v = t.arr[k];
      if (isFinite(v)) {
        if (v < dMin) dMin = v;
        if (v > dMax) dMax = v;
      }
    }
  });

  let yMin, yMax;
  if (yScaleChoice === "pos20_to_neg60" && metric === "mag") {
    yMin = -60; yMax = 20;
  } else if (yScaleChoice === "0_to_neg100" && metric === "mag") {
    yMin = -100; yMax = 0;
  } else if (yScaleChoice === "0_to_neg40" && metric === "mag") {
    yMin = -40; yMax = 0;
  } else if (metric === "phase") {
    if (!isFinite(dMin) || !isFinite(dMax)) {
      yMin = -180; yMax = 180;
    } else {
      yMin = Math.max(-360, Math.floor(dMin / 45) * 45);
      yMax = Math.min(360, Math.ceil(dMax / 45) * 45);
      if (yMin >= yMax) { yMin = -180; yMax = 180; }
    }
  } else if (metric === "k") {
    yMin = Math.min(0, Math.floor(dMin * 2) / 2);
    yMax = Math.max(3, Math.ceil(dMax * 1.2));
  } else if (metric === "delay") {
    if (!isFinite(dMin) || !isFinite(dMax)) {
      yMin = 0; yMax = 10;
    } else {
      const span = Math.max(0.5, dMax - dMin);
      yMin = Math.floor((dMin - span * 0.15) * 10) / 10;
      yMax = Math.ceil((dMax + span * 0.15) * 10) / 10;
      if (yMin >= yMax) { yMin = 0; yMax = 10; }
    }
  } else {
    // Standard magnitude dB auto-scale without artificial -110 dB cutoff
    if (!isFinite(dMin) || !isFinite(dMax)) {
      yMin = -60; yMax = 30;
    } else {
      const span = Math.max(5, dMax - dMin);
      yMin = Math.floor((dMin - span * 0.12) / 5) * 5;
      yMax = Math.ceil((dMax + span * 0.12) / 5) * 5;
      if (yMin >= yMax) { yMin = -60; yMax = 30; }
    }
  }

  const getY = val => margin.top + (1 - (val - yMin) / (yMax - yMin || 1)) * ph;

  let svgHtml = `<svg id="spSvgPlot" width="100%" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="user-select:none; font-family:var(--sans); background:var(--canvas); border-radius:6px; overflow:visible">`;

  // Plot Area Background
  svgHtml += `<rect x="${margin.left}" y="${margin.top}" width="${pw}" height="${ph}" fill="var(--canvas)" stroke="var(--line)"/>`;

  // Y-Axis Grid Lines & Tick Labels
  const yDivisions = 6;
  const yRawStep = (yMax - yMin) / yDivisions;
  const yStep = Math.max(0.1, yRawStep >= 5 ? Math.round(yRawStep / 5) * 5 : parseFloat(yRawStep.toPrecision(2)));

  for (let val = yMin; val <= yMax + yStep * 0.1; val += yStep) {
    const y = getY(val);
    if (y >= margin.top - 1 && y <= H - margin.bottom + 1) {
      const isZero = Math.abs(val) < 1e-4;
      svgHtml += `<line x1="${margin.left}" y1="${y}" x2="${W - margin.right}" y2="${y}" stroke="${isZero ? 'var(--ink-dim)' : 'var(--grid-maj)'}" stroke-width="${isZero ? 1.5 : 1}"/>`;
      svgHtml += `<text x="${margin.left - 8}" y="${y + 4}" font-size="10" font-family="var(--mono)" fill="var(--ink-dim)" text-anchor="end">${val.toFixed(metric === "delay" || metric === "k" ? 1 : 0)} ${yUnit}</text>`;
    }
  }

  // Stability K = 1.0 Threshold Reference Line
  if (isStability) {
    const yK1 = getY(1.0);
    if (yK1 >= margin.top && yK1 <= H - margin.bottom) {
      svgHtml += `<line x1="${margin.left}" y1="${yK1}" x2="${W - margin.right}" y2="${yK1}" stroke="#ef4444" stroke-width="2" stroke-dasharray="5 3"/>`;
      svgHtml += `<text x="${W - margin.right - 8}" y="${yK1 - 5}" font-size="10.5" font-family="var(--mono)" font-weight="bold" fill="#ef4444" text-anchor="end">K = 1.0 (Stability Threshold)</text>`;
    }
  }

  // X-Axis Grid Lines & Frequency Tick Labels
  if (isLogSweep) {
    const startDecade = Math.floor(logMin);
    const stopDecade = Math.ceil(logMax);
    for (let dec = startDecade; dec <= stopDecade; dec++) {
      const fDec = Math.pow(10, dec);
      if (fDec >= fMin * 0.99 && fDec <= fMax * 1.01) {
        const x = getX(fDec);
        svgHtml += `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${H - margin.bottom}" stroke="var(--ink-dim)" stroke-width="1.2"/>`;
        const lbl = fDec >= 1e9 ? `${(fDec/1e9).toFixed(dec%1===0?0:1)} GHz` : fDec >= 1e6 ? `${(fDec/1e6).toFixed(dec%1===0?0:1)} MHz` : `${(fDec/1e3).toFixed(0)} kHz`;
        svgHtml += `<text x="${x}" y="${H - margin.bottom + 18}" font-size="10" font-family="var(--mono)" fill="var(--ink-dim)" text-anchor="middle">${lbl}</text>`;
      }
      // Minor sub-decade ticks
      for (const m of [2, 3, 5, 7]) {
        const fSub = m * fDec;
        if (fSub > fMin && fSub < fMax) {
          const xSub = getX(fSub);
          svgHtml += `<line x1="${xSub}" y1="${margin.top}" x2="${xSub}" y2="${H - margin.bottom}" stroke="var(--grid-maj)" stroke-width="0.8" stroke-dasharray="2 2"/>`;
        }
      }
    }
  } else {
    for (let i = 0; i <= 5; i++) {
      const fVal = fMin + (i / 5) * (fMax - fMin);
      const x = getX(fVal);
      svgHtml += `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${H - margin.bottom}" stroke="var(--grid-maj)" stroke-width="1"/>`;
      svgHtml += `<text x="${x}" y="${H - margin.bottom + 18}" font-size="10" font-family="var(--mono)" fill="var(--ink-dim)" text-anchor="middle">${(fVal / fDiv).toFixed(2)} ${fUnit}</text>`;
    }
  }

  // Path generator with safety clamping
  const makePath = arr => {
    let d = "";
    for (let k = 0; k < N; k++) {
      const x = getX(freqs[k]);
      const rawY = getY(arr[k]);
      const y = Math.max(margin.top, Math.min(H - margin.bottom, rawY));
      d += (k === 0 ? "M" : "L") + `${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  };

  // Comparative Overlays for Benchmark Saved Tabs
  if (showCompare && sparamsTabs.length > 1 && !isStability) {
    sparamsTabs.forEach((tb, idx) => {
      if (idx === activeTabIdx || !tb.res || !tb.res.matrix) return;
      invokedTraces.forEach(sKey => {
        let cmpArr = metric === "phase" ? (tb.res.matrix_phase && tb.res.matrix_phase[sKey]) :
                     metric === "delay" ? (tb.res.matrix_gd && tb.res.matrix_gd[sKey]) :
                     tb.res.matrix[sKey];
        if (cmpArr) {
          svgHtml += `<path d="${makePath(cmpArr)}" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.6"/>`;
        }
      });
    });
  }

  // Draw Main Traces
  tracesToPlot.forEach(t => {
    svgHtml += `<path d="${makePath(t.arr)}" fill="none" stroke="${t.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  });

  // Frequency Markers
  if (linearMarkers.length) {
    if (linearMarkers[0].f === 0) linearMarkers[0].f = (fMin + fMax) / 2;

    linearMarkers.forEach((m, mIdx) => {
      const mx = getX(m.f);
      svgHtml += `<g class="sp-mkr-handle" data-midx="${mIdx}" style="cursor:ew-resize">
        <line x1="${mx}" y1="${margin.top}" x2="${mx}" y2="${H - margin.bottom}" stroke="#f59e0b" stroke-width="1.8" stroke-dasharray="4 3"/>
        <polygon points="${mx-7},${margin.top} ${mx+7},${margin.top} ${mx},${margin.top+12}" fill="#f59e0b"/>
        <rect x="${mx-12}" y="${margin.top-16}" width="24" height="24" fill="transparent"/>
        <text x="${mx}" y="${margin.top - 5}" font-size="11" font-family="var(--mono)" font-weight="bold" fill="#f59e0b" text-anchor="middle">${m.id}</text>
      </g>`;
    });
  }

  // Interactive Crosshair & Tooltip Overlay Elements
  svgHtml += `<g id="spCrosshairG" style="display:none; pointer-events:none">
    <line id="spCrosshairX" x1="0" y1="${margin.top}" x2="0" y2="${H - margin.bottom}" stroke="#38bdf8" stroke-width="1" stroke-dasharray="3 3"/>
  </g>`;

  svgHtml += `</svg>`;

  // Append Tooltip Container
  svgHtml += `<div id="spHoverTooltip" class="sp-chart-tooltip" style="display:none"></div>`;

  container.innerHTML = svgHtml;

  // Bind Mouse & Pointer Events for Interactive Crosshairs, Dragging, and Double-Click
  const svgEl = container.querySelector("#spSvgPlot");
  const crosshairG = container.querySelector("#spCrosshairG");
  const crosshairX = container.querySelector("#spCrosshairX");
  const tooltipEl = container.querySelector("#spHoverTooltip");

  if (svgEl && crosshairG && crosshairX && tooltipEl) {
    let isDraggingMarker = false;
    let dragMIdx = 0;

    // Draggable Marker Pointer Events
    container.querySelectorAll(".sp-mkr-handle").forEach(handle => {
      handle.onpointerdown = e => {
        e.preventDefault();
        e.stopPropagation();
        isDraggingMarker = true;
        dragMIdx = parseInt(handle.getAttribute("data-midx")) || 0;
        handle.setPointerCapture(e.pointerId);

        const onPointerMove = ev => {
          if (!isDraggingMarker) return;
          const rect = svgEl.getBoundingClientRect();
          const curX = ev.clientX - rect.left;
          const clampedX = Math.max(margin.left, Math.min(W - margin.right, curX));
          const newF = getFFromX(clampedX);
          linearMarkers[dragMIdx].f = newF;

          // Re-render plot and update tables
          renderSvgPlot(res, metric, yScaleChoice);
          if (typeof renderMarkerTable === "function") renderMarkerTable(res, metric);
          if (typeof renderSParamMatrixTable === "function") renderSParamMatrixTable(res, "spMatrixTableContainer");
        };

        const onPointerUp = ev => {
          isDraggingMarker = false;
          try { handle.releasePointerCapture(ev.pointerId); } catch (_) {}
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", onPointerUp);
        };

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
      };
    });

    // Hover Crosshairs Tracking
    svgEl.onpointermove = e => {
      if (isDraggingMarker) return;
      const rect = svgEl.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;

      if (curX < margin.left || curX > W - margin.right || curY < margin.top || curY > H - margin.bottom) {
        crosshairG.style.display = "none";
        tooltipEl.style.display = "none";
        return;
      }

      const f = getFFromX(curX);
      let k = 0;
      while (k < N - 1 && freqs[k + 1] < f) k++;

      const plotX = getX(freqs[k]);
      crosshairG.style.display = "inline";
      crosshairX.setAttribute("x1", plotX);
      crosshairX.setAttribute("x2", plotX);

      // Tooltip HTML
      let tipHtml = `<div style="font-weight:700; color:var(--accent,#f59e0b); border-bottom:1px solid #334155; padding-bottom:3px; margin-bottom:5px">f = ${(freqs[k]/fDiv).toFixed(3)} ${fUnit}</div>`;
      tracesToPlot.forEach(t => {
        const v = t.arr[k];
        const vStr = (v !== undefined && isFinite(v)) ? `${v.toFixed(2)} ${yUnit}` : "—";
        tipHtml += `<div style="display:flex; justify-content:space-between; gap:12px; margin-bottom:2px">
          <span style="color:${t.color}; font-weight:700">■ ${t.key}:</span>
          <span style="color:#ffffff; font-weight:600">${vStr}</span>
        </div>`;
      });

      tooltipEl.innerHTML = tipHtml;
      tooltipEl.style.display = "block";

      // Keep tooltip within container bounds
      const tipW = tooltipEl.offsetWidth || 140;
      let leftPos = curX + 16;
      if (leftPos + tipW > W) leftPos = curX - tipW - 16;
      tooltipEl.style.left = `${leftPos}px`;
      tooltipEl.style.top = `${Math.min(H - 100, Math.max(margin.top, curY - 20))}px`;
    };

    svgEl.onpointerleave = () => {
      if (!isDraggingMarker) {
        crosshairG.style.display = "none";
        tooltipEl.style.display = "none";
      }
    };

    // Double-click on chart: Move Marker 1 to Clicked Frequency
    svgEl.ondblclick = e => {
      const rect = svgEl.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      if (curX >= margin.left && curX <= W - margin.right && linearMarkers.length) {
        linearMarkers[0].f = getFFromX(curX);
        renderSvgPlot(res, metric, yScaleChoice);
        if (typeof renderMarkerTable === "function") renderMarkerTable(res, metric);
        if (typeof renderSParamMatrixTable === "function") renderSParamMatrixTable(res, "spMatrixTableContainer");
      }
    };
  }
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
  const P = (res.portsList && res.portsList.length) || 2;

  // If backend provided verified Touchstone s2p string, use it directly for 2-port export
  if (P === 2 && res.touchstone_s2p) {
    const blob = new Blob([res.touchstone_s2p], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "system_linear_analysis.s2p";
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const freqs = res.freqs;
  let sNp = `! RF Chain System Multi-Port S-Parameters (${P}-Port Export)\n`;
  sNp += `! Date: ${new Date().toISOString()}\n`;
  sNp += `# Hz S DB R 50\n`;

  for (let k = 0; k < freqs.length; k++) {
    let line = `${freqs[k].toFixed(0)}`;
    if (P === 2) {
      // Touchstone 2-port specification requires: S11 S21 S12 S22
      const sOrder = ["S11", "S21", "S12", "S22"];
      for (const sk of sOrder) {
        const arr = res.matrix[sk];
        const db = arr ? arr[k].toFixed(3) : "-120.000";
        line += ` ${db} 0.00`;
      }
    } else {
      for (let i = 1; i <= P; i++) {
        for (let j = 1; j <= P; j++) {
          const arr = res.matrix[`S${i}${j}`];
          const db = arr ? arr[k].toFixed(3) : "-120.000";
          line += ` ${db} 0.00`;
        }
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    TRACE_COLORS,
    FALLBACK_COLORS,
    getTraceColor,
    renderSvgPlot,
    exportSParamsCsv,
    exportSParamsSvg,
    exportSParamsPng,
    exportTouchstoneS2p
  };
}

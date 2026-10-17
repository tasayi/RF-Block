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
  const margin = { top: 20, right: 30, bottom: 35, left: 55 };
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

  let svgHtml = `<svg id="spSvgPlot" width="100%" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="user-select:none; font-family:var(--sans); background:var(--canvas); border-radius:6px">`;

  // Grid Lines & Axis Labels
  svgHtml += `<rect x="${margin.left}" y="${margin.top}" width="${pw}" height="${ph}" fill="var(--canvas)" stroke="var(--line)"/>`;

  const yStep = Math.max(2, Math.ceil((yMax - yMin) / 6 / 2) * 2);
  for (let db = yMin; db <= yMax; db += yStep) {
    const y = getY(db);
    if (y >= margin.top && y <= H - margin.bottom) {
      svgHtml += `<line x1="${margin.left}" y1="${y}" x2="${W - margin.right}" y2="${y}" stroke="${db===0?'var(--ink-dim)':'var(--grid-maj)'}" stroke-width="${db===0?1.5:1}"/>`;
      svgHtml += `<text x="${margin.left - 8}" y="${y + 4}" font-size="10" font-family="var(--mono)" fill="var(--ink-dim)" text-anchor="end">${db} dB</text>`;
    }
  }

  for (let i = 0; i <= 5; i++) {
    const fVal = fMin + (i / 5) * (fMax - fMin);
    const x = getX(fVal);
    svgHtml += `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${H - margin.bottom}" stroke="var(--grid-maj)" stroke-width="1"/>`;
    svgHtml += `<text x="${x}" y="${H - margin.bottom + 18}" font-size="10" font-family="var(--mono)" fill="var(--ink-dim)" text-anchor="middle">${(fVal / fDiv).toFixed(2)} ${fUnit}</text>`;
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
          svgHtml += `<path d="${makePath(tb.res.matrix[sKey])}" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.75"/>`;
        }
      });
    });
  }

  // Active Invoked Traces
  let traceIdx = 0;
  invokedTraces.forEach(sKey => {
    if (res.matrix[sKey]) {
      const col = getTraceColor(sKey, traceIdx++);
      svgHtml += `<path d="${makePath(res.matrix[sKey])}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  });

  // Frequency Markers
  if (linearMarkers.length) {
    if (linearMarkers[0].f === 0) linearMarkers[0].f = (fMin + fMax) / 2;

    linearMarkers.forEach(m => {
      const mx = getX(m.f);
      svgHtml += `<line x1="${mx}" y1="${margin.top}" x2="${mx}" y2="${H - margin.bottom}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4 3"/>`;
      svgHtml += `<polygon points="${mx-6},${margin.top} ${mx+6},${margin.top} ${mx},${margin.top+10}" fill="#f59e0b"/>`;
      svgHtml += `<text x="${mx}" y="${margin.top - 4}" font-size="11" font-family="var(--mono)" font-weight="bold" fill="#f59e0b" text-anchor="middle">${m.id}</text>`;
    });
  }

  svgHtml += `</svg>`;
  container.innerHTML = svgHtml;
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

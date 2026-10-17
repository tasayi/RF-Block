"use strict";

/* =====================================================================
 * RF Block Diagram Editor - Cascade Budget Drawer & Interactive Stage Plotter
 * ===================================================================== */

let budgetViewMode = "plot"; // "plot" or "table"
let budgetIsMaximized = false;
let budgetPlotMetrics = new Set(["cumG", "cumNF", "lvl", "oip3", "cumP1db"]);
let budgetCustomScaling = {
  leftAuto: true,
  leftMin: -60,
  leftMax: 40,
  rightAuto: true,
  rightMin: 0,
  rightMax: 15,
  showScaleOptions: false
};

const BUDGET_METRICS = {
  cumG: { key: "cumG", label: "Cascaded Gain", unit: "dB", axis: "left", color: "#38bdf8", getVal: r => r.cumG },
  lvl: { key: "lvl", label: "Signal Level", unit: "dBm", axis: "left", color: "#10b981", getVal: r => r.lvl },
  cumNF: { key: "cumNF", label: "Cum. Noise Figure", unit: "dB", axis: "right", color: "#f43f5e", getVal: r => r.cumNF },
  nfStage: { key: "nfStage", label: "Stage NF", unit: "dB", axis: "right", color: "#14b8a6", getVal: r => r.nfStage },
  noiseFloor: {
    key: "noiseFloor",
    label: "Noise Floor",
    unit: "dBm",
    axis: "left",
    color: "#a855f7",
    getVal: (r, bwHz) => -174 + 10 * Math.log10(Math.max(1, bwHz)) + (r.cumNF || 0)
  },
  oip3: {
    key: "oip3",
    label: "Output IP3",
    unit: "dBm",
    axis: "left",
    color: "#f59e0b",
    getVal: r => (r.oip3 !== undefined && isFinite(r.oip3)) ? r.oip3 : null
  },
  cumP1db: {
    key: "cumP1db",
    label: "Cascaded P1dB",
    unit: "dBm",
    axis: "left",
    color: "#ec4899",
    getVal: r => (r.cumP1db !== undefined && isFinite(r.cumP1db)) ? r.cumP1db : ((r.p1db !== undefined && isFinite(r.p1db)) ? r.p1db : null)
  },
  p1dbStage: {
    key: "p1dbStage",
    label: "Stage P1dB",
    unit: "dBm",
    axis: "left",
    color: "#f472b6",
    getVal: r => (r.p1dbStage !== undefined && isFinite(r.p1dbStage)) ? r.p1dbStage : null
  }
};

const budgetOpen = () => {
  const el = $("budget");
  return el ? el.classList.contains("open") : false;
};

function toggleBudget() {
  const el = $("budget");
  if (!el) return;
  const open = el.classList.toggle("open");
  if (open) renderBudget();
  const btn = $("btnBudget");
  if (btn) btn.style.borderColor = open ? "var(--accent)" : "";
}

function toggleBudgetExpand() {
  const el = $("budget");
  if (!el) return;
  budgetIsMaximized = !budgetIsMaximized;
  el.classList.toggle("maximized", budgetIsMaximized);
  const btn = $("bgToggleExpand");
  if (btn) btn.textContent = budgetIsMaximized ? "⬍ Minimize" : "⛶ Expand";
  renderBudget();
}

function renderBudget() {
  const body = $("bgBody"), sel = $("bgStart");
  if (!body || !sel) return;
  const starts = startBlocks();
  const curStart = sel.value;
  sel.innerHTML = starts.map(b => `<option value="${b.id}"${b.id === curStart ? " selected" : ""}>${esc(b.params.label || COMP[b.type].name)}</option>`).join("");
  sel.onchange = () => renderBudget();

  // Bind view switch buttons
  const tabTable = $("bgTabTable"), tabPlot = $("bgTabPlot");
  if (tabTable && tabPlot) {
    tabTable.className = `bg-tab-btn ${budgetViewMode === "table" ? "active" : ""}`;
    tabPlot.className = `bg-tab-btn ${budgetViewMode === "plot" ? "active" : ""}`;
    tabTable.onclick = () => { budgetViewMode = "table"; renderBudget(); };
    tabPlot.onclick = () => { budgetViewMode = "plot"; renderBudget(); };
  }

  // Bind action buttons
  if ($("bgToggleExpand")) {
    $("bgToggleExpand").onclick = toggleBudgetExpand;
    $("bgToggleExpand").textContent = budgetIsMaximized ? "⬍ Minimize" : "⛶ Expand";
  }
  if ($("bgXlsx")) $("bgXlsx").onclick = exportBudgetXlsx;
  if ($("bgCsv")) $("bgCsv").onclick = exportBudgetCsv;
  if ($("bgClose")) $("bgClose").onclick = toggleBudget;

  const startId = sel.value || (starts[0] ? starts[0].id : null);
  const { rows, P } = buildBudget(startId);
  const bwHz = (settings.bandwidthHz && settings.bandwidthHz > 0) ? settings.bandwidthHz : 1e6;
  const bwMHz = bwHz / 1e6;

  if (!rows.length) {
    body.innerHTML = `<div class="bg-empty">Add a source (RF IN, Source, or an Rx antenna) and wire a chain to see the budget.</div>` + warnHtml(P);
    return;
  }

  if (budgetViewMode === "plot") {
    renderBudgetPlot(rows, bwHz, bwMHz, P, body);
  } else {
    renderBudgetTable(rows, bwHz, bwMHz, P, body);
  }
}

/* =====================================================================
 * Cascade Stage Plotter: Dual Y-Axis SVG Chart with Interactive Controls
 * ===================================================================== */
function renderBudgetPlot(rows, bwHz, bwMHz, P, container) {
  const numStages = rows.length;
  const W = Math.max(680, container.clientWidth - 24) || 920;
  const H = budgetIsMaximized ? 420 : 280;
  const margin = { top: 28, right: 65, bottom: 60, left: 65 };
  const pw = Math.max(120, W - margin.left - margin.right);
  const ph = Math.max(100, H - margin.top - margin.bottom);

  // 1. Gather all active Left Axis data points and Right Axis data points
  let leftVals = [];
  let rightVals = [];

  for (const mKey of budgetPlotMetrics) {
    const m = BUDGET_METRICS[mKey];
    if (!m) continue;
    rows.forEach(r => {
      const v = m.getVal(r, bwHz);
      if (v !== null && v !== undefined && isFinite(v)) {
        if (m.axis === "right") rightVals.push(v);
        else leftVals.push(v);
      }
    });
  }

  // Left Axis Range (Power, Gain, Linearity in dB / dBm)
  let yLeftMin = -40, yLeftMax = 40;
  if (budgetCustomScaling.leftAuto) {
    if (leftVals.length) {
      const minV = Math.min(...leftVals);
      const maxV = Math.max(...leftVals);
      const span = maxV - minV || 20;
      yLeftMin = Math.floor(minV - span * 0.12);
      yLeftMax = Math.ceil(maxV + span * 0.12);
      if (yLeftMin === yLeftMax) { yLeftMin -= 5; yLeftMax += 5; }
    }
  } else {
    yLeftMin = budgetCustomScaling.leftMin;
    yLeftMax = budgetCustomScaling.leftMax;
  }

  // Right Axis Range (Noise Figure in dB)
  let yRightMin = 0, yRightMax = 15;
  if (budgetCustomScaling.rightAuto) {
    if (rightVals.length) {
      const minV = Math.min(...rightVals);
      const maxV = Math.max(...rightVals);
      yRightMin = Math.max(0, Math.floor(minV - 0.5));
      yRightMax = Math.max(yRightMin + 3, Math.ceil(maxV + 1.5));
    }
  } else {
    yRightMin = budgetCustomScaling.rightMin;
    yRightMax = budgetCustomScaling.rightMax;
  }

  const getX = idx => margin.left + (idx / Math.max(1, numStages - 1)) * pw;
  const getYLeft = val => margin.top + ph - ((val - yLeftMin) / (yLeftMax - yLeftMin || 1)) * ph;
  const getYRight = val => margin.top + ph - ((val - yRightMin) / (yRightMax - yRightMin || 1)) * ph;

  // 2. Build Interactive Metric Pills and Scale Controls Toolbar
  let topBarHtml = `<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px; padding:6px 0; border-bottom:1px solid var(--line);">
    <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
      <span style="font-size:11.5px; font-weight:600; color:var(--ink-dim); margin-right:4px;">Plot Traces:</span>`;

  for (const mKey in BUDGET_METRICS) {
    const m = BUDGET_METRICS[mKey];
    const isAct = budgetPlotMetrics.has(mKey);
    topBarHtml += `<button class="bg-metric-pill ${isAct ? "active" : ""}" data-mkey="${mKey}" style="${isAct ? `border-color:${m.color}; color:#f8fafc;` : ""}">
      <span style="width:7px; height:7px; border-radius:50%; background:${m.color}; display:inline-block;"></span>
      <span>${esc(m.label)}</span>
      <span style="font-size:10px; opacity:0.7">(${m.axis === "right" ? "Rt" : "Lt"})</span>
    </button>`;
  }

  topBarHtml += `</div>
    <div style="display:flex; align-items:center; gap:8px;">
      <button class="btn btn-sm" id="bgToggleScaleOpt">⚙️ ${budgetCustomScaling.showScaleOptions ? "Hide Scales" : "Axis Scales"}</button>
    </div>
  </div>`;

  // Scale Options Panel (Collapsible)
  let scalePanelHtml = "";
  if (budgetCustomScaling.showScaleOptions) {
    scalePanelHtml = `<div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap; background:rgba(0,0,0,0.25); border:1px solid var(--line); border-radius:6px; padding:8px 12px; margin-bottom:10px; font-size:11.5px;">
      <div style="display:flex; align-items:center; gap:6px;">
        <b style="color:var(--accent)">Left Axis (Power/Gain):</b>
        <label><input type="checkbox" id="bgScaleLeftAuto" ${budgetCustomScaling.leftAuto ? "checked" : ""}/> Auto</label>
        ${!budgetCustomScaling.leftAuto ? `
          <span>Min:</span><input type="number" id="bgScaleLeftMin" value="${budgetCustomScaling.leftMin}" style="width:55px; padding:2px 4px; font-size:11px; background:#192231; border:1px solid var(--line); color:var(--ink);"/>
          <span>Max:</span><input type="number" id="bgScaleLeftMax" value="${budgetCustomScaling.leftMax}" style="width:55px; padding:2px 4px; font-size:11px; background:#192231; border:1px solid var(--line); color:var(--ink);"/>
        ` : ""}
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <b style="color:#f43f5e">Right Axis (Noise Figure):</b>
        <label><input type="checkbox" id="bgScaleRightAuto" ${budgetCustomScaling.rightAuto ? "checked" : ""}/> Auto</label>
        ${!budgetCustomScaling.rightAuto ? `
          <span>Min:</span><input type="number" id="bgScaleRightMin" value="${budgetCustomScaling.rightMin}" style="width:55px; padding:2px 4px; font-size:11px; background:#192231; border:1px solid var(--line); color:var(--ink);"/>
          <span>Max:</span><input type="number" id="bgScaleRightMax" value="${budgetCustomScaling.rightMax}" style="width:55px; padding:2px 4px; font-size:11px; background:#192231; border:1px solid var(--line); color:var(--ink);"/>
        ` : ""}
      </div>
    </div>`;
  }

  // 3. Construct SVG Plot
  let svg = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block; overflow:visible; font-family:var(--sans);">`;

  // Background rect
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="var(--chrome-2,#1e293b)" rx="6"/>`;

  // Plot area rect
  svg += `<rect x="${margin.left}" y="${margin.top}" width="${pw}" height="${ph}" fill="rgba(15,23,42,0.45)" stroke="var(--line,#334155)" stroke-width="1"/>`;

  // Horizontal Grid Lines & Left Axis Ticks (6 divisions)
  const numGridTicks = 6;
  for (let k = 0; k <= numGridTicks; k++) {
    const frac = k / numGridTicks;
    const y = margin.top + frac * ph;
    const valL = yLeftMax - frac * (yLeftMax - yLeftMin);
    const valR = yRightMax - frac * (yRightMax - yRightMin);

    // Gridline
    svg += `<line x1="${margin.left}" y1="${y}" x2="${margin.left + pw}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3,3"/>`;

    // Left Axis Label
    svg += `<text x="${margin.left - 8}" y="${y + 3.5}" fill="var(--ink-dim,#94a3b8)" font-size="10.5" text-anchor="end">${valL.toFixed(0)}</text>`;

    // Right Axis Label (colored for NF)
    svg += `<text x="${margin.left + pw + 8}" y="${y + 3.5}" fill="#f43f5e" font-size="10.5" text-anchor="start">${valR.toFixed(1)}</text>`;
  }

  // Axis Labels
  svg += `<text transform="rotate(-90)" x="${-(margin.top + ph / 2)}" y="${margin.left - 42}" fill="var(--ink,#f8fafc)" font-size="11" font-weight="600" text-anchor="middle">Power &amp; Gain (dB / dBm)</text>`;
  svg += `<text transform="rotate(90)" x="${(margin.top + ph / 2)}" y="${-(margin.left + pw + 44)}" fill="#f43f5e" font-size="11" font-weight="600" text-anchor="middle">Noise Figure (dB)</text>`;

  // Vertical Stage Gridlines and X-Axis Labels
  rows.forEach((r, idx) => {
    const x = getX(idx);
    svg += `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + ph}" stroke="rgba(255,255,255,0.06)"/>`;
    svg += `<line x1="${x}" y1="${margin.top + ph}" x2="${x}" y2="${margin.top + ph + 5}" stroke="var(--line,#334155)" stroke-width="1"/>`;

    // Rotated Stage Label
    const stageName = r.name || `Stage ${idx + 1}`;
    svg += `<g transform="translate(${x}, ${margin.top + ph + 16}) rotate(28)">
      <text x="0" y="0" fill="var(--ink,#f8fafc)" font-size="10.5" font-weight="500" text-anchor="start">${esc(stageName)}</text>
      <text x="0" y="11" fill="var(--ink-dim,#94a3b8)" font-size="9" text-anchor="start">${esc(r.type)}</text>
    </g>`;
  });

  // Plot Active Traces
  for (const mKey of budgetPlotMetrics) {
    const m = BUDGET_METRICS[mKey];
    if (!m) continue;

    const isRight = (m.axis === "right");
    const getY = isRight ? getYRight : getYLeft;

    let pathD = "";
    const pts = [];

    rows.forEach((r, idx) => {
      const v = m.getVal(r, bwHz);
      if (v !== null && v !== undefined && isFinite(v)) {
        const x = getX(idx);
        const y = getY(v);
        pts.push({ x, y, v, stage: r, idx });
        pathD += (pathD === "" ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
    });

    if (pathD) {
      // Trace line
      svg += `<path d="${pathD}" fill="none" stroke="${m.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;

      // Stage dots
      pts.forEach(pt => {
        svg += `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4.5" fill="${m.color}" stroke="#0f172a" stroke-width="1.5" class="bg-stage-dot" data-bid="${esc(pt.stage.id)}" data-mkey="${mKey}" style="cursor:pointer; transition:r 0.15s ease;">
          <title>${esc(pt.stage.name)}: ${m.label} = ${fmt(pt.v)} ${m.unit}</title>
        </circle>`;
      });
    }
  }

  svg += `</svg>`;

  // 4. Stage Summary Footer & Warnings
  const last = rows[rows.length - 1];
  const nfFinal = last.cumNF;
  const sens = noiseFloor(nfFinal, bwHz);
  const lastP1Cum = (last.cumP1db !== undefined && isFinite(last.cumP1db)) ? last.cumP1db : last.p1db;

  let footerHtml = `<div class="bg-sum" style="margin-top:10px;">
    <div><span>Total Gain:</span><b>${gsign(last.cumG)}</b></div>
    <div><span>Cascade NF:</span><b>${last.cumNF !== undefined ? fmt(last.cumNF) + " dB" : "\u2014"}</b></div>
    <div><span>Sens. (${fmt(bwMHz)} MHz):</span><b>${fmt(sens)} dBm</b></div>
    <div><span>Cascade OIP3:</span><b>${(last.oip3 !== undefined && isFinite(last.oip3)) ? fmt(last.oip3) + " dBm" : "\u2014"}</b></div>
    <div><span>Cascade P1dB:</span><b>${(lastP1Cum !== undefined && isFinite(lastP1Cum)) ? fmt(lastP1Cum) + " dBm" : "\u2014"}</b></div>
  </div>`;
  footerHtml += warnHtml(P);

  container.innerHTML = topBarHtml + scalePanelHtml + svg + footerHtml;

  // 5. Attach Plot Event Listeners
  container.querySelectorAll(".bg-metric-pill").forEach(pill => {
    pill.onclick = () => {
      const k = pill.getAttribute("data-mkey");
      if (budgetPlotMetrics.has(k)) {
        if (budgetPlotMetrics.size > 1) budgetPlotMetrics.delete(k);
      } else {
        budgetPlotMetrics.add(k);
      }
      renderBudget();
    };
  });

  const btnScaleOpt = $("bgToggleScaleOpt");
  if (btnScaleOpt) {
    btnScaleOpt.onclick = () => {
      budgetCustomScaling.showScaleOptions = !budgetCustomScaling.showScaleOptions;
      renderBudget();
    };
  }

  // Scale inputs
  const chkLeftAuto = $("bgScaleLeftAuto");
  if (chkLeftAuto) {
    chkLeftAuto.onchange = e => { budgetCustomScaling.leftAuto = e.target.checked; renderBudget(); };
  }
  const inLeftMin = $("bgScaleLeftMin"), inLeftMax = $("bgScaleLeftMax");
  if (inLeftMin) inLeftMin.onchange = e => { budgetCustomScaling.leftMin = parseFloat(e.target.value) || -40; renderBudget(); };
  if (inLeftMax) inLeftMax.onchange = e => { budgetCustomScaling.leftMax = parseFloat(e.target.value) || 40; renderBudget(); };

  const chkRightAuto = $("bgScaleRightAuto");
  if (chkRightAuto) {
    chkRightAuto.onchange = e => { budgetCustomScaling.rightAuto = e.target.checked; renderBudget(); };
  }
  const inRightMin = $("bgScaleRightMin"), inRightMax = $("bgScaleRightMax");
  if (inRightMin) inRightMin.onchange = e => { budgetCustomScaling.rightMin = parseFloat(e.target.value) || 0; renderBudget(); };
  if (inRightMax) inRightMax.onchange = e => { budgetCustomScaling.rightMax = parseFloat(e.target.value) || 15; renderBudget(); };

  // Click stage dot to select block on canvas
  container.querySelectorAll(".bg-stage-dot").forEach(dot => {
    dot.onclick = () => {
      const bid = dot.getAttribute("data-bid");
      const sh = sheetOfBlock(bid);
      if (sh && sh !== sheets[cur]) gotoSheet(sheets.indexOf(sh));
      selectOnly(bid);
      renderAll();
    };
  });
}

/* =====================================================================
 * Cascade Stage Table View Renderer
 * ===================================================================== */
function renderBudgetTable(rows, bwHz, bwMHz, P, body) {
  const nfFinal = rows[rows.length - 1].cumNF;
  const sens = noiseFloor(nfFinal, bwHz);
  let h = `<table class="bg"><thead><tr>
    <th>Stage</th><th>Type</th><th>Gain</th><th>Level</th>
    <th>NF stage</th><th>NF cum.</th><th>OIP3 cum.</th><th>P1dB stage</th><th>P1dB cum.</th><th>Headroom</th>
  </tr></thead><tbody>`;

  rows.forEach(r => {
    const isHot = r.over;
    const p1CumVal = (r.cumP1db !== undefined && isFinite(r.cumP1db)) ? r.cumP1db : r.p1db;
    h += `<tr class="${isHot ? "hot" : ""}" data-bid="${r.id}">
      <td>${esc(r.name)}</td>
      <td style="color:var(--ink-dim)">${esc(r.type)}</td>
      <td>${r.gain === undefined ? "\u2014" : gsign(r.gain)}</td>
      <td style="font-weight:600;color:var(--accent)">${dbm(r.lvl)}</td>
      <td>${r.nfStage ? fmt(r.nfStage) + " dB" : "\u2014"}</td>
      <td>${r.cumNF !== undefined ? fmt(r.cumNF) + " dB" : "\u2014"}</td>
      <td>${(r.oip3 !== undefined && isFinite(r.oip3)) ? fmt(r.oip3) + " dBm" : "\u2014"}</td>
      <td>${(r.p1dbStage !== undefined && isFinite(r.p1dbStage)) ? fmt(r.p1dbStage) + " dBm" : "\u2014"}</td>
      <td style="font-weight:600;color:#ec4899">${(p1CumVal !== undefined && isFinite(p1CumVal)) ? fmt(p1CumVal) + " dBm" : "\u2014"}</td>
      <td style="color:${r.head !== undefined && r.head < 3 ? "#f0a0a0" : "inherit"}">${r.head === undefined ? "\u2014" : fmt(r.head) + " dB"}</td>
    </tr>`;
  });
  h += `</tbody></table>`;

  const last = rows[rows.length - 1];
  const lastP1Cum = (last.cumP1db !== undefined && isFinite(last.cumP1db)) ? last.cumP1db : last.p1db;
  h += `<div class="bg-sum">
    <div><span>Total gain:</span><b>${gsign(last.cumG)}</b></div>
    <div><span>Cascade NF:</span><b>${last.cumNF !== undefined ? fmt(last.cumNF) + " dB" : "\u2014"}</b></div>
    <div><span>Sens. (${fmt(bwMHz)} MHz):</span><b>${fmt(sens)} dBm</b></div>
    <div><span>Cascade OIP3:</span><b>${(last.oip3 !== undefined && isFinite(last.oip3)) ? fmt(last.oip3) + " dBm" : "\u2014"}</b></div>
    <div><span>Cascade P1dB:</span><b>${(lastP1Cum !== undefined && isFinite(lastP1Cum)) ? fmt(lastP1Cum) + " dBm" : "\u2014"}</b></div>
  </div>`;
  h += warnHtml(P);

  body.innerHTML = h;
  body.querySelectorAll("tbody tr[data-bid]").forEach(tr => {
    tr.onclick = () => {
      const id = tr.getAttribute("data-bid");
      const sh = sheetOfBlock(id);
      if (sh && sh !== sheets[cur]) gotoSheet(sheets.indexOf(sh));
      selectOnly(id);
      renderAll();
    };
  });
}

function warnHtml(P) {
  const w = runChecks(P);
  if (!w.length) return `<div class="bg-warn"><div class="info">\u2713 Design check: no warnings detected.</div></div>`;
  let h = `<div class="bg-warn">`;
  for (const item of w) {
    h += `<div class="${esc(item.lvl)}" data-bid="${esc(item.id)}">${item.lvl === "err" ? "\u26a0 " : item.lvl === "warn" ? "\u2022 " : "\u2139 "}${esc(item.msg)}</div>`;
  }
  return h + `</div>`;
}

/* =====================================================================
 * Multi-Sheet Formatted Excel (.xlsx) Export
 * ===================================================================== */
function exportBudgetXlsx() {
  const sel = $("bgStart");
  const startId = sel ? sel.value : null;
  const { rows } = buildBudget(startId);
  if (!rows || !rows.length) { hint("No budget data to export."); return; }

  const bwHz = (settings.bandwidthHz && settings.bandwidthHz > 0) ? settings.bandwidthHz : 1e6;
  const bwMHz = bwHz / 1e6;
  const startBlock = allBlocks().find(b => b.id === startId);
  const startName = startBlock ? (startBlock.params.label || COMP[startBlock.type].name) : "Source";

  // --- Sheet 1: Cascade Budget Data ---
  const sheet1Headers = [
    "Stage #", "Component Name", "Type", "Gain (dB)", "Cum. Gain (dB)",
    "Level (dBm)", "Stage NF (dB)", "Cum. NF (dB)", "Noise Floor (dBm)",
    "OIP3 cum. (dBm)", "Stage P1dB (dBm)", "Cascaded P1dB (dBm)", "Headroom (dB)", "Status"
  ];
  const sheet1Widths = [10, 22, 16, 12, 14, 14, 14, 14, 18, 16, 16, 18, 14, 16];
  const sheet1Rows = [sheet1Headers];

  rows.forEach((r, idx) => {
    const nfCum = r.cumNF || 0;
    const nFloor = -174 + 10 * Math.log10(Math.max(1, bwHz)) + nfCum;
    const status = r.over ? "OVERDRIVEN" : (r.head !== undefined && r.head < 3 ? "LOW HEADROOM" : "NORMAL");
    const p1Cum = (r.cumP1db !== undefined && isFinite(r.cumP1db)) ? r.cumP1db : r.p1db;

    sheet1Rows.push([
      idx + 1,
      r.name || `Stage ${idx + 1}`,
      r.type || "",
      r.gain !== undefined ? parseFloat(r.gain.toFixed(2)) : "",
      r.cumG !== undefined ? parseFloat(r.cumG.toFixed(2)) : "",
      r.lvl !== undefined ? parseFloat(r.lvl.toFixed(2)) : "",
      r.nfStage !== undefined ? parseFloat(r.nfStage.toFixed(2)) : "",
      r.cumNF !== undefined ? parseFloat(r.cumNF.toFixed(2)) : "",
      parseFloat(nFloor.toFixed(2)),
      (r.oip3 !== undefined && isFinite(r.oip3)) ? parseFloat(r.oip3.toFixed(2)) : "",
      (r.p1dbStage !== undefined && isFinite(r.p1dbStage)) ? parseFloat(r.p1dbStage.toFixed(2)) : "",
      (p1Cum !== undefined && isFinite(p1Cum)) ? parseFloat(p1Cum.toFixed(2)) : "",
      r.head !== undefined ? parseFloat(r.head.toFixed(2)) : "",
      status
    ]);
  });

  // Summary Row
  const last = rows[rows.length - 1];
  const lastNf = last.cumNF || 0;
  const sens = noiseFloor(lastNf, bwHz);
  const lastP1Cum = (last.cumP1db !== undefined && isFinite(last.cumP1db)) ? last.cumP1db : last.p1db;
  sheet1Rows.push([]);
  sheet1Rows.push([
    "CASCADE SUMMARY", "", "",
    "", parseFloat(last.cumG.toFixed(2)),
    parseFloat(last.lvl.toFixed(2)), "",
    parseFloat(lastNf.toFixed(2)),
    parseFloat(sens.toFixed(2)),
    (last.oip3 !== undefined && isFinite(last.oip3)) ? parseFloat(last.oip3.toFixed(2)) : "",
    "",
    (lastP1Cum !== undefined && isFinite(lastP1Cum)) ? parseFloat(lastP1Cum.toFixed(2)) : "",
    "", "COMPLETE"
  ]);

  // --- Sheet 2: Plot Settings & System Configuration ---
  const sheet2Headers = ["Configuration Parameter", "Value", "Unit / Notes"];
  const sheet2Widths = [28, 26, 32];
  const activeMetricsStr = Array.from(budgetPlotMetrics).map(k => (BUDGET_METRICS[k] ? BUDGET_METRICS[k].label : k)).join(", ");

  const sheet2Rows = [
    sheet2Headers,
    ["Signal Source", startName, "Chain origin"],
    ["Analysis Bandwidth", bwHz, "Hz"],
    ["Analysis Bandwidth (MHz)", bwMHz, "MHz"],
    ["Thermal Noise Reference", -174.0, "dBm/Hz (k*T at 290 K)"],
    ["System Sensitivity", parseFloat(sens.toFixed(2)), `dBm at ${bwMHz.toFixed(3)} MHz BW`],
    ["Total Cascaded Gain", parseFloat(last.cumG.toFixed(2)), "dB"],
    ["Total Cascaded NF", parseFloat(lastNf.toFixed(2)), "dB"],
    ["Total Cascaded OIP3", (last.oip3 !== undefined && isFinite(last.oip3)) ? parseFloat(last.oip3.toFixed(2)) : "", "dBm"],
    ["Total Cascaded P1dB", (lastP1Cum !== undefined && isFinite(lastP1Cum)) ? parseFloat(lastP1Cum.toFixed(2)) : "", "dBm"],
    ["Active Plot Traces", activeMetricsStr, "Rendered on Stage Plot"],
    ["Left Y-Axis Scaling", budgetCustomScaling.leftAuto ? "Auto" : `Custom (${budgetCustomScaling.leftMin} to ${budgetCustomScaling.leftMax})`, "dB / dBm"],
    ["Right Y-Axis (NF) Scaling", budgetCustomScaling.rightAuto ? "Auto" : `Custom (${budgetCustomScaling.rightMin} to ${budgetCustomScaling.rightMax})`, "dB"],
    ["Export Date", new Date().toISOString(), "ISO 8601 UTC"]
  ];

  if (typeof xlsxBlob === "function") {
    const blob = xlsxBlob([
      { name: "Cascade Budget", rows: sheet1Rows, widths: sheet1Widths },
      { name: "Plot Configuration", rows: sheet2Rows, widths: sheet2Widths }
    ]);
    downloadFile(blob, "cascade-budget-analysis.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  } else {
    exportBudgetCsv();
  }
}

function exportBudgetCsv() {
  const sel = $("bgStart");
  const startId = sel ? sel.value : null;
  const { rows } = buildBudget(startId);
  if (!rows.length) { hint("No budget to export."); return; }
  let csv = "Stage,Type,Gain_dB,Level_dBm,NF_stage_dB,NF_cum_dB,OIP3_cum_dBm,P1dB_stage_dBm,P1dB_cum_dBm,Headroom_dB\n";
  for (const r of rows) {
    const q = s => `"${String(s || "").replace(/"/g, '""')}"`;
    const p1Cum = (r.cumP1db !== undefined && isFinite(r.cumP1db)) ? r.cumP1db : r.p1db;
    csv += [q(r.name), q(r.type), r.gain ?? "", r.lvl ?? "", r.nfStage ?? "", r.cumNF ?? "", (r.oip3 !== undefined && isFinite(r.oip3)) ? r.oip3 : "", (r.p1dbStage !== undefined && isFinite(r.p1dbStage)) ? r.p1dbStage : "", (p1Cum !== undefined && isFinite(p1Cum)) ? p1Cum : "", r.head ?? ""].join(",") + "\n";
  }
  downloadFile(csv, "cascade-budget.csv", "text/csv");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    budgetOpen,
    toggleBudget,
    toggleBudgetExpand,
    renderBudget,
    exportBudgetXlsx,
    exportBudgetCsv,
    BUDGET_METRICS
  };
}

"use strict";

/* Cascade Budget UI Drawer Renderer */
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

function renderBudget() {
  const body = $("bgBody"), sel = $("bgStart");
  if (!body || !sel) return;
  const starts = startBlocks();
  const curStart = sel.value;
  sel.innerHTML = starts.map(b => `<option value="${b.id}"${b.id === curStart ? " selected" : ""}>${esc(b.params.label || COMP[b.type].name)}</option>`).join("");
  sel.onchange = () => renderBudget();

  const startId = sel.value || (starts[0] ? starts[0].id : null);
  const { rows, P } = buildBudget(startId);
  const bwMHz = Math.max(0.001, +($("bgBw") ? $("bgBw").value : 1) || 1);
  const bwHz = bwMHz * 1e6;

  if (!rows.length) {
    body.innerHTML = `<div class="bg-empty">Add a source (RF IN, Source, or an Rx antenna) and wire a chain to see the budget.</div>` + warnHtml(P);
    return;
  }

  const nfFinal = rows[rows.length - 1].cumNF;
  const sens = noiseFloor(nfFinal, bwHz);
  let h = `<table class="bg"><thead><tr>
    <th>Stage</th><th>Type</th><th>Gain</th><th>Level</th>
    <th>NF stage</th><th>NF cum.</th><th>OIP3 cum.</th><th>P1dB</th><th>Headroom</th>
  </tr></thead><tbody>`;

  rows.forEach(r => {
    const isHot = r.over;
    h += `<tr class="${isHot ? "hot" : ""}" data-bid="${r.id}">
      <td>${esc(r.name)}</td>
      <td style="color:var(--ink-dim)">${esc(r.type)}</td>
      <td>${r.gain === undefined ? "\u2014" : gsign(r.gain)}</td>
      <td style="font-weight:600;color:var(--accent)">${dbm(r.lvl)}</td>
      <td>${r.nfStage ? fmt(r.nfStage) + " dB" : "\u2014"}</td>
      <td>${r.cumNF !== undefined ? fmt(r.cumNF) + " dB" : "\u2014"}</td>
      <td>${r.oip3 !== undefined ? fmt(r.oip3) + " dBm" : "\u2014"}</td>
      <td>${r.p1db !== undefined ? fmt(r.p1db) + " dBm" : "\u2014"}</td>
      <td style="color:${r.head !== undefined && r.head < 3 ? "#f0a0a0" : "inherit"}">${r.head === undefined ? "\u2014" : fmt(r.head) + " dB"}</td>
    </tr>`;
  });
  h += `</tbody></table>`;

  const last = rows[rows.length - 1];
  h += `<div class="bg-sum">
    <div><span>Total gain:</span><b>${gsign(last.cumG)}</b></div>
    <div><span>Cascade NF:</span><b>${last.cumNF !== undefined ? fmt(last.cumNF) + " dB" : "\u2014"}</b></div>
    <div><span>Sens. (${fmt(bwMHz)} MHz):</span><b>${fmt(sens)} dBm</b></div>
    <div><span>Cascade OIP3:</span><b>${last.oip3 !== undefined ? fmt(last.oip3) + " dBm" : "\u2014"}</b></div>
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

function exportBudgetCsv() {
  const sel = $("bgStart");
  const startId = sel ? sel.value : null;
  const { rows } = buildBudget(startId);
  if (!rows.length) { hint("No budget to export."); return; }
  let csv = "Stage,Type,Gain_dB,Level_dBm,NF_stage_dB,NF_cum_dB,OIP3_cum_dBm,P1dB_dBm,Headroom_dB\n";
  for (const r of rows) {
    const q = s => `"${String(s || "").replace(/"/g, '""')}"`;
    csv += [q(r.name), q(r.type), r.gain ?? "", r.lvl ?? "", r.nfStage ?? "", r.cumNF ?? "", r.oip3 ?? "", r.p1db ?? "", r.head ?? ""].join(",") + "\n";
  }
  const blob = new Blob([csv], { type: "text/csv" }), url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "cascade-budget.csv"; a.click(); URL.revokeObjectURL(url);
  hint("Exported cascade-budget.csv");
}


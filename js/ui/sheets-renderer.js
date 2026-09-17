"use strict";

/* Sheet Tab Bar & Re-ordering Manager */
function renderSheets() {
  commitSheet();
  const bar = $("sheetBar");
  if (!bar) return;
  bar.innerHTML = sheets.map((sh, i) => `<button class="sheet-tab${i === cur ? " on" : ""}${sh.parent ? " child" : ""}" data-i="${i}" title="${sh.parent ? "Inside a subsystem — " : ""}Click to open, double-click to rename, drag to reorder">`
    + (sh.parent ? `<span class="kid">\u21b3</span>` : "")
    + `<span class="nm">${esc(sh.name)}</span><span class="cnt">${sh.blocks.length}</span></button>`).join("")
    + `<button class="sheet-add" id="sheetAdd" title="Add a sheet">+</button>`;

  bar.querySelectorAll(".sheet-tab").forEach(el => {
    const i = +el.getAttribute("data-i");
    el.onmousedown = ev => {
      if (ev.button !== 0) return;
      if (ev.target && ev.target.closest && ev.target.closest("input")) return;
      startTabDrag(i, ev.clientX);
    };
    el.onclick = () => {
      if (tabDragBlockClick) { tabDragBlockClick = false; return; }
      if (i !== cur) gotoSheet(i);
    };
    el.ondblclick = ev => { ev.preventDefault(); renameSheet(i, el); };
    el.oncontextmenu = ev => {
      ev.preventDefault(); ev.stopPropagation(); gotoSheet(i);
      ctxItems([
        ...(sheets[i].parent ? [ctxItem("Go to parent block", "", "sh-up"), "divider"] : []),
        ctxItem("Rename", "", "sh-rename"), ctxItem("Duplicate sheet", "", "sh-dup"),
        "divider", ctxItem("Delete sheet", "", "sh-del", "danger")
      ]);
      showCtx(ev.clientX, ev.clientY);
    };
  });
  const addBtn = $("sheetAdd");
  if (addBtn) addBtn.onclick = addSheet;
}

function gotoSheet(i) {
  commitSheet();
  adoptSheet(i);
  applyView();
  renderAll();
  renderSheets();
  hint(`Sheet: ${sheets[cur].name}`);
}

let tabDrag = null, tabDragBlockClick = false;

function tabEls() { return [...$("sheetBar").querySelectorAll(".sheet-tab")]; }

function clearDropMarks() {
  tabEls().forEach(t => { t.classList.remove("drop-before"); t.classList.remove("drop-after"); });
}

function tabDropIndex(clientX) {
  const t = tabEls();
  for (let k = 0; k < t.length; k++) {
    const r = t[k].getBoundingClientRect();
    if (clientX < r.left + r.width / 2) return k;
  }
  return t.length;
}

function startTabDrag(from, x) {
  tabDrag = { from, startX: x, moved: false, to: from };
  window.addEventListener("mousemove", onTabMove);
  window.addEventListener("mouseup", onTabUp);
}

function onTabMove(e) {
  if (!tabDrag) return;
  if (!tabDrag.moved) {
    if (Math.abs(e.clientX - tabDrag.startX) < 5) return;
    tabDrag.moved = true;
    const el = tabEls()[tabDrag.from];
    if (el) el.classList.add("dragging");
    $("sheetBar").classList.add("reordering");
  }
  tabDrag.to = tabDropIndex(e.clientX);
  clearDropMarks();
  const t = tabEls();
  if (tabDrag.to < t.length) t[tabDrag.to].classList.add("drop-before");
  else if (t.length) t[t.length - 1].classList.add("drop-after");
}

function onTabUp() {
  window.removeEventListener("mousemove", onTabMove);
  window.removeEventListener("mouseup", onTabUp);
  const d = tabDrag; tabDrag = null;
  clearDropMarks();
  const bar = $("sheetBar");
  if (bar) bar.classList.remove("reordering");
  if (!d || !d.moved) return;
  tabDragBlockClick = true; setTimeout(() => { tabDragBlockClick = false; }, 0);
  const from = d.from; let to = d.to;
  if (to === from || to === from + 1) { renderSheets(); return; }
  pushHistory();
  commitSheet();
  const keep = sheets[cur];
  const moved = sheets.splice(from, 1)[0];
  if (to > from) to--;
  sheets.splice(to, 0, moved);
  cur = sheets.indexOf(keep);
  renderSheets();
  hint(`Moved "${moved.name}" to position ${to + 1}.`);
}

function addSheet() {
  pushHistory();
  commitSheet();
  sheets.push({ id: newSheetId(), name: newSheetName(), blocks: [], conns: [], view: { tx: 60, ty: 56, scale: 1 } });
  adoptSheet(sheets.length - 1);
  applyView();
  renderAll();
  renderSheets();
  hint("Sheet added.");
}

function duplicateSheet() {
  pushHistory();
  commitSheet();
  const src = sheets[cur], map = {};
  const nb = src.blocks.map(b => { const n = JSON.parse(JSON.stringify(b)); n.id = uid(b.type); map[b.id] = n.id; return n; });
  const nc = src.conns.filter(c => map[c.from.block] && map[c.to.block]).map(c => {
    const n = JSON.parse(JSON.stringify(c)); n.id = uid("c");
    n.from = { block: map[c.from.block], port: c.from.port }; n.to = { block: map[c.to.block], port: c.to.port }; return n;
  });
  sheets.splice(cur + 1, 0, { id: newSheetId(), name: src.name + " copy", blocks: nb, conns: nc, view: { ...src.view } });
  adoptSheet(cur + 1);
  applyView();
  renderAll();
  renderSheets();
  hint("Sheet duplicated.");
}

function deleteSheet() {
  if (sheets.length < 2) { hint("A file needs at least one sheet."); return; }
  if (sheets[cur].blocks.length && !confirm(`Delete "${sheets[cur].name}" and everything on it?`)) return;
  pushHistory();
  sheets.splice(cur, 1);
  adoptSheet(Math.min(cur, sheets.length - 1));
  applyView();
  renderAll();
  renderSheets();
  hint("Sheet deleted.");
}

function renameSheet(i, tabEl) {
  const sh = sheets[i];
  const span = tabEl && tabEl.querySelector(".nm");
  if (!span) return;
  const inp = document.createElement("input");
  inp.className = "sheet-rename"; inp.value = sh.name; inp.maxLength = 40;
  span.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const commit = ok => {
    if (done) return; done = true;
    const v = inp.value.trim();
    if (ok && v && v !== sh.name) { pushHistory(); sh.name = v; hint(`Renamed to "${v}".`); }
    renderSheets();
    if (typeof budgetOpen === "function" && budgetOpen()) renderBudget();
  };
  inp.onkeydown = ev => {
    if (ev.key === "Enter") { ev.preventDefault(); commit(true); }
    else if (ev.key === "Escape") { ev.preventDefault(); commit(false); }
    ev.stopPropagation();
  };
  inp.onblur = () => commit(true);
}


"use strict";

/* Right-Click Context Menu Engine */
const ctx = $("ctxmenu");
let ctxAt = { x: 120, y: 120 };

function ctxItem(label, kbd, act, cls) {
  return `<button data-act="${act}" class="${cls || ""}"><span>${esc(label)}</span><span class="kbd">${esc(kbd || "")}</span></button>`;
}

function ctxItems(list) {
  if (!ctx) return;
  ctx.innerHTML = list.map(x => x === "divider" ? `<div class="divider"></div>` : x).join("");
  ctx.querySelectorAll("[data-act]").forEach(btn => btn.onclick = () => {
    const a = btn.getAttribute("data-act");
    hideCtx();
    if (a === "col") { const b = findBlock([...selected][0]); if (b) openColorPop(b, ctxAt.x, ctxAt.y); return; }
    if (a === "colrst") {
      const b = findBlock([...selected][0]); if (!b) return;
      const k = keyOfBlock(b);
      if (typeColor[k] === undefined) { hint("Already the default colour."); return; }
      pushHistory(); delete typeColor[k]; markDirty(); renderPalette(); renderCanvas(); hint("Reset to the default colour."); return;
    }
    if (a === "sub-open") { const b = findBlock([...selected][0]); if (b) openSubsystem(b); return; }
    if (a === "sub-group") { groupIntoSubsystem(); return; }
    if (a === "sh-up") { goToParent(); return; }
    if (a === "sh-rename") { const el = $("sheetBar").querySelector(`.sheet-tab[data-i="${cur}"]`); renameSheet(cur, el); return; }
    if (a === "sh-dup") { duplicateSheet(); return; }
    if (a === "sh-del") { deleteSheet(); return; }
    if (a && a.indexOf("al-") === 0) { alignSelection(a.slice(3)); return; }
    if (a === "mirror") mirrorSelection();
    else if (a === "rotate") rotateSelection();
    else if (a === "dup") duplicateSelection();
    else if (a === "del") deleteSelection();
    else if (a === "pill") {
      const cn = conns.find(c => c.id === selConn);
      if (cn) { pushHistory(); cn.hidePill = !cn.hidePill; renderAll(); hint(cn.hidePill ? "Label hidden. Right-click the wire to show it." : "Label shown."); }
    }
    else if (a === "wp-add") {
      const cn = conns.find(c => c.id === selConn);
      if (cn) {
        pushHistory();
        const w = screenToWorld(ctxAt.x, ctxAt.y);
        insertWaypointInOrder(cn, { x: snap(w.x), y: snap(w.y) });
        delete cn.jog;
        renderAll();
        hint("Added routing waypoint.");
      }
    }
    else if (a === "wp-clear") {
      const cn = conns.find(c => c.id === selConn);
      if (cn) {
        pushHistory();
        delete cn.jog;
        delete cn.waypoints;
        renderAll();
        hint("Wire straightened.");
      }
    }
    else if (a === "delc") {
      if (selConn) { pushHistory(); conns = conns.filter(c => c.id !== selConn); selConn = null; renderAll(); }
    }
    else if (a === "all") selectAll();
    else if (a === "fit") fitView();
  });
}

function showCtx(x, y) {
  if (!ctx) return;
  ctxAt = { x, y };
  ctx.classList.add("open");
  const r = ctx.getBoundingClientRect();
  let px = x, py = y;
  if (x + r.width > window.innerWidth) px = window.innerWidth - r.width - 6;
  if (y + r.height > window.innerHeight) py = window.innerHeight - r.height - 6;
  ctx.style.left = px + "px";
  ctx.style.top = py + "px";
}

function hideCtx() {
  if (ctx) ctx.classList.remove("open");
}


"use strict";

/* Custom Color Picker Modal */
let cpState = null;
const cpEl = () => $("colorPop");

function openColorPop(b, px, py) {
  if (!b) return;
  const k = keyOfBlock(b), before = typeColor[k];
  const c0 = colorOf(k, b.type);
  cpState = { key: k, type: b.type, before, value: c0, pre: snapState(), what: colorLabel(b) };
  $("cpWhat").textContent = cpState.what;
  cpSlidersFrom(c0);
  $("cpHex").value = c0;
  cpPaintChip(c0);
  paintSwatches();

  const pop = cpEl();
  pop.classList.add("open");
  const r = pop.getBoundingClientRect();
  let x = px, y = py;
  if (x + r.width > window.innerWidth) x = window.innerWidth - r.width - 10;
  if (y + r.height > window.innerHeight) y = window.innerHeight - r.height - 10;
  pop.style.left = Math.max(10, x) + "px";
  pop.style.top = Math.max(10, y) + "px";
}

function paintSwatches() {
  const box = $("cpSwatches");
  if (!box) return;
  box.innerHTML = SWATCHES.map(col => `<button data-c="${col}" class="${col.toLowerCase() === ((cpState && cpState.value) || "").toLowerCase() ? "on" : ""}" style="background:${col}" title="${col}"></button>`).join("");
  box.querySelectorAll("[data-c]").forEach(btn => btn.onclick = () => {
    const c = btn.getAttribute("data-c");
    cpSlidersFrom(c);
    cpPreview(c);
  });
}

function cpPreview(col, fromHexField) {
  if (!cpState) return;
  const c = normHex(col);
  if (!c) return;
  cpState.value = c;
  typeColor[cpState.key] = c;
  if (!settings.color) {
    settings.color = true;
    if ($("tglColor")) $("tglColor").checked = true;
  }
  if (!fromHexField && $("cpHex")) $("cpHex").value = c;
  cpPaintChip(c);
  paintSwatches();
  renderPalette();
  renderCanvas();
}

function cpRestore() {
  if (!cpState) return;
  if (cpState.before === undefined) delete typeColor[cpState.key];
  else typeColor[cpState.key] = cpState.before;
  renderPalette();
  renderCanvas();
}

function closeColorPop() {
  cpEl().classList.remove("open");
  cpState = null;
}

function cpApply() {
  if (!cpState) return;
  const v = typeColor[cpState.key], changed = v !== cpState.before;
  if (changed) {
    cpRestore();
    pushHistoryState(cpState.pre);
    typeColor[cpState.key] = v;
    markDirty();
    renderPalette();
    renderCanvas();
    hint(`Recoloured ${cpState.what}.`);
  }
  closeColorPop();
}

function cpCancel() {
  cpRestore();
  closeColorPop();
  hint("Colour unchanged.");
}

function cpDefault() {
  if (!cpState) return;
  delete typeColor[cpState.key];
  cpState.value = colorOf(cpState.key, cpState.type);
  cpSlidersFrom(cpState.value);
  $("cpHex").value = cpState.value;
  cpPaintChip(cpState.value);
  paintSwatches();
  renderPalette();
  renderCanvas();
}

const CP_MID = 55, CP_PS = 51, CP_PL = 79, CP_VS = 95, CP_VL = 45;

function cpFromSliders() {
  const h = +($("cpHue") ? $("cpHue").value : 0) || 0, t = +($("cpStr") ? $("cpStr").value : 0) || 0;
  if (t <= 0) return "#ffffff";
  if (t <= CP_MID) return hsl2hex(h, 18 + t * (CP_PS - 18) / CP_MID, 99 - t * (99 - CP_PL) / CP_MID);
  const f = (t - CP_MID) / (100 - CP_MID);
  return hsl2hex(h, CP_PS + f * (CP_VS - CP_PS), CP_PL - f * (CP_PL - CP_VL));
}

function cpSlidersFrom(hex) {
  const c = hex2hsl(hex);
  if (!c) {
    if ($("cpHue")) $("cpHue").value = 210;
    if ($("cpStr")) $("cpStr").value = 0;
    return;
  }
  if ($("cpHue")) $("cpHue").value = Math.round(c.h * 4) / 4;
  let t = 0;
  if (c.s >= 3) {
    t = (c.l >= CP_PL) ? (99 - c.l) * CP_MID / (99 - CP_PL)
                       : CP_MID + ((CP_PL - c.l) / (CP_PL - CP_VL)) * (100 - CP_MID);
  }
  if ($("cpStr")) $("cpStr").value = Math.max(0, Math.min(100, Math.round(t * 4) / 4));
}

function cpPaintChip(col) {
  if ($("cpChip")) $("cpChip").style.background = col;
  const h = +($("cpHue") ? $("cpHue").value : 0) || 0;
  if ($("cpStr")) $("cpStr").style.background = `linear-gradient(to right,#ffffff,${hsl2hex(h, CP_PS, CP_PL)},${hsl2hex(h, CP_VS, CP_VL)})`;
}

function cpSliderKeys(el, fine, coarse) {
  if (!el) return;
  el.addEventListener("keydown", e => {
    e.stopPropagation();
    const k = e.key;
    if (k === "Enter") { e.preventDefault(); cpApply(); return; }
    if (k === "Escape") { e.preventDefault(); cpCancel(); return; }
    let dir = 0;
    if (k === "ArrowRight" || k === "ArrowUp") dir = 1;
    else if (k === "ArrowLeft" || k === "ArrowDown") dir = -1;
    else if (k === "Home" || k === "End") {
      e.preventDefault();
      el.value = (k === "Home") ? el.min : el.max;
      cpPreview(cpFromSliders());
      return;
    }
    else return;
    e.preventDefault();
    const step = e.shiftKey ? coarse : fine, lo = +el.min, hi = +el.max;
    const v = Math.min(hi, Math.max(lo, (+el.value) + dir * step));
    el.value = Math.round(v * 100) / 100;
    cpPreview(cpFromSliders());
  });
}


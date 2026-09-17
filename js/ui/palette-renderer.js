"use strict";

/* Component Palette Sidebar Renderer */
function paletteIcon(type) {
  const c = COMP[type];
  if (c.isLabel) return `<svg viewBox="0 0 60 30"><text x="30" y="20" text-anchor="middle" style="fill:#cdd6e0;font-family:var(--mono);font-size:13px;font-weight:600">Text</text></svg>`;
  const D = dims(c, c.params);
  return `<svg viewBox="-6 -6 ${D.w + 12} ${D.h + 12}"><g transform="translate(0 0)">${c.sym(c.params)}</g></svg>`;
}

function renderPalette() {
  const box = $("palBody"), q = ($("palSearch") ? $("palSearch").value : "").trim().toLowerCase();
  let h = "";
  for (const grp of GROUPS) {
    const list = ORDER.filter(t => COMP[t].group === grp && (!q || COMP[t].name.toLowerCase().includes(q) || (COMP[t].keys || "").toLowerCase().includes(q)));
    if (!list.length) continue;
    h += `<div class="pal-group"><h4>${esc(grp)}</h4><div class="pal-grid">`;
    for (const type of list) {
      const c = COMP[type], fill = blockFill({ type, params: c.params }), ink = blockInk(fill);
      const st = `--blk-fill:${fill}` + (ink ? `;--blk-stroke:${ink}` : "");
      h += `<div class="pal-item" data-add="${type}" title="${esc(c.name)} — click or drag onto the grid" style="${st}">
        <div class="pico">${paletteIcon(type)}</div>
        <div class="pname">${esc(c.name)}</div></div>`;
    }
    h += `</div></div>`;
  }
  if (!h) h = `<div class="pal-none">No symbols match "${esc(q)}".</div>`;
  if (box) box.innerHTML = h;
}


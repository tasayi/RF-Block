"use strict";

/* Orthogonal Line Router & Obstacle Avoidance */
function buildPathWithJumpers(pts, allVerticalSegs, currentConnId) {
  if (!pts || pts.length < 2) return "";
  if (typeof settings !== "undefined" && settings.enableJumpers === false) {
    return "M" + pts.map(p => `${p.x} ${p.y}`).join("L");
  }

  const r = 5;
  let d = `M ${pts[0].x} ${pts[0].y}`;

  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1];
    const isHoriz = Math.abs(p.y - q.y) < 0.5;

    if (isHoriz) {
      const y = p.y;
      const xMin = Math.min(p.x, q.x);
      const xMax = Math.max(p.x, q.x);
      const dirRight = q.x > p.x;

      const crossings = [];
      if (allVerticalSegs) {
        for (const vs of allVerticalSegs) {
          if (vs.connId === currentConnId) continue;
          const vx = vs.p.x;
          const vyMin = Math.min(vs.p.y, vs.q.y);
          const vyMax = Math.max(vs.p.y, vs.q.y);

          if (y > vyMin + 3 && y < vyMax - 3 && vx > xMin + r + 3 && vx < xMax - r - 3) {
            crossings.push(vx);
          }
        }
      }

      if (crossings.length > 0) {
        if (dirRight) {
          crossings.sort((a, b) => a - b);
        } else {
          crossings.sort((a, b) => b - a);
        }

        const filtered = [];
        for (const cx of crossings) {
          if (!filtered.length || Math.abs(cx - filtered[filtered.length - 1]) >= 2 * r + 2) {
            filtered.push(cx);
          }
        }

        for (const cx of filtered) {
          if (dirRight) {
            d += ` L ${cx - r} ${y} A ${r} ${r} 0 0 1 ${cx + r} ${y}`;
          } else {
            d += ` L ${cx + r} ${y} A ${r} ${r} 0 0 0 ${cx - r} ${y}`;
          }
        }
      }
      d += ` L ${q.x} ${q.y}`;
    } else {
      d += ` L ${q.x} ${q.y}`;
    }
  }

  return d;
}

function distToSeg(pt, p, q) {
  const dx = q.x - p.x, dy = q.y - p.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(pt.x - p.x, pt.y - p.y);
  let t = ((pt.x - p.x) * dx + (pt.y - p.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const projX = p.x + t * dx, projY = p.y + t * dy;
  return Math.hypot(pt.x - projX, pt.y - projY);
}

function insertWaypointInOrder(cn, pt) {
  if (!cn.waypoints || !cn.waypoints.length) {
    cn.waypoints = [pt];
    return;
  }
  const fb = findBlock(cn.from.block), tb = findBlock(cn.to.block);
  const a = portPt(fb, cn.from.port), z = portPt(tb, cn.to.port);
  if (!a || !z) {
    cn.waypoints.push(pt);
    return;
  }

  const nodes = [a, ...cn.waypoints, z];
  let bestDist = Infinity, bestIdx = 0;
  for (let i = 0; i < nodes.length - 1; i++) {
    const d = distToSeg(pt, nodes[i], nodes[i + 1]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  cn.waypoints.splice(bestIdx, 0, pt);
}

function obstacleRects(m) {
  const out = [];
  for (const b of blocks) {
    if (COMP[b.type].isLabel) continue;
    const f = footprint(b);
    out.push({ x1: b.x - m, y1: b.y - m, x2: b.x + f.w + m, y2: b.y + f.h + m });
  }
  return out;
}

function route(a, z, cn) {
  const S = 16, off = p => ({ left: [-S, 0], right: [S, 0], top: [0, -S], bottom: [0, S] }[p.side] || [S, 0]);
  const [ax, ay] = off(a), [zx, zy] = off(z);
  const a2 = { x: a.x + ax, y: a.y + ay }, z2 = { x: z.x + zx, y: z.y + zy };
  const hA = a.side === "left" || a.side === "right", hZ = z.side === "left" || z.side === "right";
  const g = v => Math.round(v / settings.gridSize) * settings.gridSize;
  const jogAxis = (hA && hZ) ? "x" : ((!hA && !hZ) ? "y" : null);
  let pts;

  if (cn && cn.waypoints && cn.waypoints.length > 0) {
    pts = [a, a2];
    for (const wp of cn.waypoints) {
      const last = pts[pts.length - 1];
      if (Math.abs(last.x - wp.x) > 0.5 && Math.abs(last.y - wp.y) > 0.5) {
        pts.push({ x: wp.x, y: last.y });
      }
      pts.push({ x: wp.x, y: wp.y });
    }
    const last = pts[pts.length - 1];
    if (Math.abs(last.x - z2.x) > 0.5 && Math.abs(last.y - z2.y) > 0.5) {
      pts.push({ x: z2.x, y: last.y });
    }
    pts.push(z2, z);
  } else if (cn && cn.jog != null && jogAxis === "x") {
    pts = [a, a2, { x: cn.jog, y: a2.y }, { x: cn.jog, y: z2.y }, z2, z];
  } else if (cn && cn.jog != null && jogAxis === "y") {
    pts = [a, a2, { x: a2.x, y: cn.jog }, { x: z2.x, y: cn.jog }, z2, z];
  } else {
    const rects = obstacleRects(6);
    const mkSegs = ps => {
      const ss = [];
      for (let i = 0; i < ps.length - 1; i++) {
        const p = ps[i], q = ps[i + 1];
        const len = Math.hypot(q.x - p.x, q.y - p.y);
        if (len < 0.001) continue;
        ss.push({ p, q, len, horiz: Math.abs(p.y - q.y) < 0.5 });
      }
      return ss;
    };
    const cost = ps => {
      const ss = mkSegs(ps);
      let cross = 0, len = 0;
      for (let i = 0; i < ss.length; i++) {
        const sg = ss[i];
        len += sg.len;
        if (i === 0 || i === ss.length - 1) continue;
        for (const r of rects) {
          if (segHitsRect(sg, r.x1, r.y1, r.x2, r.y2)) { cross++; break; }
        }
      }
      return cross * 100000 + len + ss.length * 8;
    };
    const VJ = mx => [a, a2, { x: mx, y: a2.y }, { x: mx, y: z2.y }, z2, z];
    const HJ = my => [a, a2, { x: a2.x, y: my }, { x: z2.x, y: my }, z2, z];
    const cands = [];
    if (hA && hZ) cands.push(VJ(g((a2.x + z2.x) / 2)));
    else if (!hA && !hZ) cands.push(HJ(g((a2.y + z2.y) / 2)));
    else if (hA && !hZ) cands.push([a, a2, { x: z2.x, y: a2.y }, z2, z]);
    else cands.push([a, a2, { x: a2.x, y: z2.y }, z2, z]);
    const xlo = Math.min(a2.x, z2.x), xhi = Math.max(a2.x, z2.x), ylo = Math.min(a2.y, z2.y), yhi = Math.max(a2.y, z2.y);
    cands.push(VJ(g((a2.x + z2.x) / 2)), HJ(g((a2.y + z2.y) / 2)));
    for (const k of [24, 64, 120, 200]) cands.push(VJ(g(xlo - k)), VJ(g(xhi + k)), HJ(g(ylo - k)), HJ(g(yhi + k)));
    let best = null, bc = Infinity;
    for (const c of cands) { const cs = cost(c); if (cs < bc) { bc = cs; best = c; } }
    pts = best;
  }
  const cleanPts = [];
  for (let i = 0; i < pts.length; i++) {
    if (i === 0 || Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) > 0.01) {
      cleanPts.push(pts[i]);
    }
  }
  pts = cleanPts;

  const d = "M" + pts.map(p => `${p.x} ${p.y}`).join("L");
  const segs = []; let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len < 0.001) continue;
    segs.push({ p, q, len, horiz: Math.abs(p.y - q.y) < 0.5, connId: cn ? cn.id : null });
    total += len;
  }
  let mx, my, orient = "h", segSel = null;
  if (!segs.length) { mx = (a.x + z.x) / 2; my = (a.y + z.y) / 2; }
  else {
    let acc = 0, chosen = segs[Math.floor(segs.length / 2)], t = 0.5, target = total / 2;
    for (const s of segs) {
      if (acc + s.len >= target) { chosen = s; t = (target - acc) / s.len; break; }
      acc += s.len;
    }
    mx = chosen.p.x + (chosen.q.x - chosen.p.x) * t;
    my = chosen.p.y + (chosen.q.y - chosen.p.y) * t;
    orient = chosen.horiz ? "h" : "v";
    segSel = chosen;
  }
  return { d, pts, mx, my, orient, jogAxis, segs, seg: segSel };
}

function pillDims(lvl, nf) {
  const full = dbm(lvl);
  const nrow = (nf === undefined || !isFinite(nf)) ? null : ("NF " + fmt(nf) + " dB");
  const w = Math.max(full.length * 6.4 + 14, nrow ? nrow.length * 5.4 + 14 : 0, 52);
  return { full, nrow, w, h: nrow ? 32 : 20 };
}

function segHitsRect(s, rx1, ry1, rx2, ry2) {
  if (s.horiz) {
    const y = s.p.y; if (y < ry1 || y > ry2) return false;
    const x1 = Math.min(s.p.x, s.q.x), x2 = Math.max(s.p.x, s.q.x);
    return x2 >= rx1 && x1 <= rx2;
  }
  const x = s.p.x; if (x < rx1 || x > rx2) return false;
  const y1 = Math.min(s.p.y, s.q.y), y2 = Math.max(s.p.y, s.q.y);
  return y2 >= ry1 && y1 <= ry2;
}

function pickClear(cands, d, segs, rects) {
  for (const c of cands) {
    const rx1 = c.x - d.w / 2 - 2, rx2 = c.x + d.w / 2 + 2, ry1 = c.y - d.h / 2 - 2, ry2 = c.y + d.h / 2 + 2;
    const segHit = segs.some(s => segHitsRect(s, rx1, ry1, rx2, ry2));
    const rectHit = (rects || []).some(r => !(rx2 < r.x1 || rx1 > r.x2 || ry2 < r.y1 || ry1 > r.y2));
    if (!segHit && !rectHit) return c;
  }
  return cands[0];
}

function pillCenter(R, lvl, allSegs, rects, nf) {
  const d = pillDims(lvl, nf);
  const segs = allSegs || R.segs || [];
  let seg = R.seg, cx = R.mx, cy = R.my;
  if (seg && R.segs && R.segs.length) {
    const need = (seg.horiz ? d.w : d.h) + 24;
    if (seg.len < need) {
      const L = R.segs.reduce((a, b) => b.len > a.len ? b : a);
      if (L.len > seg.len) { seg = L; cx = (L.p.x + L.q.x) / 2; cy = (L.p.y + L.q.y) / 2; }
    }
  }
  if (!seg) return { x: cx, y: cy - (d.h / 2 + 7) };
  if (seg.horiz) {
    const lo = Math.min(seg.p.x, seg.q.x) + d.w / 2 + 12, hi = Math.max(seg.p.x, seg.q.x) - d.w / 2 - 12;
    cx = lo <= hi ? Math.min(Math.max(cx, lo), hi) : (seg.p.x + seg.q.x) / 2;
    const off = d.h / 2 + 7, far = d.h / 2 + 35;
    cy = pickClear([{ x: cx, y: cy - off }, { x: cx, y: cy + off }, { x: cx, y: cy - far }, { x: cx, y: cy + far }], d, segs, rects).y;
  } else {
    const lo = Math.min(seg.p.y, seg.q.y) + d.h / 2 + 12, hi = Math.max(seg.p.y, seg.q.y) - d.h / 2 - 12;
    cy = lo <= hi ? Math.min(Math.max(cy, lo), hi) : (seg.p.y + seg.q.y) / 2;
    const off = d.w / 2 + 8, far = d.w / 2 + 36;
    cx = pickClear([{ x: cx + off, y: cy }, { x: cx - off, y: cy }, { x: cx + far, y: cy }, { x: cx - far, y: cy }], d, segs, rects).x;
  }
  return { x: cx, y: cy };
}

function pill(cx, cy, lvl, connId, nf) {
  const unk = (lvl === undefined || !isFinite(lvl));
  const d = pillDims(lvl, nf);
  const rows = d.nrow
    ? `<text class="ptx" x="0" y="-6" dominant-baseline="central" text-anchor="middle">${esc(d.full)}</text><text class="pun" x="0" y="7" dominant-baseline="central" text-anchor="middle">${esc(d.nrow)}</text>`
    : `<text class="ptx" x="0" y="0" dominant-baseline="central" text-anchor="middle">${esc(d.full)}</text>`;
  return `<g class="pill${unk ? " unk" : ""}"${connId ? ` data-conn="${connId}"` : ""} transform="translate(${cx} ${cy})"><rect class="pbg" x="${-d.w / 2}" y="${-d.h / 2}" width="${d.w}" height="${d.h}" rx="6"/>${rows}</g>`;
}


"use strict";

/* Friis Noise Figure Calculation Engine */
function computeNoise(P) { return withAllSheets(() => computeNoiseRaw(P)); }

function computeNoiseRaw(P) {
  const N = {};
  for (const b of blocks) {
    const c = COMP[b.type];
    if (c.isSource && c.isSource(b.params)) {
      for (const pid of srcPorts(c, b.params)) N[key(b.id, pid)] = { F: 1, G: 1 };
    }
  }
  const near = (a, b2) => a && b2 && Math.abs(a.F - b2.F) < 1e-9 && Math.abs(a.G - b2.G) < 1e-12;
  const maxIter = blocks.length + 6;
  for (let it = 0; it < maxIter; it++) {
    let changed = false;
    const tagN = {};
    for (const b of blocks) {
      const c = COMP[b.type];
      if (!c.isInterconnect || !icSend(b.params)) continue;
      const pt = getPorts(b)[0];
      if (!pt) continue;
      let best = null, bl = -Infinity;
      for (const cn of conns) {
        if (cn.to.block !== b.id || cn.to.port !== pt.id) continue;
        const lv = P[key(cn.from.block, cn.from.port)], nn = N[key(cn.from.block, cn.from.port)];
        if (lv === undefined || !isFinite(lv) || !nn) continue;
        if (lv > bl) { bl = lv; best = nn; }
      }
      if (best) tagN[(b.params.tag || "").trim()] = best;
    }
    /* Subsystem input boundary */
    for (const b of blocks) {
      const c = COMP[b.type];
      if (!c.isSubsystem) continue;
      for (const pt of getPorts(b)) {
        if (pt.kind !== "in") continue;
        let best = null, bl = -Infinity;
        for (const cn of conns) {
          if (cn.to.block !== b.id || cn.to.port !== pt.id) continue;
          const lv = P[key(cn.from.block, cn.from.port)], nn = N[key(cn.from.block, cn.from.port)];
          if (lv === undefined || !isFinite(lv) || !nn) continue;
          if (lv > bl) { bl = lv; best = nn; }
        }
        if (best) tagN[subTag(b.id, pt.id)] = best;
      }
    }
    for (const b of blocks) {
      const c = COMP[b.type];
      if (!c.isInterconnect || !icRecv(b.params)) continue;
      const nn = tagN[(b.params.tag || "").trim()];
      if (!nn) continue;
      const k = key(b.id, getPorts(b)[0].id);
      if (!near(N[k], nn)) { N[k] = { F: nn.F, G: nn.G }; changed = true; }
    }
    for (const b of blocks) {
      const c = COMP[b.type];
      if (!c.isSubsystem) continue;
      for (const pt of getPorts(b)) {
        if (pt.kind !== "out") continue;
        const nn = tagN[subTag(b.id, pt.id)];
        if (!nn) continue;
        const k = key(b.id, pt.id);
        if (!near(N[k], nn)) { N[k] = { F: nn.F, G: nn.G }; changed = true; }
      }
    }
    for (const b of blocks) {
      const c = COMP[b.type];
      if (c.isInterconnect || c.isLabel || c.isSubsystem || (c.isSource && c.isSource(b.params))) continue;
      const ports = getPorts(b);
      let inP = null, inLvl = -Infinity, inN = null;
      for (const p of ports) {
        if (p.kind === "out") continue;
        if (c.refIn && p.id !== c.refIn) continue;
        for (const cn of conns) {
          if (cn.to.block !== b.id || cn.to.port !== p.id) continue;
          const lv = P[key(cn.from.block, cn.from.port)], nn = N[key(cn.from.block, cn.from.port)];
          if (lv === undefined || !isFinite(lv) || !nn) continue;
          if (lv > inLvl) { inLvl = lv; inP = p.id; inN = nn; }
        }
      }
      if (!inN || !isFinite(inLvl)) continue;
      const fdecl = Math.pow(10, (c.nf ? Math.max(0, +c.nf(b.params) || 0) : 0) / 10);
      for (const p of ports) {
        if (p.id === inP) continue;
        const k = key(b.id, p.id), lv = P[k];
        if (lv === undefined || !isFinite(lv)) continue;
        const g = Math.pow(10, (lv - inLvl) / 10);
        const f = Math.max(fdecl, g < 1 ? 1 / g : 1);
        const cand = { F: inN.F + (f - 1) / Math.max(1e-12, inN.G), G: inN.G * g };
        if (!near(N[k], cand)) { N[k] = cand; changed = true; }
      }
    }
    if (!changed) break;
  }
  return N;
}

const nfDb = nn => (nn && isFinite(nn.F) && nn.F > 0) ? 10 * Math.log10(nn.F) : undefined;


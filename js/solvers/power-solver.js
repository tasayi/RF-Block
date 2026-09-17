"use strict";

/* Power Level Solver Engine */
function computePowers() { return withAllSheets(computePowersRaw); }

function computePowersRaw() {
  const out = {};
  for (const b of blocks) {
    const c = COMP[b.type];
    if (c.isSource && c.isSource(b.params)) {
      const lv = Number(c.srcPower(b.params));
      for (const pid of srcPorts(c, b.params)) out[key(b.id, pid)] = lv;
    }
  }
  const maxIter = blocks.length + 6;
  for (let it = 0; it < maxIter; it++) {
    let changed = false;
    const tagLevel = {};

    /* Capture levels arriving at 'in' interconnects, keyed by tag */
    for (const b of blocks) {
      const c = COMP[b.type];
      if (!c.isSubsystem) continue;
      for (const pt of getPorts(b)) {
        if (pt.kind !== "in") continue;
        const f = conns.filter(cn => cn.to.block === b.id && cn.to.port === pt.id)
          .map(cn => out[key(cn.from.block, cn.from.port)]).filter(v => v !== undefined && isFinite(v));
        if (!f.length) continue;
        const lv = f.length === 1 ? f[0] : sumDbm(f);
        const t = subTag(b.id, pt.id);
        tagLevel[t] = (tagLevel[t] === undefined) ? lv : Math.max(tagLevel[t], lv);
      }
    }

    for (const b of blocks) {
      const c = COMP[b.type];
      if (!c.isInterconnect || !icSend(b.params)) continue;
      const pt = getPorts(b)[0];
      if (!pt) continue;
      const f = conns.filter(cn => cn.to.block === b.id && cn.to.port === pt.id)
        .map(cn => out[key(cn.from.block, cn.from.port)]).filter(v => v !== undefined && isFinite(v));
      if (f.length) {
        const lv = f.length === 1 ? f[0] : sumDbm(f);
        const t = (b.params.tag || "").trim();
        tagLevel[t] = (tagLevel[t] === undefined) ? lv : Math.max(tagLevel[t], lv);
      }
    }

    /* Re-emit at matching 'out' interconnects */
    for (const b of blocks) {
      const c = COMP[b.type];
      if (!c.isInterconnect || !icRecv(b.params)) continue;
      const t = (b.params.tag || "").trim();
      const lv = tagLevel[t];
      if (lv === undefined || !isFinite(lv)) continue;
      const pt = getPorts(b)[0];
      const k = key(b.id, pt.id);
      if (out[k] !== lv) { out[k] = lv; changed = true; }
    }

    /* Subsystem outputs */
    for (const b of blocks) {
      const c = COMP[b.type];
      if (!c.isSubsystem) continue;
      for (const pt of getPorts(b)) {
        if (pt.kind !== "out") continue;
        const lv = tagLevel[subTag(b.id, pt.id)];
        if (lv === undefined || !isFinite(lv)) continue;
        const k = key(b.id, pt.id);
        if (out[k] !== lv) { out[k] = lv; changed = true; }
      }
    }

    /* Normal components */
    for (const b of blocks) {
      const c = COMP[b.type];
      if (!c.out || (c.isSource && c.isSource(b.params))) continue;
      const ports = getPorts(b), inMap = {};
      for (const p of ports) {
        if (p.kind !== "in" && p.kind !== "inout") continue;
        const f = conns.filter(cn => cn.to.block === b.id && cn.to.port === p.id)
          .map(cn => out[key(cn.from.block, cn.from.port)]).filter(v => v !== undefined && isFinite(v));
        if (f.length) inMap[p.id] = f.length === 1 ? f[0] : sumDbm(f);
      }
      const p1 = (c.p1db && typeof c.p1db === "function") ? c.p1db(b.params) : undefined;
      const capP1 = (p1 !== undefined && isFinite(p1)) ? Number(p1) : undefined;
      if (c.bidi) {
        const em = c.bidi(inMap, b.params);
        for (const pid in em) {
          let nv = em[pid];
          if (nv === undefined || !isFinite(nv)) continue;
          if (capP1 !== undefined && nv > capP1) nv = capP1;
          const k = key(b.id, pid);
          if (out[k] !== nv) { out[k] = nv; changed = true; }
        }
        continue;
      }
      let ref;
      if (c.ref) ref = c.ref(inMap, b.params);
      else {
        const fp = ports.find(p => (p.kind === "in" || p.kind === "inout") && inMap[p.id] !== undefined);
        ref = fp ? inMap[fp.id] : undefined;
      }
      if (ref === undefined || !isFinite(ref)) continue;
      if (c.xfer) {
        const ab = c.xfer(ref, b.params);
        for (const pid in ab) {
          let nv = ab[pid];
          if (nv === undefined || !isFinite(nv)) continue;
          if (capP1 !== undefined && nv > capP1) nv = capP1;
          const k = key(b.id, pid);
          if (out[k] !== nv) { out[k] = nv; changed = true; }
        }
        continue;
      }
      const g = c.out(b.params, b);
      for (const pid in g) {
        let nv = ref + g[pid];
        if (nv === undefined || !isFinite(nv)) continue;
        if (capP1 !== undefined && nv > capP1) nv = capP1;
        const k = key(b.id, pid);
        if (out[k] !== nv) { out[k] = nv; changed = true; }
      }
    }
    if (!changed) break;
  }
  return out;
}


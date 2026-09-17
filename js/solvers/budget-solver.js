"use strict";

/* Cascade Budget & Design Rule Checker Engine */
function startBlocks() {
  return allBlocks().filter(b => {
    const c = COMP[b.type];
    return c.isSource && c.isSource(b.params);
  });
}

function feedsOf(bid, pid) {
  return allConns().filter(c => c.to.block === bid && c.to.port === pid);
}

function drivenBy(bid, pid) {
  return allConns().filter(c => c.from.block === bid && c.from.port === pid);
}

function nextHop(P, bid, inPort) {
  const b = allBlocks().find(x => x.id === bid);
  if (!b) return null;
  let best = null, bl = -Infinity;
  for (const p of getPorts(b)) {
    if (p.id === inPort) continue;
    const lv = P[key(bid, p.id)];
    if (lv === undefined || !isFinite(lv)) continue;
    for (const cn of drivenBy(bid, p.id)) {
      if (lv > bl) { bl = lv; best = { outPort: p.id, conn: cn }; }
    }
  }
  return best;
}

function tagPartner(b) {
  const c = COMP[b.type];
  if (!c.isInterconnect || !icSend(b.params)) return null;
  const t = (b.params.tag || "").trim();
  return allBlocks().find(x => COMP[x.type].isInterconnect && icRecv(x.params) && (x.params.tag || "").trim() === t) || null;
}

function buildBudget(startId) {
  const P = computePowers(), N = computeNoise(P);
  const starts = startBlocks();
  const s0 = startId ? (allBlocks().find(b => b.id === startId) || null) : (starts[0] || null);
  if (!s0) return { rows: [], P, N, start: null };
  const c0 = COMP[s0.type];
  let curB = s0, curPort = srcPorts(c0, s0.params)[0], curIn = null;
  let lvl = P[key(s0.id, curPort)];
  const rows = [{
    id: s0.id, name: s0.params.label || c0.name, type: c0.name, gain: undefined,
    nf: 0, lvl, cumG: 0, cumNF: 0, oip3: Infinity, p1db: undefined, over: false, src: true
  }];
  let cumG = 0, cumOip3Lin = Infinity;
  const seen = new Set([s0.id]);
  const total = allBlocks().length;

  for (let hop = 0; hop < total + 4; hop++) {
    if (COMP[curB.type].isInterconnect && icSend(curB.params)) {
      const partner = tagPartner(curB);
      if (!partner || seen.has(partner.id)) break;
      seen.add(partner.id);
      const pp = getPorts(partner)[0];
      if (!pp) break;
      const sh = sheetOfBlock(partner.id);
      rows.push({
        id: partner.id, name: (partner.params.tag || "?") + " \u2192" + (sh ? " " + sh.name : ""), type: "Interconnect",
        gain: 0, nfStage: 0, lvl: P[key(partner.id, pp.id)], cumG, cumNF: nfDb(N[key(partner.id, pp.id)]),
        oip3: (cumOip3Lin === Infinity) ? undefined : 10 * Math.log10(cumOip3Lin), link: true
      });
      curB = partner; curIn = null; curPort = pp.id; continue;
    }
    const nx = nextHop(P, curB.id, curIn);
    if (!nx) break;
    const cn = nx.conn, nb = allBlocks().find(x => x.id === cn.to.block);
    if (!nb || seen.has(nb.id)) break;
    seen.add(nb.id);
    const nc = COMP[nb.type];
    const inLvl = P[key(cn.from.block, cn.from.port)];
    let outPort = null, outLvl = -Infinity;
    for (const p of getPorts(nb)) {
      if (p.id === cn.to.port) continue;
      const v = P[key(nb.id, p.id)];
      if (v !== undefined && isFinite(v) && v > outLvl) { outLvl = v; outPort = p.id; }
    }
    const hasOut = outPort !== null;
    const g = hasOut ? (outLvl - inLvl) : undefined;
    if (hasOut) cumG += g;
    const nfHere = nc.nf ? Math.max(0, +nc.nf(nb.params) || 0) : 0;
    const cumNF = hasOut ? (nfDb(N[key(nb.id, outPort)])) : (nfDb(N[key(cn.from.block, cn.from.port)]));
    const oi = nc.oip3 ? nc.oip3(nb.params) : undefined;
    if (hasOut) {
      const gl = Math.pow(10, g / 10);
      const prev = (cumOip3Lin === Infinity) ? Infinity : cumOip3Lin * gl;
      const own = (oi === undefined) ? Infinity : Math.pow(10, oi / 10);
      cumOip3Lin = (prev === Infinity && own === Infinity) ? Infinity : 1 / ((prev === Infinity ? 0 : 1 / prev) + (own === Infinity ? 0 : 1 / own));
    }
    const p1 = nc.p1db ? nc.p1db(nb.params) : undefined;
    const over = (p1 !== undefined && isFinite(p1) && hasOut && outLvl >= p1);
    rows.push({
      id: nb.id, name: nb.params.label || nc.name, type: nc.isSubsystem ? "Section" : nc.name, gain: g, nfStage: nfHere,
      lvl: hasOut ? outLvl : inLvl, cumG, cumNF, p1db: p1,
      head: (p1 !== undefined && hasOut) ? (p1 - outLvl) : undefined, over,
      oip3: (cumOip3Lin === Infinity) ? undefined : 10 * Math.log10(cumOip3Lin)
    });
    if (!hasOut) {
      if (nc.isInterconnect && icSend(nb.params) && tagPartner(nb)) { curB = nb; curIn = cn.to.port; continue; }
      break;
    }
    curB = nb; curIn = cn.to.port; curPort = outPort;
  }
  return { rows, P, N, start: s0 };
}

function runChecks(P) {
  const w = [];
  const AB = allBlocks(), AC = allConns();
  const many = sheets.length > 1;
  const pre = id => {
    if (!many) return "";
    const sh = sheetOfBlock(id);
    return sh ? `[${sh.name}] ` : "";
  };
  const conns = AC;
  for (const b of AB) {
    const c = COMP[b.type];
    if (c.isLabel) continue;
    const ports = getPorts(b);
    for (const p of ports) {
      const wired = conns.some(cn => (cn.from.block === b.id && cn.from.port === p.id) || (cn.to.block === b.id && cn.to.port === p.id));
      if (!wired) w.push({ lvl: "info", id: b.id, msg: `${pre(b.id)}${b.params.label || c.name}: port "${p.id}" is unconnected` });
    }
    for (const p of ports) {
      if (!conns.some(cn => cn.from.block === b.id && cn.from.port === p.id)) continue;
      if (P[key(b.id, p.id)] === undefined) w.push({ lvl: "warn", id: b.id, msg: `${pre(b.id)}${b.params.label || c.name}: no level at "${p.id}" — check the source or switch position` });
    }
    if (c.p1db) {
      const p1 = c.p1db(b.params);
      if (p1 !== undefined) for (const p of ports) {
        const v = P[key(b.id, p.id)];
        if (v !== undefined && isFinite(v) && v > p1) w.push({ lvl: "err", id: b.id, msg: `${pre(b.id)}${b.params.label || c.name}: ${fmt(v - p1)} dB into compression (${fmt(v)} dBm vs P1dB ${fmt(p1)})` });
      }
    }
  }
  const outTags = {}, inTags = {};
  for (const b of AB) {
    const c = COMP[b.type];
    if (!c.isInterconnect) continue;
    const t = (b.params.tag || "").trim();
    if (isSubTag(t)) continue;
    (icRecv(b.params) ? outTags : inTags)[t] = b.id;
  }
  const inCount = {};
  for (const b of AB) {
    const c = COMP[b.type];
    if (!c.isInterconnect || !icSend(b.params)) continue;
    const t = (b.params.tag || "").trim();
    if (isSubTag(t)) continue;
    inCount[t] = (inCount[t] || 0) + 1;
  }
  for (const t in inCount) if (inCount[t] > 1)
    w.push({ lvl: "warn", id: inTags[t], msg: `Tag "${t}" is sent from ${inCount[t]} places — the strongest is used (levels are not added)` });
  for (const t in outTags) if (!(t in inTags)) w.push({ lvl: "warn", id: outTags[t], msg: `Tag "${t}" brings a signal in, but nothing sends it` });
  for (const t in inTags) if (!(t in outTags)) w.push({ lvl: "info", id: inTags[t], msg: `Tag "${t}" sends a signal, but nothing brings it in` });
  return w;
}

const noiseFloor = (nfDbv, bwHz) => (-174 + 10 * Math.log10(Math.max(1, bwHz)) + (nfDbv || 0));


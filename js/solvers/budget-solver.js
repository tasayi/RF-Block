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
  const p0 = c0.p1db ? c0.p1db(s0.params) : undefined;
  let cumG = 0, cumOip3Lin = Infinity, cumP1dbLin = (p0 !== undefined && isFinite(p0)) ? Math.pow(10, p0 / 10) : Infinity;
  const p0Cum = (cumP1dbLin === Infinity) ? undefined : 10 * Math.log10(cumP1dbLin);
  const rows = [{
    id: s0.id, name: s0.params.label || c0.name, type: c0.name, gain: undefined,
    nf: 0, lvl, cumG: 0, cumNF: 0, oip3: Infinity,
    p1db: p0Cum, cumP1db: p0Cum, p1dbStage: p0,
    head: (p0Cum !== undefined && isFinite(p0Cum) && lvl !== undefined) ? (p0Cum - lvl) : undefined,
    over: false, src: true
  }];
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
      const icLvl = P[key(partner.id, pp.id)];
      const icP1Cum = (cumP1dbLin === Infinity) ? undefined : 10 * Math.log10(cumP1dbLin);
      rows.push({
        id: partner.id, name: (partner.params.tag || "?") + " \u2192" + (sh ? " " + sh.name : ""), type: "Interconnect",
        gain: 0, nfStage: 0, lvl: icLvl, cumG, cumNF: nfDb(N[key(partner.id, pp.id)]),
        oip3: (cumOip3Lin === Infinity) ? undefined : 10 * Math.log10(cumOip3Lin),
        p1db: icP1Cum, cumP1db: icP1Cum, p1dbStage: undefined,
        head: (icP1Cum !== undefined && isFinite(icP1Cum) && icLvl !== undefined) ? (icP1Cum - icLvl) : undefined,
        over: (icP1Cum !== undefined && isFinite(icP1Cum) && icLvl !== undefined && icLvl >= icP1Cum),
        link: true
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
    const p1 = nc.p1db ? nc.p1db(nb.params) : undefined;
    if (hasOut) {
      const gl = Math.pow(10, g / 10);
      const prevOi = (cumOip3Lin === Infinity) ? Infinity : cumOip3Lin * gl;
      const ownOi = (oi === undefined || !isFinite(oi)) ? Infinity : Math.pow(10, oi / 10);
      cumOip3Lin = (prevOi === Infinity && ownOi === Infinity) ? Infinity : 1 / ((prevOi === Infinity ? 0 : 1 / prevOi) + (ownOi === Infinity ? 0 : 1 / ownOi));

      const prevP1 = (cumP1dbLin === Infinity) ? Infinity : cumP1dbLin * gl;
      const ownP1 = (p1 === undefined || !isFinite(p1)) ? Infinity : Math.pow(10, p1 / 10);
      cumP1dbLin = (prevP1 === Infinity && ownP1 === Infinity) ? Infinity : 1 / ((prevP1 === Infinity ? 0 : 1 / prevP1) + (ownP1 === Infinity ? 0 : 1 / ownP1));
    }
    const cumP1Val = (cumP1dbLin === Infinity) ? undefined : 10 * Math.log10(cumP1dbLin);
    const effLvl = hasOut ? outLvl : inLvl;
    const over = (cumP1Val !== undefined && isFinite(cumP1Val) && hasOut && outLvl >= cumP1Val) || (p1 !== undefined && isFinite(p1) && hasOut && outLvl >= p1);
    const head = (cumP1Val !== undefined && isFinite(cumP1Val) && hasOut) ? (cumP1Val - outLvl) : ((p1 !== undefined && isFinite(p1) && hasOut) ? (p1 - outLvl) : undefined);
    rows.push({
      id: nb.id, name: nb.params.label || nc.name, type: nc.isSubsystem ? "Section" : nc.name, gain: g, nfStage: nfHere,
      lvl: effLvl, cumG, cumNF,
      p1db: cumP1Val, cumP1db: cumP1Val, p1dbStage: p1,
      head, over,
      oip3: (cumOip3Lin === Infinity) ? undefined : 10 * Math.log10(cumOip3Lin)
    });
    if (!hasOut) {
      if (nc.isInterconnect && icSend(nb.params) && tagPartner(nb)) { curB = nb; curIn = cn.to.port; continue; }
      break;
    }
    curB = nb; curIn = cn.to.port; curPort = outPort;
  }
  const bwHz = (typeof settings !== "undefined" && settings.bandwidthHz && settings.bandwidthHz > 0) ? settings.bandwidthHz : 1e6;
  const s0Lvl = rows.length ? rows[0].lvl : 0;
  rows.forEach(r => {
    r.nfloor = (typeof computeNoiseFloor === "function")
      ? computeNoiseFloor(r.cumNF, r.lvl, s0Lvl, bwHz)
      : (-173.98 + 10 * Math.log10(Math.max(1, bwHz)) + (r.cumNF || 0) + (r.cumG || 0));
  });
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

const noiseFloor = (nfDbv, bwHz, gCum = 0) => (-173.98 + 10 * Math.log10(Math.max(1, bwHz)) + (nfDbv || 0) + gCum);


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

/* Subsystem Hierarchy Name Resolver */
function subsystemPrefix(bid) {
  const sh = typeof sheetOfBlock === "function" ? sheetOfBlock(bid) : null;
  if (!sh || !sh.parent) return "";
  const names = [];
  let curSh = sh;
  while (curSh && curSh.parent) {
    const parentB = allBlocks().find(b => b.id === curSh.parent);
    const name = parentB ? (parentB.params.label || (COMP[parentB.type] ? COMP[parentB.type].name : "Section")) : curSh.name;
    names.unshift(name);
    curSh = parentB ? sheetOfBlock(parentB.id) : null;
  }
  return names.length ? `[${names.join(" / ")}] ` : "";
}

/* Component Output Port Resolver for Signal Path Progression */
function getComponentForwardPorts(b, inPort) {
  const c = COMP[b.type];
  if (!c) return [];
  if (c.isSink && c.isSink(b.params)) return [];
  if (b.type === "rfout" || b.type === "termination" || b.type === "detector") return [];

  if (b.type === "switch") {
    const n = cint(b.params.throws, 1, 8);
    if (inPort === "in") {
      const ports = [];
      for (let i = 1; i <= n; i++) ports.push("o" + i);
      return ports;
    }
    return ["in"];
  }

  if (b.type === "splitter") {
    const n = cint(b.params.ways, 2, 8);
    if (inPort === "in") {
      const ports = [];
      for (let i = 1; i <= n; i++) ports.push("o" + i);
      return ports;
    }
    return ["in"];
  }

  if (b.type === "combiner") {
    if (inPort === "out") {
      const n = cint(b.params.ways, 2, 8), ports = [];
      for (let i = 1; i <= n; i++) ports.push("i" + i);
      return ports;
    }
    return ["out"];
  }

  if (b.type === "coupler") {
    const k = b.params.ctype || "Directional";
    if (k === "Power tap") {
      if (inPort === "in") return ["thru", "tap"];
      return inPort === "thru" ? ["in", "tap"] : ["in", "thru"];
    }
    if (k === "Resistive") {
      if (inPort === "in") return ["o1", "o2"];
      return ["in"];
    }
    if (k === "Bi-directional") {
      if (inPort === "in") return ["thru", "fwd"];
      if (inPort === "thru") return ["in", "rev"];
      return ["thru"];
    }
    if (k === "90\u00b0 hybrid") {
      if (inPort === "in") return ["out0", "out90"];
      if (inPort === "iso") return ["out0", "out90"];
      return ["in", "iso"];
    }
    if (k === "180\u00b0 hybrid") {
      if (inPort === "sum" || inPort === "dif") return ["o1", "o2"];
      return ["sum", "dif"];
    }
    if (inPort === "in") return ["thru", "cpl"];
    if (inPort === "thru") return ["in", "iso"];
    return ["thru"];
  }

  if (b.type === "mixer") {
    if (inPort === "rf" || inPort === "lo") return ["if"];
    return ["rf"];
  }

  if (b.type === "circulator") {
    if (inPort === "p1") return ["p2", "p3"];
    if (inPort === "p2") return ["p3"];
    if (inPort === "p3") return ["p1"];
  }

  if (c.out) {
    try {
      const o = c.out(b.params, b);
      if (o && typeof o === "object") {
        const keys = Object.keys(o).filter(k => k !== inPort);
        if (keys.length) return keys;
      }
    } catch (_) {}
  }

  const allP = getPorts(b);
  const outP = allP.filter(p => p.id !== inPort && p.kind !== "in");
  if (outP.length) return outP.map(p => p.id);
  const anyP = allP.filter(p => p.id !== inPort);
  return anyP.map(p => p.id);
}

/* Nominal Stage Gain Calculation (Fallback for inactive paths) */
function getStageNominalGain(b, inPort, outPort) {
  const c = COMP[b.type];
  if (!c) return 0;
  if (b.type === "amp") return +b.params.gain || 0;
  if (b.type === "bamp") {
    return (b.params.mode === "Bypass Mode") ? -Math.abs(+b.params.bypLoss || 0) : (+b.params.gain || 0);
  }
  if (b.type === "atten" || b.type === "dsa") return -Math.abs(+b.params.loss || 0);
  if (b.type === "attenuator") return -Math.abs(+b.params.att || 0);
  if (b.type === "filter") return -Math.abs(+b.params.il || 0);
  if (b.type === "switch") {
    const n = cint(b.params.throws, 1, 8);
    const sw = swState(b.params, n);
    const throwNum = parseInt(String(outPort).replace(/\D/g, ""), 10);
    return (sw === throwNum) ? -Math.abs(+b.params.il || 0) : -(+b.params.iso >= 0 ? +b.params.iso : 60);
  }
  if (b.type === "splitter") {
    return -(10 * Math.log10(cint(b.params.ways, 2, 8)) + Math.abs(+b.params.exloss || 0));
  }
  if (b.type === "combiner") {
    return -(10 * Math.log10(cint(b.params.ways, 2, 8)) + Math.abs(+b.params.exloss || 0));
  }
  if (b.type === "coupler") {
    if (typeof cplMatrix === "function") {
      const M = cplMatrix(b.params);
      if (M && M[inPort] && M[inPort][outPort] !== undefined) return -M[inPort][outPort];
    }
    return -Math.abs(+b.params.il || 0);
  }
  if (b.type === "mixer") return -Math.abs(+b.params.cl || 0);
  if (b.type === "isolator") return -Math.abs(+b.params.il || 0);
  if (b.type === "circulator") {
    return (outPort === "p3") ? -Math.abs(+b.params.iso || 20) : -Math.abs(+b.params.il || 0);
  }
  if (b.type === "phase") return -Math.abs(+b.params.il || 0);
  if (b.type === "multiplier") return -(+b.params.il || 0);
  if (b.type === "divider") return -Math.abs(+b.params.il || 0);
  if (b.type === "equalizer") {
    return (typeof eqLoss === "function") ? -eqLoss(b.params) : -Math.abs(+b.params.minil || 0);
  }
  if (c.out) {
    try {
      const o = c.out(b.params, b);
      if (o && o[outPort] !== undefined) return o[outPort];
    } catch (_) {}
  }
  return 0;
}

/* Discover all Candidate Forward Paths through Components and Subsystems */
function findCandidatePaths(s0, P) {
  if (!s0) return [];
  const c0 = COMP[s0.type];
  const sPorts = srcPorts(c0, s0.params);
  const startPort = sPorts[0] || (getPorts(s0)[0] ? getPorts(s0)[0].id : "out");
  const candidatePaths = [];
  const MAX_PATHS = 32;

  function dfs(currB, currPort, stages, visited, branches) {
    if (candidatePaths.length >= MAX_PATHS) return;
    let outConns = [];

    // Check if currB is an interconnect sender:
    if (COMP[currB.type].isInterconnect && icSend(currB.params)) {
      const tag = (currB.params.tag || "").trim();
      if (isSubTag(tag)) {
        // Exiting subsystem boundary into parent sheet
        const ownerId = subTagOwner(tag);
        const ownerPort = subTagPort(tag);
        const subOwner = allBlocks().find(x => x.id === ownerId);
        if (subOwner) {
          outConns = drivenBy(subOwner.id, ownerPort);
          if (!outConns.length) {
            recordPath(stages, branches, subOwner);
            return;
          }
        }
      } else {
        // Regular user interconnect across sheets
        const partner = tagPartner(currB);
        if (partner && !visited.has(partner.id)) {
          const pp = getPorts(partner)[0];
          if (pp) {
            const sh = typeof sheetOfBlock === "function" ? sheetOfBlock(partner.id) : null;
            const linkStage = {
              block: partner, inPort: null, outPort: pp.id,
              isLink: true,
              displayName: (partner.params.tag || "?") + " \u2192" + (sh ? " " + sh.name : "")
            };
            const nextStages = [...stages, linkStage];
            const nextVisited = new Set(visited);
            nextVisited.add(partner.id);
            const connsFromPartner = drivenBy(partner.id, pp.id);
            if (!connsFromPartner.length) {
              recordPath(nextStages, branches, partner);
              return;
            }
            for (const cn of connsFromPartner) {
              stepConnection(cn, nextStages, nextVisited, branches);
            }
            return;
          }
        }
      }
    } else {
      outConns = drivenBy(currB.id, currPort);
    }

    if (!outConns.length) {
      recordPath(stages, branches, currB);
      return;
    }

    for (const cn of outConns) {
      stepConnection(cn, stages, visited, branches);
    }
  }

  function stepConnection(cn, stages, visited, branches) {
    if (candidatePaths.length >= MAX_PATHS) return;
    const nb = allBlocks().find(x => x.id === cn.to.block);
    if (!nb) return;
    const inPort = cn.to.port;
    const nc = COMP[nb.type];

    // If nb is a Subsystem block: dive into child sheet!
    if (nc.isSubsystem) {
      const tag = subTag(nb.id, inPort);
      const icIn = allBlocks().find(x => COMP[x.type].isInterconnect && icRecv(x.params) && (x.params.tag || "").trim() === tag);
      if (icIn) {
        const icP = getPorts(icIn)[0];
        if (icP) {
          const nextVisited = new Set(visited);
          nextVisited.add(nb.id);
          dfs(icIn, icP.id, stages, nextVisited, branches);
          return;
        }
      }
      recordPath(stages, branches, nb);
      return;
    }

    // If nb is an interconnect sender, jump directly:
    if (nc.isInterconnect && icSend(nb.params)) {
      dfs(nb, inPort, stages, visited, branches);
      return;
    }

    // Check for cycles along this path branch:
    if (visited.has(nb.id)) {
      recordPath(stages, branches, nb);
      return;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(nb.id);

    const fwPorts = getComponentForwardPorts(nb, inPort);
    const subPre = subsystemPrefix(nb.id);
    const baseName = nb.params.label || nc.name;
    const dispName = subPre ? `${subPre}${baseName}` : baseName;

    if (!fwPorts.length) {
      // Sink or terminal block (RF OUT, termination, detector, antenna)
      const stage = { block: nb, inPort, outPort: null, displayName: dispName };
      recordPath([...stages, stage], branches, nb);
      return;
    }

    // Branch through each forward output port:
    for (const outP of fwPorts) {
      const stage = { block: nb, inPort, outPort: outP, displayName: dispName };
      const nextStages = [...stages, stage];
      let nextBranches = branches;

      if (fwPorts.length > 1) {
        const brLabel = `${baseName} [${outP}]`;
        nextBranches = branches ? `${branches} \u2192 ${brLabel}` : brLabel;
      }

      dfs(nb, outP, nextStages, nextVisited, nextBranches);
    }
  }

  function recordPath(stages, branches, endBlock) {
    if (!stages || !stages.length) return;
    const sig = stages.map(s => `${s.block.id}:${s.inPort}->${s.outPort}`).join("|");
    if (candidatePaths.some(p => p.sig === sig)) return;

    let active = true;
    for (const stg of stages) {
      if (stg.outPort) {
        const lv = P[key(stg.block.id, stg.outPort)];
        if (lv === undefined || !isFinite(lv)) {
          active = false;
          break;
        }
        if (stg.block.type === "switch") {
          const sw = swState(stg.block.params, cint(stg.block.params.throws, 1, 8));
          const throwNum = parseInt(String(stg.outPort).replace(/\D/g, ""), 10);
          if (sw !== throwNum) {
            active = false;
            break;
          }
        }
      }
    }

    const endName = endBlock ? (subsystemPrefix(endBlock.id) + (endBlock.params.label || (COMP[endBlock.type] ? COMP[endBlock.type].name : "End"))) : "End";
    const pathIdx = candidatePaths.length;
    let label = "";

    if (branches) {
      label = `Path ${pathIdx + 1}: via ${branches} \u2192 ${endName}${active ? " (Active)" : ""}`;
    } else {
      label = `Path ${pathIdx + 1}: \u2192 ${endName} (${stages.length} stages)${active ? " (Active)" : ""}`;
    }

    candidatePaths.push({
      id: pathIdx,
      label,
      shortLabel: branches || endName,
      stages,
      endBlock,
      isActive: active,
      sig
    });
  }

  const s0Pre = subsystemPrefix(s0.id);
  const s0Disp = s0Pre ? `${s0Pre}${s0.params.label || c0.name}` : (s0.params.label || c0.name);
  const initStages = [{ block: s0, inPort: null, outPort: startPort, displayName: s0Disp }];
  const initVisited = new Set([s0.id]);

  dfs(s0, startPort, initStages, initVisited, "");

  if (!candidatePaths.length) {
    candidatePaths.push({
      id: 0,
      label: `Path 1: ${s0Disp}`,
      shortLabel: s0Disp,
      stages: initStages,
      endBlock: s0,
      isActive: true,
      sig: `${s0.id}:null->${startPort}`
    });
  }

  return candidatePaths;
}

/* Cascade Budget Builder with Recursive Subsystem Traversal and Path Selection */
function buildBudget(startId, pathIdx) {
  const P = computePowers(), N = computeNoise(P);
  const starts = startBlocks();
  const s0 = startId ? (allBlocks().find(b => b.id === startId) || null) : (starts[0] || null);
  if (!s0) return { rows: [], P, N, start: null, paths: [], activePathIdx: 0 };

  const candidatePaths = findCandidatePaths(s0, P);
  let chosenIdx = 0;
  if (typeof pathIdx === "number" && pathIdx >= 0 && pathIdx < candidatePaths.length) {
    chosenIdx = pathIdx;
  } else {
    const firstActive = candidatePaths.findIndex(p => p.isActive);
    chosenIdx = firstActive >= 0 ? firstActive : 0;
  }

  const selectedPath = candidatePaths[chosenIdx];
  const stages = selectedPath ? selectedPath.stages : [];
  if (!stages.length) return { rows: [], P, N, start: s0, paths: candidatePaths, activePathIdx: chosenIdx };

  const s0Stage = stages[0];
  const c0 = COMP[s0.type];
  const s0Port = s0Stage.outPort;
  let lvl = P[key(s0.id, s0Port)];
  if (lvl === undefined || !isFinite(lvl)) {
    lvl = (c0.isSource && c0.srcPower) ? Number(c0.srcPower(s0.params)) : 0;
  }

  const p0 = c0.p1db ? c0.p1db(s0.params) : undefined;
  let cumG = 0;
  let cumOip3Lin = Infinity;
  let cumP1dbLin = (p0 !== undefined && isFinite(p0)) ? Math.pow(10, p0 / 10) : Infinity;
  const p0Cum = (cumP1dbLin === Infinity) ? undefined : 10 * Math.log10(cumP1dbLin);

  const rows = [{
    id: s0.id,
    name: s0Stage.displayName,
    type: c0.name,
    gain: undefined,
    nf: 0,
    lvl,
    cumG: 0,
    cumNF: 0,
    oip3: Infinity,
    p1db: p0Cum,
    cumP1db: p0Cum,
    p1dbStage: p0,
    head: (p0Cum !== undefined && isFinite(p0Cum) && lvl !== undefined) ? (p0Cum - lvl) : undefined,
    over: false,
    src: true
  }];

  let prevLvl = lvl;
  let prevCumLinNf = 1;

  for (let i = 1; i < stages.length; i++) {
    const stg = stages[i];
    const b = stg.block;
    const nc = COMP[b.type];
    const inPort = stg.inPort;
    const outPort = stg.outPort;
    const hasOut = (outPort !== null && outPort !== undefined);

    if (stg.isLink) {
      const pp = outPort || (getPorts(b)[0] ? getPorts(b)[0].id : "p");
      const icLvl = P[key(b.id, pp)];
      const effIcLvl = (icLvl !== undefined && isFinite(icLvl)) ? icLvl : prevLvl;
      const icP1Cum = (cumP1dbLin === Infinity) ? undefined : 10 * Math.log10(cumP1dbLin);
      const cumNfVal = nfDb(N[key(b.id, pp)]);
      rows.push({
        id: b.id,
        name: stg.displayName,
        type: "Interconnect",
        gain: 0,
        nfStage: 0,
        lvl: effIcLvl,
        cumG,
        cumNF: (cumNfVal !== undefined) ? cumNfVal : (10 * Math.log10(Math.max(1, prevCumLinNf))),
        oip3: (cumOip3Lin === Infinity) ? undefined : 10 * Math.log10(cumOip3Lin),
        p1db: icP1Cum,
        cumP1db: icP1Cum,
        p1dbStage: undefined,
        head: (icP1Cum !== undefined && isFinite(icP1Cum) && effIcLvl !== undefined) ? (icP1Cum - effIcLvl) : undefined,
        over: (icP1Cum !== undefined && isFinite(icP1Cum) && effIcLvl !== undefined && effIcLvl >= icP1Cum),
        link: true
      });
      prevLvl = effIcLvl;
      continue;
    }

    let outLvl = hasOut ? P[key(b.id, outPort)] : undefined;
    let g = undefined;
    if (hasOut) {
      if (outLvl !== undefined && isFinite(outLvl)) {
        g = outLvl - prevLvl;
      } else {
        g = getStageNominalGain(b, inPort, outPort);
        outLvl = prevLvl + g;
      }
      cumG += g;
    }

    const effLvl = hasOut ? outLvl : prevLvl;
    const nfHere = nc.nf ? Math.max(0, +nc.nf(b.params) || 0) : 0;
    let cumNF = undefined;
    if (hasOut && N[key(b.id, outPort)]) {
      cumNF = nfDb(N[key(b.id, outPort)]);
    }
    if (cumNF === undefined || !isFinite(cumNF)) {
      const gl = hasOut ? Math.pow(10, g / 10) : 1;
      const fdecl = Math.pow(10, nfHere / 10);
      const fstage = Math.max(fdecl, gl < 1 ? 1 / gl : 1);
      const prevGlin = Math.pow(10, (cumG - (g || 0)) / 10);
      prevCumLinNf = prevCumLinNf + (fstage - 1) / Math.max(1e-12, prevGlin);
      cumNF = 10 * Math.log10(Math.max(1, prevCumLinNf));
    } else {
      prevCumLinNf = Math.pow(10, cumNF / 10);
    }

    const oi = nc.oip3 ? nc.oip3(b.params) : undefined;
    const p1 = nc.p1db ? nc.p1db(b.params) : undefined;
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
    const over = (cumP1Val !== undefined && isFinite(cumP1Val) && hasOut && outLvl >= cumP1Val) || (p1 !== undefined && isFinite(p1) && hasOut && outLvl >= p1);
    const head = (cumP1Val !== undefined && isFinite(cumP1Val) && hasOut) ? (cumP1Val - outLvl) : ((p1 !== undefined && isFinite(p1) && hasOut) ? (p1 - outLvl) : undefined);

    rows.push({
      id: b.id,
      name: stg.displayName,
      type: nc.name,
      gain: g,
      nfStage: nfHere,
      lvl: effLvl,
      cumG,
      cumNF,
      p1db: cumP1Val,
      cumP1db: cumP1Val,
      p1dbStage: p1,
      head,
      over,
      oip3: (cumOip3Lin === Infinity) ? undefined : 10 * Math.log10(cumOip3Lin)
    });

    if (hasOut) prevLvl = outLvl;
  }

  const bwHz = (typeof settings !== "undefined" && settings.bandwidthHz && settings.bandwidthHz > 0) ? settings.bandwidthHz : 1e6;
  const s0Lvl = rows.length ? rows[0].lvl : 0;
  rows.forEach(r => {
    r.nfloor = (typeof computeNoiseFloor === "function")
      ? computeNoiseFloor(r.cumNF, r.lvl, s0Lvl, bwHz)
      : (-173.98 + 10 * Math.log10(Math.max(1, bwHz)) + (r.cumNF || 0) + (r.cumG || 0));
  });

  return { rows, P, N, start: s0, paths: candidatePaths, activePathIdx: chosenIdx };
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    startBlocks,
    feedsOf,
    drivenBy,
    nextHop,
    tagPartner,
    subsystemPrefix,
    getComponentForwardPorts,
    getStageNominalGain,
    findCandidatePaths,
    buildBudget,
    runChecks,
    noiseFloor
  };
}

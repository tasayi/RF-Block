"use strict";

/* ====================================================================
   RF S-Parameter Physics Solver & Multi-Port Matrix Engine (Up to 8 Ports)
   ==================================================================== */

/* Complex Number Math Library */
const CMath = {
  zero: () => ({ r: 0, i: 0 }),
  one:  () => ({ r: 1, i: 0 }),
  fromRI: (r, i) => ({ r: +r || 0, i: +i || 0 }),
  fromMADeg: (ma, deg) => {
    const rad = (deg || 0) * Math.PI / 180;
    return { r: ma * Math.cos(rad), i: ma * Math.sin(rad) };
  },
  fromDBDeg: (db, deg) => {
    const ma = Math.pow(10, db / 20);
    const rad = (deg || 0) * Math.PI / 180;
    return { r: ma * Math.cos(rad), i: ma * Math.sin(rad) };
  },
  add: (a, b) => ({ r: a.r + b.r, i: a.i + b.i }),
  sub: (a, b) => ({ r: a.r - b.r, i: a.i - b.i }),
  mul: (a, b) => ({ r: a.r * b.r - a.i * b.i, i: a.r * b.i + a.i * b.r }),
  div: (a, b) => {
    const d = b.r * b.r + b.i * b.i;
    if (d === 0) return { r: 0, i: 0 };
    return { r: (a.r * b.r + a.i * b.i) / d, i: (a.i * b.r - a.r * b.i) / d };
  },
  mag: a => Math.hypot(a.r, a.i),
  dB: a => {
    const m = Math.hypot(a.r, a.i);
    return m <= 1e-12 ? -120 : 20 * Math.log10(m);
  },
  phaseDeg: a => Math.atan2(a.i, a.r) * 180 / Math.PI
};

/* Convert unit strings to Hz multiplier */
function unitToHz(u) {
  if (!u) return 1e9;
  const s = u.trim().toLowerCase();
  if (s.startsWith("hz")) return 1;
  if (s.startsWith("khz")) return 1e3;
  if (s.startsWith("mhz")) return 1e6;
  if (s.startsWith("ghz")) return 1e9;
  if (s.startsWith("thz")) return 1e12;
  return 1e9;
}

/* Generate Analysis Band Frequency Array in Hz */
function generateFreqVector(band) {
  const fStart = (+band.startFreq || 1) * unitToHz(band.startUnit || "GHz");
  const fStop = (+band.stopFreq || 10) * unitToHz(band.stopUnit || "GHz");
  const N = Math.max(2, Math.min(2001, parseInt(band.points) || 101));
  const freqs = new Float64Array(N);
  if (band.sweepType === "log" && fStart > 0 && fStop > fStart) {
    const log1 = Math.log10(fStart), log2 = Math.log10(fStop);
    for (let k = 0; k < N; k++) freqs[k] = Math.pow(10, log1 + (k / (N - 1)) * (log2 - log1));
  } else {
    const step = (fStop - fStart) / (N - 1);
    for (let k = 0; k < N; k++) freqs[k] = fStart + k * step;
  }
  return freqs;
}

/* Touchstone File Parser (.s1p, .s2p, .s3p, .s4p ... .sNp) */
function parseTouchstone(text) {
  if (!text || typeof text !== "string") return null;
  const lines = text.split(/\r?\n/);
  let freqHzMult = 1e9, format = "DB", z0 = 50, numPorts = null;

  const rawTokens = [];
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("!")) continue;
    if (line.startsWith("#")) {
      const tokens = line.slice(1).trim().split(/\s+/);
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i].toUpperCase();
        if (["HZ", "KHZ", "MHZ", "GHZ", "THZ"].includes(t)) freqHzMult = unitToHz(t);
        else if (["DB", "MA", "RI"].includes(t)) format = t;
        else if (t === "R" && tokens[i + 1]) z0 = parseFloat(tokens[i + 1]) || 50;
      }
      continue;
    }

    const tokens = line.split(/\s+/);
    for (const tok of tokens) {
      const num = Number(tok);
      if (!isNaN(num)) rawTokens.push(num);
    }
  }

  if (!rawTokens.length) return null;

  // Infer numPorts if not explicitly set
  // For N-port: 1 freq + 2*N^2 vals per point
  for (const p of [2, 3, 4, 5, 6, 7, 8, 1]) {
    const valsPerPoint = 1 + 2 * p * p;
    if (rawTokens.length % valsPerPoint === 0) {
      numPorts = p;
      break;
    }
  }
  if (!numPorts) numPorts = 2;

  const valsPerPoint = 1 + 2 * numPorts * numPorts;
  const numPoints = Math.floor(rawTokens.length / valsPerPoint);
  if (numPoints === 0) return null;

  const readVal = (n1, n2) => {
    if (format === "DB") return CMath.fromDBDeg(n1, n2);
    if (format === "MA") return CMath.fromMADeg(n1, n2);
    return CMath.fromRI(n1, n2);
  };

  const pts = [];
  let idx = 0;
  for (let ptIdx = 0; ptIdx < numPoints; ptIdx++) {
    const fHz = rawTokens[idx++] * freqHzMult;
    const sMat = [];

    if (numPorts === 2) {
      // Touchstone 2-port token order: f, S11, S21, S12, S22
      const s11 = readVal(rawTokens[idx++], rawTokens[idx++]);
      const s21 = readVal(rawTokens[idx++], rawTokens[idx++]);
      const s12 = readVal(rawTokens[idx++], rawTokens[idx++]);
      const s22 = (rawTokens[idx] !== undefined) ? readVal(rawTokens[idx++], rawTokens[idx++]) : CMath.zero();
      sMat.push([s11, s12], [s21, s22]);
    } else {
      // Touchstone N-port (N >= 3) token order: row-by-row (S11, S12, S13... S21, S22, S23...)
      for (let i = 0; i < numPorts; i++) {
        const row = [];
        for (let j = 0; j < numPorts; j++) {
          const val1 = rawTokens[idx++];
          const val2 = rawTokens[idx++];
          row.push(readVal(val1, val2));
        }
        sMat.push(row);
      }
    }
    pts.push({ f: fHz, s: sMat });
  }

  pts.sort((a, b) => a.f - b.f);
  return {
    numPorts,
    z0,
    minFreq: pts[0].f,
    maxFreq: pts[pts.length - 1].f,
    pts
  };
}

/* Extract transmission magnitude vector in dB for a single block stage */
function getBlockBranchIndex(b, path) {
  if (!b) return 1;
  const allConnections = (typeof allConns === "function") ? allConns() : (typeof conns !== "undefined" ? conns : []);
  const pathIds = new Set((path || []).map(x => x.id));
  pathIds.delete(b.id);

  for (const cn of allConnections) {
    if (cn.from.block === b.id && pathIds.has(cn.to.block)) {
      const m = String(cn.from.port || "").match(/^[oi](\d+)$/i);
      if (m) return parseInt(m[1], 10);
    }
    if (cn.to.block === b.id && pathIds.has(cn.from.block)) {
      const m = String(cn.to.port || "").match(/^[oi](\d+)$/i);
      if (m) return parseInt(m[1], 10);
    }
  }
  return 1;
}

function getStageTransmissionDb(b, freqs, warnings, path, isReverse = false, inPort = null, outPort = null) {
  const N = freqs.length;
  const tDb = new Float64Array(N);
  const lbl = (b.params && b.params.label) || (COMP[b.type] && COMP[b.type].name) || "Block";

  if (b.type === "switch") {
    const nThrows = parseInt(b.params && b.params.throws) || 2;
    const stNum = swState(b.params || {}, nThrows);
    let kThrow = 1;
    if (outPort && outPort.startsWith("o")) {
      kThrow = parseInt(outPort.slice(1)) || 1;
    } else if (inPort && inPort.startsWith("o")) {
      kThrow = parseInt(inPort.slice(1)) || 1;
    } else {
      kThrow = getBlockBranchIndex(b, path);
    }
    const isoDb = -Math.abs(+b.params.iso >= 0 ? +b.params.iso : 40);
    const ilDb = -Math.abs(+b.params.il || 0.4);

    if (stNum === 0) {
      // Off / Open state
      for (let k = 0; k < N; k++) tDb[k] = isoDb;
      return tDb;
    }

    // Check per-throw file or active switch position file or multi-port Touchstone
    const sRaw = (b.params && b.params[`s2pData_st${kThrow}`]) || (b.params && b.params[`s2pData_st${stNum}`]) || (b.params && b.params.s2pData) || (b.params && b.params.s3pData) || (b.params && b.params.snpData);

    if (sRaw) {
      const parsed = parseTouchstone(sRaw);
      if (parsed) {
        let dstPortIdx = 1;
        if (parsed.numPorts >= 3) {
          // Multi-port S(N+1)P Touchstone file: Throw k = Port k+1 (row index k in sMat)
          dstPortIdx = kThrow;
        } else {
          // 2-port Touchstone file:
          if (kThrow !== stNum) {
            for (let k = 0; k < N; k++) tDb[k] = isoDb;
            return tDb;
          }
          dstPortIdx = 1;
        }

        const pts = parsed.pts, numPts = pts.length;

        for (let k = 0; k < N; k++) {
          const f = freqs[k];
          let cVal = CMath.zero();
          if (f <= pts[0].f) {
            const row = pts[0].s[dstPortIdx];
            cVal = row ? row[0] : CMath.zero();
          } else if (f >= pts[numPts - 1].f) {
            const row = pts[numPts - 1].s[dstPortIdx];
            cVal = row ? row[0] : CMath.zero();
          } else {
            let idx = 0;
            while (idx < numPts - 1 && pts[idx + 1].f < f) idx++;
            const p0 = pts[idx], p1 = pts[idx + 1];
            const t = (f - p0.f) / (p1.f - p0.f);
            const r0 = p0.s[dstPortIdx] ? p0.s[dstPortIdx][0] : CMath.zero();
            const r1 = p1.s[dstPortIdx] ? p1.s[dstPortIdx][0] : CMath.zero();
            cVal = CMath.fromRI(r0.r + t * (r1.r - r0.r), r0.i + t * (r1.i - r0.i));
          }
          tDb[k] = CMath.dB(cVal);
        }

        if ((freqs[0] < parsed.minFreq || freqs[N - 1] > parsed.maxFreq) && warnings) {
          warnings.push(`Warning: Touchstone data for '${lbl}' (${(parsed.minFreq/1e9).toFixed(2)}–${(parsed.maxFreq/1e9).toFixed(2)} GHz) was extrapolated to match the analysis band.`);
        }
        return tDb;
      }
    }

    // Behavioral synthesis for switch:
    const pathLossDb = (kThrow === stNum) ? ilDb : isoDb;
    for (let k = 0; k < N; k++) tDb[k] = pathLossDb;
    return tDb;
  }

  if (b.type === "splitter" || b.type === "combiner") {
    const nWays = parseInt(b.params && b.params.ways) || 2;
    let kBranch = 1;
    if (outPort && outPort.startsWith("o")) {
      kBranch = parseInt(outPort.slice(1)) || 1;
    } else if (inPort && inPort.startsWith("i")) {
      kBranch = parseInt(inPort.slice(1)) || 1;
    } else {
      kBranch = getBlockBranchIndex(b, path);
    }
    const exLoss = Math.abs(+b.params.exloss || 0);
    const pathLossDb = -(10 * Math.log10(Math.max(1, nWays)) + exLoss);

    const sRaw = b.params && (b.params.s2pData || b.params.s3pData || b.params.snpData);
    if (sRaw) {
      const parsed = parseTouchstone(sRaw);
      if (parsed) {
        const dstPortIdx = (parsed.numPorts >= 3) ? kBranch : 1;
        const pts = parsed.pts, numPts = pts.length;

        for (let k = 0; k < N; k++) {
          const f = freqs[k];
          let cVal = CMath.zero();
          if (f <= pts[0].f) {
            const row = pts[0].s[dstPortIdx];
            cVal = row ? row[0] : CMath.zero();
          } else if (f >= pts[numPts - 1].f) {
            const row = pts[numPts - 1].s[dstPortIdx];
            cVal = row ? row[0] : CMath.zero();
          } else {
            let idx = 0;
            while (idx < numPts - 1 && pts[idx + 1].f < f) idx++;
            const p0 = pts[idx], p1 = pts[idx + 1];
            const t = (f - p0.f) / (p1.f - p0.f);
            const r0 = p0.s[dstPortIdx] ? p0.s[dstPortIdx][0] : CMath.zero();
            const r1 = p1.s[dstPortIdx] ? p1.s[dstPortIdx][0] : CMath.zero();
            cVal = CMath.fromRI(r0.r + t * (r1.r - r0.r), r0.i + t * (r1.i - r0.i));
          }
          tDb[k] = CMath.dB(cVal);
        }

        if ((freqs[0] < parsed.minFreq || freqs[N - 1] > parsed.maxFreq) && warnings) {
          warnings.push(`Warning: Touchstone data for '${lbl}' (${(parsed.minFreq/1e9).toFixed(2)}–${(parsed.maxFreq/1e9).toFixed(2)} GHz) was extrapolated to match the analysis band.`);
        }
        return tDb;
      }
    }

    for (let k = 0; k < N; k++) tDb[k] = pathLossDb;
    return tDb;
  }

  if (b.type === "bamp") {
    const isByp = (b.params && b.params.mode === "Bypass Mode");
    const sRaw = isByp ? (b.params.s2pData_byp || b.params.s2pData) : (b.params.s2pData_amp || b.params.s2pData);
    const idealDb = isByp ? -Math.abs(+b.params.bypLoss || 1.8) : (isReverse ? -Math.abs(+b.params.iso || +b.params.s12 || 30) : (+b.params.gain || 18));

    if (sRaw) {
      const parsed = parseTouchstone(sRaw);
      if (parsed) {
        const pts = parsed.pts, numPts = pts.length;
        const rowIdx = isReverse ? 0 : 1;
        const colIdx = isReverse ? 1 : 0;
        for (let k = 0; k < N; k++) {
          const f = freqs[k];
          let cVal = CMath.zero();
          if (f <= pts[0].f) {
            cVal = (pts[0].s[rowIdx] && pts[0].s[rowIdx][colIdx]) || CMath.zero();
          } else if (f >= pts[numPts - 1].f) {
            cVal = (pts[numPts - 1].s[rowIdx] && pts[numPts - 1].s[rowIdx][colIdx]) || CMath.zero();
          } else {
            let idx = 0;
            while (idx < numPts - 1 && pts[idx + 1].f < f) idx++;
            const p0 = pts[idx], p1 = pts[idx + 1];
            const t = (f - p0.f) / (p1.f - p0.f);
            const r0 = (p0.s[rowIdx] && p0.s[rowIdx][colIdx]) || CMath.zero();
            const r1 = (p1.s[rowIdx] && p1.s[rowIdx][colIdx]) || CMath.zero();
            cVal = CMath.fromRI(r0.r + t * (r1.r - r0.r), r0.i + t * (r1.i - r0.i));
          }
          tDb[k] = CMath.dB(cVal);
        }

        if ((freqs[0] < parsed.minFreq || freqs[N - 1] > parsed.maxFreq) && warnings) {
          warnings.push(`Warning: Touchstone data for '${lbl}' (${(parsed.minFreq/1e9).toFixed(2)}–${(parsed.maxFreq/1e9).toFixed(2)} GHz) was extrapolated to match the analysis band.`);
        }
        return tDb;
      }
    }

    for (let k = 0; k < N; k++) tDb[k] = idealDb;
    return tDb;
  }

  // Standard component Touchstone S2P or ideal gain/loss
  const sRaw = b.params && b.params.s2pData;
  if (sRaw) {
    const parsed = parseTouchstone(sRaw);
    if (parsed) {
      const pts = parsed.pts, numPts = pts.length;
      const rowIdx = isReverse ? 0 : 1;
      const colIdx = isReverse ? 1 : 0;
      for (let k = 0; k < N; k++) {
        const f = freqs[k];
        let cVal = CMath.zero();
        if (f <= pts[0].f) {
          cVal = (pts[0].s[rowIdx] && pts[0].s[rowIdx][colIdx]) || CMath.zero();
        } else if (f >= pts[numPts - 1].f) {
          cVal = (pts[numPts - 1].s[rowIdx] && pts[numPts - 1].s[rowIdx][colIdx]) || CMath.zero();
        } else {
          let idx = 0;
          while (idx < numPts - 1 && pts[idx + 1].f < f) idx++;
          const p0 = pts[idx], p1 = pts[idx + 1];
          const t = (f - p0.f) / (p1.f - p0.f);
          const r0 = (p0.s[rowIdx] && p0.s[rowIdx][colIdx]) || CMath.zero();
          const r1 = (p1.s[rowIdx] && p1.s[rowIdx][colIdx]) || CMath.zero();
          cVal = CMath.fromRI(r0.r + t * (r1.r - r0.r), r0.i + t * (r1.i - r0.i));
        }
        tDb[k] = CMath.dB(cVal);
      }

      if ((freqs[0] < parsed.minFreq || freqs[N - 1] > parsed.maxFreq) && warnings) {
        warnings.push(`Warning: Touchstone data for '${lbl}' (${(parsed.minFreq/1e9).toFixed(2)}–${(parsed.maxFreq/1e9).toFixed(2)} GHz) was extrapolated to match the analysis band.`);
      }
      return tDb;
    }
  }

  // Calculate ideal dB for standard block
  let idealDb = 0;
  const c = COMP[b.type];
  const p = b.params || {};
  if (b.type === "amp") {
    idealDb = isReverse ? -Math.abs(+p.s12 || +p.iso || 30) : (+p.gain || 0);
  } else if (b.type === "isolator") {
    idealDb = isReverse ? -Math.abs(+p.iso || 25) : -Math.abs(+p.il || 0.4);
  } else if (b.type === "coupler") {
    if (typeof cplMatrix === "function") {
      const M = cplMatrix(p);
      const pIn = inPort || "in";
      const pOut = outPort || (isReverse ? "in" : "thru");
      const lossVal = (M[pIn] && M[pIn][pOut] !== undefined) ? M[pIn][pOut] : 0.5;
      idealDb = -Math.abs(lossVal);
    } else {
      const cpl = Math.abs(+p.coupling || 10);
      const il = Math.abs(+p.il || 0.5);
      const dir = Math.abs(+p.iso || 30);
      if (outPort === "cpl" || inPort === "cpl") idealDb = -cpl;
      else if (outPort === "iso" || inPort === "iso") idealDb = -(cpl + dir);
      else idealDb = -il;
    }
  } else if (c && c.out) {
    const o = c.out(p);
    if (o) {
      if (o.out !== undefined) idealDb = +o.out || 0;
      else {
        const vals = Object.values(o).map(v => +v).filter(v => !isNaN(v));
        if (vals.length) idealDb = vals[0];
      }
    }
  } else if (p.gain !== undefined) {
    idealDb = isReverse ? -Math.abs(+p.s12 || +p.iso || 30) : (+p.gain || 0);
  } else if (p.atten !== undefined) {
    idealDb = -Math.abs(+p.atten || 0);
  } else if (p.il !== undefined) {
    idealDb = -Math.abs(+p.il || 0);
  } else if (p.loss !== undefined) {
    idealDb = -Math.abs(+p.loss || 0);
  }

  for (let k = 0; k < N; k++) tDb[k] = idealDb;
  return tDb;
}

/* Trace linear path between startBlockId and endBlockId via BFS */
function tagPartner(b) {
  const c = COMP[b.type];
  if (!c || !c.isInterconnect) return null;
  const isSend = (b.params && b.params.role === "send");
  const targetRole = isSend ? "receive" : "send";
  const t = (b.params && b.params.tag || "").trim();
  if (!t) return null;
  const allB = (typeof blocks !== "undefined" ? blocks : []);
  return allB.find(x => COMP[x.type] && COMP[x.type].isInterconnect && (x.params && x.params.role) === targetRole && (x.params && x.params.tag || "").trim() === t) || null;
}

const SOURCE_TYPES = new Set(["source", "rfin", "antenna", "pll", "lo"]);
const SINK_TYPES = new Set(["rfout", "detector", "termination", "antenna"]);

function getBlockInternalConnections(b, includeAllThrows = true) {
  if (!b) return [];
  const btype = b.type || "";
  const params = b.params || {};

  if (SOURCE_TYPES.has(btype) || SINK_TYPES.has(btype)) return [];

  if (btype === "switch") {
    const throws = parseInt(params.throws) || 2;
    if (includeAllThrows) {
      const res = [];
      for (let i = 1; i <= throws; i++) {
        res.push(["in", `o${i}`]);
        res.push([`o${i}`, "in"]);
      }
      return res;
    }
    const state = String(params.state !== undefined ? params.state : "1");
    if (state === "open" || state === "0") return [];
    const sel = parseInt(state) || 1;
    return [["in", `o${sel}`], [`o${sel}`, "in"]];
  }

  if (btype === "circulator") {
    return [["p1", "p2"], ["p2", "p3"], ["p3", "p1"]];
  }

  if (btype === "splitter") {
    const ways = parseInt(params.ways) || 2;
    const res = [];
    for (let i = 1; i <= ways; i++) {
      res.push(["in", `o${i}`]);
      res.push([`o${i}`, "in"]);
    }
    return res;
  }

  if (btype === "combiner") {
    const ways = parseInt(params.ways) || 2;
    const res = [];
    for (let i = 1; i <= ways; i++) {
      res.push([`i${i}`, "out"]);
      res.push(["out", `i${i}`]);
    }
    return res;
  }

  if (btype === "coupler") {
    const ctype = params.ctype || "Directional";
    if (ctype === "Bi-directional") return [["in", "thru"], ["in", "fwd"], ["thru", "rev"]];
    if (ctype === "Power tap") return [["in", "thru"], ["in", "tap"]];
    if (ctype === "Resistive") return [["in", "o1"], ["in", "o2"]];
    if (ctype.toLowerCase().includes("90")) return [["in", "out0"], ["in", "out90"]];
    if (ctype.toLowerCase().includes("180")) return [["sum", "o1"], ["sum", "o2"]];
    return [["in", "thru"], ["in", "cpl"]];
  }

  return [["in", "out"]];
}

function findAllSignalPaths(allBlocks, allConnections, includeAllThrows = true) {
  if (!allBlocks || !allBlocks.length) return [];
  const blocksMap = new Map();
  allBlocks.forEach(b => blocksMap.set(b.id, b));

  const wireMap = new Map();
  const addWire = (sB, sP, dB, dP) => {
    const k1 = `${sB}:${sP}`;
    if (!wireMap.has(k1)) wireMap.set(k1, []);
    wireMap.get(k1).push({ block: dB, port: dP });

    const k2 = `${dB}:${dP}`;
    if (!wireMap.has(k2)) wireMap.set(k2, []);
    wireMap.get(k2).push({ block: sB, port: sP });
  };

  (allConnections || []).forEach(cn => {
    if (cn.from && cn.to) {
      addWire(cn.from.block, cn.from.port, cn.to.block, cn.to.port);
    }
  });

  // Interconnect tag connections
  allBlocks.forEach(b => {
    if (typeof COMP !== "undefined" && COMP[b.type] && COMP[b.type].isInterconnect) {
      const partner = tagPartner(b);
      if (partner) {
        const isSend = (b.params && b.params.role === "send");
        if (isSend) addWire(b.id, "out", partner.id, "in");
      }
    }
  });

  // Identify sources
  const startNodes = [];
  allBlocks.forEach(b => {
    if (SOURCE_TYPES.has(b.type) || (b.params && b.params.anaPort === "P1")) {
      const outP = (b.type === "antenna" && b.params && b.params.role === "Rx") ? "ant" : "out";
      startNodes.push({ block: b.id, port: outP });
    }
  });
  if (!startNodes.length && allBlocks.length) {
    const firstB = allBlocks[0];
    const outP = (firstB.type === "antenna" && firstB.params && firstB.params.role === "Rx") ? "ant" : "out";
    startNodes.push({ block: firstB.id, port: outP });
  }

  // Identify sinks
  const sinkBlockIds = new Set();
  allBlocks.forEach(b => {
    if (SINK_TYPES.has(b.type) || (b.params && b.params.anaPort && b.params.anaPort !== "P1" && b.params.anaPort !== "None")) {
      sinkBlockIds.add(b.id);
    }
  });

  const discovered = [];

  function dfs(currNode, currPath, visitedBlocks) {
    const { block: cbId, port: cpId } = currNode;
    const wireKey = `${cbId}:${cpId}`;
    const nextDsts = wireMap.get(wireKey) || [];

    for (const dst of nextDsts) {
      const nbId = dst.block;
      const npId = dst.port;

      if (!blocksMap.has(nbId) || visitedBlocks.has(nbId)) continue;
      const targetB = blocksMap.get(nbId);

      if (sinkBlockIds.has(nbId)) {
        const finalNode = [nbId, npId];
        const fullChain = [...currPath, finalNode];
        const blockChain = Array.from(new Set(fullChain.map(x => x[0])));

        // Determine if path is active based on current switch states
        let isActive = true;
        for (let i = 0; i < fullChain.length - 1; i++) {
          const [b1, p1] = fullChain[i];
          const [b2, p2] = fullChain[i + 1];
          if (b1 === b2) {
            const blk = blocksMap.get(b1);
            if (blk && blk.type === "switch") {
              const st = String(blk.params && blk.params.state !== undefined ? blk.params.state : "1");
              if (p1 === "in" && p2 !== `o${st}`) isActive = false;
              if (p2 === "in" && p1 !== `o${st}`) isActive = false;
            }
          }
        }

        const labels = blockChain.map(id => {
          const bObj = blocksMap.get(id);
          let lbl = (bObj && bObj.params && bObj.params.label) || (typeof COMP !== "undefined" && COMP[bObj.type] && COMP[bObj.type].name) || id;
          if (bObj && bObj.type === "switch") {
            for (let i = 0; i < fullChain.length - 1; i++) {
              if (fullChain[i][0] === id && fullChain[i + 1][0] === id) {
                const pA = fullChain[i][1];
                const pB = fullChain[i + 1][1];
                const outP = (pB && pB.startsWith("o")) ? pB : pA;
                if (outP && outP.startsWith("o")) lbl += ` [Throw ${outP.slice(1)}]`;
                break;
              }
            }
          }
          return lbl;
        });

        const statusTag = isActive ? " (Active)" : "";
        discovered.push({
          id: `path_${discovered.length + 1}`,
          name: `Path ${discovered.length + 1}${statusTag}: ${labels.join(" ➔ ")}`,
          block_ids: blockChain,
          node_chain: fullChain,
          isActive
        });
        continue;
      }

      // Follow internal block connections
      const intConns = getBlockInternalConnections(targetB, includeAllThrows);
      for (const [inP, outP] of intConns) {
        if (inP === npId) {
          const newVisited = new Set(visitedBlocks);
          newVisited.add(nbId);
          dfs(
            { block: nbId, port: outP },
            [...currPath, [nbId, inP], [nbId, outP]],
            newVisited
          );
        }
      }
    }
  }

  startNodes.forEach(sn => {
    dfs(sn, [[sn.block, sn.port]], new Set([sn.block]));
  });

  return discovered;
}

function findSignalPath(startBlockId, endBlockId) {
  if (!startBlockId || !endBlockId) return [];

  const allB = (typeof blocks !== "undefined" ? blocks : []);
  const allC = (typeof conns !== "undefined" ? conns : []);

  if (startBlockId === endBlockId) {
    const b = allB.find(x => x.id === startBlockId);
    return b ? [b] : [];
  }

  // 1. Try finding path respecting active switch states
  const activePath = _searchPath(startBlockId, endBlockId, allB, allC, true);
  if (activePath.length) return activePath;

  // 2. Fallback to exploring all throws
  return _searchPath(startBlockId, endBlockId, allB, allC, false);
}

function _searchPath(startBlockId, endBlockId, allB, allC, respectSwitches) {
  const blocksMap = new Map();
  allB.forEach(b => blocksMap.set(b.id, b));

  const queue = [{ id: startBlockId, path: [startBlockId], visited: new Set([startBlockId]) }];

  while (queue.length > 0) {
    const { id: lastId, path: currPath, visited } = queue.shift();
    if (lastId === endBlockId) {
      return currPath.map(id => blocksMap.get(id)).filter(Boolean);
    }

    const lastB = blocksMap.get(lastId);

    // Find all connected blocks
    for (const cn of allC) {
      let nextId = null;
      let exitPort = null;

      if (cn.from.block === lastId) {
        nextId = cn.to.block;
        exitPort = cn.from.port;
      } else if (cn.to.block === lastId) {
        nextId = cn.from.block;
        exitPort = cn.to.port;
      }

      if (!nextId || visited.has(nextId)) continue;

      if (respectSwitches && lastB && lastB.type === "switch") {
        const throws = parseInt(lastB.params && lastB.params.throws) || 2;
        const stNum = swState(lastB.params || {}, throws);
        if (stNum === 0) continue; // isolated / open
        if (exitPort && exitPort.startsWith("o") && exitPort !== `o${stNum}`) {
          continue; // not active throw
        }
      }

      const newVisited = new Set(visited);
      newVisited.add(nextId);
      queue.push({ id: nextId, path: [...currPath, nextId], visited: newVisited });
    }

    // Interconnect tag partner check
    if (lastB && COMP[lastB.type] && COMP[lastB.type].isInterconnect) {
      const partner = tagPartner(lastB);
      if (partner && !visited.has(partner.id)) {
        const newVisited = new Set(visited);
        newVisited.add(partner.id);
        queue.push({ id: partner.id, path: [...currPath, partner.id], visited: newVisited });
      }
    }
  }

  return [];
}

/* Main Execution Engine for Scalable Multi-Port S-Parameter Analysis */
function computeLinearAnalysis(band) {
  const freqs = generateFreqVector(band);
  const N = freqs.length;

  const allB = (typeof blocks !== "undefined" ? blocks : []);
  const allC = (typeof allConns === "function") ? allConns() : (typeof conns !== "undefined" ? conns : []);

  // Scan for defined analysis ports P1 through P8, auto-resolving multiple sinks/terminals without collision
  const portsList = [];
  const assignedBlockIds = new Set();
  const usedPortNums = new Set();

  for (let pNum = 1; pNum <= 8; pNum++) {
    const pTag = "P" + pNum;
    const b = allB.find(x => x.params && x.params.anaPort === pTag && !assignedBlockIds.has(x.id));
    if (b) {
      portsList.push({ num: pNum, tag: pTag, label: b.params.label || pTag, block: b });
      assignedBlockIds.add(b.id);
      usedPortNums.add(pNum);
    }
  }

  // Auto-assign P1 if missing but a source exists
  if (!usedPortNums.has(1)) {
    const srcB = allB.find(b => (SOURCE_TYPES.has(b.type) || (typeof COMP !== "undefined" && COMP[b.type] && COMP[b.type].isSource)) && !assignedBlockIds.has(b.id));
    if (srcB) {
      portsList.unshift({ num: 1, tag: "P1", label: (srcB.params && srcB.params.label) || "P1", block: srcB });
      assignedBlockIds.add(srcB.id);
      usedPortNums.add(1);
    }
  }

  // Auto-assign next ports to unassigned/duplicate sinks (e.g. second RF OUT with default P2)
  const unassignedSinks = allB.filter(b => (SINK_TYPES.has(b.type) || (b.params && b.params.anaPort && b.params.anaPort !== "None")) && !assignedBlockIds.has(b.id));
  let nextP = 2;
  for (const sb of unassignedSinks) {
    while (usedPortNums.has(nextP) && nextP <= 8) nextP++;
    if (nextP > 8) break;
    const pTag = "P" + nextP;
    portsList.push({ num: nextP, tag: pTag, label: (sb.params && sb.params.label) || pTag, block: sb });
    assignedBlockIds.add(sb.id);
    usedPortNums.add(nextP);
  }

  portsList.sort((a, b) => a.num - b.num);

  const warnings = [];

  // Discover all topological paths
  const discoveredPaths = findAllSignalPaths(allB, allC, true);

  // Calculate S-parameters for each discovered path
  discoveredPaths.forEach(pInfo => {
    const chainBlocks = pInfo.block_ids.map(id => allB.find(x => x.id === id)).filter(b => b && !COMP[b.type].isSource && b.type !== "antenna" && b.type !== "rfin" && b.type !== "rfout");

    const s21Arr = new Float64Array(N);
    const s12Arr = new Float64Array(N);
    const s11Arr = new Float64Array(N);
    const s22Arr = new Float64Array(N);

    for (let k = 0; k < N; k++) {
      s11Arr[k] = -20.0;
      s22Arr[k] = -20.0;
    }

    // Extract exact traversed in/out ports for each block from node_chain
    const blockPortsMap = new Map();
    if (pInfo.node_chain) {
      for (let i = 0; i < pInfo.node_chain.length - 1; i++) {
        const itemA = pInfo.node_chain[i];
        const itemB = pInfo.node_chain[i + 1];
        if (itemA[0] === itemB[0]) {
          blockPortsMap.set(itemA[0], { inPort: itemA[1], outPort: itemB[1] });
        }
      }
    }

    for (const b of chainBlocks) {
      const ports = blockPortsMap.get(b.id) || {};
      const fwdDb = getStageTransmissionDb(b, freqs, warnings, chainBlocks, false, ports.inPort, ports.outPort);
      const revDb = getStageTransmissionDb(b, freqs, warnings, chainBlocks, true, ports.outPort, ports.inPort);

      for (let k = 0; k < N; k++) {
        s21Arr[k] += fwdDb[k];
        s12Arr[k] += revDb[k];
      }
    }

    const startId = pInfo.block_ids[0];
    const endId = pInfo.block_ids[pInfo.block_ids.length - 1];
    const srcPObj = portsList.find(p => p.block && p.block.id === startId);
    const dstPObj = portsList.find(p => p.block && p.block.id === endId);
    const srcNum = srcPObj ? srcPObj.num : 1;
    const dstNum = dstPObj ? dstPObj.num : 2;
    const fwdKey = `S${dstNum}${srcNum}`;
    const revKey = `S${srcNum}${dstNum}`;
    const inMatchKey = `S${srcNum}${srcNum}`;
    const outMatchKey = `S${dstNum}${dstNum}`;

    pInfo.srcPort = srcNum;
    pInfo.dstPort = dstNum;
    pInfo.fwdKey = fwdKey;
    pInfo.revKey = revKey;

    pInfo.s21_db = Array.from(s21Arr);
    pInfo.s12_db = Array.from(s12Arr);
    pInfo.s11_db = Array.from(s11Arr);
    pInfo.s22_db = Array.from(s22Arr);
    pInfo.matrix = {
      [fwdKey]: s21Arr,
      [revKey]: s12Arr,
      [inMatchKey]: s11Arr,
      [outMatchKey]: s22Arr,
      S21: s21Arr,
      S12: s12Arr,
      S11: s11Arr,
      S22: s22Arr
    };
  });

  const matrix = {};

  // Populate multi-port matrix from discovered paths
  // Inactive paths populate first, active paths overwrite so active takes priority
  discoveredPaths.filter(p => !p.isActive).forEach(p => {
    if (p.fwdKey && !matrix[p.fwdKey]) {
      matrix[p.fwdKey] = p.matrix[p.fwdKey];
      matrix[p.revKey] = p.matrix[p.revKey];
      matrix[`S${p.srcPort}${p.srcPort}`] = p.matrix[`S${p.srcPort}${p.srcPort}`];
      matrix[`S${p.dstPort}${p.dstPort}`] = p.matrix[`S${p.dstPort}${p.dstPort}`];
    }
  });
  discoveredPaths.filter(p => p.isActive).forEach(p => {
    if (p.fwdKey) {
      matrix[p.fwdKey] = p.matrix[p.fwdKey];
      matrix[p.revKey] = p.matrix[p.revKey];
      matrix[`S${p.srcPort}${p.srcPort}`] = p.matrix[`S${p.srcPort}${p.srcPort}`];
      matrix[`S${p.dstPort}${p.dstPort}`] = p.matrix[`S${p.dstPort}${p.dstPort}`];
    }
  });

  // Ensure default S21 and S12 are set from primary active path
  const activePath = discoveredPaths.find(p => p.isActive) || (discoveredPaths.length ? discoveredPaths[0] : null);
  if (activePath && activePath.matrix) {
    if (!matrix.S21) matrix.S21 = activePath.matrix.S21;
    if (!matrix.S12) matrix.S12 = activePath.matrix.S12;
    if (!matrix.S11) matrix.S11 = activePath.matrix.S11;
    if (!matrix.S22) matrix.S22 = activePath.matrix.S22;
  }

  // Port-pair matrix calculations (for P1–P8 terminal system compatibility)
  if (portsList.length >= 2) {
    for (const srcPort of portsList) {
      for (const dstPort of portsList) {
        if (srcPort.num === dstPort.num) continue;
        const sKey = `S${dstPort.num}${srcPort.num}`;
        if (matrix[sKey]) continue; // Already populated from discovered paths
        const path = findSignalPath(srcPort.block.id, dstPort.block.id);

        if (!path.length || path[path.length - 1].id !== dstPort.block.id) {
          const sArr = new Float64Array(N);
          for (let k = 0; k < N; k++) sArr[k] = -120.0;
          matrix[sKey] = sArr;
          continue;
        }

        const chainBlocks = path.filter(b => !COMP[b.type].isSource && b.type !== "antenna" && b.type !== "rfin" && b.type !== "rfout");
        const sArr = new Float64Array(N);
        const isReverse = (srcPort.num > dstPort.num);

        for (const b of chainBlocks) {
          const stageDb = getStageTransmissionDb(b, freqs, warnings, path, isReverse);
          for (let k = 0; k < N; k++) {
            sArr[k] += stageDb[k];
          }
        }
        matrix[sKey] = sArr;
      }
    }

    for (const port of portsList) {
      const sKey = `S${port.num}${port.num}`;
      if (!matrix[sKey]) {
        const sArr = new Float64Array(N);
        for (let k = 0; k < N; k++) sArr[k] = -20.0;
        matrix[sKey] = sArr;
      }
    }
  }

  const uniqueWarnings = Array.from(new Set(warnings));

  return {
    freqs,
    portsList,
    matrix,
    paths: discoveredPaths,
    warnings: uniqueWarnings
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    computeLinearAnalysis,
    findAllSignalPaths,
    findSignalPath,
    parseTouchstone,
    CMath
  };
}


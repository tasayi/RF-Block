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
function getSwitchThrowIndex(b, path) {
  if (!b) return 1;
  const allConnections = (typeof allConns === "function") ? allConns() : (typeof conns !== "undefined" ? conns : []);
  const pathIds = new Set((path || []).map(x => x.id));
  pathIds.delete(b.id);

  for (const cn of allConnections) {
    if (cn.from.block === b.id && pathIds.has(cn.to.block)) {
      const m = String(cn.from.port || "").match(/^o(\d+)$/i);
      if (m) return parseInt(m[1], 10);
    }
    if (cn.to.block === b.id && pathIds.has(cn.from.block)) {
      const m = String(cn.to.port || "").match(/^o(\d+)$/i);
      if (m) return parseInt(m[1], 10);
    }
  }
  return 1;
}

function getStageTransmissionDb(b, freqs, warnings, path) {
  const N = freqs.length;
  const tDb = new Float64Array(N);
  const lbl = (b.params && b.params.label) || (COMP[b.type] && COMP[b.type].name) || "Block";

  if (b.type === "switch") {
    const nThrows = parseInt(b.params && b.params.throws) || 2;
    const stNum = swState(b.params || {}, nThrows);
    const kThrow = getSwitchThrowIndex(b, path);
    const isoDb = -Math.abs(+b.params.iso >= 0 ? +b.params.iso : 60);
    const ilDb = -Math.abs(+b.params.il || 0.4);

    if (stNum === 0) {
      // Off / Open state
      for (let k = 0; k < N; k++) tDb[k] = isoDb;
      return tDb;
    }

    // Check per-state file for active switch position stNum
    const sRaw = (b.params && b.params[`s2pData_st${stNum}`]) || (b.params && b.params.s2pData);

    if (sRaw) {
      const parsed = parseTouchstone(sRaw);
      if (parsed) {
        let dstPortIdx = 1;
        if (parsed.numPorts >= 3) {
          // Multi-port S(N+1)P Touchstone file: Throw k = Port k+1 (row index k in sMat)
          dstPortIdx = kThrow;
        } else {
          // 2-port Touchstone file:
          // If this path goes through the active throw (kThrow === stNum), use Port 2 (index 1) S21
          // If this path goes through an inactive throw (kThrow !== stNum), return isolation
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

    // Fallback to ideal switch loss
    const pathLossDb = (kThrow === stNum) ? ilDb : isoDb;
    for (let k = 0; k < N; k++) tDb[k] = pathLossDb;
    return tDb;
  }

  if (b.type === "bamp") {
    const isByp = (b.params && b.params.mode === "Bypass Mode");
    const sRaw = isByp ? (b.params.s2pData_byp || b.params.s2pData) : (b.params.s2pData_amp || b.params.s2pData);
    const idealDb = isByp ? -Math.abs(+b.params.bypLoss || 1.8) : (+b.params.gain || 18);

    if (sRaw) {
      const parsed = parseTouchstone(sRaw);
      if (parsed) {
        const pts = parsed.pts, numPts = pts.length;
        for (let k = 0; k < N; k++) {
          const f = freqs[k];
          let cVal = CMath.zero();
          if (f <= pts[0].f) {
            cVal = (pts[0].s[1] && pts[0].s[1][0]) || CMath.zero();
          } else if (f >= pts[numPts - 1].f) {
            cVal = (pts[numPts - 1].s[1] && pts[numPts - 1].s[1][0]) || CMath.zero();
          } else {
            let idx = 0;
            while (idx < numPts - 1 && pts[idx + 1].f < f) idx++;
            const p0 = pts[idx], p1 = pts[idx + 1];
            const t = (f - p0.f) / (p1.f - p0.f);
            const r0 = (p0.s[1] && p0.s[1][0]) || CMath.zero();
            const r1 = (p1.s[1] && p1.s[1][0]) || CMath.zero();
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
      for (let k = 0; k < N; k++) {
        const f = freqs[k];
        let cVal = CMath.zero();
        if (f <= pts[0].f) {
          cVal = (pts[0].s[1] && pts[0].s[1][0]) || CMath.zero();
        } else if (f >= pts[numPts - 1].f) {
          cVal = (pts[numPts - 1].s[1] && pts[numPts - 1].s[1][0]) || CMath.zero();
        } else {
          let idx = 0;
          while (idx < numPts - 1 && pts[idx + 1].f < f) idx++;
          const p0 = pts[idx], p1 = pts[idx + 1];
          const t = (f - p0.f) / (p1.f - p0.f);
          const r0 = (p0.s[1] && p0.s[1][0]) || CMath.zero();
          const r1 = (p1.s[1] && p1.s[1][0]) || CMath.zero();
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
  if (c && c.out) {
    const o = c.out(p);
    if (o) {
      if (o.out !== undefined) idealDb = +o.out || 0;
      else {
        const vals = Object.values(o).map(v => +v).filter(v => !isNaN(v));
        if (vals.length) idealDb = vals[0];
      }
    }
  } else if (p.gain !== undefined) idealDb = +p.gain || 0;
  else if (p.loss !== undefined) idealDb = -Math.abs(+p.loss || 0);

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

function findSignalPath(startBlockId, endBlockId) {
  if (!startBlockId || !endBlockId) return [];

  const allB = (typeof blocks !== "undefined" ? blocks : []);
  const allC = (typeof conns !== "undefined" ? conns : []);

  if (startBlockId === endBlockId) {
    const b = allB.find(x => x.id === startBlockId);
    return b ? [b] : [];
  }

  const queue = [[startBlockId]];
  const visited = new Set([startBlockId]);

  while (queue.length > 0) {
    const currentPath = queue.shift();
    const lastId = currentPath[currentPath.length - 1];

    if (lastId === endBlockId) {
      return currentPath.map(id => allB.find(x => x.id === id)).filter(Boolean);
    }

    // Find all connected blocks (forward or backward)
    const neighbors = [];
    for (const cn of allC) {
      if (cn.from.block === lastId && !visited.has(cn.to.block)) {
        neighbors.push(cn.to.block);
      } else if (cn.to.block === lastId && !visited.has(cn.from.block)) {
        neighbors.push(cn.from.block);
      }
    }

    // Interconnect tag partner check
    const lastB = allB.find(x => x.id === lastId);
    if (lastB && COMP[lastB.type] && COMP[lastB.type].isInterconnect) {
      const partner = tagPartner(lastB);
      if (partner && !visited.has(partner.id)) {
        neighbors.push(partner.id);
      }
    }

    for (const neighborId of neighbors) {
      visited.add(neighborId);
      queue.push([...currentPath, neighborId]);
    }
  }

  return [];
}

/* Main Execution Engine for Scalable Multi-Port S-Parameter Analysis (Transmission Focus) */
function computeLinearAnalysis(band) {
  const freqs = generateFreqVector(band);
  const N = freqs.length;

  const allB = (typeof blocks !== "undefined" ? blocks : []);

  // Scan for defined analysis ports P1 through P8
  const portsList = []; // [{ num: 1, label: "P1", block: {...} }, ...]
  for (let pNum = 1; pNum <= 8; pNum++) {
    const pTag = "P" + pNum;
    const b = allB.find(x => x.params && x.params.anaPort === pTag);
    if (b) {
      portsList.push({ num: pNum, tag: pTag, label: b.params.label || pTag, block: b });
    }
  }

  const warnings = [];

  if (portsList.length < 2) {
    return { error: "At least 2 Analysis Ports (e.g. P1 and P2) must be defined on schematic terminals to run linear analysis.", freqs, portsList };
  }

  // Matrix dictionary: store transmission parameters S_ij (where i != j)
  const matrix = {};

  // Analyze pair (i, j): Port j (source) -> Port i (destination)
  for (const srcPort of portsList) {
    for (const dstPort of portsList) {
      if (srcPort.num === dstPort.num) continue; // Focus strictly on transmission parameters S_ij (i != j)

      const sKey = `S${dstPort.num}${srcPort.num}`;
      const path = findSignalPath(srcPort.block.id, dstPort.block.id);

      if (!path.length || path[path.length - 1].id !== dstPort.block.id) {
        // No connected physical path between Port j and Port i
        const sArr = new Float64Array(N);
        for (let k = 0; k < N; k++) sArr[k] = -120.0; // Isolation (-120 dB)
        matrix[sKey] = sArr;
        continue;
      }

      const chainBlocks = path.filter(b => !COMP[b.type].isSource && b.type !== "antenna" && b.type !== "rfin" && b.type !== "rfout");
      const sArr = new Float64Array(N);

      for (const b of chainBlocks) {
        const stageDb = getStageTransmissionDb(b, freqs, warnings, path);
        for (let k = 0; k < N; k++) {
          sArr[k] += stageDb[k];
        }
      }

      matrix[sKey] = sArr;
    }
  }

  const uniqueWarnings = Array.from(new Set(warnings));

  return {
    freqs,
    portsList,
    matrix,
    warnings: uniqueWarnings
  };
}


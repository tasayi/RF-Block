"use strict";

/* ====================================================================
   RF S-Parameter Physics Solver & Touchstone Engine
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
  let freqHzMult = 1e9, format = "DB", z0 = 50, numPorts = 2;

  const dataRows = [];
  let headerFound = false;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("!")) continue; // Comment line
    if (line.startsWith("#")) {
      // Option line e.g. # GHz S DB R 50
      headerFound = true;
      const tokens = line.slice(1).trim().split(/\s+/);
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i].toUpperCase();
        if (["HZ", "KHZ", "MHZ", "GHZ", "THZ"].includes(t)) freqHzMult = unitToHz(t);
        else if (["DB", "MA", "RI"].includes(t)) format = t;
        else if (t === "R" && tokens[i + 1]) z0 = parseFloat(tokens[i + 1]) || 50;
      }
      continue;
    }

    const nums = line.split(/\s+/).map(Number).filter(n => !isNaN(n));
    if (nums.length >= 3) dataRows.push(nums);
  }

  if (!dataRows.length) return null;

  // Infer ports if data row length matches: 2-port .s2p has 9 numbers per freq row (f, s11_1, s11_2, s21_1, s21_2, s12_1, s12_2, s22_1, s22_2)
  if (dataRows[0].length === 9) numPorts = 2;
  else if (dataRows[0].length === 3) numPorts = 1;

  const pts = [];
  for (const row of dataRows) {
    const fHz = row[0] * freqHzMult;
    const sMat = [];
    if (numPorts === 2 && row.length >= 9) {
      // 2-Port: S11, S21, S12, S22
      const readVal = (n1, n2) => {
        if (format === "DB") return CMath.fromDBDeg(n1, n2);
        if (format === "MA") return CMath.fromMADeg(n1, n2);
        return CMath.fromRI(n1, n2);
      };
      const s11 = readVal(row[1], row[2]);
      const s21 = readVal(row[3], row[4]);
      const s12 = readVal(row[5], row[6]);
      const s22 = readVal(row[7], row[8]);
      sMat.push([s11, s12], [s21, s22]);
    } else {
      // Fallback 1-port
      const readVal = (n1, n2) => {
        if (format === "DB") return CMath.fromDBDeg(n1, n2);
        if (format === "MA") return CMath.fromMADeg(n1, n2);
        return CMath.fromRI(n1, n2);
      };
      const s11 = readVal(row[1], row[2]);
      sMat.push([s11]);
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

/* Interpolate Touchstone data onto target frequency vector */
function interpolateSParams(sData, targetFreqs) {
  const N = targetFreqs.length;
  const interpolated = [];
  const pts = sData.pts;
  const numPts = pts.length;

  let extrapolated = false;

  for (let k = 0; k < N; k++) {
    const f = targetFreqs[k];
    if (f < sData.minFreq || f > sData.maxFreq) extrapolated = true;

    let s11, s21, s12, s22;

    if (f <= pts[0].f) {
      const p = pts[0].s;
      s11 = p[0][0]; s12 = p[0][1] || CMath.zero();
      s21 = p[1] ? p[1][0] : CMath.zero(); s22 = p[1] ? p[1][1] : CMath.zero();
    } else if (f >= pts[numPts - 1].f) {
      const p = pts[numPts - 1].s;
      s11 = p[0][0]; s12 = p[0][1] || CMath.zero();
      s21 = p[1] ? p[1][0] : CMath.zero(); s22 = p[1] ? p[1][1] : CMath.zero();
    } else {
      // Find bounding interval
      let idx = 0;
      while (idx < numPts - 1 && pts[idx + 1].f < f) idx++;
      const p0 = pts[idx], p1 = pts[idx + 1];
      const t = (f - p0.f) / (p1.f - p0.f);

      const interpC = (c0, c1) => CMath.fromRI(c0.r + t * (c1.r - c0.r), c0.i + t * (c1.i - c0.i));

      s11 = interpC(p0.s[0][0], p1.s[0][0]);
      s12 = interpC(p0.s[0][1] || CMath.zero(), p1.s[0][1] || CMath.zero());
      s21 = interpC(p0.s[1] ? p0.s[1][0] : CMath.zero(), p1.s[1] ? p1.s[1][0] : CMath.zero());
      s22 = interpC(p0.s[1] ? p0.s[1][1] : CMath.zero(), p1.s[1] ? p1.s[1][1] : CMath.zero());
    }

    interpolated.push({ s11, s21, s12, s22 });
  }

  return { interpolated, extrapolated };
}

/* Fallback Constant Model (Perfect Match S11=0, S22=0, S21=gain/loss) */
function getIdealSParams(block, targetFreqs) {
  const N = targetFreqs.length;
  const c = COMP[block.type];
  const p = block.params || {};

  let gainDb = 0;
  if (c.out) {
    const o = c.out(p);
    if (o && o.out !== undefined) gainDb = +o.out || 0;
  } else if (p.gain !== undefined) gainDb = +p.gain || 0;
  else if (p.loss !== undefined) gainDb = -Math.abs(+p.loss || 0);

  // If SPnT switch, check active mode/throw
  if (block.type === "bamp") {
    gainDb = (p.mode === "Bypass Mode") ? -Math.abs(+p.bypLoss || 1.8) : (+p.gain || 18);
  }

  const s21 = CMath.fromDBDeg(gainDb, 0);
  const s11 = CMath.zero(); // Perfect input match (0 linear -> -inf dB)
  const s22 = CMath.zero(); // Perfect output match (0 linear -> -inf dB)
  const s12 = CMath.zero(); // Perfect isolation

  const interpolated = [];
  for (let k = 0; k < N; k++) {
    interpolated.push({ s11, s21, s12, s22 });
  }
  return { interpolated, extrapolated: false };
}

/* Convert 2-Port S-matrix to ABCD Matrix */
function sToAbcd(S, z0 = 50) {
  const { s11, s21, s12, s22 } = S;
  const twoS21 = CMath.mul(CMath.fromRI(2, 0), s21);

  // Num A: (1 + s11)(1 - s22) + s12*s21
  const tA1 = CMath.mul(CMath.add(CMath.one(), s11), CMath.sub(CMath.one(), s22));
  const tA2 = CMath.mul(s12, s21);
  const A = CMath.div(CMath.add(tA1, tA2), twoS21);

  // Num B: Z0 * ((1 + s11)(1 + s22) - s12*s21)
  const tB1 = CMath.mul(CMath.add(CMath.one(), s11), CMath.add(CMath.one(), s22));
  const B = CMath.mul(CMath.fromRI(z0, 0), CMath.div(CMath.sub(tB1, tA2), twoS21));

  // Num C: (1/Z0) * ((1 - s11)(1 - s22) - s12*s21)
  const tC1 = CMath.mul(CMath.sub(CMath.one(), s11), CMath.sub(CMath.one(), s22));
  const C = CMath.mul(CMath.fromRI(1 / z0, 0), CMath.div(CMath.sub(tC1, tA2), twoS21));

  // Num D: (1 - s11)(1 + s22) + s12*s21
  const tD1 = CMath.mul(CMath.sub(CMath.one(), s11), CMath.add(CMath.one(), s22));
  const D = CMath.div(CMath.add(tD1, tA2), twoS21);

  return { A, B, C, D };
}

/* Convert 2-Port ABCD Matrix to S-matrix */
function abcdToS(M, z0 = 50) {
  const { A, B, C, D } = M;
  const bOverZ0 = CMath.div(B, CMath.fromRI(z0, 0));
  const cTimesZ0 = CMath.mul(C, CMath.fromRI(z0, 0));

  // Denom: A + B/Z0 + C*Z0 + D
  const denom = CMath.add(CMath.add(A, bOverZ0), CMath.add(cTimesZ0, D));

  // S11: (A + B/Z0 - C*Z0 - D) / Denom
  const numS11 = CMath.sub(CMath.sub(CMath.add(A, bOverZ0), cTimesZ0), D);
  const s11 = CMath.div(numS11, denom);

  // S21: 2 / Denom
  const s21 = CMath.div(CMath.fromRI(2, 0), denom);

  // S12: 2 * (A*D - B*C) / Denom
  const ad_bc = CMath.sub(CMath.mul(A, D), CMath.mul(B, C));
  const s12 = CMath.div(CMath.mul(CMath.fromRI(2, 0), ad_bc), denom);

  // S22: (-A + B/Z0 - C*Z0 + D) / Denom
  const numS22 = CMath.add(CMath.sub(CMath.add(CMath.mul(CMath.fromRI(-1, 0), A), bOverZ0), cTimesZ0), D);
  const s22 = CMath.div(numS22, denom);

  return { s11, s21, s12, s22 };
}

/* Multiply two ABCD matrices M1 * M2 */
function mulAbcd(M1, M2) {
  const A = CMath.add(CMath.mul(M1.A, M2.A), CMath.mul(M1.B, M2.C));
  const B = CMath.add(CMath.mul(M1.A, M2.B), CMath.mul(M1.B, M2.D));
  const C = CMath.add(CMath.mul(M1.C, M2.A), CMath.mul(M1.D, M2.C));
  const D = CMath.add(CMath.mul(M1.C, M2.B), CMath.mul(M1.D, M2.D));
  return { A, B, C, D };
}

/* Trace linear path from P1 port block to target port block */
function findSignalPath(startBlockId, endBlockId) {
  const path = [];
  let currentId = startBlockId;
  const visited = new Set();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const b = blocks.find(x => x.id === currentId);
    if (!b) break;
    path.push(b);
    if (currentId === endBlockId) break;

    // Find outgoing connection
    const cn = conns.find(c => c.from.block === currentId);
    if (!cn) break;
    currentId = cn.to.block;
  }
  return path;
}

/* Main Execution Engine for S-Parameter Linear Analysis */
function computeLinearAnalysis(band) {
  const freqs = generateFreqVector(band);
  const N = freqs.length;

  // Locate Analysis Ports P1, P2, P3
  const p1Block = blocks.find(b => b.params && b.params.anaPort === "P1");
  const p2Block = blocks.find(b => b.params && b.params.anaPort === "P2");
  const p3Block = blocks.find(b => b.params && b.params.anaPort === "P3");

  const warnings = [];

  if (!p1Block) {
    return { error: "No Analysis Port P1 (Input) defined. Set 'Analysis Port' to P1 on an input terminal.", freqs };
  }
  if (!p2Block && !p3Block) {
    return { error: "No Analysis Port P2 or P3 defined. Set 'Analysis Port' to P2/P3 on output terminals.", freqs };
  }

  // Helper to process chain of components
  const analyzeChain = (pStart, pEnd) => {
    if (!pEnd) return null;
    const path = findSignalPath(pStart.id, pEnd.id);
    if (!path.length || path[path.length - 1].id !== pEnd.id) return null;

    // Filter out pure terminals from cascading calculations if desired
    const chainBlocks = path.filter(b => !COMP[b.type].isSource && b.type !== "antenna" && b.type !== "rfin" && b.type !== "rfout");

    const stageSParams = [];
    for (const b of chainBlocks) {
      let sRes = null;
      // Check if S2P data uploaded for active path
      const sRaw = b.params && b.params.s2pData;
      if (sRaw) {
        const parsed = parseTouchstone(sRaw);
        if (parsed) {
          sRes = interpolateSParams(parsed, freqs);
          if (sRes.extrapolated) {
            const lbl = b.params.label || COMP[b.type].name;
            warnings.push(`Warning: Touchstone data for '${lbl}' (${(parsed.minFreq/1e9).toFixed(2)}–${(parsed.maxFreq/1e9).toFixed(2)} GHz) was extrapolated to match the analysis band.`);
          }
        }
      }
      if (!sRes) sRes = getIdealSParams(b, freqs);
      stageSParams.push(sRes.interpolated);
    }

    const s21Arr = new Float64Array(N);
    const s11Arr = new Float64Array(N);
    const s22Arr = new Float64Array(N);
    const s12Arr = new Float64Array(N);

    for (let k = 0; k < N; k++) {
      if (!chainBlocks.length) {
        s21Arr[k] = 0; s11Arr[k] = -120; s22Arr[k] = -120; s12Arr[k] = -120;
        continue;
      }
      let chainAbcd = sToAbcd(stageSParams[0][k]);
      for (let i = 1; i < stageSParams.length; i++) {
        const nextAbcd = sToAbcd(stageSParams[i][k]);
        chainAbcd = mulAbcd(chainAbcd, nextAbcd);
      }
      const sysS = abcdToS(chainAbcd);
      s21Arr[k] = CMath.dB(sysS.s21);
      s11Arr[k] = CMath.dB(sysS.s11);
      s22Arr[k] = CMath.dB(sysS.s22);
      s12Arr[k] = CMath.dB(sysS.s12);
    }

    return { s21: s21Arr, s11: s11Arr, s22: s22Arr, s12: s12Arr };
  };

  const path12 = analyzeChain(p1Block, p2Block);
  const path13 = analyzeChain(p1Block, p3Block);

  // Deduplicate warnings
  const uniqueWarnings = Array.from(new Set(warnings));

  return {
    freqs,
    p1: p1Block ? (p1Block.params.label || "P1") : null,
    p2: p2Block ? (p2Block.params.label || "P2") : null,
    p3: p3Block ? (p3Block.params.label || "P3") : null,
    path12,
    path13,
    warnings: uniqueWarnings
  };
}


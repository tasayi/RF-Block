"use strict";

const $ = id => document.getElementById(id);
let UIDC = 1;
const uid = p => (p || "n") + (UIDC++) + "_" + Math.random().toString(36).slice(2, 6);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* Escapes HTML special characters including single quotes to prevent XSS breakout */
const esc = s => String(s == null ? "" : s).replace(/[&<>'"]/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;"
}[c]));

function fmt(n, d) {
  n = Number(n);
  if (!isFinite(n)) return String(n);
  if (d !== undefined) {
    const v = (Object.is(n, -0) ? 0 : n);
    return v.toFixed(d);
  }
  const r = Math.round(n * 10) / 10;
  return (Object.is(r, -0) ? 0 : r).toString();
}

const dsp = n => fmt(n).replace("-", "\u2212");
const dbm = v => (v === undefined || !isFinite(v)) ? "\u2014 dBm" : dsp(v) + " dBm";
const gsign = v => (v >= 0 ? "+" : "\u2212") + fmt(Math.abs(v)) + " dB";
const cint = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(+v || lo)));
const num = v => {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = +v;
  return isFinite(n) ? n : undefined;
};

/* srcOut may name one port or several (a custom block with no inputs feeds them all) */
const srcPorts = (c, p) => [].concat(c.srcOut(p)).filter(Boolean);

/* Interconnect direction from the signal point of view */
const icSend = p => {
  const r = (p && p.role) || "receive";
  return r === "send" || r === "in";
};
const icRecv = p => !icSend(p);

/* Subsystem port boundary tag helpers */
const subTag = (bid, port) => "\u00a7" + bid + "." + port;
const isSubTag = t => String(t || "").charAt(0) === "\u00a7";
const subTagPort = t => {
  const i = String(t).lastIndexOf(".");
  return i < 0 ? "" : String(t).slice(i + 1);
};

/* Tag text formatting */
const icTagText = t => {
  const v = String(t == null ? "" : t);
  return v.length > 6 ? v.slice(0, 6) : v;
};
const icTagFont = t => {
  const n = icTagText(t).length;
  return n <= 2 ? 13 : n === 3 ? 11 : n === 4 ? 9.5 : 8.5;
};

const sanPath = s => String(s || "").replace(/[^MmZzLlHhVvCcSsQqTtAa0-9,.\s-]/g, "").slice(0, 600);

const rl = (m, d) => {
  const o = {};
  if (m.in !== undefined) o.out = m.in - d;
  if (m.out !== undefined) o.in = m.out - d;
  return o;
};

const fLoss = p => (p.band === "stopband") ? (((+p.rej) >= 0) ? +p.rej : 40) : Math.abs(p.il);
const key = (b, p) => b + "\u00b7" + p;
const L = (x1, y1, x2, y2, c = "blk-line") => `<path class="${c}" d="M${x1} ${y1}L${x2} ${y2}"/>`;

/* Logarithmic power sum in dBm with bounds checking */
const sumDbm = arr => {
  const valid = arr.filter(v => v !== undefined && isFinite(v));
  if (!valid.length) return -Infinity;
  const sum = valid.reduce((s, v) => s + Math.pow(10, v / 10), 0);
  return sum <= 0 ? -Infinity : 10 * Math.log10(sum);
};

/* Color maths */
function hsl2hex(h, sPct, lPct) {
  const s = sPct / 100, l = lPct / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const q = v => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return "#" + q(r) + q(g) + q(b);
}

function hex2hsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = d / (1 - Math.abs(2 * l - 1));
    h = (mx === r) ? 60 * (((g - b) / d) % 6) : (mx === g) ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

/* Strict hex sanitizer to prevent CSS / HTML injection vulnerabilities */
const normHex = v => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(v || "").trim());
  return m ? ("#" + m[1].toLowerCase()) : null;
};


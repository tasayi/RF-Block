"use strict";

/* =====================================================================
 * RF Block Diagram Editor - Native Enhanced Metafile (EMF) Vector Exporter
 * Pure client-side binary Microsoft Enhanced Metafile (MS-EMF) generator
 * ===================================================================== */

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    Object.assign(root, exports);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  /* --- GDI Record Constants --- */
  const EMR_HEADER = 1;
  const EMR_POLYBEZIER = 2;
  const EMR_POLYGON = 3;
  const EMR_POLYLINE = 4;
  const EMR_SETWINDOWEXTEX = 9;
  const EMR_SETVIEWPORTEXTEX = 11;
  const EMR_EOF = 14;
  const EMR_SETMAPMODE = 17;
  const EMR_SETBKMODE = 18;
  const EMR_SETTEXTCOLOR = 24;
  const EMR_SETTEXTALIGN = 22;
  const EMR_MOVETOEX = 27;
  const EMR_SELECTOBJECT = 37;
  const EMR_CREATEPEN = 38;
  const EMR_CREATEBRUSHINDIRECT = 39;
  const EMR_DELETEOBJECT = 40;
  const EMR_ELLIPSE = 42;
  const EMR_RECTANGLE = 43;
  const EMR_ROUNDRECT = 44;
  const EMR_LINETO = 54;
  const EMR_BEGINPATH = 59;
  const EMR_ENDPATH = 60;
  const EMR_CLOSEFIGURE = 61;
  const EMR_FILLPATH = 62;
  const EMR_STROKEANDFILLPATH = 63;
  const EMR_STROKEPATH = 64;
  const EMR_EXTCREATEFONTINDIRECTW = 82;
  const EMR_EXTTEXTOUTW = 84;
  const EMR_POLYGON16 = 85;
  const EMR_POLYLINE16 = 86;

  /* Stock Object Constants */
  const WHITE_BRUSH = 0x80000000;
  const LTGRAY_BRUSH = 0x80000001;
  const GRAY_BRUSH = 0x80000002;
  const DKGRAY_BRUSH = 0x80000003;
  const BLACK_BRUSH = 0x80000004;
  const NULL_BRUSH = 0x80000005;
  const WHITE_PEN = 0x80000006;
  const BLACK_PEN = 0x80000007;
  const NULL_PEN = 0x80000008;

  /* Color parsing helper */
  function parseColor(str, defaultColor = { r: 0, g: 0, b: 0, a: 1 }) {
    if (!str || str === "none" || str === "transparent") return null;
    const s = String(str).trim().toLowerCase();
    if (s === "black") return { r: 0, g: 0, b: 0, a: 1 };
    if (s === "white") return { r: 255, g: 255, b: 255, a: 1 };
    if (s === "red") return { r: 255, g: 0, b: 0, a: 1 };
    if (s === "green") return { r: 0, g: 128, b: 0, a: 1 };
    if (s === "blue") return { r: 0, g: 0, b: 255, a: 1 };

    // #hex
    if (s.startsWith("#")) {
      const hex = s.slice(1);
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0] + hex[0], 16),
          g: parseInt(hex[1] + hex[1], 16),
          b: parseInt(hex[2] + hex[2], 16),
          a: 1
        };
      }
      if (hex.length === 6 || hex.length === 8) {
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
          a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
        };
      }
    }

    // rgb/rgba
    const rgbMatch = s.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (rgbMatch) {
      return {
        r: Math.round(parseFloat(rgbMatch[1])),
        g: Math.round(parseFloat(rgbMatch[2])),
        b: Math.round(parseFloat(rgbMatch[3])),
        a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1
      };
    }

    // hsl/hsla
    const hslMatch = s.match(/hsla?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)/);
    if (hslMatch && typeof hsl2hex === "function") {
      const hex = hsl2hex(parseFloat(hslMatch[1]), parseFloat(hslMatch[2]), parseFloat(hslMatch[3]));
      return parseColor(hex);
    }

    return defaultColor;
  }

  /* COLORREF in GDI format: 0x00BBGGRR */
  function colorRef(c) {
    if (!c) return 0;
    return (c.b << 16) | (c.g << 8) | c.r;
  }

  /* Matrix 2D Transform helper */
  function identityMatrix() {
    return [1, 0, 0, 1, 0, 0];
  }

  function multiplyMatrix(m1, m2) {
    return [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];
  }

  function transformPoint(m, pt) {
    return {
      x: m[0] * pt.x + m[2] * pt.y + m[4],
      y: m[1] * pt.x + m[3] * pt.y + m[5]
    };
  }

  function parseTransform(str) {
    if (!str) return identityMatrix();
    let m = identityMatrix();
    const regex = /([a-zA-Z]+)\s*\(([^)]+)\)/g;
    let match;
    while ((match = regex.exec(str)) !== null) {
      const type = match[1].toLowerCase();
      const args = match[2].trim().split(/[\s,]+/).map(Number);
      if (type === "translate") {
        const tx = args[0] || 0, ty = args[1] || 0;
        m = multiplyMatrix(m, [1, 0, 0, 1, tx, ty]);
      } else if (type === "scale") {
        const sx = args[0] || 1, sy = args[1] !== undefined ? args[1] : sx;
        m = multiplyMatrix(m, [sx, 0, 0, sy, 0, 0]);
      } else if (type === "rotate") {
        const deg = args[0] || 0;
        const rad = deg * Math.PI / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        if (args.length >= 3) {
          const cx = args[1], cy = args[2];
          m = multiplyMatrix(m, [1, 0, 0, 1, cx, cy]);
          m = multiplyMatrix(m, [cos, sin, -sin, cos, 0, 0]);
          m = multiplyMatrix(m, [1, 0, 0, 1, -cx, -cy]);
        } else {
          m = multiplyMatrix(m, [cos, sin, -sin, cos, 0, 0]);
        }
      } else if (type === "matrix" && args.length === 6) {
        m = multiplyMatrix(m, args);
      }
    }
    return m;
  }

  /* Binary EMF Buffer Builder */
  class EmfBuffer {
    constructor(initialCapacity = 65536) {
      this.buffer = new Uint8Array(initialCapacity);
      this.view = new DataView(this.buffer.buffer);
      this.offset = 0;
      this.recordCount = 0;
      this.handlesCount = 0;
      this.penCache = new Map();
      this.brushCache = new Map();
      this.fontCache = new Map();
    }

    ensureCapacity(additionalBytes) {
      if (this.offset + additionalBytes > this.buffer.length) {
        let newSize = Math.max(this.buffer.length * 2, this.offset + additionalBytes + 16384);
        const newBuf = new Uint8Array(newSize);
        newBuf.set(this.buffer);
        this.buffer = newBuf;
        this.view = new DataView(this.buffer.buffer);
      }
    }

    writeUInt8(val) {
      this.ensureCapacity(1);
      this.view.setUint8(this.offset, val);
      this.offset += 1;
    }

    writeInt16(val) {
      this.ensureCapacity(2);
      this.view.setInt16(this.offset, val, true);
      this.offset += 2;
    }

    writeUInt16(val) {
      this.ensureCapacity(2);
      this.view.setUint16(this.offset, val, true);
      this.offset += 2;
    }

    writeInt32(val) {
      this.ensureCapacity(4);
      this.view.setInt32(this.offset, val, true);
      this.offset += 4;
    }

    writeUInt32(val) {
      this.ensureCapacity(4);
      this.view.setUint32(this.offset, val, true);
      this.offset += 4;
    }

    writeFloat(val) {
      this.ensureCapacity(4);
      this.view.setFloat32(this.offset, val, true);
      this.offset += 4;
    }

    writeBytes(bytes) {
      this.ensureCapacity(bytes.length);
      this.buffer.set(bytes, this.offset);
      this.offset += bytes.length;
    }

    beginRecord(type) {
      const startOffset = this.offset;
      this.writeUInt32(type);
      this.writeUInt32(0); // placeholder for record size
      return startOffset;
    }

    endRecord(startOffset) {
      // Align record size to 4-byte boundary
      const unalignedSize = this.offset - startOffset;
      const pad = (4 - (unalignedSize % 4)) % 4;
      for (let i = 0; i < pad; i++) this.writeUInt8(0);

      const recordSize = this.offset - startOffset;
      this.view.setUint32(startOffset + 4, recordSize, true);
      this.recordCount++;
    }

    allocHandle() {
      this.handlesCount++;
      return this.handlesCount;
    }

    getPen(c, width = 1, isDashed = false) {
      if (!c) return NULL_PEN;
      const key = `${c.r},${c.g},${c.b},${width},${isDashed}`;
      if (this.penCache.has(key)) return this.penCache.get(key);

      const handle = this.allocHandle();
      const start = this.beginRecord(EMR_CREATEPEN);
      this.writeUInt32(handle);
      this.writeUInt32(isDashed ? 1 : 0); // PS_SOLID = 0, PS_DASH = 1
      this.writeInt32(Math.max(1, Math.round(width)));
      this.writeInt32(0);
      this.writeUInt32(colorRef(c));
      this.endRecord(start);

      this.penCache.set(key, handle);
      return handle;
    }

    getBrush(c) {
      if (!c) return NULL_BRUSH;
      const key = `${c.r},${c.g},${c.b}`;
      if (this.brushCache.has(key)) return this.brushCache.get(key);

      const handle = this.allocHandle();
      const start = this.beginRecord(EMR_CREATEBRUSHINDIRECT);
      this.writeUInt32(handle);
      this.writeUInt32(0); // BS_SOLID = 0
      this.writeUInt32(colorRef(c));
      this.writeUInt32(0); // Hatch = 0
      this.endRecord(start);

      this.brushCache.set(key, handle);
      return handle;
    }

    getFont(family = "Arial", sizePx = 13, isBold = false) {
      const key = `${family},${sizePx},${isBold}`;
      if (this.fontCache.has(key)) return this.fontCache.get(key);

      const handle = this.allocHandle();
      const start = this.beginRecord(EMR_EXTCREATEFONTINDIRECTW);
      this.writeUInt32(handle);

      // EXTLOGFONTW (320 bytes)
      this.writeInt32(-Math.round(sizePx)); // lfHeight
      this.writeInt32(0); // lfWidth
      this.writeInt32(0); // lfEscapement
      this.writeInt32(0); // lfOrientation
      this.writeInt32(isBold ? 700 : 400); // lfWeight
      this.writeUInt8(0); // lfItalic
      this.writeUInt8(0); // lfUnderline
      this.writeUInt8(0); // lfStrikeOut
      this.writeUInt8(1); // lfCharSet = DEFAULT_CHARSET
      this.writeUInt8(0); // lfOutPrecision
      this.writeUInt8(0); // lfClipPrecision
      this.writeUInt8(4); // lfQuality = ANTIALIASED_QUALITY
      this.writeUInt8(0x20); // lfPitchAndFamily = DEFAULT_PITCH | FF_SWISS

      // lfFaceName (32 WCHAR = 64 bytes)
      const cleanFont = String(family || "Arial").replace(/['"]/g, "").trim();
      const faceBytes = new Uint8Array(64);
      for (let i = 0; i < Math.min(31, cleanFont.length); i++) {
        const code = cleanFont.charCodeAt(i);
        faceBytes[i * 2] = code & 0xff;
        faceBytes[i * 2 + 1] = (code >> 8) & 0xff;
      }
      this.writeBytes(faceBytes);

      // Pad remaining EXTLOGFONTW fields with zeros (256 bytes)
      const padBytes = new Uint8Array(256);
      this.writeBytes(padBytes);

      this.endRecord(start);
      this.fontCache.set(key, handle);
      return handle;
    }

    selectObject(handle) {
      const start = this.beginRecord(EMR_SELECTOBJECT);
      this.writeUInt32(handle);
      this.endRecord(start);
    }

    setTextColor(c) {
      const start = this.beginRecord(EMR_SETTEXTCOLOR);
      this.writeUInt32(colorRef(c));
      this.endRecord(start);
    }

    setTextAlign(alignMode) {
      const start = this.beginRecord(EMR_SETTEXTALIGN);
      this.writeUInt32(alignMode);
      this.endRecord(start);
    }

    drawRectangle(x1, y1, x2, y2) {
      const start = this.beginRecord(EMR_RECTANGLE);
      this.writeInt32(Math.round(Math.min(x1, x2)));
      this.writeInt32(Math.round(Math.min(y1, y2)));
      this.writeInt32(Math.round(Math.max(x1, x2)));
      this.writeInt32(Math.round(Math.max(y1, y2)));
      this.endRecord(start);
    }

    drawRoundRect(x1, y1, x2, y2, rw, rh) {
      const start = this.beginRecord(EMR_ROUNDRECT);
      this.writeInt32(Math.round(Math.min(x1, x2)));
      this.writeInt32(Math.round(Math.min(y1, y2)));
      this.writeInt32(Math.round(Math.max(x1, x2)));
      this.writeInt32(Math.round(Math.max(y1, y2)));
      this.writeInt32(Math.round(rw * 2));
      this.writeInt32(Math.round(rh * 2));
      this.endRecord(start);
    }

    drawEllipse(x1, y1, x2, y2) {
      const start = this.beginRecord(EMR_ELLIPSE);
      this.writeInt32(Math.round(Math.min(x1, x2)));
      this.writeInt32(Math.round(Math.min(y1, y2)));
      this.writeInt32(Math.round(Math.max(x1, x2)));
      this.writeInt32(Math.round(Math.max(y1, y2)));
      this.endRecord(start);
    }

    drawLine(x1, y1, x2, y2) {
      const mStart = this.beginRecord(EMR_MOVETOEX);
      this.writeInt32(Math.round(x1));
      this.writeInt32(Math.round(y1));
      this.endRecord(mStart);

      const lStart = this.beginRecord(EMR_LINETO);
      this.writeInt32(Math.round(x2));
      this.writeInt32(Math.round(y2));
      this.endRecord(lStart);
    }

    drawPolygon16(pts) {
      if (!pts || pts.length < 3) return;
      let minX = pts[0].x, minY = pts[0].y, maxX = pts[0].x, maxY = pts[0].y;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }

      const start = this.beginRecord(EMR_POLYGON16);
      this.writeInt32(Math.round(minX));
      this.writeInt32(Math.round(minY));
      this.writeInt32(Math.round(maxX));
      this.writeInt32(Math.round(maxY));
      this.writeUInt32(pts.length);
      for (const p of pts) {
        this.writeInt16(Math.round(p.x));
        this.writeInt16(Math.round(p.y));
      }
      this.endRecord(start);
    }

    drawPolyline16(pts) {
      if (!pts || pts.length < 2) return;
      let minX = pts[0].x, minY = pts[0].y, maxX = pts[0].x, maxY = pts[0].y;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }

      const start = this.beginRecord(EMR_POLYLINE16);
      this.writeInt32(Math.round(minX));
      this.writeInt32(Math.round(minY));
      this.writeInt32(Math.round(maxX));
      this.writeInt32(Math.round(maxY));
      this.writeUInt32(pts.length);
      for (const p of pts) {
        this.writeInt16(Math.round(p.x));
        this.writeInt16(Math.round(p.y));
      }
      this.endRecord(start);
    }

    drawText(str, x, y) {
      if (!str) return;
      const strLen = str.length;
      const strBytes = new Uint8Array(strLen * 2);
      for (let i = 0; i < strLen; i++) {
        const code = str.charCodeAt(i);
        strBytes[i * 2] = code & 0xff;
        strBytes[i * 2 + 1] = (code >> 8) & 0xff;
      }

      const start = this.beginRecord(EMR_EXTTEXTOUTW);
      this.writeInt32(0);
      this.writeInt32(0);
      this.writeInt32(-1);
      this.writeInt32(-1);
      this.writeUInt32(1); // GM_COMPATIBLE
      this.writeFloat(1.0);
      this.writeFloat(1.0);
      this.writeInt32(Math.round(x));
      this.writeInt32(Math.round(y));
      this.writeUInt32(strLen);
      this.writeUInt32(76); // offString from record start (8 bytes type/size + 68 bytes fields)
      this.writeUInt32(0); // fOptions
      // rcl [48..63]
      this.writeInt32(0);
      this.writeInt32(0);
      this.writeInt32(0);
      this.writeInt32(0);
      this.writeUInt32(0); // offDx
      this.writeBytes(strBytes);
      this.endRecord(start);
    }
  }

  /* SVG Path 'd' Parser into Polylines and Closed Polygons */
  function parseSvgPathD(d) {
    if (!d) return [];
    const tokens = [];
    const re = /([a-df-z])|(-?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/gi;
    let m;
    while ((m = re.exec(d)) !== null) {
      if (m[1]) tokens.push(m[1]);
      else if (m[2]) tokens.push(parseFloat(m[2]));
    }

    const subpaths = [];
    let curPts = [];
    let isClosed = false;
    let cx = 0, cy = 0;
    let startX = 0, startY = 0;
    let i = 0;

    function flush() {
      if (curPts.length > 1) {
        subpaths.push({ pts: curPts, closed: isClosed });
      }
      curPts = [];
      isClosed = false;
    }

    while (i < tokens.length) {
      const tok = tokens[i];
      if (typeof tok !== "string") { i++; continue; }
      i++;

      const cmd = tok;
      const isRel = cmd === cmd.toLowerCase() && cmd !== "z";

      switch (cmd.toUpperCase()) {
        case "M": {
          flush();
          const x = isRel ? cx + tokens[i] : tokens[i];
          const y = isRel ? cy + tokens[i + 1] : tokens[i + 1];
          i += 2;
          cx = x; cy = y;
          startX = x; startY = y;
          curPts.push({ x, y });
          while (i < tokens.length && typeof tokens[i] === "number") {
            const lx = isRel ? cx + tokens[i] : tokens[i];
            const ly = isRel ? cy + tokens[i + 1] : tokens[i + 1];
            i += 2;
            cx = lx; cy = ly;
            curPts.push({ x: lx, y: ly });
          }
          break;
        }
        case "L": {
          while (i < tokens.length && typeof tokens[i] === "number") {
            const x = isRel ? cx + tokens[i] : tokens[i];
            const y = isRel ? cy + tokens[i + 1] : tokens[i + 1];
            i += 2;
            cx = x; cy = y;
            curPts.push({ x, y });
          }
          break;
        }
        case "H": {
          while (i < tokens.length && typeof tokens[i] === "number") {
            const x = isRel ? cx + tokens[i] : tokens[i];
            i += 1;
            cx = x;
            curPts.push({ x, y: cy });
          }
          break;
        }
        case "V": {
          while (i < tokens.length && typeof tokens[i] === "number") {
            const y = isRel ? cy + tokens[i] : tokens[i];
            i += 1;
            cy = y;
            curPts.push({ x: cx, y });
          }
          break;
        }
        case "C": {
          while (i < tokens.length && typeof tokens[i] === "number") {
            const cp1x = isRel ? cx + tokens[i] : tokens[i];
            const cp1y = isRel ? cy + tokens[i + 1] : tokens[i + 1];
            const cp2x = isRel ? cx + tokens[i + 2] : tokens[i + 2];
            const cp2y = isRel ? cy + tokens[i + 3] : tokens[i + 3];
            const ex = isRel ? cx + tokens[i + 4] : tokens[i + 4];
            const ey = isRel ? cy + tokens[i + 5] : tokens[i + 5];
            i += 6;

            // Interpolate cubic bezier curve
            const steps = 10;
            for (let step = 1; step <= steps; step++) {
              const t = step / steps, mt = 1 - t;
              const px = mt * mt * mt * cx + 3 * mt * mt * t * cp1x + 3 * mt * t * t * cp2x + t * t * t * ex;
              const py = mt * mt * mt * cy + 3 * mt * mt * t * cp1y + 3 * mt * t * t * cp2y + t * t * t * ey;
              curPts.push({ x: px, y: py });
            }
            cx = ex; cy = ey;
          }
          break;
        }
        case "Q": {
          while (i < tokens.length && typeof tokens[i] === "number") {
            const cpx = isRel ? cx + tokens[i] : tokens[i];
            const cpy = isRel ? cy + tokens[i + 1] : tokens[i + 1];
            const ex = isRel ? cx + tokens[i + 2] : tokens[i + 2];
            const ey = isRel ? cy + tokens[i + 3] : tokens[i + 3];
            i += 4;

            const steps = 8;
            for (let step = 1; step <= steps; step++) {
              const t = step / steps, mt = 1 - t;
              const px = mt * mt * cx + 2 * mt * t * cpx + t * t * ex;
              const py = mt * mt * cy + 2 * mt * t * cpy + t * t * ey;
              curPts.push({ x: px, y: py });
            }
            cx = ex; cy = ey;
          }
          break;
        }
        case "Z": {
          isClosed = true;
          cx = startX; cy = startY;
          if (curPts.length && (curPts[curPts.length - 1].x !== startX || curPts[curPts.length - 1].y !== startY)) {
            curPts.push({ x: startX, y: startY });
          }
          flush();
          break;
        }
        default:
          break;
      }
    }
    flush();
    return subpaths;
  }

  /* Lightweight XML element tree parser for non-browser / Node.js environments */
  function parseSvgXmlString(xmlStr) {
    function Element(tagName) {
      this.tagName = tagName;
      this.nodeType = 1;
      this.attributes = Object.create(null);
      this.children = [];
      this.textContent = "";
    }
    Element.prototype.getAttribute = function(name) {
      return this.attributes[name] !== undefined ? this.attributes[name] : null;
    };
    Element.prototype.querySelector = function(sel) {
      if (this.tagName.toLowerCase() === sel.toLowerCase()) return this;
      for (const ch of this.children) {
        const found = ch.querySelector(sel);
        if (found) return found;
      }
      return null;
    };

    let root = null;
    const stack = [];
    const tagRegex = /<(\/?)([a-zA-Z0-9_\-:]+)([^>]*)>|([^<]+)/g;
    let match;

    while ((match = tagRegex.exec(xmlStr)) !== null) {
      const isClose = match[1];
      const tagName = match[2];
      const rawAttrs = match[3];
      const textContent = match[4];

      if (textContent) {
        if (stack.length > 0) {
          stack[stack.length - 1].textContent += textContent;
        }
        continue;
      }
      if (isClose) {
        if (stack.length > 0 && stack[stack.length - 1].tagName.toLowerCase() === tagName.toLowerCase()) {
          stack.pop();
        }
      } else {
        const selfCloseExplicit = (rawAttrs && rawAttrs.trim().endsWith("/"));
        const isSelfClosing = selfCloseExplicit || (["circle", "line", "rect", "ellipse", "path", "polygon", "polyline"].includes(tagName.toLowerCase()) && !xmlStr.includes(`</${tagName}>`));
        const elem = new Element(tagName);
        if (rawAttrs) {
          const attrRegex = /([a-zA-Z0-9_\-:]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
          let attrMatch;
          while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
            const key = attrMatch[1];
            const val = attrMatch[2] !== undefined ? attrMatch[2] : (attrMatch[3] !== undefined ? attrMatch[3] : attrMatch[4]);
            elem.attributes[key] = val;
          }
        }
        if (!root) root = elem;
        if (stack.length > 0) {
          stack[stack.length - 1].children.push(elem);
        }
        if (!isSelfClosing) {
          stack.push(elem);
        }
      }
    }
    return root;
  }

  /* Core SVG to EMF Converter */
  function svgToEmf(svgInput) {
    let svgDoc = null;
    let svgElement = null;

    if (typeof svgInput === "string") {
      if (typeof DOMParser !== "undefined") {
        svgDoc = new DOMParser().parseFromString(svgInput, "image/svg+xml");
        svgElement = svgDoc.querySelector("svg");
      } else {
        const rootElem = parseSvgXmlString(svgInput);
        svgElement = rootElem ? (rootElem.tagName.toLowerCase() === "svg" ? rootElem : rootElem.querySelector("svg")) : null;
      }
    } else if (svgInput && svgInput.nodeType === 1) {
      svgElement = svgInput;
    }

    if (!svgElement) {
      throw new Error("Unable to parse SVG input into a valid SVG DOM tree.");
    }

    // Determine dimensions from viewBox or width/height
    const viewBoxAttr = svgElement.getAttribute("viewBox");
    let vx = 0, vy = 0, vw = 800, vh = 600;
    if (viewBoxAttr) {
      const parts = viewBoxAttr.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        vx = parts[0]; vy = parts[1]; vw = parts[2]; vh = parts[3];
      }
    } else {
      vw = parseFloat(svgElement.getAttribute("width")) || 800;
      vh = parseFloat(svgElement.getAttribute("height")) || 600;
    }

    const width = Math.max(10, Math.round(vw));
    const height = Math.max(10, Math.round(vh));
    const dpi = 96;
    const mmW = Math.max(1, Math.round(width * 25.4 / dpi));
    const mmH = Math.max(1, Math.round(height * 25.4 / dpi));

    const emf = new EmfBuffer(131072);

    // Reserve 88 bytes for EMR_HEADER (offset 0..87)
    const hdrOffset = emf.offset;
    for (let i = 0; i < 88; i++) emf.writeUInt8(0);
    emf.recordCount = 1;

    // Initial setup records
    // SetMapMode = MM_ANISOTROPIC (8)
    const sMap = emf.beginRecord(EMR_SETMAPMODE);
    emf.writeUInt32(8);
    emf.endRecord(sMap);

    // SetWindowExtEx
    const sWin = emf.beginRecord(EMR_SETWINDOWEXTEX);
    emf.writeInt32(width);
    emf.writeInt32(height);
    emf.endRecord(sWin);

    // SetViewportExtEx
    const sVp = emf.beginRecord(EMR_SETVIEWPORTEXTEX);
    emf.writeInt32(width);
    emf.writeInt32(height);
    emf.endRecord(sVp);

    // SetBkMode = TRANSPARENT (1)
    const sBk = emf.beginRecord(EMR_SETBKMODE);
    emf.writeUInt32(1);
    emf.endRecord(sBk);

    // Base viewBox offset matrix
    const baseMatrix = multiplyMatrix(identityMatrix(), [1, 0, 0, 1, -vx, -vy]);

    // Recursive DOM Traversal
    function processNode(node, curMatrix, inherited) {
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toLowerCase();
      if (tag === "defs" || tag === "style" || tag === "clippath" || tag === "pattern" || tag === "marker") return;

      const transformAttr = node.getAttribute("transform");
      const nodeMatrix = transformAttr ? multiplyMatrix(curMatrix, parseTransform(transformAttr)) : curMatrix;

      const fillAttr = node.getAttribute("fill");
      const strokeAttr = node.getAttribute("stroke");
      const strokeWidthAttr = node.getAttribute("stroke-width");
      const strokeDashAttr = node.getAttribute("stroke-dasharray");
      const isDashed = !!(strokeDashAttr && strokeDashAttr !== "none");

      const fill = fillAttr !== null ? (fillAttr === "none" ? null : parseColor(fillAttr)) : inherited.fill;
      const stroke = strokeAttr !== null ? (strokeAttr === "none" ? null : parseColor(strokeAttr)) : inherited.stroke;
      const strokeWidth = strokeWidthAttr !== null ? parseFloat(strokeWidthAttr) || 1 : inherited.strokeWidth;

      const style = { fill, stroke, strokeWidth, isDashed };

      function applyPenAndBrush(f, s, w, dashed) {
        const penHandle = s ? emf.getPen(s, w, dashed) : NULL_PEN;
        const brushHandle = f ? emf.getBrush(f) : NULL_BRUSH;
        emf.selectObject(penHandle);
        emf.selectObject(brushHandle);
      }

      switch (tag) {
        case "rect": {
          const x = parseFloat(node.getAttribute("x")) || 0;
          const y = parseFloat(node.getAttribute("y")) || 0;
          const w = parseFloat(node.getAttribute("width")) || 0;
          const h = parseFloat(node.getAttribute("height")) || 0;
          const rx = parseFloat(node.getAttribute("rx")) || 0;
          const ry = parseFloat(node.getAttribute("ry")) || rx;
          if (w <= 0 || h <= 0) break;

          applyPenAndBrush(style.fill, style.stroke, style.strokeWidth, style.isDashed);

          // If no rotation, use standard rectangle / roundrect
          if (nodeMatrix[1] === 0 && nodeMatrix[2] === 0) {
            const p1 = transformPoint(nodeMatrix, { x, y });
            const p2 = transformPoint(nodeMatrix, { x: x + w, y: y + h });
            if (rx > 0 || ry > 0) {
              emf.drawRoundRect(p1.x, p1.y, p2.x, p2.y, rx * nodeMatrix[0], ry * nodeMatrix[3]);
            } else {
              emf.drawRectangle(p1.x, p1.y, p2.x, p2.y);
            }
          } else {
            // Transformed rect as polygon
            const pts = [
              transformPoint(nodeMatrix, { x, y }),
              transformPoint(nodeMatrix, { x: x + w, y }),
              transformPoint(nodeMatrix, { x: x + w, y: y + h }),
              transformPoint(nodeMatrix, { x, y: y + h })
            ];
            emf.drawPolygon16(pts);
          }
          break;
        }

        case "circle": {
          const cx = parseFloat(node.getAttribute("cx")) || 0;
          const cy = parseFloat(node.getAttribute("cy")) || 0;
          const r = parseFloat(node.getAttribute("r")) || 0;
          if (r <= 0) break;

          applyPenAndBrush(style.fill, style.stroke, style.strokeWidth, style.isDashed);
          const cp = transformPoint(nodeMatrix, { x: cx, y: cy });
          const rx = r * Math.hypot(nodeMatrix[0], nodeMatrix[1]);
          const ry = r * Math.hypot(nodeMatrix[2], nodeMatrix[3]);
          emf.drawEllipse(cp.x - rx, cp.y - ry, cp.x + rx, cp.y + ry);
          break;
        }

        case "ellipse": {
          const cx = parseFloat(node.getAttribute("cx")) || 0;
          const cy = parseFloat(node.getAttribute("cy")) || 0;
          const rx = parseFloat(node.getAttribute("rx")) || 0;
          const ry = parseFloat(node.getAttribute("ry")) || 0;
          if (rx <= 0 || ry <= 0) break;

          applyPenAndBrush(style.fill, style.stroke, style.strokeWidth, style.isDashed);
          const cp = transformPoint(nodeMatrix, { x: cx, y: cy });
          emf.drawEllipse(cp.x - rx, cp.y - ry, cp.x + rx, cp.y + ry);
          break;
        }

        case "line": {
          const x1 = parseFloat(node.getAttribute("x1")) || 0;
          const y1 = parseFloat(node.getAttribute("y1")) || 0;
          const x2 = parseFloat(node.getAttribute("x2")) || 0;
          const y2 = parseFloat(node.getAttribute("y2")) || 0;

          if (style.stroke) {
            applyPenAndBrush(null, style.stroke, style.strokeWidth, style.isDashed);
            const p1 = transformPoint(nodeMatrix, { x: x1, y: y1 });
            const p2 = transformPoint(nodeMatrix, { x: x2, y: y2 });
            emf.drawLine(p1.x, p1.y, p2.x, p2.y);
          }
          break;
        }

        case "polyline":
        case "polygon": {
          const pointsAttr = node.getAttribute("points");
          if (!pointsAttr) break;
          const rawNums = pointsAttr.trim().split(/[\s,]+/).map(Number);
          const pts = [];
          for (let k = 0; k < rawNums.length - 1; k += 2) {
            pts.push(transformPoint(nodeMatrix, { x: rawNums[k], y: rawNums[k + 1] }));
          }
          if (pts.length < 2) break;

          applyPenAndBrush(tag === "polygon" ? style.fill : null, style.stroke, style.strokeWidth, style.isDashed);
          if (tag === "polygon") {
            emf.drawPolygon16(pts);
          } else {
            emf.drawPolyline16(pts);
          }
          break;
        }

        case "path": {
          const d = node.getAttribute("d");
          if (!d) break;
          const subpaths = parseSvgPathD(d);
          for (const sp of subpaths) {
            const transformedPts = sp.pts.map(pt => transformPoint(nodeMatrix, pt));
            if (sp.closed && style.fill) {
              applyPenAndBrush(style.fill, style.stroke, style.strokeWidth, style.isDashed);
              emf.drawPolygon16(transformedPts);
            } else if (style.stroke) {
              applyPenAndBrush(null, style.stroke, style.strokeWidth, style.isDashed);
              emf.drawPolyline16(transformedPts);
            }
          }
          break;
        }

        case "text": {
          const x = parseFloat(node.getAttribute("x")) || 0;
          const y = parseFloat(node.getAttribute("y")) || 0;
          const text = (node.textContent || "").trim();
          if (!text) break;

          const textColor = style.fill || { r: 0, g: 0, b: 0, a: 1 };
          const fontSize = parseFloat(node.getAttribute("font-size")) || 13;
          const fontWeight = (node.getAttribute("font-weight") || "").toLowerCase();
          const isBold = fontWeight === "bold" || fontWeight === "700" || fontWeight === "600";
          const fontFamily = node.getAttribute("font-family") || "Arial";
          const textAnchor = (node.getAttribute("text-anchor") || "start").toLowerCase();

          const pt = transformPoint(nodeMatrix, { x, y });
          const fontHandle = emf.getFont(fontFamily, fontSize, isBold);

          emf.selectObject(fontHandle);
          emf.setTextColor(textColor);

          // TA_BASELINE = 24. Combine with alignment:
          // TA_LEFT = 0, TA_RIGHT = 2, TA_CENTER = 6
          let alignMode = 24; // BASELINE
          if (textAnchor === "middle") alignMode |= 6;
          else if (textAnchor === "end") alignMode |= 2;
          else alignMode |= 0;

          emf.setTextAlign(alignMode);
          emf.drawText(text, pt.x, pt.y);
          break;
        }

        default:
          break;
      }

      // Recurse children
      const kids = node.children || [];
      for (let i = 0; i < kids.length; i++) {
        processNode(kids[i], nodeMatrix, style);
      }
    }

    const rootStyle = { fill: null, stroke: null, strokeWidth: 1, isDashed: false };
    const rootKids = svgElement.children || [];
    for (let i = 0; i < rootKids.length; i++) {
      processNode(rootKids[i], baseMatrix, rootStyle);
    }

    // Write EMR_EOF (14)
    const sEof = emf.beginRecord(EMR_EOF);
    emf.writeUInt32(0); // nPalEntries
    emf.writeUInt32(0); // offPalEntries
    emf.writeUInt32(20); // nSizeLast
    emf.endRecord(sEof);

    // Finalize EMR_HEADER at offset 0
    const totalBytes = emf.offset;
    const numRecords = emf.recordCount;
    const numHandles = emf.handlesCount + 1;

    emf.view.setUint32(0, EMR_HEADER, true);
    emf.view.setUint32(4, 88, true);
    // rclBounds (pixels)
    emf.view.setInt32(8, 0, true);
    emf.view.setInt32(12, 0, true);
    emf.view.setInt32(16, width, true);
    emf.view.setInt32(20, height, true);
    // rclFrame (0.01 mm)
    emf.view.setInt32(24, 0, true);
    emf.view.setInt32(28, 0, true);
    emf.view.setInt32(32, mmW * 100, true);
    emf.view.setInt32(36, mmH * 100, true);
    // dSignature = " EMF" (0x464D4520, [MS-EMF] 2.2.9)
    emf.view.setUint32(40, 0x464D4520, true);
    emf.view.setUint32(44, 0x00010000, true); // nVersion
    emf.view.setUint32(48, totalBytes, true);
    emf.view.setUint32(52, numRecords, true);
    emf.view.setUint16(56, numHandles, true);
    emf.view.setUint16(58, 0, true); // sReserved
    emf.view.setUint32(60, 0, true); // nDescription
    emf.view.setUint32(64, 0, true); // offDescription
    emf.view.setUint32(68, 0, true); // nPalEntries
    emf.view.setInt32(72, width, true); // szlDevice.cx
    emf.view.setInt32(76, height, true); // szlDevice.cy
    emf.view.setInt32(80, mmW, true); // szlMillimeters.cx
    emf.view.setInt32(84, mmH, true); // szlMillimeters.cy

    return emf.buffer.subarray(0, totalBytes);
  }

  /* Export Action Triggers */
  function exportSchematicEmf() {
    if (typeof commitSheet === "function") commitSheet();
    if (typeof blocks !== "undefined" && !blocks.length) {
      if (typeof hint === "function") hint("Can't export EMF — the diagram is empty.");
      return;
    }
    try {
      const svgStr = (typeof buildExportSVG === "function")
        ? buildExportSVG(1)
        : ((typeof buildSvgString === "function") ? buildSvgString() : null);
      if (!svgStr) {
        if (typeof hint === "function") hint("SVG export engine is unavailable.");
        return;
      }
      const emfBytes = svgToEmf(svgStr);
      const blob = new Blob([emfBytes], { type: "image/emf" });
      const base = (typeof fileName !== "undefined" && fileName ? fileName : "rf-chain").replace(/\.(rfbd|json|vsdx|vdx|png|svg|emf)$/i, "");
      const name = `${base}.emf`;
      if (typeof downloadFile === "function") {
        downloadFile(blob, name, "image/emf");
        if (typeof hint === "function") hint(`Exported schematic vector figure as '${name}'`);
      }
    } catch (err) {
      console.error("EMF export error:", err);
      if (typeof hint === "function") hint("Error exporting EMF: " + (err.message || err));
    }
  }

  function exportBudgetPlotEmf() {
    const sel = typeof $ === "function" ? $("bgStart") : null;
    const startId = sel ? sel.value : null;
    const pathIdx = (typeof budgetSelectedPathIdx !== "undefined") ? budgetSelectedPathIdx : 0;
    const { rows } = (typeof buildBudget === "function") ? buildBudget(startId, pathIdx) : { rows: [] };
    if (!rows || !rows.length) {
      if (typeof hint === "function") hint("No budget plot data to export.");
      return;
    }
    try {
      const bwHz = (typeof settings !== "undefined" && settings.bandwidthHz && settings.bandwidthHz > 0) ? settings.bandwidthHz : 1e6;
      const res = (typeof generateBudgetPlotSvg === "function") ? generateBudgetPlotSvg(rows, bwHz, true) : null;
      if (!res || !res.svg) {
        if (typeof hint === "function") hint("Budget plot SVG generator is unavailable.");
        return;
      }
      const emfBytes = svgToEmf(res.svg);
      const blob = new Blob([emfBytes], { type: "image/emf" });
      if (typeof downloadFile === "function") {
        downloadFile(blob, "cascade_budget_plot.emf", "image/emf");
        if (typeof hint === "function") hint("Exported Cascade Budget Plot as Enhanced Metafile (.emf)");
      }
    } catch (err) {
      console.error("Budget EMF export error:", err);
      if (typeof hint === "function") hint("Error exporting Budget EMF: " + (err.message || err));
    }
  }

  function exportSParamsEmf() {
    try {
      let svgStr = null;
      if (typeof buildSParamsExportSvg === "function") {
        svgStr = buildSParamsExportSvg();
      } else if (typeof buildStandaloneSvg === "function") {
        const container = (typeof $ === "function") ? $("spChartContainer") : null;
        if (container) svgStr = buildStandaloneSvg(container);
      }
      if (!svgStr) {
        if (typeof hint === "function") hint("S-Parameters graph SVG generator is unavailable.");
        return;
      }
      const emfBytes = svgToEmf(svgStr);
      const blob = new Blob([emfBytes], { type: "image/emf" });
      if (typeof downloadFile === "function") {
        downloadFile(blob, "sparams_graph.emf", "image/emf");
        if (typeof hint === "function") hint("Exported S-Parameters Graph as Enhanced Metafile (.emf)");
      }
    } catch (err) {
      console.error("S-Params EMF export error:", err);
      if (typeof hint === "function") hint("Error exporting S-Params EMF: " + (err.message || err));
    }
  }

  return {
    svgToEmf,
    exportSchematicEmf,
    exportBudgetPlotEmf,
    exportSParamsEmf
  };
});

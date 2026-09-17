"use strict";

/* Native ZIP / XLSX Binary Generator for Bill of Materials (BOM) Export */
const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zipStore(entries) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  for (const e of entries) {
    const nb = enc.encode(e.name), data = (typeof e.data === "string") ? enc.encode(e.data) : e.data, crc = crc32(data);
    const lh = new Uint8Array(30 + nb.length), dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x800, true);
    dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true);
    dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true);
    dv.setUint16(26, nb.length, true); dv.setUint16(28, 0, true); lh.set(nb, 30);
    parts.push(lh, data);
    const ch = new Uint8Array(46 + nb.length), cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x800, true); cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, nb.length, true); cv.setUint32(38, 0, true); cv.setUint32(42, off, true);
    ch.set(nb, 46); central.push(ch);
    off += lh.length + data.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const eo = new Uint8Array(22), ev = new DataView(eo.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, central.length, true); ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, off, true); ev.setUint16(20, 0, true);
  return new Blob([...parts, ...central, eo],
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

const colName = i => {
  let s2 = "", n = i;
  while (n >= 0) { s2 = String.fromCharCode(65 + (n % 26)) + s2; n = Math.floor(n / 26) - 1; }
  return s2;
};

const xesc = v => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

function sheetXml(rows, widths) {
  let x = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<cols>` + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("") + `</cols>`
    + `<sheetData>`;
  rows.forEach((r, ri) => {
    x += `<row r="${ri + 1}">`;
    r.forEach((cell, ci) => {
      const ref = colName(ci) + (ri + 1), st = (ri === 0) ? ` s="1"` : "";
      if (typeof cell === "number" && isFinite(cell)) x += `<c r="${ref}"${st}><v>${cell}</v></c>`;
      else if (cell !== "" && cell != null) x += `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${xesc(cell)}</t></is></c>`;
    });
    x += `</row>`;
  });
  return x + `</sheetData></worksheet>`;
}

function xlsxBlob(rows, widths, tabName) {
  const P = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return zipStore([
    {
      name: "[Content_Types].xml", data: P + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
        + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
        + `<Default Extension="xml" ContentType="application/xml"/>`
        + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
        + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
        + `</Types>`
    },
    {
      name: "_rels/.rels", data: P + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
        + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
    },
    {
      name: "xl/workbook.xml", data: P + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
        + `<sheets><sheet name="${xesc(tabName || "BOM")}" sheetId="1" r:id="rId1"/></sheets></workbook>`
    },
    {
      name: "xl/_rels/workbook.xml.rels", data: P + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
        + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>`
        + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
    },
    {
      name: "xl/styles.xml", data: P + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
        + `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>`
        + `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>`
        + `<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>`
        + `<cellXfs count="2"><xf xfId="0"/><xf xfId="0" fontId="1" applyFont="1"/></cellXfs>`
        + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
    },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml(rows, widths) }
  ]);
}


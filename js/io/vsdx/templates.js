"use strict";

/* =====================================================================
 * RF Block Diagram Editor - Visio VSDX OPC XML Templates & Validator
 * ===================================================================== */

const VSDX_XML_HDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function vsdxEsc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

function vsdxColor(hex) {
  if (!hex || typeof hex !== "string") return "#ffffff";
  const h = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(h)) return h.toLowerCase();
  return "#ffffff";
}

function getVsdxContentTypesXml() {
  return VSDX_XML_HDR
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n`
    + `  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n`
    + `  <Default Extension="xml" ContentType="application/xml"/>\n`
    + `  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>\n`
    + `  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>\n`
    + `  <Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>\n`
    + `  <Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>\n`
    + `  <Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>\n`
    + `  <Override PartName="/visio/masters/masters.xml" ContentType="application/vnd.ms-visio.masters+xml"/>\n`
    + `  <Override PartName="/visio/windows.xml" ContentType="application/vnd.ms-visio.windows+xml"/>\n`
    + `</Types>`;
}

function getVsdxAppXml() {
  return VSDX_XML_HDR + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>RF Chain</Application></Properties>`;
}

function getVsdxCoreXml() {
  return VSDX_XML_HDR + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>RF Chain Block Diagram</dc:title><dc:creator>RF Chain Editor</dc:creator><cp:lastModifiedBy>RF Chain Editor</cp:lastModifiedBy></cp:coreProperties>`;
}

function getVsdxRootRelsXml() {
  return VSDX_XML_HDR
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n`
    + `  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/>\n`
    + `  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>\n`
    + `  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>\n`
    + `</Relationships>`;
}

function getVsdxDocXml() {
  return VSDX_XML_HDR
    + `<VisioDocument xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n`
    + `  <DocumentProperties>\n`
    + `    <Title>RF Chain Block Diagram</Title>\n`
    + `    <Creator>RF Chain Editor</Creator>\n`
    + `  </DocumentProperties>\n`
    + `  <FaceNames>\n`
    + `    <FaceName ID="1" Name="Calibri" Flags="0"/>\n`
    + `  </FaceNames>\n`
    + `  <StyleSheets>\n`
    + `    <StyleSheet ID="0" Name="Normal">\n`
    + `      <Cell N="Font" V="1"/>\n`
    + `    </StyleSheet>\n`
    + `  </StyleSheets>\n`
    + `</VisioDocument>`;
}

function getVsdxDocRelsXml() {
  return VSDX_XML_HDR
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n`
    + `  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/>\n`
    + `  <Relationship Id="rId2" Type="http://schemas.microsoft.com/visio/2010/relationships/masters" Target="masters/masters.xml"/>\n`
    + `  <Relationship Id="rId3" Type="http://schemas.microsoft.com/visio/2010/relationships/windows" Target="windows.xml"/>\n`
    + `</Relationships>`;
}

function getVsdxPagesXml() {
  return VSDX_XML_HDR
    + `<Pages xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n`
    + `  <Page ID="0" Name="Page-1" NameU="Page-1">\n`
    + `    <Rel r:id="rId1"/>\n`
    + `  </Page>\n`
    + `</Pages>`;
}

function getVsdxPagesRelsXml() {
  return VSDX_XML_HDR
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n`
    + `  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/>\n`
    + `</Relationships>`;
}

function getVsdxWindowsXml() {
  return VSDX_XML_HDR
    + `<Windows xmlns="http://schemas.microsoft.com/office/visio/2012/main">\n`
    + `  <Window ID="0" WindowType="Drawing" WindowWidth="1600" WindowHeight="1000" ViewScale="1" Page="1"/>\n`
    + `</Windows>`;
}

function validateVsdxPackage(entries) {
  const parts = (entries || []).map(e => e && e.name ? e.name : "").filter(Boolean);
  const required = [
    "[Content_Types].xml",
    "_rels/.rels",
    "docProps/app.xml",
    "docProps/core.xml",
    "visio/document.xml",
    "visio/_rels/document.xml.rels",
    "visio/pages/pages.xml",
    "visio/pages/_rels/pages.xml.rels",
    "visio/pages/page1.xml",
    "visio/masters/masters.xml",
    "visio/windows.xml"
  ];
  const missing = required.filter(name => !parts.includes(name));
  if (missing.length) throw new Error(`Invalid VSDX package: missing required part(s): ${missing.join(", ")}`);

  const partMap = new Map((entries || []).filter(Boolean).map(e => [e.name, String(e.data || "")]));
  const xmlTypes = partMap.get("[Content_Types].xml") || "";
  const docRels = partMap.get("visio/_rels/document.xml.rels") || "";
  const pageRels = partMap.get("visio/pages/_rels/pages.xml.rels") || "";
  const pageXml = partMap.get("visio/pages/page1.xml") || "";

  const need = [
    '/visio/document.xml',
    '/visio/pages/pages.xml',
    '/visio/pages/page1.xml',
    '/visio/windows.xml',
    '/docProps/core.xml',
    '/docProps/app.xml'
  ];
  for (const token of need) {
    if (!xmlTypes.includes(`PartName="${token}"`)) throw new Error(`Invalid VSDX package: missing Content_Types entry for ${token}`);
  }

  if (!/Relationship Id="rId1"[^>]*Target="visio\/document\.xml"/.test((partMap.get("_rels/.rels") || ""))) {
    throw new Error("Invalid VSDX package: package root relationship is missing or malformed.");
  }
  if (!/Relationship Id="rId1"[^>]*Target="pages\/pages\.xml"/.test(docRels)) {
    throw new Error("Invalid VSDX package: document relationships are missing the pages target.");
  }
  if (!/Relationship Id="rId1"[^>]*Target="page1\.xml"/.test(pageRels)) {
    throw new Error("Invalid VSDX package: page relationships are missing the page target.");
  }
  if (!/<Page\b[^>]*xmlns=/.test(pageXml)) {
    throw new Error("Invalid VSDX package: page XML must use a Visio Page root element.");
  }

  const xmlFiles = ["[Content_Types].xml", "_rels/.rels", "visio/document.xml", "visio/_rels/document.xml.rels", "visio/pages/pages.xml", "visio/pages/_rels/pages.xml.rels", "visio/pages/page1.xml", "visio/masters/masters.xml", "visio/windows.xml", "docProps/core.xml", "docProps/app.xml"];
  for (const name of xmlFiles) {
    const xml = partMap.get(name) || "";
    if (!xml.startsWith("<?xml")) throw new Error(`Invalid VSDX package: ${name} is not valid XML.`);
  }

  const shapeTags = [...pageXml.matchAll(/<Shape\b([^>]*)>/g)];
  const shapeIds = new Set();
  for (const match of shapeTags) {
    const id = (match[1].match(/\bID="(\d+)"/) || [])[1];
    if (!id) throw new Error("Invalid VSDX page: a Shape is missing its numeric ID.");
    if (shapeIds.has(id)) throw new Error(`Invalid VSDX page: duplicate Shape ID ${id}.`);
    shapeIds.add(id);
  }
  if (!shapeTags.length) throw new Error("Invalid VSDX page: no shapes were generated.");

  const masterXml = partMap.get("visio/masters/masters.xml") || "";
  const masterIds = new Set([...masterXml.matchAll(/<Master\b[^>]*\bID="(\d+)"/g)].map(match => match[1]));
  for (const match of pageXml.matchAll(/<Shape\b([^>]*)>/g)) {
    const masterId = (match[1].match(/\bMaster="(\d+)"/) || [])[1];
    if (masterId && !masterIds.has(masterId)) throw new Error(`Invalid VSDX page: Shape references missing Master ID ${masterId}.`);
  }
  for (const connect of pageXml.matchAll(/<Connect\b([^>]*)\/>/g)) {
    for (const attr of ["FromSheet", "ToSheet"]) {
      const id = (connect[1].match(new RegExp(`\\b${attr}="(\\d+)"`)) || [])[1];
      if (id && !shapeIds.has(id)) throw new Error(`Invalid VSDX page: connector references missing Shape ID ${id}.`);
    }
    const targetId = (connect[1].match(/\bToSheet="(\d+)"/) || [])[1];
    const targetCell = (connect[1].match(/\bToCell="([^"]+)"/) || [])[1];
    if (targetId && targetCell && targetCell.startsWith("Connections.X")) {
      const pointNo = Number(targetCell.slice("Connections.X".length));
      const targetShape = [...pageXml.matchAll(/<Shape\b([^>]*)>([\s\S]*?)<\/Shape>/g)]
        .find(shape => (shape[1].match(/\bID="(\d+)"/) || [])[1] === targetId);
      if (!targetShape || !new RegExp(`<Section N="Connection"[^>]*>[\\s\\S]*?<Row IX="${pointNo - 1}"`).test(targetShape[2])) {
        throw new Error(`Invalid VSDX page: connector target ${targetId}/${targetCell} does not resolve to a port connection point.`);
      }
    }
  }
  for (const match of pageXml.matchAll(/<Shape\b([^>]*)NameU="Dynamic connector"([^>]*)>([\s\S]*?)<\/Shape>/g)) {
    const attrs = `${match[1]} ${match[2]}`;
    if (!/\bOneD="1"/.test(attrs) || !/<Cell N="BeginX"/.test(match[3]) || !/<Cell N="EndX"/.test(match[3])) {
      throw new Error("Invalid VSDX page: a connector is missing 1D endpoint coordinates.");
    }
  }
  if (shapeTags.some(match => /\bNameU="[^"]+ symbol"/.test(match[1]))
      && !/<Shape\b[^>]*NameU="[^"]+ symbol"[^>]*>[\s\S]*?<Section N="Geometry"/.test(pageXml)) {
    throw new Error("Invalid VSDX page: component symbols are missing vector geometry.");
  }

  return true;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    VSDX_XML_HDR,
    vsdxEsc,
    vsdxColor,
    getVsdxContentTypesXml,
    getVsdxAppXml,
    getVsdxCoreXml,
    getVsdxRootRelsXml,
    getVsdxDocXml,
    getVsdxDocRelsXml,
    getVsdxPagesXml,
    getVsdxPagesRelsXml,
    getVsdxWindowsXml,
    validateVsdxPackage
  };
}

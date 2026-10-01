"use strict";

/* Native Microsoft Visio (.vsdx) Binary Generator
   Generates native OpenXML Visio OPC zip package with vector shapes, text & dynamic connectors */

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

function buildVsdxBlob(blocksList, connsList, Pdict, NFdict, PSecondaryDict) {
  const blks = blocksList || [];
  const cns = connsList || [];
  const P = Pdict || (typeof computePowers === "function" ? computePowers("primary") : {});
  const PSecondary = PSecondaryDict || (typeof computePowers === "function" ? computePowers("secondary") : {});
  const needNoise = (typeof settings !== "undefined" && (settings.showNF || settings.showNoiseFloor));
  const NFm = NFdict || (needNoise && typeof computeNoise === "function" ? computeNoise(P) : null);

  /* Calculate canvas bounding box in pixels */
  const pad = (typeof DESIGN_TOKENS !== "undefined" && DESIGN_TOKENS.exportPadding) ? DESIGN_TOKENS.exportPadding : 24;
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  if (!blks.length) {
    minx = 0; miny = 0; maxx = 800; maxy = 600;
  } else {
    for (const b of blks) {
      const f = (typeof footprint === "function") ? footprint(b) : { w: 100, h: 60 };
      minx = Math.min(minx, b.x - pad);
      miny = Math.min(miny, b.y - pad - 20);
      maxx = Math.max(maxx, b.x + f.w + pad);
      maxy = Math.max(maxy, b.y + f.h + pad + 35);
    }
    for (const cn of cns) {
      if (cn.waypoints && cn.waypoints.length) {
        for (const wp of cn.waypoints) {
          minx = Math.min(minx, wp.x - pad);
          miny = Math.min(miny, wp.y - pad);
          maxx = Math.max(maxx, wp.x + pad);
          maxy = Math.max(maxy, wp.y + pad);
        }
      }
    }
  }

  const pxW = Math.max(400, maxx - minx);
  const pxH = Math.max(300, maxy - miny);
  const dpi = 96;
  const pageWin = Math.max(8.5, Math.ceil((pxW / dpi) * 10) / 10 + 1.0);
  const pageHin = Math.max(11.0, Math.ceil((pxH / dpi) * 10) / 10 + 1.0);

  /* Conversion helper: canvas px to Visio inches */
  const toInX = px => Math.round(((px - minx + 48) / dpi) * 10000) / 10000;
  const toInY = py => Math.round((pageHin - ((py - miny + 48) / dpi)) * 10000) / 10000;
  const toInLen = len => Math.round((len / dpi) * 10000) / 10000;

  /* XML Headers */
  const XML_HDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  /* Content Types */
  const contentTypesXml = XML_HDR
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n`
    + `  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n`
    + `  <Default Extension="xml" ContentType="application/xml"/>\n`
    + `  <Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>\n`
    + `  <Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>\n`
    + `  <Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>\n`
    + `  <Override PartName="/visio/masters/masters.xml" ContentType="application/vnd.ms-visio.masters+xml"/>\n`
    + `  <Override PartName="/visio/windows.xml" ContentType="application/vnd.ms-visio.windows+xml"/>\n`
    + `</Types>`;

  /* Root Relationships */
  const rootRelsXml = XML_HDR
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n`
    + `  <Relationship Id="rId1" Type="http://schemas.microsoft.com/office/visio/2012/relationships/document" Target="visio/document.xml"/>\n`
    + `</Relationships>`;

  /* Visio Document */
  const docXml = XML_HDR
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

  /* Document Relationships */
  const docRelsXml = XML_HDR
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n`
    + `  <Relationship Id="rId1" Type="http://schemas.microsoft.com/office/visio/2012/relationships/pages" Target="pages/pages.xml"/>\n`
    + `  <Relationship Id="rId2" Type="http://schemas.microsoft.com/office/visio/2012/relationships/masters" Target="masters/masters.xml"/>\n`
    + `  <Relationship Id="rId3" Type="http://schemas.microsoft.com/office/visio/2012/relationships/windows" Target="windows.xml"/>\n`
    + `</Relationships>`;

  /* Pages Manifest */
  const pagesXml = XML_HDR
    + `<Pages xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n`
    + `  <Page ID="1" Name="Page-1" NameU="Page-1">\n`
    + `    <Rel r:id="rId1"/>\n`
    + `  </Page>\n`
    + `</Pages>`;

  /* Pages Relationships */
  const pagesRelsXml = XML_HDR
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n`
    + `  <Relationship Id="rId1" Type="http://schemas.microsoft.com/office/visio/2012/relationships/page" Target="page1.xml"/>\n`
    + `</Relationships>`;

  /* Masters Manifest */
  const mastersXml = XML_HDR
    + `<Masters xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>\n`;

  /* Windows View */
  const windowsXml = XML_HDR
    + `<Windows xmlns="http://schemas.microsoft.com/office/visio/2012/main">\n`
    + `  <Window ID="0" WindowType="Drawing" WindowWidth="1600" WindowHeight="1000" ViewScale="1" Page="1"/>\n`
    + `</Windows>`;

  /* Build Page 1 Diagram Shapes & Connectors */
  let shapesXml = "";
  let connectsXml = "";
  let nextShapeId = 1;
  const blockShapeMap = new Map();

  /* 1. Map Blocks to Native Visio Shapes */
  for (const b of blks) {
    const c = (typeof COMP !== "undefined" && COMP[b.type]) ? COMP[b.type] : {};
    const f = (typeof footprint === "function") ? footprint(b) : { w: 100, h: 60 };
    const shapeId = nextShapeId++;
    blockShapeMap.set(b.id, shapeId);

    const wIn = toInLen(f.w);
    const hIn = toInLen(f.h);
    const pinX = toInX(b.x + f.w / 2);
    const pinY = toInY(b.y + f.h / 2);
    const fillHex = vsdxColor(typeof blockFill === "function" ? blockFill(b) : "#ffffff");

    let textContent = "";
    if (c.isLabel) {
      textContent = vsdxEsc(b.params.text || "Label");
    } else {
      const lblName = b.params.label || c.name || b.type.toUpperCase();
      let paramStr = "";
      if (c.p1db && b.params.p1db != null) paramStr += `\nP1dB: ${b.params.p1db} dBm`;
      else if (c.gain && b.params.gain != null) paramStr += `\nGain: ${b.params.gain} dB`;
      else if (c.cl && b.params.cl != null) paramStr += `\nLoss: ${b.params.cl} dB`;
      else if (c.il && b.params.il != null) paramStr += `\nIL: ${b.params.il} dB`;
      else if (c.power && b.params.power != null) paramStr += `\nPwr: ${b.params.power} dBm`;
      textContent = `${vsdxEsc(lblName)}${vsdxEsc(paramStr)}`;
    }

    /* Primary Shape Cells (Visio 2013 OpenXML Cell Names: Width, Height, PinX, PinY, LocPinX, LocPinY, LineWeight, FillForegnd) */
    let shapeXml = `    <Shape ID="${shapeId}" NameU="${vsdxEsc(c.name || b.type)}" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">\n`
      + `      <Cell N="Width" V="${wIn}"/>\n`
      + `      <Cell N="Height" V="${hIn}"/>\n`
      + `      <Cell N="PinX" V="${pinX}"/>\n`
      + `      <Cell N="PinY" V="${pinY}"/>\n`
      + `      <Cell N="LocPinX" V="${wIn / 2}"/>\n`
      + `      <Cell N="LocPinY" V="${hIn / 2}"/>\n`
      + `      <Cell N="FillForegnd" V="${fillHex}"/>\n`
      + `      <Cell N="LineColor" V="#0f172a"/>\n`
      + `      <Cell N="LineWeight" V="0.02"/>\n`
      + `      <Cell N="Rounding" V="${c.isLabel ? 0 : 0.06}"/>\n`
      + `      <Section N="Geometry" IX="0">\n`
      + `        <Row T="MoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>\n`
      + `        <Row T="LineTo" IX="2"><Cell N="X" V="${wIn}"/><Cell N="Y" V="0"/></Row>\n`
      + `        <Row T="LineTo" IX="3"><Cell N="X" V="${wIn}"/><Cell N="Y" V="${hIn}"/></Row>\n`
      + `        <Row T="LineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="${hIn}"/></Row>\n`
      + `        <Row T="LineTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>\n`
      + `      </Section>\n`;

    /* Component Glyphs (Internal Symbol Geometry) */
    if (b.type === "amp" || b.type === "bamp") {
      const x1 = wIn * 0.2, y1 = hIn * 0.2, x2 = wIn * 0.8, y2 = hIn * 0.5, x3 = wIn * 0.2, y3 = hIn * 0.8;
      shapeXml += `      <Section N="Geometry" IX="1">\n`
        + `        <Cell N="NoFill" V="1"/>\n`
        + `        <Row T="MoveTo" IX="1"><Cell N="X" V="${x1}"/><Cell N="Y" V="${y1}"/></Row>\n`
        + `        <Row T="LineTo" IX="2"><Cell N="X" V="${x2}"/><Cell N="Y" V="${y2}"/></Row>\n`
        + `        <Row T="LineTo" IX="3"><Cell N="X" V="${x3}"/><Cell N="Y" V="${y3}"/></Row>\n`
        + `        <Row T="LineTo" IX="4"><Cell N="X" V="${x1}"/><Cell N="Y" V="${y1}"/></Row>\n`
        + `      </Section>\n`;
    } else if (b.type === "mixer") {
      const cx = wIn * 0.5, cy = hIn * 0.5, r = Math.min(wIn, hIn) * 0.3;
      shapeXml += `      <Section N="Geometry" IX="1">\n`
        + `        <Cell N="NoFill" V="1"/>\n`
        + `        <Row T="MoveTo" IX="1"><Cell N="X" V="${cx - r * 0.7}"/><Cell N="Y" V="${cy - r * 0.7}"/></Row>\n`
        + `        <Row T="LineTo" IX="2"><Cell N="X" V="${cx + r * 0.7}"/><Cell N="Y" V="${cy + r * 0.7}"/></Row>\n`
        + `        <Row T="MoveTo" IX="3"><Cell N="X" V="${cx - r * 0.7}"/><Cell N="Y" V="${cy + r * 0.7}"/></Row>\n`
        + `        <Row T="LineTo" IX="4"><Cell N="X" V="${cx + r * 0.7}"/><Cell N="Y" V="${cy - r * 0.7}"/></Row>\n`
        + `      </Section>\n`;
    }

    shapeXml += `      <Text><cp IX="0"/><pp IX="0"/>${textContent}</Text>\n`
      + `    </Shape>\n`;

    shapesXml += shapeXml;
  }

  /* 2. Map Connections to Native Visio Connectors & Indicator Pills */
  const ERS = [];
  for (const cn of cns) {
    const fb = (typeof findBlock === "function") ? findBlock(cn.from.block) : blks.find(b => b.id === cn.from.block);
    const tb = (typeof findBlock === "function") ? findBlock(cn.to.block) : blks.find(b => b.id === cn.to.block);
    if (!fb || !tb) continue;
    const a = (typeof portPt === "function") ? portPt(fb, cn.from.port) : { x: fb.x, y: fb.y };
    const z = (typeof portPt === "function") ? portPt(tb, cn.to.port) : { x: tb.x, y: tb.y };
    if (!a || !z) continue;
    const R = (typeof route === "function") ? route(a, z, cn) : { pts: [a, z], mx: (a.x + z.x) / 2, my: (a.y + z.y) / 2 };
    ERS.push({ cn, R, fb, tb, a, z });
  }

  for (const { cn, R, fb, tb, a, z } of ERS) {
    const connShapeId = nextShapeId++;
    const pts = R.pts || [];
    if (!pts.length) continue;

    const minPxX = Math.min(...pts.map(p => p.x));
    const maxPxX = Math.max(...pts.map(p => p.x));
    const minPxY = Math.min(...pts.map(p => p.y));
    const maxPxY = Math.max(...pts.map(p => p.y));

    const connW = Math.max(0.1, toInLen(maxPxX - minPxX));
    const connH = Math.max(0.1, toInLen(maxPxY - minPxY));
    const connPinX = toInX((minPxX + maxPxX) / 2);
    const connPinY = toInY((minPxY + maxPxY) / 2);

    let connXml = `    <Shape ID="${connShapeId}" NameU="Dynamic connector" Type="Shape" LineStyle="0" FillStyle="0">\n`
      + `      <Cell N="Width" V="${connW}"/>\n`
      + `      <Cell N="Height" V="${connH}"/>\n`
      + `      <Cell N="PinX" V="${connPinX}"/>\n`
      + `      <Cell N="PinY" V="${connPinY}"/>\n`
      + `      <Cell N="LocPinX" V="${connW / 2}"/>\n`
      + `      <Cell N="LocPinY" V="${connH / 2}"/>\n`
      + `      <Cell N="LineColor" V="#0f172a"/>\n`
      + `      <Cell N="LineWeight" V="0.023"/>\n`
      + `      <Cell N="EndArrow" V="4"/>\n`
      + `      <Section N="Geometry" IX="0">\n`;

    pts.forEach((p, idx) => {
      const relX = toInLen(p.x - minPxX);
      const relY = toInLen(maxPxY - p.y);
      if (idx === 0) {
        connXml += `        <Row T="MoveTo" IX="1"><Cell N="X" V="${relX}"/><Cell N="Y" V="${relY}"/></Row>\n`;
      } else {
        connXml += `        <Row T="LineTo" IX="${idx + 1}"><Cell N="X" V="${relX}"/><Cell N="Y" V="${relY}"/></Row>\n`;
      }
    });

    connXml += `      </Section>\n`
      + `    </Shape>\n`;

    shapesXml += connXml;

    /* Anchor Connects in Visio */
    const fromShapeId = blockShapeMap.get(fb.id);
    const toShapeId = blockShapeMap.get(tb.id);
    if (fromShapeId) {
      connectsXml += `    <Connect FromSheet="${connShapeId}" FromCell="BeginX" ToSheet="${fromShapeId}" ToCell="PinX"/>\n`;
    }
    if (toShapeId) {
      connectsXml += `    <Connect FromSheet="${connShapeId}" FromCell="EndX" ToSheet="${toShapeId}" ToCell="PinX"/>\n`;
    }

    /* Export Active Signal Wire Indicator Pills as Native Visio Shapes */
    if (typeof settings !== "undefined" && settings.showLabels !== false && !cn.hidePill) {
      const lv = P[key(cn.from.block, cn.from.port)];
      const nnObj = NFm ? NFm[key(cn.from.block, cn.from.port)] : undefined;
      const nfVal = (typeof nfDb === "function") ? nfDb(nnObj) : undefined;
      const srcLvl = (typeof startBlocks === "function" && startBlocks().length && typeof COMP !== "undefined" && typeof srcPorts === "function") ? P[key(startBlocks()[0].id, srcPorts(COMP[startBlocks()[0].type], startBlocks()[0].params)[0])] : 0;
      const bwHz = (settings.bandwidthHz && settings.bandwidthHz > 0) ? settings.bandwidthHz : 1e6;
      const nflVal = (nnObj && typeof computeNoiseFloor === "function") ? computeNoiseFloor(nnObj, lv, srcLvl, bwHz) : undefined;

      const indicators = [];
      const lvPrimary = (P && P[key(cn.from.block, cn.from.port)] !== undefined) ? P[key(cn.from.block, cn.from.port)] : lv;
      const lvSecondary = (PSecondary && PSecondary[key(cn.from.block, cn.from.port)] !== undefined) ? PSecondary[key(cn.from.block, cn.from.port)] : lv;
      if (settings.showNF === true && nfVal !== undefined && isFinite(nfVal)) indicators.push({ text: `NF ${fmt(nfVal)} dB`, pos: "above" });
      if (settings.showPwr1 !== false && lvPrimary !== undefined && isFinite(lvPrimary)) indicators.push({ text: dbm(lvPrimary), pos: "above" });
      if (settings.showPwr2 === true && lvSecondary !== undefined && isFinite(lvSecondary)) indicators.push({ text: dbm(lvSecondary), pos: "below" });
      if (settings.showNoiseFloor === true && nflVal !== undefined && isFinite(nflVal)) indicators.push({ text: dbm(nflVal), pos: "below" });

      if (indicators.length > 0) {
        const pX = R.mx || (a.x + z.x) / 2;
        const pY = R.my || (a.y + z.y) / 2;
        indicators.forEach((ind, i) => {
          const pillShapeId = nextShapeId++;
          const pillW = 0.85;
          const pillH = 0.22;
          const yOffPx = (ind.pos === "above" ? -1 : 1) * (14 + i * 22);
          const pillPinX = toInX(pX);
          const pillPinY = toInY(pY + yOffPx);

          shapesXml += `    <Shape ID="${pillShapeId}" NameU="IndicatorPill" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">\n`
            + `      <Cell N="Width" V="${pillW}"/>\n`
            + `      <Cell N="Height" V="${pillH}"/>\n`
            + `      <Cell N="PinX" V="${pillPinX}"/>\n`
            + `      <Cell N="PinY" V="${pillPinY}"/>\n`
            + `      <Cell N="LocPinX" V="${pillW / 2}"/>\n`
            + `      <Cell N="LocPinY" V="${pillH / 2}"/>\n`
            + `      <Cell N="FillForegnd" V="#ffffff"/>\n`
            + `      <Cell N="LineColor" V="#efd3a0"/>\n`
            + `      <Cell N="LineWeight" V="0.012"/>\n`
            + `      <Cell N="Rounding" V="0.05"/>\n`
            + `      <Section N="Geometry" IX="0">\n`
            + `        <Row T="MoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>\n`
            + `        <Row T="LineTo" IX="2"><Cell N="X" V="${pillW}"/><Cell N="Y" V="0"/></Row>\n`
            + `        <Row T="LineTo" IX="3"><Cell N="X" V="${pillW}"/><Cell N="Y" V="${pillH}"/></Row>\n`
            + `        <Row T="LineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="${pillH}"/></Row>\n`
            + `        <Row T="LineTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>\n`
            + `      </Section>\n`
            + `      <Text><cp IX="0"/><pp IX="0"/>${vsdxEsc(ind.text)}</Text>\n`
            + `    </Shape>\n`;
        });
      }
    }
  }

  /* Assemble Page 1 XML */
  const page1Xml = XML_HDR
    + `<PageContents xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n`
    + `  <PageSheet LineStyle="0" FillStyle="0" TextStyle="0">\n`
    + `    <Cell N="PageWidth" V="${pageWin}"/>\n`
    + `    <Cell N="PageHeight" V="${pageHin}"/>\n`
    + `  </PageSheet>\n`
    + `  <Shapes>\n`
    + shapesXml
    + `  </Shapes>\n`
    + `  <Connects>\n`
    + connectsXml
    + `  </Connects>\n`
    + `</PageContents>`;

  /* Pack OPC Zip Archive */
  if (typeof zipStore !== "function") {
    throw new Error("zipStore packager function is not available.");
  }

  const entries = [
    { name: "[Content_Types].xml", data: contentTypesXml },
    { name: "_rels/.rels", data: rootRelsXml },
    { name: "visio/document.xml", data: docXml },
    { name: "visio/_rels/document.xml.rels", data: docRelsXml },
    { name: "visio/pages/pages.xml", data: pagesXml },
    { name: "visio/pages/_rels/pages.xml.rels", data: pagesRelsXml },
    { name: "visio/pages/page1.xml", data: page1Xml },
    { name: "visio/masters/masters.xml", data: mastersXml },
    { name: "visio/windows.xml", data: windowsXml }
  ];

  const res = zipStore(entries);
  if (typeof Blob !== "undefined" && res instanceof Blob) return res;
  if (typeof Blob !== "undefined") return new Blob([res], { type: "application/vnd.ms-visio.drawing" });
  return res;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildVsdxBlob };
}

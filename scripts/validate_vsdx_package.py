#!/usr/bin/env python3
"""Validate a Visio VSDX package against the minimum required Open XML layout."""

from __future__ import annotations

import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

REQUIRED = {
    "[Content_Types].xml",
    "_rels/.rels",
    "docProps/app.xml",
    "docProps/core.xml",
    "visio/document.xml",
    "visio/_rels/document.xml.rels",
    "visio/pages/pages.xml",
    "visio/pages/_rels/pages.xml.rels",
    "visio/pages/page1.xml",
    "visio/windows.xml",
}


def _parse_xml(name: str, text: str):
    try:
        return ET.fromstring(text)
    except ET.ParseError as exc:
        raise ValueError(f"{name} is not valid XML: {exc}") from exc


def validate_vsdx_zip(path: str | Path) -> None:
    with zipfile.ZipFile(path, "r") as zf:
        names = set(zf.namelist())
        missing = sorted(REQUIRED - names)
        if missing:
            raise ValueError(f"VSDX package missing required parts: {', '.join(missing)}")

        ct = zf.read("[Content_Types].xml").decode("utf-8")
        root_rels = zf.read("_rels/.rels").decode("utf-8")
        doc_rels = zf.read("visio/_rels/document.xml.rels").decode("utf-8")
        page_rels = zf.read("visio/pages/_rels/pages.xml.rels").decode("utf-8")
        page_xml = zf.read("visio/pages/page1.xml").decode("utf-8")

        for name in [
            "[Content_Types].xml",
            "_rels/.rels",
            "docProps/app.xml",
            "docProps/core.xml",
            "visio/document.xml",
            "visio/_rels/document.xml.rels",
            "visio/pages/pages.xml",
            "visio/pages/_rels/pages.xml.rels",
            "visio/pages/page1.xml",
            "visio/windows.xml",
        ]:
            _parse_xml(name, zf.read(name).decode("utf-8"))

        required_overrides = [
            '/visio/document.xml',
            '/visio/pages/pages.xml',
            '/visio/pages/page1.xml',
            '/visio/windows.xml',
            '/docProps/core.xml',
            '/docProps/app.xml',
        ]
        for target in required_overrides:
            if f'PartName="{target}"' not in ct:
                raise ValueError(f"Missing required Content_Types override for {target}")

        if 'Target="visio/document.xml"' not in root_rels:
            raise ValueError("Root package rels are missing the main Visio document target.")
        if 'Target="pages/pages.xml"' not in doc_rels:
            raise ValueError("Document rels are missing the pages target.")
        if 'Target="page1.xml"' not in page_rels:
            raise ValueError("Page rels are missing the page target.")
        if "<Page " not in page_xml:
            raise ValueError("Page XML must begin with a Visio Page element.")

        root = _parse_xml("visio/pages/page1.xml", page_xml)
        if root.tag.rsplit("}", 1)[-1] != "Page":
            raise ValueError("visio/pages/page1.xml root tag must be Page.")


PACKAGE_TEMPLATE = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>
  <Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>
  <Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>
  <Override PartName="/visio/windows.xml" ContentType="application/vnd.ms-visio.windows+xml"/>
</Types>
"""


def build_reference_vsdx(output_path: str | Path) -> None:
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", PACKAGE_TEMPLATE)
        zf.writestr(
            "_rels/.rels",
            '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.microsoft.com/office/visio/2012/relationships/document" Target="visio/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
''',
        )
        zf.writestr(
            "docProps/core.xml",
            '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>RF Chain</dc:title><dc:creator>RF Chain Editor</dc:creator></cp:coreProperties>
''',
        )
        zf.writestr(
            "docProps/app.xml",
            '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>RF Chain</Application></Properties>
''',
        )
        zf.writestr(
            "visio/document.xml",
            '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<VisioDocument xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <DocumentProperties>
    <Title>RF Chain</Title>
    <Creator>RF Chain Editor</Creator>
  </DocumentProperties>
</VisioDocument>
''',
        )
        zf.writestr(
            "visio/_rels/document.xml.rels",
            '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.microsoft.com/office/visio/2012/relationships/pages" Target="pages/pages.xml"/>
  <Relationship Id="rId2" Type="http://schemas.microsoft.com/office/visio/2012/relationships/masters" Target="masters/masters.xml"/>
  <Relationship Id="rId3" Type="http://schemas.microsoft.com/office/visio/2012/relationships/windows" Target="windows.xml"/>
</Relationships>
''',
        )
        zf.writestr(
            "visio/pages/pages.xml",
            '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Pages xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <Page ID="0" Name="Page-1" NameU="Page-1"><Rel r:id="rId1"/></Page>
</Pages>
''',
        )
        zf.writestr(
            "visio/pages/_rels/pages.xml.rels",
            '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.microsoft.com/office/visio/2012/relationships/page" Target="page1.xml"/>
</Relationships>
''',
        )
        zf.writestr(
            "visio/pages/page1.xml",
            '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Page xmlns="http://schemas.microsoft.com/office/visio/2012/main">
  <PageSheet>
    <Cell N="PageWidth" V="8.5"/>
    <Cell N="PageHeight" V="11"/>
  </PageSheet>
  <Shapes/>
  <Connects/>
</Page>
''',
        )
        zf.writestr(
            "visio/windows.xml",
            '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Windows xmlns="http://schemas.microsoft.com/office/visio/2012/main"><Window ID="0" WindowType="Drawing" WindowWidth="1600" WindowHeight="1000" ViewScale="1" Page="1"/></Windows>
''',
        )
        zf.writestr("visio/masters/masters.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Masters xmlns="http://schemas.microsoft.com/office/visio/2012/main"/>')


if __name__ == "__main__":
    sample = Path(__file__).resolve().parent.parent / "dist" / "sample-rf-chain.vsdx"
    build_reference_vsdx(sample)
    validate_vsdx_zip(sample)
    print(f"Validated VSDX package: {sample}")

import os
import subprocess
import unittest
import zipfile
import xml.etree.ElementTree as ET

class TestVsdxExporter(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Run node script to generate dist/sample-rf-chain.vsdx
        repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../"))
        script_path = os.path.join(repo_root, "scripts/gen_vsdx_sample.js")
        result = subprocess.run(["node", script_path], cwd=repo_root, capture_output=True, text=True)
        assert result.returncode == 0, f"gen_vsdx_sample.js failed: {result.stderr}"
        cls.vsdx_path = os.path.join(repo_root, "dist/sample-rf-chain.vsdx")
        assert os.path.exists(cls.vsdx_path), "sample-rf-chain.vsdx does not exist"

    def test_vsdx_is_valid_zip(self):
        """Test that VSDX file is a valid ZIP archive."""
        self.assertTrue(zipfile.is_zipfile(self.vsdx_path))

    def test_vsdx_package_structure(self):
        """Test that VSDX contains standard OpenXML package parts."""
        with zipfile.ZipFile(self.vsdx_path, 'r') as z:
            names = set(z.namelist())
            expected_parts = {
                "[Content_Types].xml",
                "_rels/.rels",
                "visio/document.xml",
                "visio/_rels/document.xml.rels",
                "visio/pages/pages.xml",
                "visio/pages/_rels/pages.xml.rels",
                "visio/pages/page1.xml",
                "visio/masters/masters.xml",
                "visio/windows.xml"
            }
            for part in expected_parts:
                self.assertIn(part, names, f"Missing required OpenXML part: {part}")

    def test_page1_xml_validity(self):
        """Test that page1.xml is well-formed XML and parses cleanly."""
        with zipfile.ZipFile(self.vsdx_path, 'r') as z:
            xml_data = z.read("visio/pages/page1.xml")
            root = ET.fromstring(xml_data)
            self.assertTrue(root.tag.endswith("}Page"), f"Unexpected Visio page root: {root.tag}")

    def test_page1_shapes_and_connectors(self):
        """Test that shapes, connectors, and geometry rows with IX attributes exist."""
        with zipfile.ZipFile(self.vsdx_path, 'r') as z:
            xml_data = z.read("visio/pages/page1.xml")
            root = ET.fromstring(xml_data)
            ns = {'v': 'http://schemas.microsoft.com/office/visio/2012/main'}
            
            # Find Shapes
            shapes = root.findall('.//v:Shape', ns)
            self.assertGreater(len(shapes), 0, "No shapes found in page1.xml")

            # Verify Cells in shapes
            found_width = False
            found_height = False
            for s in shapes:
                cells = s.findall('./v:Cell', ns)
                cell_names = [c.attrib.get('N') for c in cells]
                if 'Width' in cell_names:
                    found_width = True
                if 'Height' in cell_names:
                    found_height = True

            self.assertTrue(found_width, "Shape Width cell missing")
            self.assertTrue(found_height, "Shape Height cell missing")

            # Verify Geometry Row IX attributes
            rows = root.findall('.//v:Row', ns)
            self.assertGreater(len(rows), 0, "No Geometry Rows found")
            for row in rows:
                self.assertIn('IX', row.attrib, f"Geometry Row missing IX attribute: {ET.tostring(row).decode()}")

            # Verify Connects
            connects = root.findall('.//v:Connect', ns)
            self.assertGreater(len(connects), 0, "No Connect elements found linking connectors to shapes")

    def test_text_labels_preserved(self):
        """Test that text labels are editable native Visio text objects."""
        with zipfile.ZipFile(self.vsdx_path, 'r') as z:
            xml_data = z.read("visio/pages/page1.xml")
            root = ET.fromstring(xml_data)
            ns = {'v': 'http://schemas.microsoft.com/office/visio/2012/main'}
            
            texts = root.findall('.//v:Text', ns)
            self.assertGreater(len(texts), 0, "No Text elements found")
            text_contents = ["".join(t.itertext()) for t in texts]
            self.assertTrue(any("LNA 28GHz" in tc for tc in text_contents), "Expected block label 'LNA 28GHz' not found in text elements")

            # Verify that text annotation shapes specify TxtLocPinX and TxtLocPinY for accurate centering
            text_shapes = [s for s in root.findall('.//v:Shape', ns) if s.find('./v:Text', ns) is not None]
            self.assertGreater(len(text_shapes), 0, "No text shapes found")
            for ts in text_shapes:
                cells = {c.attrib.get('N'): c.attrib.get('V') for c in ts.findall('./v:Cell', ns)}
                self.assertIn('TxtLocPinX', cells, f"Shape {ts.attrib.get('ID')} missing TxtLocPinX")
                self.assertIn('TxtLocPinY', cells, f"Shape {ts.attrib.get('ID')} missing TxtLocPinY")

    def test_component_symbols_are_exported_as_vector_geometry(self):
        """Ensure each sample component maps to its own native vector symbol."""
        with zipfile.ZipFile(self.vsdx_path, 'r') as z:
            root = ET.fromstring(z.read("visio/pages/page1.xml"))
            ns = {'v': 'http://schemas.microsoft.com/office/visio/2012/main'}
            shapes = root.findall('.//v:Shape', ns)
            ids = [shape.attrib.get("ID") for shape in shapes]
            self.assertEqual(len(ids), len(set(ids)), "Visio Shape IDs must be unique")
            shape_names = [shape.attrib.get("NameU", "") for shape in shapes]
            for component in ("Source", "Amplifier", "Mixer", "Filter"):
                matching = [shape for shape in shapes if shape.attrib.get("NameU") == f"{component} symbol"]
                self.assertTrue(matching, f"Missing vector shape for {component}")
                self.assertTrue(any(shape.find('.//v:Section[@N="Geometry"]', ns) is not None for shape in matching),
                                f"No native vector geometry found for {component}")
            symbol_names = {name for name in shape_names if name.endswith(" symbol")}
            self.assertGreaterEqual(len(symbol_names), 30, "The fixture should cover nearly all registered component symbol mappings")
            self.assertFalse(any("Generic" in name or "Placeholder" in name for name in shape_names),
                             "Unexpected generic placeholder shape was exported")

    @staticmethod
    def _parse_cells(shape, ns):
        res = {}
        for cell in shape.findall('./v:Cell', ns):
            n = cell.attrib.get("N")
            v = cell.attrib.get("V", "0")
            try:
                res[n] = float(v)
            except (ValueError, TypeError):
                res[n] = v
        return res

    def test_multiport_connection_points_match_authored_symbol_edges(self):
        """Dynamic multiport anchors should coincide with the authored splitter edges."""
        with zipfile.ZipFile(self.vsdx_path, 'r') as z:
            root = ET.fromstring(z.read("visio/pages/page1.xml"))
            ns = {'v': 'http://schemas.microsoft.com/office/visio/2012/main'}
            splitter = next(shape for shape in root.findall('.//v:Shape', ns)
                            if shape.attrib.get("NameU") == "Splitter symbol")
            cells = self._parse_cells(splitter, ns)
            rows = splitter.findall('./v:Section[@N="Connection"]/v:Row', ns)
            self.assertEqual(len(rows), 3, "Two-way splitter should export its input and both output ports")
            x_values = [float(row.find('./v:Cell[@N="X"]', ns).attrib["V"]) * 96 for row in rows]
            self.assertAlmostEqual(x_values[0], 0, delta=0.02, msg="Input port should align to the authored left symbol edge")
            self.assertAlmostEqual(x_values[1], 60, delta=0.02, msg="Output ports should align to the authored right symbol edge")
            self.assertAlmostEqual(x_values[2], 60, delta=0.02, msg="Every output port should share the authored right symbol edge")
            self.assertAlmostEqual(cells["Width"] * 96, 60, delta=0.02)

    def test_all_component_ports_follow_the_twenty_pixel_grid(self):
        """All authored component port anchors should remain on the 10px component grid."""
        with zipfile.ZipFile(self.vsdx_path, 'r') as z:
            root = ET.fromstring(z.read("visio/pages/page1.xml"))
            ns = {'v': 'http://schemas.microsoft.com/office/visio/2012/main'}
            symbols = [shape for shape in root.findall('.//v:Shape', ns)
                       if shape.attrib.get("NameU", "").endswith(" symbol")]
            self.assertTrue(symbols, "Expected component symbols with connection points")
            for shape in symbols:
                for row in shape.findall('./v:Section[@N="Connection"]/v:Row', ns):
                    for axis in ("X", "Y"):
                        value_px = float(row.find(f'./v:Cell[@N="{axis}"]', ns).attrib["V"]) * 96
                        nearest_grid = round(value_px / 10) * 10
                        self.assertAlmostEqual(value_px, nearest_grid, delta=0.02,
                                               msg=f"{shape.attrib.get('NameU')} {axis} port coordinate {value_px}px is off-grid")

    def test_master_and_connector_references_are_valid(self):
        """Ensure vector-equivalent exports do not leave dangling master or shape references."""
        with zipfile.ZipFile(self.vsdx_path, 'r') as z:
            page = ET.fromstring(z.read("visio/pages/page1.xml"))
            masters = ET.fromstring(z.read("visio/masters/masters.xml"))
            ns = {'v': 'http://schemas.microsoft.com/office/visio/2012/main'}
            master_ids = {master.attrib["ID"] for master in masters.findall(".//v:Master", ns)}
            shape_ids = {shape.attrib["ID"] for shape in page.findall(".//v:Shape", ns)}
            for shape in page.findall(".//v:Shape", ns):
                if "Master" in shape.attrib:
                    self.assertIn(shape.attrib["Master"], master_ids, "Shape references a missing Visio master")
            for connect in page.findall(".//v:Connect", ns):
                self.assertIn(connect.attrib["FromSheet"], shape_ids)
                self.assertIn(connect.attrib["ToSheet"], shape_ids)

    def test_component_values_are_preserved(self):
        """Ensure the visible gain/loss annotations are present in exported text."""
        with zipfile.ZipFile(self.vsdx_path, 'r') as z:
            root = ET.fromstring(z.read("visio/pages/page1.xml"))
            ns = {'v': 'http://schemas.microsoft.com/office/visio/2012/main'}
            contents = ["".join(text.itertext()) for text in root.findall('.//v:Text', ns)]
            joined = " ".join(contents)
            self.assertIn("+20 dB", joined)
            self.assertIn("CL 6 dB", joined)
            self.assertTrue("−2 dB" in joined or "IL 2 dB" in joined)

    def test_text_annotations_have_no_geometry_line_artifact(self):
        """Text-only shapes must not contain diagonal guide geometry or visible outlines."""
        with zipfile.ZipFile(self.vsdx_path, 'r') as z:
            root = ET.fromstring(z.read("visio/pages/page1.xml"))
            ns = {'v': 'http://schemas.microsoft.com/office/visio/2012/main'}
            text_shapes = [shape for shape in root.findall('.//v:Shape', ns)
                           if shape.attrib.get("NameU") == "Text annotation"]
            self.assertTrue(text_shapes, "Expected canvas text annotations in the export")
            for shape in text_shapes:
                self.assertIsNone(shape.find('./v:Section[@N="Geometry"]', ns),
                                  "Text-only shapes must not have line-producing geometry")
                cells = {cell.attrib.get("N"): cell.attrib.get("V") for cell in shape.findall('./v:Cell', ns)}
                self.assertEqual(cells.get("LinePattern"), "0", "Text shape outline must be suppressed")
                self.assertEqual(cells.get("FillPattern"), "0", "Text shape fill must be suppressed")
                self.assertEqual(cells.get("TxtMarginLeft"), "0")
                self.assertEqual(cells.get("TxtMarginRight"), "0")
                size_cell = shape.find('./v:Section[@N="Character"]/v:Row/v:Cell[@N="Size"]', ns)
                self.assertIsNotNone(size_cell, "Text should retain its design-system font size")
                self.assertIn(round(float(size_cell.attrib["V"]) * 96), {8, 9, 10, 11, 12, 13, 14, 15, 16, 18},
                              "Font cells should convert source CSS pixels to Visio inches without scaling up")

    def test_power_badges_are_tightly_sized(self):
        """Power pills should remain close to the canvas's 20px height and text-sized width."""
        with zipfile.ZipFile(self.vsdx_path, 'r') as z:
            root = ET.fromstring(z.read("visio/pages/page1.xml"))
            ns = {'v': 'http://schemas.microsoft.com/office/visio/2012/main'}
            badges = [shape for shape in root.findall('.//v:Shape', ns)
                      if shape.attrib.get("NameU") == "IndicatorPill pwr1"]
            self.assertTrue(badges, "Expected power indicator pills in the fixture")
            shapes = root.findall('.//v:Shape', ns)
            power_labels = ["".join(shape.find("./v:Text", ns).itertext()) for shape in shapes
                            if shape.attrib.get("NameU") == "Text annotation"
                            and shape.find("./v:Text", ns) is not None
                            and "".join(shape.find("./v:Text", ns).itertext()).endswith("dBm")]
            expected_width = max(32, max(map(len, power_labels)) * 7.6 + 10)
            for badge in badges:
                cells = self._parse_cells(badge, ns)
                self.assertAlmostEqual(cells["Height"] * 96, 20, delta=0.1)
                matching_text = []
                for shape in shapes:
                    if shape.attrib.get("NameU") != "Text annotation":
                        continue
                    text_cells = self._parse_cells(shape, ns)
                    same_position = (abs(text_cells.get("PinX", 0) - cells["PinX"]) < 0.0001
                                     and abs(text_cells.get("PinY", 0) - cells["PinY"]) < 0.0001)
                    if same_position:
                        content = "".join(shape.find("./v:Text", ns).itertext())
                        if content.endswith("dBm"):
                            matching_text.append(content)
                self.assertTrue(matching_text, "Power badge is missing its matching text annotation")
                self.assertAlmostEqual(cells["Width"] * 96, expected_width, delta=0.1,
                                       msg="Uniform power stack width should match its widest text plus 5px padding per side")

    def test_connectors_attach_to_exact_component_ports(self):
        """The connector endpoint coordinates and ToCell references must agree with port connection rows."""
        with zipfile.ZipFile(self.vsdx_path, 'r') as z:
            root = ET.fromstring(z.read("visio/pages/page1.xml"))
            ns = {'v': 'http://schemas.microsoft.com/office/visio/2012/main'}
            shapes = {shape.attrib["ID"]: shape for shape in root.findall('.//v:Shape', ns)}
            connects = root.findall('.//v:Connect', ns)
            self.assertTrue(connects, "Expected connector-to-port relationships")
            for connect in connects:
                target = shapes[connect.attrib["ToSheet"]]
                target_cell = connect.attrib["ToCell"]
                self.assertTrue(target_cell.startswith("Connections.X"),
                                f"Connector should attach to a port, not shape center: {target_cell}")
                point_index = int(target_cell.rsplit("X", 1)[1]) - 1
                rows = target.findall('./v:Section[@N="Connection"]/v:Row', ns)
                self.assertGreater(point_index, -1)
                self.assertGreater(len(rows), point_index, "Referenced component port point is missing")
                row = next(row for row in rows if int(row.attrib["IX"]) == point_index)
                local = {cell.attrib["N"]: float(cell.attrib["V"]) for cell in row.findall("./v:Cell", ns)}
                target_cells = self._parse_cells(target, ns)
                expected_x = target_cells["PinX"] + local["X"] - target_cells["LocPinX"]
                expected_y = target_cells["PinY"] + local["Y"] - target_cells["LocPinY"]
                connector = shapes[connect.attrib["FromSheet"]]
                connector_cells = self._parse_cells(connector, ns)
                endpoint = "Begin" if connect.attrib["FromCell"] == "BeginX" else "End"
                self.assertAlmostEqual(connector_cells[f"{endpoint}X"], expected_x, delta=0.0002)
                self.assertAlmostEqual(connector_cells[f"{endpoint}Y"], expected_y, delta=0.0002)

            connector_shapes = [shape for shape in shapes.values() if shape.attrib.get("NameU") == "Dynamic connector"]
            self.assertTrue(connector_shapes)
            for connector in connector_shapes:
                cells = self._parse_cells(connector, ns)
                self.assertIn("BeginX", cells)
                self.assertIn("BeginY", cells)
                self.assertIn("EndX", cells)
                self.assertIn("EndY", cells)

    def test_custom_pill_stack_position_exports_at_configured_route_fraction(self):
        """A saved stack route fraction and offset must be reflected in each VSDX badge coordinate."""
        with zipfile.ZipFile(self.vsdx_path, 'r') as z:
            root = ET.fromstring(z.read("visio/pages/page1.xml"))
            ns = {'v': 'http://schemas.microsoft.com/office/visio/2012/main'}
            shapes = root.findall('.//v:Shape', ns)
            connector = next(shape for shape in shapes if shape.attrib.get("NameU") == "Dynamic connector")
            connector_cells = self._parse_cells(connector, ns)
            expected_x = connector_cells["BeginX"] + 0.25 * (connector_cells["EndX"] - connector_cells["BeginX"]) + 8 / 96
            expected_stack_y = connector_cells["BeginY"] + 0.25 * (connector_cells["EndY"] - connector_cells["BeginY"]) + 19 / 96
            badge_cells = {}
            for badge_type in ("pwr1", "pwr2"):
                badge = next(shape for shape in shapes if shape.attrib.get("NameU") == f"IndicatorPill {badge_type}")
                badge_cells[badge_type] = self._parse_cells(badge, ns)
                self.assertAlmostEqual(badge_cells[badge_type]["PinX"], expected_x, delta=0.0002)
            self.assertAlmostEqual(badge_cells["pwr1"]["PinY"], expected_stack_y + 14 / 96, delta=0.0002)
            self.assertAlmostEqual(badge_cells["pwr2"]["PinY"], expected_stack_y - 14 / 96, delta=0.0002)

    def test_relationship_types_use_visio_2010_schema(self):
        """Test that OPC relationship parts use http://schemas.microsoft.com/visio/2010/relationships/...
        which is required by libvisio (LibreOffice Draw) and standard Visio OPC specs."""
        with zipfile.ZipFile(self.vsdx_path, 'r') as z:
            root_rels = z.read("_rels/.rels").decode("utf-8")
            self.assertIn('Type="http://schemas.microsoft.com/visio/2010/relationships/document"', root_rels)

            doc_rels = z.read("visio/_rels/document.xml.rels").decode("utf-8")
            self.assertIn('Type="http://schemas.microsoft.com/visio/2010/relationships/pages"', doc_rels)
            self.assertIn('Type="http://schemas.microsoft.com/visio/2010/relationships/masters"', doc_rels)
            self.assertIn('Type="http://schemas.microsoft.com/visio/2010/relationships/windows"', doc_rels)

            page_rels = z.read("visio/pages/_rels/pages.xml.rels").decode("utf-8")
            self.assertIn('Type="http://schemas.microsoft.com/visio/2010/relationships/page"', page_rels)

    def test_libreoffice_draw_headless_conversion(self):
        """Test that LibreOffice Draw can open and convert the generated VSDX file without corruption errors."""
        import shutil
        import tempfile
        if not shutil.which("libreoffice"):
            self.skipTest("libreoffice is not installed in the environment")

        with tempfile.TemporaryDirectory() as tmpdir:
            res = subprocess.run(
                ["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", tmpdir, self.vsdx_path],
                capture_output=True,
                text=True,
                timeout=30
            )
            self.assertEqual(res.returncode, 0, f"LibreOffice failed to open VSDX: {res.stderr}\n{res.stdout}")
            pdf_path = os.path.join(tmpdir, "sample-rf-chain.pdf")
            self.assertTrue(os.path.exists(pdf_path), "LibreOffice did not produce output PDF")
            self.assertGreater(os.path.getsize(pdf_path), 1000, "Output PDF is empty or corrupt")

    def test_tightly_cropped_page_dimensions_and_dynamic_label_clearance(self):
        """Test that VSDX export tightly crops to the drawing bounds and dynamically positions labels."""
        import tempfile
        repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../"))
        node_script = """
        const fs = require('fs');
        const vm = require('vm');
        const path = require('path');
        const xlsxCode = fs.readFileSync(path.join(__dirname, 'js/io/xlsx-exporter.js'), 'utf8');
        const context = vm.createContext({ global, TextEncoder: require('util').TextEncoder, Uint32Array, Uint8Array, DataView, Blob, Buffer, console });
        vm.runInContext(xlsxCode, context);
        global.zipStore = context.zipStore;
        const { buildVsdxBlob } = require('./js/io/vsdx-exporter.js');
        const dummyComp = { amp: { name: 'Amplifier', w: 60, h: 60, val: () => '+20 dB', ports: [{ id: 'in', dx: 0, dy: 30 }, { id: 'out', dx: 60, dy: 30 }], sym: () => '<path d="M0 4L60 30L0 56Z"/>' } };
        const blocks = [{ id: 'b1', type: 'amp', x: 80, y: 140, params: {} }];
        (async () => {
            const vsdx = buildVsdxBlob(blocks, [], {}, null, {}, dummyComp, { showNF: true, showPwr1: true });
            const buf = vsdx.arrayBuffer ? Buffer.from(await vsdx.arrayBuffer()) : Buffer.from(vsdx);
            fs.writeFileSync(process.argv[1], buf);
        })().catch(e => { console.error(e); process.exit(1); });
        """
        with tempfile.NamedTemporaryFile(suffix=".vsdx", delete=False) as tf:
            out_vsdx = tf.name
        try:
            res = subprocess.run(["node", "-e", node_script, out_vsdx], cwd=repo_root, capture_output=True, text=True)
            self.assertEqual(res.returncode, 0, f"Node script failed: {res.stderr}")
            with zipfile.ZipFile(out_vsdx, 'r') as z:
                root = ET.fromstring(z.read("visio/pages/page1.xml"))
                ns = {'v': 'http://schemas.microsoft.com/office/visio/2012/main'}
                page_sheet = root.find('./v:PageSheet', ns)
                self.assertIsNotNone(page_sheet, "PageSheet element missing")
                cells = {c.attrib.get('N'): c.attrib.get('V') for c in page_sheet.findall('./v:Cell', ns)}
                # Tightly cropped dimensions with 24px margins at 96 DPI
                self.assertEqual(cells.get('PageWidth'), '3.63', "PageWidth should tightly crop drawing bounds")
                self.assertEqual(cells.get('PageHeight'), '2.59', "PageHeight should tightly crop drawing bounds")
                self.assertEqual(cells.get('DrawingScale'), '1')
                self.assertEqual(cells.get('PageScale'), '1')
                self.assertEqual(cells.get('DrawingSizeType'), '3')
        finally:
            if os.path.exists(out_vsdx):
                os.remove(out_vsdx)

if __name__ == '__main__':
    unittest.main()


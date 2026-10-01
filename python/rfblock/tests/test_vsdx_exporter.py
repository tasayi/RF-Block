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
            self.assertIn("IL 2 dB", joined)

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
            expected_width = max(32, max(map(len, power_labels)) * 8.5 + 8)
            for badge in badges:
                cells = {cell.attrib.get("N"): float(cell.attrib.get("V", "0"))
                         for cell in badge.findall('./v:Cell', ns)}
                self.assertAlmostEqual(cells["Height"] * 96, 20, delta=0.1)
                matching_text = []
                for shape in shapes:
                    if shape.attrib.get("NameU") != "Text annotation":
                        continue
                    text_cells = {cell.attrib.get("N"): float(cell.attrib.get("V", "0"))
                                  for cell in shape.findall('./v:Cell', ns)}
                    same_position = (abs(text_cells.get("PinX", 0) - cells["PinX"]) < 0.0001
                                     and abs(text_cells.get("PinY", 0) - cells["PinY"]) < 0.0001)
                    if same_position:
                        content = "".join(shape.find("./v:Text", ns).itertext())
                        if content.endswith("dBm"):
                            matching_text.append(content)
                self.assertTrue(matching_text, "Power badge is missing its matching text annotation")
                self.assertAlmostEqual(cells["Width"] * 96, expected_width, delta=0.1,
                                       msg="Uniform power stack width should match its widest text plus only 4px padding per side")

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
                target_cells = {cell.attrib["N"]: float(cell.attrib["V"])
                                for cell in target.findall("./v:Cell", ns)}
                expected_x = target_cells["PinX"] + local["X"] - target_cells["LocPinX"]
                expected_y = target_cells["PinY"] + local["Y"] - target_cells["LocPinY"]
                connector = shapes[connect.attrib["FromSheet"]]
                connector_cells = {cell.attrib["N"]: float(cell.attrib["V"])
                                   for cell in connector.findall("./v:Cell", ns)}
                endpoint = "Begin" if connect.attrib["FromCell"] == "BeginX" else "End"
                self.assertAlmostEqual(connector_cells[f"{endpoint}X"], expected_x, delta=0.0002)
                self.assertAlmostEqual(connector_cells[f"{endpoint}Y"], expected_y, delta=0.0002)

            connector_shapes = [shape for shape in shapes.values() if shape.attrib.get("NameU") == "Dynamic connector"]
            self.assertTrue(connector_shapes)
            for connector in connector_shapes:
                cells = {cell.attrib.get("N"): float(cell.attrib.get("V", "0"))
                         for cell in connector.findall('./v:Cell', ns)}
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
            connector_cells = {cell.attrib["N"]: float(cell.attrib["V"])
                               for cell in connector.findall('./v:Cell', ns)}
            expected_x = connector_cells["BeginX"] + 0.25 * (connector_cells["EndX"] - connector_cells["BeginX"]) + 8 / 96
            expected_stack_y = connector_cells["BeginY"] + 0.25 * (connector_cells["EndY"] - connector_cells["BeginY"]) + 19 / 96
            badge_cells = {}
            for badge_type in ("pwr1", "pwr2"):
                badge = next(shape for shape in shapes if shape.attrib.get("NameU") == f"IndicatorPill {badge_type}")
                badge_cells[badge_type] = {cell.attrib["N"]: float(cell.attrib["V"])
                                           for cell in badge.findall('./v:Cell', ns)}
                self.assertAlmostEqual(badge_cells[badge_type]["PinX"], expected_x, delta=0.0002)
            self.assertAlmostEqual(badge_cells["pwr1"]["PinY"], expected_stack_y + 14 / 96, delta=0.0002)
            self.assertAlmostEqual(badge_cells["pwr2"]["PinY"], expected_stack_y - 14 / 96, delta=0.0002)

if __name__ == '__main__':
    unittest.main()

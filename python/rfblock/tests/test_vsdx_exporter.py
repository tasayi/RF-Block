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
            self.assertIn("PageContents", root.tag)

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

if __name__ == '__main__':
    unittest.main()

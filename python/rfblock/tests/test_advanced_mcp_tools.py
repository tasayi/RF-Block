import unittest
import os
import json
import tempfile
import shutil

from rfblock.physics.advanced_tools import (
    update_component_parameters,
    sweep_dynamic_range,
    optimize_chain_attenuation,
    export_touchstone
)
from rfblock.mcp.server import (
    rf_get_status,
    rf_update_component_params,
    rf_sweep_dynamic_range,
    rf_optimize_chain_attenuation,
    rf_export_touchstone
)


class TestAdvancedMCPTools(unittest.TestCase):
    def setUp(self):
        self.sample_file = "/home/satish/Documents/Work_ofc/BD/BD14.rfbd"
        self.assertTrue(os.path.exists(self.sample_file), "BD14.rfbd should exist")

        # Create temporary working copy for file update tests
        self.temp_dir = tempfile.mkdtemp()
        self.temp_file = os.path.join(self.temp_dir, "test_diagram.rfbd")
        shutil.copyfile(self.sample_file, self.temp_file)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_mcp_status_reports_new_features(self):
        status_raw = rf_get_status()
        status = json.loads(status_raw)
        self.assertEqual(status["version"], "2.3.0")
        self.assertIn("Multi-point dynamic range & P1dB bottleneck sweeping", status["supported_features"])
        self.assertIn("Goal-oriented automatic DSA & gain optimization", status["supported_features"])
        self.assertIn("Component parameter batch-updating and state switching", status["supported_features"])

    def test_update_component_parameters(self):
        updates = [
            {"id": "dsa23_3wq7", "params": {"attenuation": 10.0}},
            {"id": "bamp487_hszh", "params": {"mode": "Amp Mode"}}
        ]
        res = update_component_parameters(self.temp_file, updates, re_solve=True)
        self.assertTrue(res["success"])
        self.assertEqual(res["applied_count"], 2)

        # Verify on disk
        with open(self.temp_file) as f:
            bd = json.load(f)
        b_map = {}
        for sh in bd["sheets"]:
            for b in sh["blocks"]:
                b_map[b["id"]] = b

        dsa = b_map["dsa23_3wq7"]["params"]
        self.assertEqual(dsa["attenuation"], 10.0)
        self.assertEqual(dsa["loss"], dsa["intrinsicLoss"] + 10.0)
        self.assertEqual(b_map["bamp487_hszh"]["params"]["mode"], "Amp Mode")

    def test_sweep_dynamic_range(self):
        res = sweep_dynamic_range(
            file_path=self.temp_file,
            pin_start_dbm=-30.0,
            pin_stop_dbm=-10.0,
            step_db=10.0,
            monitor_ports=["custom68_djys·o1"]
        )
        self.assertIn("sweep_parameters", res)
        self.assertEqual(res["sweep_parameters"]["total_points"], 3)
        self.assertIn("custom68_djys·o1", res["channels"])
        points = res["points"]
        self.assertEqual(len(points), 3)
        self.assertEqual(points[0]["pin_dbm"], -30.0)
        self.assertEqual(points[2]["pin_dbm"], -10.0)

    def test_optimize_chain_attenuation(self):
        targets = {
            "custom68_djys·o1": [-45.0, -5.0],
            "custom69_as8a·o1": [-45.0, -5.0]
        }
        res = optimize_chain_attenuation(
            file_path=self.temp_file,
            targets=targets,
            apply_to_file=True
        )
        self.assertTrue(res["success"])
        self.assertTrue(res["all_targets_met"])
        for ch in res["channel_results"]:
            self.assertTrue(ch["compliant"])

    def test_export_touchstone(self):
        s2p_text = export_touchstone(
            file_path=self.temp_file,
            sheet_id="s14",
            start_freq_ghz=1.0,
            stop_freq_ghz=2.0,
            points=5
        )
        self.assertIn("# Hz S", s2p_text)
        self.assertIn("! Created with skrf", s2p_text)

    def test_mcp_wrappers(self):
        # Test tool wrappers return valid JSON
        res_sweep = rf_sweep_dynamic_range(
            file_path=self.temp_file,
            pin_start_dbm=-20.0,
            pin_stop_dbm=-10.0,
            step_db=10.0,
            monitor_ports=["custom68_djys·o1"]
        )
        parsed_sweep = json.loads(res_sweep)
        self.assertEqual(len(parsed_sweep["points"]), 2)

        s2p_raw = rf_export_touchstone(
            file_path=self.temp_file,
            sheet_id="s14",
            start_freq_ghz=1.0,
            stop_freq_ghz=2.0,
            points=3
        )
        self.assertTrue(s2p_raw.startswith("! Created with skrf") or "# Hz S" in s2p_raw)


if __name__ == "__main__":
    unittest.main()

"""
Unit tests for CanvasSolver (Single Source of Truth) and MultiSheetSolver parity.
"""

import unittest
import json
import os
from pathlib import Path
from rfblock.physics.canvas_solver import CanvasSolver, analyze_canvas_file
from rfblock.physics.multi_sheet_solver import MultiSheetSolver

BD14_PATH = "/home/satish/Documents/Work_ofc/BD/BD14.rfbd"

class TestCanvasSolver(unittest.TestCase):

    def setUp(self):
        self.skip_bd14 = not os.path.exists(BD14_PATH)
        if not self.skip_bd14:
            with open(BD14_PATH, "r", encoding="utf-8") as f:
                self.bd14_data = json.load(f)

    def test_canvas_solver_current_state(self):
        """Verify CanvasSolver on current BD14.rfbd state (High DR: Pin = +15 dBm, calibrated DSAs, bypassed amps)."""
        if self.skip_bd14:
            self.skipTest(f"File not found: {BD14_PATH}")

        solver = CanvasSolver(self.bd14_data, power_budget="primary")
        res = solver.analyze()
        self.assertIn("outputs", res)
        self.assertEqual(len(res["outputs"]), 4)

        out_map = {o["label"]: o for o in res["outputs"]}
        self.assertIn("CH_A", out_map)
        self.assertIn("CH_B", out_map)
        self.assertIn("CH_C", out_map)
        self.assertIn("CH_D", out_map)

        # Verified Canvas indicators on current BD14.rfbd:
        for lbl in ["CH_A", "CH_B", "CH_C", "CH_D"]:
            self.assertIsInstance(out_map[lbl]["output_power_dbm"], (int, float))
            self.assertIsInstance(out_map[lbl]["noise_figure_db"], (int, float))
            self.assertGreater(out_map[lbl]["noise_figure_db"], 0)

    def test_canvas_solver_uncalibrated_high_dr(self):
        """Verify CanvasSolver on uncalibrated High DR mode (Pin = +15 dBm, 0 dB DSA, LNAs in Bypass)."""
        bak_path = BD14_PATH + ".bak"
        if os.path.exists(bak_path):
            with open(bak_path, "r", encoding="utf-8") as f:
                base_data = json.load(f)
        elif not self.skip_bd14:
            base_data = self.bd14_data
        else:
            self.skipTest(f"File not found: {BD14_PATH}")

        import copy
        bd_hdr = copy.deepcopy(base_data)
        for sh in bd_hdr.get("sheets", []):
            for b in sh.get("blocks", []):
                if b.get("type") == "antenna":
                    b.setdefault("params", {})["primaryPower"] = 15.0
                    b.setdefault("params", {})["power"] = 15.0
                if b.get("type") == "bamp":
                    b.setdefault("params", {})["mode"] = "Bypass Mode"
                if b.get("type") == "dsa":
                    b.setdefault("params", {})["attenuation"] = 0.0
                    b["params"]["loss"] = b["params"].get("intrinsicLoss", 2.0)
                if b.get("type") == "switch" and b["id"] in ["switch88_fm78", "switch89_x613", "switch570_yvdt", "switch571_abn9", "switch613_hqdv", "switch614_9fn0"]:
                    b.setdefault("params", {})["state"] = "1"

        solver = CanvasSolver(bd_hdr, power_budget="primary")
        res = solver.analyze()
        out_map = {o["label"]: o for o in res["outputs"]}

        # Verified Canvas High DR indicators (P1dB compressed when amplifiers unbypassed):
        self.assertAlmostEqual(out_map["CH_A"]["output_power_dbm"], 5.00, places=1)
        self.assertAlmostEqual(out_map["CH_A"]["noise_figure_db"], 22.47, places=1)

        self.assertAlmostEqual(out_map["CH_B"]["output_power_dbm"], 3.50, places=1)
        self.assertAlmostEqual(out_map["CH_B"]["noise_figure_db"], 21.85, places=1)

        self.assertAlmostEqual(out_map["CH_C"]["output_power_dbm"], 1.00, places=1)
        self.assertAlmostEqual(out_map["CH_C"]["noise_figure_db"], 18.24, places=1)

        self.assertAlmostEqual(out_map["CH_D"]["output_power_dbm"], -2.00, places=1)
        self.assertAlmostEqual(out_map["CH_D"]["noise_figure_db"], 20.82, places=1)

    def test_canvas_and_python_parity(self):
        """Verify 100% parity between CanvasSolver and MultiSheetSolver."""
        if self.skip_bd14:
            self.skipTest(f"File not found: {BD14_PATH}")

        canvas_res = CanvasSolver(self.bd14_data, power_budget="primary").analyze()
        python_res = MultiSheetSolver(self.bd14_data, power_budget="primary").analyze()

        c_map = {o["label"]: o for o in canvas_res["outputs"]}
        p_map = {o["label"]: o for o in python_res["outputs"]}

        for lbl in ["CH_A", "CH_B", "CH_C", "CH_D"]:
            self.assertAlmostEqual(
                c_map[lbl]["output_power_dbm"],
                p_map[lbl]["output_power_dbm"],
                places=1,
                msg=f"Power mismatch on {lbl}"
            )
            self.assertAlmostEqual(
                c_map[lbl]["noise_figure_db"],
                p_map[lbl]["noise_figure_db"],
                places=1,
                msg=f"NF mismatch on {lbl}"
            )

if __name__ == "__main__":
    unittest.main()

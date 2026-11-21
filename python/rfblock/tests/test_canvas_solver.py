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

    def test_canvas_solver_baseline(self):
        """Verify CanvasSolver on BD14.rfbd baseline (Pin = -35 dBm)."""
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

        # Verified Canvas indicators:
        self.assertAlmostEqual(out_map["CH_A"]["output_power_dbm"], -10.41, places=1)
        self.assertAlmostEqual(out_map["CH_A"]["noise_figure_db"], 7.70, places=1)

        self.assertAlmostEqual(out_map["CH_B"]["output_power_dbm"], -5.06, places=1)
        self.assertAlmostEqual(out_map["CH_B"]["noise_figure_db"], 8.04, places=1)

        self.assertAlmostEqual(out_map["CH_C"]["output_power_dbm"], -4.76, places=1)
        self.assertAlmostEqual(out_map["CH_C"]["noise_figure_db"], 8.36, places=1)

        self.assertAlmostEqual(out_map["CH_D"]["output_power_dbm"], -4.56, places=1)
        self.assertAlmostEqual(out_map["CH_D"]["noise_figure_db"], 8.70, places=1)

    def test_canvas_solver_high_dr(self):
        """Verify CanvasSolver on High DR mode (Pin = +15 dBm, LNAs in Bypass)."""
        if self.skip_bd14:
            self.skipTest(f"File not found: {BD14_PATH}")

        import copy
        bd_hdr = copy.deepcopy(self.bd14_data)
        for sh in bd_hdr.get("sheets", []):
            for b in sh.get("blocks", []):
                if b.get("type") == "antenna":
                    b.setdefault("params", {})["primaryPower"] = 15.0
                    b.setdefault("params", {})["power"] = 15.0
                if b.get("type") == "bamp":
                    b.setdefault("params", {})["mode"] = "Bypass Mode"

        solver = CanvasSolver(bd_hdr, power_budget="primary")
        res = solver.analyze()
        out_map = {o["label"]: o for o in res["outputs"]}

        # Verified Canvas High DR indicators (P1dB compressed):
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

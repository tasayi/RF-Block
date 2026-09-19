"""
Unit tests for RFBlock path finder and S-parameter cascading engine.
"""

import unittest
import numpy as np
import skrf as rf
from rfblock.physics.path_finder import find_all_signal_paths, get_block_internal_connections
from rfblock.physics.cascade import analyze_schematic_cascade

class TestPhysicsEngine(unittest.TestCase):

    def test_spdt_path_discovery(self):
        """Test path discovery through SPDT switch into parallel channels."""
        schematic = {
            "blocks": [
                {"id": "src", "type": "source", "params": {"label": "RF Source"}},
                {"id": "sw1", "type": "switch", "params": {"label": "SPDT Switch", "throws": 2}},
                {"id": "amp1", "type": "amp", "params": {"label": "CH1 LNA", "gain": 15.0}},
                {"id": "amp2", "type": "amp", "params": {"label": "CH2 LNA", "gain": 20.0}},
                {"id": "out1", "type": "rfout", "params": {"label": "OUT1"}},
                {"id": "out2", "type": "rfout", "params": {"label": "OUT2"}},
            ],
            "conns": [
                {"from": {"block": "src", "port": "out"}, "to": {"block": "sw1", "port": "in"}},
                {"from": {"block": "sw1", "port": "o1"}, "to": {"block": "amp1", "port": "in"}},
                {"from": {"block": "sw1", "port": "o2"}, "to": {"block": "amp2", "port": "in"}},
                {"from": {"block": "amp1", "port": "out"}, "to": {"block": "out1", "port": "in"}},
                {"from": {"block": "amp2", "port": "out"}, "to": {"block": "out2", "port": "in"}},
            ]
        }

        paths = find_all_signal_paths(schematic)
        self.assertEqual(len(paths), 2)
        path_ids = [p["block_ids"] for p in paths]
        self.assertIn(["src", "sw1", "amp1", "out1"], path_ids)
        self.assertIn(["src", "sw1", "amp2", "out2"], path_ids)

    def test_cascade_analysis(self):
        """Test cascading calculations of S-parameters, Group Delay, and K-factor."""
        schematic = {
            "band": {"startFreq": 1.0, "stopFreq": 2.0, "startUnit": "GHz", "points": 11},
            "blocks": [
                {"id": "src", "type": "source", "params": {"label": "RF Source"}},
                {"id": "amp", "type": "amp", "params": {"label": "LNA", "gain": 10.0, "nf": 2.0, "oip3": 25.0, "s11": -60.0}},
                {"id": "att", "type": "attenuator", "params": {"label": "ATT", "atten": 3.0, "s11": -60.0}},
                {"id": "out", "type": "rfout", "params": {"label": "OUT"}},
            ],
            "conns": [
                {"from": {"block": "src", "port": "out"}, "to": {"block": "amp", "port": "in"}},
                {"from": {"block": "amp", "port": "out"}, "to": {"block": "att", "port": "in"}},
                {"from": {"block": "att", "port": "out"}, "to": {"block": "out", "port": "in"}},
            ]
        }

        res = analyze_schematic_cascade(schematic)
        self.assertEqual(res.get("status"), "success")
        self.assertEqual(len(res.get("paths", [])), 1)

        pdata = res["paths"][0]
        # Gain should be 10 dB - 3 dB = +7.0 dB with ideal match (-60 dB S11)
        s21_db = pdata["s21_db"]
        self.assertAlmostEqual(s21_db[0], 7.0, places=1)
        self.assertIn("touchstone_s2p", res)
        self.assertIn("group_delay_ns", pdata)
        self.assertIn("k_factor", pdata)

if __name__ == "__main__":
    unittest.main()


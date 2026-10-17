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

    def test_switch_bank_bidirectional_paths(self):
        """Test discovering multiple paths through a switch bank (demux SW1 -> branches -> mux SW2 -> OUT)."""
        schematic = {
            "blocks": [
                {"id": "src", "type": "source", "params": {"label": "RF Source"}},
                {"id": "sw1", "type": "switch", "params": {"label": "SW1", "throws": 2, "state": "1"}},
                {"id": "amp", "type": "amp", "params": {"label": "CH1 AMP", "gain": 15.0}},
                {"id": "att", "type": "attenuator", "params": {"label": "CH2 ATT", "atten": 6.0}},
                {"id": "sw2", "type": "switch", "params": {"label": "SW2", "throws": 2, "state": "1"}},
                {"id": "out", "type": "rfout", "params": {"label": "OUT"}},
            ],
            "conns": [
                {"from": {"block": "src", "port": "out"}, "to": {"block": "sw1", "port": "in"}},
                {"from": {"block": "sw1", "port": "o1"}, "to": {"block": "amp", "port": "in"}},
                {"from": {"block": "amp", "port": "out"}, "to": {"block": "sw2", "port": "o1"}},
                {"from": {"block": "sw1", "port": "o2"}, "to": {"block": "att", "port": "in"}},
                {"from": {"block": "att", "port": "out"}, "to": {"block": "sw2", "port": "o2"}},
                {"from": {"block": "sw2", "port": "in"}, "to": {"block": "out", "port": "in"}},
            ]
        }
        paths = find_all_signal_paths(schematic)
        self.assertEqual(len(paths), 2)
        path_ids = [p["block_ids"] for p in paths]
        self.assertIn(["src", "sw1", "amp", "sw2", "out"], path_ids)
        self.assertIn(["src", "sw1", "att", "sw2", "out"], path_ids)

        # Path 1 is active, Path 2 is inactive
        self.assertTrue(paths[0]["is_active"])
        self.assertFalse(paths[1]["is_active"])

    def test_splitter_with_reversed_wiring(self):
        """Test that signal path splitting finds all branches even if wires are dragged in reverse order."""
        schematic = {
            "blocks": [
                {"id": "src", "type": "source", "params": {"label": "RF Source"}},
                {"id": "sp", "type": "splitter", "params": {"label": "Splitter", "ways": 2}},
                {"id": "amp1", "type": "amp", "params": {"label": "Branch 1 Amp", "gain": 12.0}},
                {"id": "amp2", "type": "amp", "params": {"label": "Branch 2 Amp", "gain": 16.0}},
                {"id": "out1", "type": "rfout", "params": {"label": "OUT 1"}},
                {"id": "out2", "type": "rfout", "params": {"label": "OUT 2"}},
            ],
            "conns": [
                {"from": {"block": "src", "port": "out"}, "to": {"block": "sp", "port": "in"}},
                {"from": {"block": "sp", "port": "o1"}, "to": {"block": "amp1", "port": "in"}},
                {"from": {"block": "amp2", "port": "in"}, "to": {"block": "sp", "port": "o2"}},  # Reverse wire
                {"from": {"block": "amp1", "port": "out"}, "to": {"block": "out1", "port": "in"}},
                {"from": {"block": "out2", "port": "in"}, "to": {"block": "amp2", "port": "out"}},  # Reverse wire
            ]
        }
        paths = find_all_signal_paths(schematic)
        self.assertEqual(len(paths), 2)
        path_ids = [p["block_ids"] for p in paths]
        self.assertIn(["src", "sp", "amp1", "out1"], path_ids)
        self.assertIn(["src", "sp", "amp2", "out2"], path_ids)

    def test_direct_wire_fanout_split(self):
        """Test splitting paths directly via multiple wires leaving a single output port."""
        schematic = {
            "blocks": [
                {"id": "src", "type": "source", "params": {"label": "RF Source"}},
                {"id": "amp1", "type": "amp", "params": {"label": "Amp 1"}},
                {"id": "amp2", "type": "amp", "params": {"label": "Amp 2"}},
                {"id": "out1", "type": "rfout", "params": {"label": "OUT 1"}},
                {"id": "out2", "type": "rfout", "params": {"label": "OUT 2"}},
            ],
            "conns": [
                {"from": {"block": "src", "port": "out"}, "to": {"block": "amp1", "port": "in"}},
                {"from": {"block": "src", "port": "out"}, "to": {"block": "amp2", "port": "in"}},
                {"from": {"block": "amp1", "port": "out"}, "to": {"block": "out1", "port": "in"}},
                {"from": {"block": "amp2", "port": "out"}, "to": {"block": "out2", "port": "in"}},
            ]
        }
        paths = find_all_signal_paths(schematic)
        self.assertEqual(len(paths), 2)
        path_ids = [p["block_ids"] for p in paths]
        self.assertIn(["src", "amp1", "out1"], path_ids)
        self.assertIn(["src", "amp2", "out2"], path_ids)

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

    def test_split_and_combine_constructive_and_destructive(self):
        """Test true multi-port vector wave superposition in split-and-combine topologies."""
        # 1. In-phase constructive interference (0 dB excess loss -> ~ 0 dB net gain)
        schematic_constructive = {
            "band": {"startFreq": 1.0, "stopFreq": 2.0, "startUnit": "GHz", "points": 3},
            "blocks": [
                {"id": "src", "type": "source", "params": {"label": "Source"}},
                {"id": "spl", "type": "splitter", "params": {"ways": 2, "exloss": 0.0, "s11": -60.0}},
                {"id": "pad1", "type": "attenuator", "params": {"atten": 0.0, "s11": -60.0}},
                {"id": "pad2", "type": "attenuator", "params": {"atten": 0.0, "s11": -60.0}},
                {"id": "cmb", "type": "combiner", "params": {"ways": 2, "exloss": 0.0, "s11": -60.0}},
                {"id": "out", "type": "rfout", "params": {"label": "Out"}}
            ],
            "conns": [
                {"from": {"block": "src", "port": "out"}, "to": {"block": "spl", "port": "in"}},
                {"from": {"block": "spl", "port": "o1"}, "to": {"block": "pad1", "port": "in"}},
                {"from": {"block": "spl", "port": "o2"}, "to": {"block": "pad2", "port": "in"}},
                {"from": {"block": "pad1", "port": "out"}, "to": {"block": "cmb", "port": "i1"}},
                {"from": {"block": "pad2", "port": "out"}, "to": {"block": "cmb", "port": "i2"}},
                {"from": {"block": "cmb", "port": "out"}, "to": {"block": "out", "port": "in"}},
            ]
        }
        res_c = analyze_schematic_cascade(schematic_constructive)
        self.assertEqual(res_c.get("status"), "success")
        s21_c = res_c["matrix"]["S21"][0]
        self.assertAlmostEqual(s21_c, 0.0, delta=0.1)

        # 2. Out-of-phase destructive interference with 180° phase shifter in arm 2
        schematic_destructive = {
            "band": {"startFreq": 1.0, "stopFreq": 2.0, "startUnit": "GHz", "points": 3},
            "blocks": [
                {"id": "src", "type": "source", "params": {"label": "Source"}},
                {"id": "spl", "type": "splitter", "params": {"ways": 2, "exloss": 0.0, "s11": -60.0}},
                {"id": "pad1", "type": "attenuator", "params": {"atten": 0.0, "s11": -60.0}},
                {"id": "ps", "type": "phase", "params": {"phase": 180.0, "il": 0.0, "s11": -60.0}},
                {"id": "cmb", "type": "combiner", "params": {"ways": 2, "exloss": 0.0, "s11": -60.0}},
                {"id": "out", "type": "rfout", "params": {"label": "Out"}}
            ],
            "conns": [
                {"from": {"block": "src", "port": "out"}, "to": {"block": "spl", "port": "in"}},
                {"from": {"block": "spl", "port": "o1"}, "to": {"block": "pad1", "port": "in"}},
                {"from": {"block": "spl", "port": "o2"}, "to": {"block": "ps", "port": "in"}},
                {"from": {"block": "pad1", "port": "out"}, "to": {"block": "cmb", "port": "i1"}},
                {"from": {"block": "ps", "port": "out"}, "to": {"block": "cmb", "port": "i2"}},
                {"from": {"block": "cmb", "port": "out"}, "to": {"block": "out", "port": "in"}},
            ]
        }
        res_d = analyze_schematic_cascade(schematic_destructive)
        self.assertEqual(res_d.get("status"), "success")
        s21_d = res_d["matrix"]["S21"][0]
        # Destructive cancellation should be at least -60 dB down
        self.assertLess(s21_d, -60.0)

    def test_isolator_cascade_non_reciprocal(self):
        """Test that an isolator block provides low forward insertion loss and high reverse isolation."""
        schematic = {
            "band": {"startFreq": 1.0, "stopFreq": 2.0, "startUnit": "GHz", "points": 3},
            "blocks": [
                {"id": "src", "type": "source", "params": {"label": "Source"}},
                {"id": "iso", "type": "isolator", "params": {"label": "Isolator", "il": 0.4, "iso": 35.0}},
                {"id": "out", "type": "rfout", "params": {"label": "Out"}}
            ],
            "conns": [
                {"from": {"block": "src", "port": "out"}, "to": {"block": "iso", "port": "in"}},
                {"from": {"block": "iso", "port": "out"}, "to": {"block": "out", "port": "in"}},
            ]
        }
        res = analyze_schematic_cascade(schematic)
        self.assertEqual(res.get("status"), "success")
        p0 = res["paths"][0]
        # Forward transmission ~ -0.4 dB
        self.assertAlmostEqual(p0["s21_db"][0], -0.4, places=1)
        # Reverse transmission ~ -35.0 dB
        self.assertAlmostEqual(p0["s12_db"][0], -35.0, places=1)
        self.assertNotEqual(p0["s21_db"][0], p0["s12_db"][0])

    def test_touchstone_out_of_bounds_extrapolation(self):
        """Test that Touchstone data defined over 2.0-3.0 GHz extrapolates gracefully to 1.0-4.0 GHz."""
        s2p_data = """# GHz S DB R 50
2.0  -20 0  12 0  -30 0  -20 0
3.0  -20 0  10 0  -30 0  -20 0
"""
        schematic = {
            "band": {"startFreq": 1.0, "stopFreq": 4.0, "startUnit": "GHz", "points": 4},
            "blocks": [
                {"id": "src", "type": "source", "params": {"label": "Source"}},
                {"id": "amp", "type": "amp", "params": {"label": "Amp", "s2pData": s2p_data}},
                {"id": "out", "type": "rfout", "params": {"label": "Out"}}
            ],
            "conns": [
                {"from": {"block": "src", "port": "out"}, "to": {"block": "amp", "port": "in"}},
                {"from": {"block": "amp", "port": "out"}, "to": {"block": "out", "port": "in"}},
            ]
        }
        # Should not raise any extrapolation or out-of-bounds error
        res = analyze_schematic_cascade(schematic)
        self.assertEqual(res.get("status"), "success")
        self.assertEqual(len(res["paths"][0]["s21_db"]), 4)


if __name__ == "__main__":
    unittest.main()


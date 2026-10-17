"""
Unit tests for the physical Pi-attenuator network synthesizer and behavioral S-parameter models.
"""

import unittest
import numpy as np
import skrf as rf
from rfblock.physics.synthesizer import calculate_pi_resistors, synthesize_pi_network
from rfblock.physics.network_builder import build_block_network, extract_component_loss_db
from rfblock.physics.cascade import analyze_schematic_cascade


class TestPiNetworkSynthesizer(unittest.TestCase):

    def test_calculate_pi_resistors_zero_loss(self):
        """0 dB loss corresponds to infinite shunt and zero series resistance (thru wire)."""
        r_shunt, r_series = calculate_pi_resistors(0.0, z0=50.0)
        self.assertTrue(np.isinf(r_shunt))
        self.assertEqual(r_series, 0.0)

    def test_calculate_pi_resistors_standard_values(self):
        """Verify Pi-pad resistor calculations against standard RF engineering handbooks."""
        # 3 dB Pad: R_shunt ~ 292.4 Ohm, R_series ~ 17.61 Ohm
        r_sh3, r_se3 = calculate_pi_resistors(3.0, z0=50.0)
        self.assertAlmostEqual(r_sh3, 292.4, delta=0.5)
        self.assertAlmostEqual(r_se3, 17.61, delta=0.5)

        # 6 dB Pad: R_shunt ~ 150.5 Ohm, R_series ~ 37.35 Ohm
        r_sh6, r_se6 = calculate_pi_resistors(6.0, z0=50.0)
        self.assertAlmostEqual(r_sh6, 150.5, delta=0.5)
        self.assertAlmostEqual(r_se6, 37.35, delta=0.5)

        # 10 dB Pad: R_shunt ~ 96.25 Ohm, R_series ~ 71.15 Ohm
        r_sh10, r_se10 = calculate_pi_resistors(10.0, z0=50.0)
        self.assertAlmostEqual(r_sh10, 96.25, delta=0.5)
        self.assertAlmostEqual(r_se10, 71.15, delta=0.5)

        # 20 dB Pad: R_shunt ~ 61.11 Ohm, R_series ~ 247.5 Ohm
        r_sh20, r_se20 = calculate_pi_resistors(20.0, z0=50.0)
        self.assertAlmostEqual(r_sh20, 61.11, delta=0.5)
        self.assertAlmostEqual(r_se20, 247.5, delta=0.5)

    def test_synthesize_pi_network_s_parameters(self):
        """Verify synthesized 2-port network S-parameter values and passivity."""
        freq = rf.Frequency(start=1.0, stop=2.0, npoints=11, unit="ghz")
        net = synthesize_pi_network(loss_db=10.0, freq=freq, z0=50.0, return_loss_db=-20.0)

        # S21 should be exactly -10 dB across band
        s21_db = net.s21.s_db.flatten()
        for v in s21_db:
            self.assertAlmostEqual(v, -10.0, places=2)

        # Reciprocity: S12 == S21
        s12_db = net.s12.s_db.flatten()
        for v in s12_db:
            self.assertAlmostEqual(v, -10.0, places=2)

        # Return loss: S11 ~ -20 dB
        s11_db = net.s11.s_db.flatten()
        for v in s11_db:
            self.assertAlmostEqual(v, -20.0, places=2)

        # Passivity constraint: |S11|^2 + |S21|^2 <= 1.0
        passivity = (np.abs(net.s[:, 0, 0]) ** 2) + (np.abs(net.s[:, 1, 0]) ** 2)
        self.assertTrue(np.all(passivity <= 1.000001))

    def test_cascade_two_pi_pads(self):
        """Cascading a 3 dB Pi-pad into a 6 dB Pi-pad yields exactly 9 dB total loss."""
        freq = rf.Frequency(start=1.0, stop=2.0, npoints=5, unit="ghz")
        net1 = synthesize_pi_network(loss_db=3.0, freq=freq, z0=50.0)
        net2 = synthesize_pi_network(loss_db=6.0, freq=freq, z0=50.0)

        cascaded = net1 ** net2
        s21_db = cascaded.s21.s_db.flatten()
        for v in s21_db:
            self.assertAlmostEqual(v, -9.0, places=2)

    def test_port_aware_loss_extraction(self):
        """Test that different ports on switches, couplers, and splitters produce correct loss."""
        # Switch in state 1
        sw_block = {"type": "switch", "params": {"state": "1", "il": 0.8, "iso": 45.0}}
        self.assertEqual(extract_component_loss_db(sw_block, in_port="in", out_port="o1"), 0.8)
        self.assertEqual(extract_component_loss_db(sw_block, in_port="in", out_port="o2"), 45.0)

        # Directional Coupler
        cpl_block = {"type": "coupler", "params": {"ctype": "Directional", "il": 0.5, "cpl": 16.0, "directivity": 20.0}}
        self.assertEqual(extract_component_loss_db(cpl_block, in_port="in", out_port="thru"), 0.5)
        self.assertEqual(extract_component_loss_db(cpl_block, in_port="in", out_port="cpl"), 16.0)
        self.assertEqual(extract_component_loss_db(cpl_block, in_port="in", out_port="iso"), 36.0)

        # Splitter 4-way
        spl_block = {"type": "splitter", "params": {"ways": 4, "exloss": 0.4}}
        # 10*log10(4) + 0.4 = 6.02 + 0.4 = 6.42 dB
        self.assertAlmostEqual(extract_component_loss_db(spl_block, in_port="in", out_port="o1"), 6.42, delta=0.01)

    def test_schematic_cascade_with_coupler_and_switch(self):
        """Full schematic cascade test with directional coupler thru vs cpl arms."""
        schematic = {
            "band": {"startFreq": 1.0, "stopFreq": 2.0, "startUnit": "GHz", "points": 5},
            "blocks": [
                {"id": "src", "type": "source", "params": {"label": "Source"}},
                {"id": "cpl", "type": "coupler", "params": {"label": "Coupler", "ctype": "Directional", "il": 0.5, "cpl": 20.0}},
                {"id": "thru_out", "type": "rfout", "params": {"label": "Thru Out"}},
                {"id": "cpl_out", "type": "rfout", "params": {"label": "Cpl Out"}},
            ],
            "conns": [
                {"from": {"block": "src", "port": "out"}, "to": {"block": "cpl", "port": "in"}},
                {"from": {"block": "cpl", "port": "thru"}, "to": {"block": "thru_out", "port": "in"}},
                {"from": {"block": "cpl", "port": "cpl"}, "to": {"block": "cpl_out", "port": "in"}},
            ]
        }
        res = analyze_schematic_cascade(schematic)
        self.assertEqual(res.get("status"), "success")
        self.assertEqual(len(res.get("paths", [])), 2)

        # Find thru path and cpl path
        paths = res["paths"]
        thru_path = next(p for p in paths if "thru_out" in p["block_ids"])
        cpl_path = next(p for p in paths if "cpl_out" in p["block_ids"])

        # Thru path loss should be ~ -0.5 dB
        self.assertAlmostEqual(thru_path["s21_db"][0], -0.5, places=1)
        # Cpl path loss should be ~ -20.0 dB
        self.assertAlmostEqual(cpl_path["s21_db"][0], -20.0, places=1)

    def test_touchstone_amp_and_atten_cascade(self):
        """
        Verify that cascading an amplifier with attached .s2p and an attenuator with attached .s2p
        correctly produces non-reciprocal S21 (gain) and S12 (isolation) rather than identical values.
        """
        amp_s2p = """# GHz S DB R 50
1.0  -20 0  15 0  -35 0  -18 0
2.0  -20 0  15 0  -35 0  -18 0
"""
        att_s2p = """# GHz S DB R 50
1.0  -30 0  -6 0  -6 0  -30 0
2.0  -30 0  -6 0  -6 0  -30 0
"""
        schematic = {
            "band": {"startFreq": 1.0, "stopFreq": 2.0, "startUnit": "GHz", "points": 3},
            "blocks": [
                {"id": "src", "type": "source", "params": {"label": "Source"}},
                {"id": "amp", "type": "amp", "params": {"label": "LNA", "s2pData": amp_s2p}},
                {"id": "att", "type": "attenuator", "params": {"label": "Pad", "s2pData": att_s2p}},
                {"id": "out", "type": "rfout", "params": {"label": "Out"}},
            ],
            "conns": [
                {"from": {"block": "src", "port": "out"}, "to": {"block": "amp", "port": "in"}},
                {"from": {"block": "amp", "port": "out"}, "to": {"block": "att", "port": "in"}},
                {"from": {"block": "att", "port": "out"}, "to": {"block": "out", "port": "in"}},
            ]
        }
        res = analyze_schematic_cascade(schematic)
        self.assertEqual(res.get("status"), "success")
        p0 = res["paths"][0]

        # S21 should be ~ +15 - 6 = +9.0 dB
        s21 = p0["s21_db"][0]
        # S12 should be ~ -35 - 6 = -41.0 dB
        s12 = p0["s12_db"][0]

        self.assertAlmostEqual(s21, 9.0, places=1)
        self.assertAlmostEqual(s12, -41.0, places=1)
        # S21 and S12 MUST NOT be equal!
        self.assertNotEqual(s21, s12)
        self.assertGreater(s21, s12)


    def test_synthesize_switch_behavioral_network(self):
        """Test behavioral 3-port switch synthesis and port extraction."""
        from rfblock.physics.synthesizer import synthesize_switch_network, extract_subnetwork_2port
        freq = rf.Frequency(1.0, 2.0, 3, "ghz")

        # Switch at state 1
        sw1 = synthesize_switch_network(throws=2, state=1, il_db=0.6, iso_db=42.0, freq=freq)
        self.assertEqual(sw1.nports, 3)

        # Port 0 (in) to Port 1 (o1) -> IL (0.6 dB)
        thru_net = extract_subnetwork_2port(sw1, 0, 1)
        self.assertAlmostEqual(thru_net.s21.s_db.flatten()[0], -0.6, places=1)

        # Port 0 (in) to Port 2 (o2) -> ISO (42.0 dB)
        iso_net = extract_subnetwork_2port(sw1, 0, 2)
        self.assertAlmostEqual(iso_net.s21.s_db.flatten()[0], -42.0, places=1)

        # Now switch shifted to state 2
        sw2 = synthesize_switch_network(throws=2, state=2, il_db=0.6, iso_db=42.0, freq=freq)
        thru_net2 = extract_subnetwork_2port(sw2, 0, 2)
        iso_net2 = extract_subnetwork_2port(sw2, 0, 1)
        self.assertAlmostEqual(thru_net2.s21.s_db.flatten()[0], -0.6, places=1)
        self.assertAlmostEqual(iso_net2.s21.s_db.flatten()[0], -42.0, places=1)

    def test_switch_state_shift_in_schematic_cascade(self):
        """
        Test that when an SPDT switch state shifts from 1 to 2,
        the transmission through Path 1 and Path 2 inverts between IL and ISO.
        """
        def make_circuit(sw_state):
            return {
                "band": {"startFreq": 1.0, "stopFreq": 2.0, "startUnit": "GHz", "points": 3},
                "blocks": [
                    {"id": "src", "type": "source", "params": {"label": "Source"}},
                    {"id": "sw", "type": "switch", "params": {"label": "SPDT", "throws": 2, "state": str(sw_state), "il": 0.5, "iso": 40.0}},
                    {"id": "pad1", "type": "attenuator", "params": {"label": "Pad1", "atten": 10.0}},
                    {"id": "pad2", "type": "attenuator", "params": {"label": "Pad2", "atten": 20.0}},
                    {"id": "out1", "type": "rfout", "params": {"label": "Out1"}},
                    {"id": "out2", "type": "rfout", "params": {"label": "Out2"}},
                ],
                "conns": [
                    {"from": {"block": "src", "port": "out"}, "to": {"block": "sw", "port": "in"}},
                    {"from": {"block": "sw", "port": "o1"}, "to": {"block": "pad1", "port": "in"}},
                    {"from": {"block": "pad1", "port": "out"}, "to": {"block": "out1", "port": "in"}},
                    {"from": {"block": "sw", "port": "o2"}, "to": {"block": "pad2", "port": "in"}},
                    {"from": {"block": "pad2", "port": "out"}, "to": {"block": "out2", "port": "in"}},
                ]
            }

        # Case A: Switch at state 1
        res_st1 = analyze_schematic_cascade(make_circuit(1))
        p1_st1 = next(p for p in res_st1["paths"] if "out1" in p["block_ids"])
        p2_st1 = next(p for p in res_st1["paths"] if "out2" in p["block_ids"])

        # Path 1 is active: 0.5 (IL) + 10 (Pad1) = ~ -10.5 dB (accounting for -20 dB mismatch interaction)
        self.assertAlmostEqual(p1_st1["s21_db"][0], -10.5, delta=0.2)
        self.assertTrue(p1_st1["is_active"])
        # Path 2 is isolated: 40.0 (ISO) + 20 (Pad2) = ~ -60.0 dB
        self.assertAlmostEqual(p2_st1["s21_db"][0], -60.0, delta=0.2)
        self.assertFalse(p2_st1["is_active"])

        # Case B: Switch shifted to state 2
        res_st2 = analyze_schematic_cascade(make_circuit(2))
        p1_st2 = next(p for p in res_st2["paths"] if "out1" in p["block_ids"])
        p2_st2 = next(p for p in res_st2["paths"] if "out2" in p["block_ids"])

        # Path 1 is now isolated: 40.0 (ISO) + 10 (Pad1) = ~ -50.0 dB
        self.assertAlmostEqual(p1_st2["s21_db"][0], -50.0, delta=0.2)
        self.assertFalse(p1_st2["is_active"])
        # Path 2 is now active: 0.5 (IL) + 20 (Pad2) = ~ -20.5 dB
        self.assertAlmostEqual(p2_st2["s21_db"][0], -20.5, delta=0.2)
        self.assertTrue(p2_st2["is_active"])


if __name__ == "__main__":
    unittest.main()



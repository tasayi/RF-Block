"""
Unit tests for RFBlock AI Agent Integration (MCP, REST API, Physics Budget, Copilot Manifests).
"""

import unittest
from fastapi.testclient import TestClient

from rfblock.api.app import create_app
from rfblock.physics.budget import calculate_cascade_budget
from rfblock.mcp.server import (
    mcp,
    rf_get_status,
    rf_calculate_cascade,
    rf_synthesize_chain,
    rf_solve_sparams
)

class TestAIAgentIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.client = TestClient(cls.app)

    def test_calculate_cascade_budget_physics(self):
        """Verify Friis noise figure and cascade gain calculations."""
        stages = [
            {"name": "LNA", "type": "lna", "gain": 15.0, "nf": 1.5, "oip3": 25.0},
            {"name": "Filter", "type": "bpf", "gain": -2.0, "nf": 2.0},
            {"name": "Mixer", "type": "mixer", "gain": -6.0, "nf": 7.0, "oip3": 18.0},
            {"name": "IF Amp", "type": "amp", "gain": 20.0, "nf": 4.0, "oip3": 30.0}
        ]
        res = calculate_cascade_budget(stages, input_power_dbm=-60.0, bandwidth_hz=1e6)
        
        self.assertEqual(res["total_gain_db"], 27.0)
        self.assertAlmostEqual(res["output_power_dbm"], -33.0, places=1)
        self.assertGreater(res["total_nf_db"], 1.5)
        self.assertLess(res["total_nf_db"], 3.5)
        self.assertIsNotNone(res["oip3_dbm"])
        self.assertEqual(len(res["stages"]), 4)

    def test_agent_status_endpoint(self):
        """Verify GET /api/v1/agent/status."""
        response = self.client.get("/api/v1/agent/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "online")
        self.assertIn("rf_cascade_budget", data["capabilities"])

    def test_agent_cascade_endpoint(self):
        """Verify POST /api/v1/agent/cascade."""
        payload = {
            "stages": [
                {"name": "LNA", "type": "lna", "gain": 18.0, "nf": 1.8, "oip3": 25.0},
                {"name": "BPF", "type": "bpf", "gain": -1.5, "nf": 1.5}
            ],
            "input_power_dbm": -50.0,
            "bandwidth_mhz": 20.0
        }
        response = self.client.post("/api/v1/agent/cascade", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total_gain_db"], 16.5)
        self.assertAlmostEqual(data["output_power_dbm"], -33.5, places=1)

    def test_agent_synthesize_endpoint(self):
        """Verify POST /api/v1/agent/synthesize."""
        payload = {
            "architecture": "receiver",
            "center_freq_ghz": 2.4,
            "bandwidth_mhz": 20.0,
            "target_gain_db": 30.0,
            "target_nf_db": 3.0,
            "broadcast_to_canvas": False
        }
        response = self.client.post("/api/v1/agent/synthesize", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("schematic", data)
        self.assertIn("budget", data)
        self.assertGreaterEqual(len(data["schematic"]["blocks"]), 5)

    def test_copilot_manifest_endpoints(self):
        """Verify Copilot and ChatGPT OpenAPI manifest routes."""
        resp_yaml = self.client.get("/copilot/openapi.yaml")
        self.assertEqual(resp_yaml.status_code, 200)
        self.assertIn("openapi:", resp_yaml.text)

        resp_json = self.client.get("/copilot/ai-plugin.json")
        self.assertEqual(resp_json.status_code, 200)
        self.assertEqual(resp_json.json()["name_for_model"], "rfblock")

        resp_wellknown = self.client.get("/.well-known/ai-plugin.json")
        self.assertEqual(resp_wellknown.status_code, 200)

    def test_mcp_server_tools(self):
        """Verify MCP server tool registration and output."""
        tool_names = [t.name for t in mcp._tool_manager.list_tools()]
        self.assertIn("rf_get_status", tool_names)
        self.assertIn("rf_calculate_cascade", tool_names)
        self.assertIn("rf_synthesize_chain", tool_names)
        self.assertIn("rf_solve_sparams", tool_names)
        self.assertIn("rf_send_canvas_action", tool_names)

        # Execute MCP tools directly
        status_json = rf_get_status()
        self.assertIn("RFBlock", status_json)

        stages = [{"name": "Amp", "gain": 10.0, "nf": 2.0}]
        cascade_json = rf_calculate_cascade(stages=stages)
        self.assertIn("total_gain_db", cascade_json)

if __name__ == "__main__":
    unittest.main()

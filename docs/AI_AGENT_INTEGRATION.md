# RFBlock AI Agent Integration Guide
### Model Context Protocol (MCP) • Microsoft 365 Copilot • ChatGPT • Gemini • Local LLMs

RFBlock provides an AI integration layer that exposes its RF physics solvers, Friis cascade budget calculator, scikit-rf S-parameter matrix engine, and live schematic synthesis to modern AI agents.

---

## 🏛️ Architecture Overview

```
                        ┌──────────────────────────────────────────────────┐
                        │              AI AGENT INTERFACES                 │
                        └──────────────────────────────────────────────────┘
                                 │                           │
                   [Cloud: M365 Copilot / GPT]         [Local: MCP / Cursor]
                                 │                           │
                       HTTPS (Azure Dev Tunnel)          stdio / SSE
                                 │                           │
                                 ▼                           ▼
                        ┌──────────────────┐       ┌──────────────────┐
                        │ OpenAPI REST API │       │  FastMCP Server  │
                        │ (FastAPI App)    │◄──────│ (python/rfblock) │
                        └──────────────────┘       └──────────────────┘
                                 │
                                 ├───────────────────────────────┐
                                 ▼                               ▼
                      ┌──────────────────────┐        ┌──────────────────────┐
                      │  RF Physics Solvers  │        │   WebSocket Bridge   │
                      │ (scikit-rf / Budget) │        │ (Live Canvas Updates)│
                      └──────────────────────┘        └──────────────────────┘
                                                                 │
                                                                 ▼
                                                      ┌──────────────────────┐
                                                      │    RFBlock Web UI    │
                                                      │  (Browser / Desktop) │
                                                      └──────────────────────┘
```

1. **Local AI Agents (Claude Desktop, Cursor, Antigravity)** communicate via the **Model Context Protocol (MCP)** using standard `stdio` or HTTP `SSE`.
2. **Cloud AI Agents (Microsoft 365 Copilot, Custom GPTs)** communicate via standard **OpenAPI 3.0 REST endpoints** and the M365 Copilot plugin manifest (`copilot/ai-plugin.json` and `copilot/declarativeAgent.json`).
3. **Live Canvas Sync**: Changes made by any AI agent (e.g., adding an amplifier, tuning gain, or synthesizing a receiver) are pushed in real time to the user's active browser canvas over WebSockets (`/ws/canvas`).

---

## ⚡ 1. Local MCP Setup (Claude Desktop, Cursor, Antigravity)

RFBlock includes a native Python MCP server powered by the official Model Context Protocol SDK.

### Running the MCP Server
```bash
# Direct CLI execution (stdio mode)
uv run rfblock-mcp

# Or via Python module
uv run python -m rfblock.mcp

# Or over HTTP SSE transport (port 8001)
uv run python -m rfblock.mcp --transport sse --port 8001
```

### Claude Desktop Configuration
Add the following to your `claude_desktop_config.json`:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "rfblock": {
      "command": "uv",
      "args": [
        "run",
        "--directory",
        "/absolute/path/to/RFBlock",
        "rfblock-mcp"
      ]
    }
  }
}
```

### Cursor & Antigravity MCP Configuration
In your Cursor / Antigravity MCP Settings:
- **Name**: `rfblock`
- **Type**: `command`
- **Command**: `uv run --directory /path/to/RFBlock python -m rfblock.mcp`

---

## 🏢 2. Microsoft 365 Copilot Setup

Microsoft 365 Copilot connects to external systems using **Declarative Agents** and **API Plugins** conforming to the OpenAPI 3.0 standard.

### Step 1: Start the Local RFBlock Engine
```bash
uv run uvicorn rfblock.api.app:create_app --host 0.0.0.0 --port 8000
```

### Step 2: Bridge Localhost to Microsoft Cloud
Because M365 Copilot runs in Microsoft Azure, it cannot directly reach `http://localhost:8000` without a secure tunnel. Use **Azure Dev Tunnels** (recommended) or **Cloudflare Tunnel**:

```bash
# Using Microsoft Dev Tunnels (free, secure)
devtunnel host -p 8000 --allow-anonymous

# OR using Cloudflare Tunnel
cloudflared tunnel --url http://localhost:8000
```
Note the public HTTPS URL (e.g. `https://abc-8000.devtunnels.ms`).

### Step 3: Register in Microsoft Copilot Studio / Teams Developer Portal
1. Open [`copilot/openapi.yaml`](file:///home/satish/Documents/Code/core/RFBlock/copilot/openapi.yaml) and replace `http://localhost:8000` with your tunnel URL.
2. In **Microsoft Copilot Studio** or **Teams Developer Portal**:
   - Create a new **Declarative Agent** or **Custom Plugin**.
   - Import `copilot/ai-plugin.json` and `copilot/openapi.yaml`.
3. In Word, Excel, or Teams, invoke Copilot:
   > *"@RFBlock synthesize a 2.4 GHz WiFi receiver chain with 30 dB gain and NF < 2.5 dB, and compute the cascade budget table."*

---

## 🤖 3. ChatGPT (Custom GPT Actions) & Gemini Setup

1. In ChatGPT, navigate to **My GPTs** -> **Create a GPT** -> **Configure** -> **Actions** -> **Create new action**.
2. Under **Schema**, paste the contents of [`copilot/openapi.yaml`](file:///home/satish/Documents/Code/core/RFBlock/copilot/openapi.yaml) (or import from `https://<your-tunnel-url>/copilot/openapi.yaml`).
3. Set **Authentication** to `None`.
4. ChatGPT can now directly execute RF calculations, synthesize schematics, and simulate S-parameters.

---

## 🐍 4. Local LLMs (Ollama / LangChain / Python)

Local LLMs can directly call the REST API without any external dependencies:

```python
import requests

# 1. Calculate Friis Cascade Budget
payload = {
    "stages": [
        {"name": "LNA", "gain": 18.0, "nf": 1.5, "oip3": 25.0},
        {"name": "BPF", "gain": -2.0, "nf": 2.0},
        {"name": "Mixer", "gain": -6.5, "nf": 7.0, "oip3": 16.0},
        {"name": "IF Amp", "gain": 20.0, "nf": 4.0, "oip3": 30.0}
    ],
    "input_power_dbm": -60.0,
    "bandwidth_mhz": 20.0
}
res = requests.post("http://localhost:8000/api/v1/agent/cascade", json=payload).json()
print(f"Total Gain: {res['total_gain_db']} dB")
print(f"Total NF: {res['total_nf_db']} dB")
print(f"Cascade OIP3: {res['oip3_dbm']} dBm")

# 2. Synthesize an RF Receiver and push it live to open browser canvas
synth_payload = {
    "architecture": "receiver",
    "center_freq_ghz": 5.8,
    "bandwidth_mhz": 40.0,
    "target_gain_db": 35.0,
    "target_nf_db": 2.5,
    "broadcast_to_canvas": True
}
requests.post("http://localhost:8000/api/v1/agent/synthesize", json=synth_payload)
```

---

## 🛠️ Complete Tool & REST API Reference

| Tool Name (MCP) | REST Endpoint | Purpose |
| :--- | :--- | :--- |
| `rf_get_status` | `GET /api/v1/agent/status` | Returns engine health, active UI connections, and supported features. |
| `rf_calculate_cascade` | `POST /api/v1/agent/cascade` | Calculates Friis cascade noise figure, gain, OIP3, OP1dB, and noise floor. |
| `rf_synthesize_chain` | `POST /api/v1/agent/synthesize` | Synthesizes a receiver/transmitter chain and optionally pushes to open canvas. |
| `rf_solve_sparams` | `POST /api/v1/agent/sparams` | Runs scikit-rf multi-port linear S-parameter matrix simulation over frequency. |
| `rf_send_canvas_action` | `POST /api/v1/agent/broadcast` | Sends live commands (`LOAD_SCHEMATIC`, `ADD_BLOCK`, `SHOW_NOTIFICATION`) to open browser/desktop window. |

---

## 💡 Example Prompt Templates

- **Receiver Design**:
  > *"Design a 10 GHz satellite receiver chain with 32 dB total gain and noise figure under 2 dB. Calculate the cascade budget and stream the circuit to my RFBlock canvas."*
- **Budget Optimization**:
  > *"I have a 3-stage chain: LNA (16 dB gain, 1.3 dB NF), Attenuator (3 dB loss), and Mixer (6 dB loss, 15 dBm OIP3). What is my total cascade noise figure and output IP3?"*
- **S-Parameter Simulation**:
  > *"Simulate the S-parameters from 1 GHz to 10 GHz for the active schematic and tell me the insertion loss and return loss at 5 GHz."*

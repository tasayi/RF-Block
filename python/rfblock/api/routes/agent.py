"""
AI Agent Integration REST Router.
Provides high-level endpoints for MCP agents, Microsoft 365 Copilot, ChatGPT, and local LLMs.
"""

from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .ws import manager as ws_manager
from ...physics.budget import calculate_cascade_budget
from ...physics.cascade import analyze_schematic_cascade
from ..schemas.schematic import SchematicPayload

router = APIRouter(prefix="/agent", tags=["AI Agent Integration"])

# --- Request / Response Models ---

class StageModel(BaseModel):
    name: str = Field(description="Stage component name / label, e.g. 'LNA', 'BPF'")
    type: str = Field(default="amp", description="Component type: 'amp', 'filter', 'atten', 'mixer'")
    gain: float = Field(default=0.0, description="Stage gain in dB (negative for loss)")
    nf: float = Field(default=0.0, ge=0.0, description="Stage noise figure in dB")
    oip3: Optional[float] = Field(default=None, description="Stage output IP3 in dBm")
    op1db: Optional[float] = Field(default=None, description="Stage output 1dB compression in dBm")

class CascadeRequest(BaseModel):
    stages: List[StageModel] = Field(description="List of RF stages in cascade sequence")
    input_power_dbm: float = Field(default=-50.0, description="Input power level in dBm")
    bandwidth_mhz: float = Field(default=1.0, gt=0.0, description="Channel noise bandwidth in MHz")
    temperature_k: float = Field(default=290.0, gt=0.0, description="Ambient temperature in Kelvin")

class SynthesisRequest(BaseModel):
    architecture: str = Field(default="receiver", description="Chain architecture: 'receiver', 'transmitter', 'custom'")
    center_freq_ghz: float = Field(default=2.4, gt=0.0, description="RF center operating frequency in GHz")
    bandwidth_mhz: float = Field(default=20.0, gt=0.0, description="Signal channel bandwidth in MHz")
    target_gain_db: float = Field(default=30.0, description="Target overall gain in dB")
    target_nf_db: float = Field(default=3.0, gt=0.0, description="Target maximum noise figure in dB")
    broadcast_to_canvas: bool = Field(default=False, description="Whether to automatically push the new chain to open Web UI")

class BroadcastRequest(BaseModel):
    action: str = Field(description="Action type: 'ADD_BLOCK', 'UPDATE_PARAMS', 'LOAD_SCHEMATIC', 'SHOW_NOTIFICATION'")
    payload: Dict[str, Any] = Field(description="Action payload data")


# --- Endpoint Implementations ---

@router.get("/status")
async def get_agent_status():
    """Returns agent connection status, physics engine availability, and active UI sessions."""
    return {
        "status": "online",
        "engine": "RFBlock scikit-rf Physics & Cascade Engine",
        "version": "2.2.0",
        "active_ui_clients": len(ws_manager.active_connections),
        "capabilities": [
            "rf_cascade_budget",
            "rf_sparams_simulation",
            "rf_chain_synthesis",
            "live_canvas_sync",
            "mcp_stdio_sse",
            "m365_copilot_openapi"
        ]
    }


@router.post("/cascade")
async def calculate_cascade(request: CascadeRequest):
    """
    Computes Friis noise figure, cumulative gain, OIP3, OP1dB, and dynamic range for a cascade of RF stages.
    """
    try:
        raw_stages = [s.model_dump() for s in request.stages]
        result = calculate_cascade_budget(
            stages=raw_stages,
            input_power_dbm=request.input_power_dbm,
            bandwidth_hz=request.bandwidth_mhz * 1.0e6,
            temperature_k=request.temperature_k
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cascade calculation error: {str(e)}")


@router.post("/synthesize")
async def synthesize_chain(request: SynthesisRequest):
    """
    Synthesizes an RF schematic block diagram chain based on frequency, gain, and noise figure specifications.
    Optionally pushes the synthesized diagram to the live open UI canvas.
    """
    try:
        freq = request.center_freq_ghz
        bw = request.bandwidth_mhz
        gain = request.target_gain_db
        nf = request.target_nf_db

        blocks = []
        conns = []
        x_cursor = 100
        y_center = 200
        x_spacing = 180

        if request.architecture.lower() == "receiver":
            # 1. Antenna
            blocks.append({
                "id": "ant_1", "type": "ant", "x": x_cursor, "y": y_center,
                "params": {"label": "Antenna", "freq": freq, "funit": "GHz"}
            })
            x_cursor += x_spacing

            # 2. Pre-Select Bandpass Filter
            blocks.append({
                "id": "bpf_1", "type": "bpf", "x": x_cursor, "y": y_center,
                "params": {"label": f"BPF {freq}G", "f0": freq, "bw": bw, "funit": "GHz", "order": 3, "loss": 1.5}
            })
            conns.append({"from": {"block": "ant_1", "port": "out"}, "to": {"block": "bpf_1", "port": "in"}})
            x_cursor += x_spacing

            # 3. Low Noise Amplifier
            lna_gain = min(20.0, gain * 0.6)
            blocks.append({
                "id": "lna_1", "type": "lna", "x": x_cursor, "y": y_center,
                "params": {"label": "LNA", "gain": lna_gain, "nf": min(nf, 1.8), "oip3": 25.0, "op1db": 12.0}
            })
            conns.append({"from": {"block": "bpf_1", "port": "out"}, "to": {"block": "lna_1", "port": "in"}})
            x_cursor += x_spacing

            # 4. Mixer / Downconverter
            blocks.append({
                "id": "mix_1", "type": "mixer", "x": x_cursor, "y": y_center,
                "params": {"label": "Downconverter", "loss": 6.5, "nf": 7.0, "oip3": 18.0}
            })
            conns.append({"from": {"block": "lna_1", "port": "out"}, "to": {"block": "mix_1", "port": "rf"}})

            # Local Oscillator for Mixer
            lo_freq = round(freq - 0.14, 3) if freq > 0.14 else round(freq * 0.8, 3)
            blocks.append({
                "id": "lo_1", "type": "lo", "x": x_cursor, "y": y_center + 120,
                "params": {"label": f"LO {lo_freq}G", "freq": lo_freq, "funit": "GHz", "pwr": 7.0}
            })
            conns.append({"from": {"block": "lo_1", "port": "out"}, "to": {"block": "mix_1", "port": "lo"}})
            x_cursor += x_spacing

            # 5. IF Amplifier
            rem_gain = max(5.0, gain - lna_gain + 6.5 + 1.5)
            blocks.append({
                "id": "amp_if", "type": "amp", "x": x_cursor, "y": y_center,
                "params": {"label": "IF Amp", "gain": rem_gain, "nf": 4.0, "oip3": 32.0, "op1db": 20.0}
            })
            conns.append({"from": {"block": "mix_1", "port": "if"}, "to": {"block": "amp_if", "port": "in"}})
            x_cursor += x_spacing

            # 6. Baseband / ADC Terminal
            blocks.append({
                "id": "term_out", "type": "rfout", "x": x_cursor, "y": y_center,
                "params": {"label": "To ADC / Baseband", "z0": 50}
            })
            conns.append({"from": {"block": "amp_if", "port": "out"}, "to": {"block": "term_out", "port": "in"}})

        else:
            # Generic Transmitter / Custom Chain
            blocks.append({"id": "src_1", "type": "source", "x": x_cursor, "y": y_center, "params": {"label": "DAC / Modulator", "pwr": -10.0}})
            x_cursor += x_spacing
            blocks.append({"id": "pa_1", "type": "pa", "x": x_cursor, "y": y_center, "params": {"label": "Driver PA", "gain": gain, "nf": 5.0, "oip3": 40.0, "op1db": 30.0}})
            conns.append({"from": {"block": "src_1", "port": "out"}, "to": {"block": "pa_1", "port": "in"}})
            x_cursor += x_spacing
            blocks.append({"id": "ant_tx", "type": "ant", "x": x_cursor, "y": y_center, "params": {"label": "Tx Antenna", "freq": freq, "funit": "GHz"}})
            conns.append({"from": {"block": "pa_1", "port": "out"}, "to": {"block": "ant_tx", "port": "in"}})

        schematic_data = {
            "name": f"Synthesized {request.architecture.title()} ({freq} GHz)",
            "blocks": blocks,
            "conns": conns
        }

        # Calculate budget for synthesized chain
        budget_stages = []
        for b in blocks:
            btype = b["type"]
            p = b.get("params", {})
            if btype in ("lna", "amp", "pa"):
                budget_stages.append({"name": p.get("label", btype), "type": btype, "gain": float(p.get("gain", 10.0)), "nf": float(p.get("nf", 2.0)), "oip3": p.get("oip3")})
            elif btype in ("bpf", "lpf", "hpf"):
                loss = float(p.get("loss", 1.5))
                budget_stages.append({"name": p.get("label", btype), "type": btype, "gain": -loss, "nf": loss})
            elif btype == "mixer":
                loss = float(p.get("loss", 6.5))
                budget_stages.append({"name": p.get("label", btype), "type": btype, "gain": -loss, "nf": float(p.get("nf", loss)), "oip3": p.get("oip3")})

        budget_summary = calculate_cascade_budget(budget_stages, input_power_dbm=-60.0)

        # Broadcast live to open UI if requested
        if request.broadcast_to_canvas and ws_manager.active_connections:
            await ws_manager.broadcast({
                "type": "LOAD_SCHEMATIC",
                "data": schematic_data
            })
            await ws_manager.broadcast({
                "type": "SHOW_NOTIFICATION",
                "message": f"🤖 AI Agent synthesized {request.architecture} chain at {freq} GHz."
            })

        return {
            "success": True,
            "schematic": schematic_data,
            "budget": budget_summary,
            "broadcasted": request.broadcast_to_canvas and len(ws_manager.active_connections) > 0
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Synthesis error: {str(e)}")


@router.post("/sparams")
async def simulate_sparams(payload: SchematicPayload):
    """
    Runs multi-port scikit-rf S-parameter matrix analysis on the provided schematic.
    Returns S-parameters over frequency, group delay, and stability factors.
    """
    try:
        schematic = payload.model_dump()
        result = analyze_schematic_cascade(schematic)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"S-parameters simulation error: {str(e)}")


@router.post("/broadcast")
async def broadcast_canvas_event(request: BroadcastRequest):
    """
    Sends an action command to the active RFBlock canvas via WebSocket.
    Actions: 'ADD_BLOCK', 'UPDATE_PARAMS', 'LOAD_SCHEMATIC', 'SHOW_NOTIFICATION'.
    """
    client_count = len(ws_manager.active_connections)
    if client_count == 0:
        return {
            "success": False,
            "client_count": 0,
            "message": "No active RFBlock Web UI clients connected to WebSocket (/ws/canvas)."
        }
    await ws_manager.broadcast({
        "type": request.action,
        "data": request.payload
    })
    return {
        "success": True,
        "client_count": client_count,
        "action": request.action
    }

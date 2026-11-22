"""
RFBlock Model Context Protocol (MCP) Server.
Exposes RF physics simulation, cascade budget analysis, circuit synthesis, and live UI control to AI agents.
"""

import sys
import json
from typing import List, Dict, Any, Optional
from mcp.server.mcpserver import MCPServer

from ..physics.budget import calculate_cascade_budget
from ..physics.cascade import analyze_schematic_cascade
from ..physics.multi_sheet_solver import MultiSheetSolver, analyze_rfbd_file
from ..physics.canvas_solver import CanvasSolver, analyze_canvas_file
from ..physics.advanced_tools import (
    update_component_parameters,
    sweep_dynamic_range,
    optimize_chain_attenuation,
    export_touchstone
)
from ..api.routes.ws import manager as ws_manager

mcp = MCPServer("rfblock")

@mcp.tool()
def rf_get_status() -> str:
    """
    Get the operational status of the RFBlock engine, active Web UI sessions, and available physics capabilities.
    """
    status = {
        "engine": "RFBlock scikit-rf Physics & Cascade Engine",
        "version": "2.3.0",
        "status": "online",
        "active_canvas_clients": len(ws_manager.active_connections),
        "supported_features": [
            "Friis cascade budget analysis (Gain, NF, OIP3, OP1dB, SNR, SFDR)",
            "scikit-rf multi-port linear S-parameter matrix simulation",
            "Multi-point dynamic range & P1dB bottleneck sweeping",
            "Goal-oriented automatic DSA & gain optimization",
            "Component parameter batch-updating and state switching",
            "Touchstone .s2p / .s4p S-parameter export for ADS/AWR",
            "Automatic RF receiver/transmitter chain synthesis",
            "Live bi-directional canvas push via WebSocket",
            "Visio VDX / EMF / SVG diagram generation"
        ]
    }
    return json.dumps(status, indent=2)


@mcp.tool()
def rf_calculate_cascade(
    stages: List[Dict[str, Any]],
    input_power_dbm: float = -50.0,
    bandwidth_mhz: float = 1.0
) -> str:
    """
    Calculate Friis cascade noise figure, cumulative gain, output power, OIP3, OP1dB, and noise floor.
    
    Args:
        stages: List of stage objects with keys:
            - name (str): Component name (e.g., 'LNA', 'BPF', 'Mixer')
            - type (str): 'amp', 'filter', 'atten', or 'mixer'
            - gain (float): Stage gain in dB (negative for loss)
            - nf (float): Stage noise figure in dB
            - oip3 (float, optional): Output IP3 in dBm
            - op1db (float, optional): Output 1dB compression point in dBm
        input_power_dbm: Input signal power in dBm (default: -50.0)
        bandwidth_mhz: Noise integration bandwidth in MHz (default: 1.0)
    """
    res = calculate_cascade_budget(
        stages=stages,
        input_power_dbm=input_power_dbm,
        bandwidth_hz=bandwidth_mhz * 1.0e6
    )
    return json.dumps(res, indent=2)


@mcp.tool()
def rf_analyze_file(
    file_path: str,
    power_budget: str = "primary",
    bandwidth_mhz: float = 1.0
) -> str:
    """
    Perform hierarchical multi-sheet RF cascade and noise figure analysis directly on an .rfbd diagram file.
    Executes the canonical Canvas JavaScript physics solvers (Single Source of Truth) to guarantee 100% exact parity with canvas indicators.

    Args:
        file_path: Absolute or relative file path to the .rfbd diagram
        power_budget: 'primary' or 'secondary' budget mode (default: 'primary')
        bandwidth_mhz: Noise integration bandwidth in MHz (default: 1.0)
    """
    res = analyze_canvas_file(
        file_path=file_path,
        power_budget=power_budget,
        bandwidth_hz=bandwidth_mhz * 1.0e6
    )
    return json.dumps(res, indent=2)


@mcp.tool()
def rf_analyze_schematic(
    schematic: Dict[str, Any],
    power_budget: str = "primary",
    bandwidth_mhz: float = 1.0
) -> str:
    """
    Perform hierarchical multi-sheet RF cascade and noise figure analysis on a schematic JSON object.
    Executes the canonical Canvas JavaScript physics solvers (Single Source of Truth) across all sheets and interconnects.

    Args:
        schematic: Diagram dictionary containing 'sheets' or 'blocks'/'connections'
        power_budget: 'primary' or 'secondary' budget mode (default: 'primary')
        bandwidth_mhz: Noise integration bandwidth in MHz (default: 1.0)
    """
    solver = CanvasSolver(
        schematic,
        power_budget=power_budget,
        bandwidth_hz=bandwidth_mhz * 1.0e6
    )
    res = solver.analyze()
    return json.dumps(res, indent=2)


@mcp.tool()
def rf_synthesize_chain(
    architecture: str = "receiver",
    center_freq_ghz: float = 2.4,
    bandwidth_mhz: float = 20.0,
    target_gain_db: float = 30.0,
    target_nf_db: float = 3.0,
    broadcast_to_canvas: bool = True
) -> str:
    """
    Synthesize an RF block diagram chain based on frequency, gain, and noise figure requirements.
    Optionally pushes the synthesized schematic directly to the open RFBlock Web UI.
    
    Args:
        architecture: 'receiver' or 'transmitter'
        center_freq_ghz: Center RF frequency in GHz (e.g., 2.4, 5.8, 10.0, 28.0)
        bandwidth_mhz: Signal bandwidth in MHz (e.g., 20, 40, 100)
        target_gain_db: Desired total gain in dB (e.g., 30.0)
        target_nf_db: Desired maximum noise figure in dB (e.g., 2.5)
        broadcast_to_canvas: If True and the UI is open, automatically updates the user's diagram
    """
    from ..api.routes.agent import synthesize_chain as api_synthesize, SynthesisRequest
    import asyncio

    req = SynthesisRequest(
        architecture=architecture,
        center_freq_ghz=center_freq_ghz,
        bandwidth_mhz=bandwidth_mhz,
        target_gain_db=target_gain_db,
        target_nf_db=target_nf_db,
        broadcast_to_canvas=broadcast_to_canvas
    )
    res = asyncio.run(api_synthesize(req))
    return json.dumps(res, indent=2)


@mcp.tool()
def rf_solve_sparams(
    start_freq_ghz: float = 1.0,
    stop_freq_ghz: float = 10.0,
    points: int = 101,
    blocks: Optional[List[Dict[str, Any]]] = None,
    conns: Optional[List[Dict[str, Any]]] = None
) -> str:
    """
    Run scikit-rf multi-port linear S-parameter simulation on an RF schematic.
    Returns S-parameters over frequency, group delay, and stability factors.
    
    Args:
        start_freq_ghz: Sweep start frequency in GHz
        stop_freq_ghz: Sweep stop frequency in GHz
        points: Number of frequency sample points (default: 101)
        blocks: List of component blocks with 'id', 'type', 'params'
        conns: List of connections with 'from' and 'to' port mappings
    """
    schematic = {
        "band": {
            "startFreq": start_freq_ghz,
            "stopFreq": stop_freq_ghz,
            "startUnit": "GHz",
            "stopUnit": "GHz",
            "points": points,
            "sweepType": "lin"
        },
        "blocks": blocks or [],
        "conns": conns or []
    }
    res = analyze_schematic_cascade(schematic)
    return json.dumps(res, indent=2)


@mcp.tool()
def rf_send_canvas_action(
    action: str,
    payload: Dict[str, Any]
) -> str:
    """
    Send an interactive action directly to the open RFBlock canvas in the user's browser/desktop window.
    
    Args:
        action: One of:
            - 'LOAD_SCHEMATIC': Loads or replaces the diagram with new blocks and conns
            - 'SHOW_NOTIFICATION': Displays a toast message in the user's workspace
            - 'UPDATE_PARAMS': Updates values of an existing block
        payload: Dict containing data for the action
    """
    import asyncio
    active_count = len(ws_manager.active_connections)
    if active_count == 0:
        return json.dumps({
            "success": False,
            "message": "No active RFBlock Web UI clients connected. Open the application in browser or desktop first."
        })
    asyncio.run(ws_manager.broadcast({
        "type": action,
        "data": payload
    }))
    return json.dumps({
        "success": True,
        "action": action,
        "clients_updated": active_count
    })


@mcp.tool()
def rf_update_component_params(
    file_path: str,
    updates: List[Dict[str, Any]],
    re_solve: bool = True,
    power_budget: str = "primary"
) -> str:
    """
    Safely update component parameters across sheets in an .rfbd diagram file.
    Preserves schematic structure and enforces component invariants (e.g. DSA loss = intrinsicLoss + attenuation).

    Args:
        file_path: Absolute or relative path to the .rfbd file
        updates: List of update dicts, e.g. [{"id": "dsa23_3wq7", "params": {"attenuation": 15.0}}]
        re_solve: Whether to re-solve the circuit before and after to return output deltas (default: True)
        power_budget: 'primary' or 'secondary' budget mode (default: 'primary')
    """
    try:
        res = update_component_parameters(
            file_path=file_path,
            updates=updates,
            re_solve=re_solve,
            power_budget=power_budget
        )
        return json.dumps(res, indent=2)
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)}, indent=2)


@mcp.tool()
def rf_sweep_dynamic_range(
    file_path: str,
    pin_start_dbm: float = -80.0,
    pin_stop_dbm: float = 20.0,
    step_db: float = 5.0,
    antenna_id: Optional[str] = None,
    monitor_ports: Optional[List[str]] = None,
    power_budget: str = "primary"
) -> str:
    """
    Perform an automated input power sweep across an .rfbd architecture.
    Identifies 1dB compression points (IP1dB/OP1dB), first-saturating bottleneck stages,
    and channel output power and noise figure trajectories.

    Args:
        file_path: Absolute or relative path to the .rfbd file
        pin_start_dbm: Starting input power in dBm (default: -80.0)
        pin_stop_dbm: Stopping input power in dBm (default: +20.0)
        step_db: Sweep power step in dB (default: 5.0)
        antenna_id: Optional specific antenna ID to sweep (others isolated at -150 dBm)
        monitor_ports: List of port keys to track, e.g. ["custom68_djys·o1", "custom69_as8a·o1"]
        power_budget: 'primary' or 'secondary' budget mode (default: 'primary')
    """
    try:
        res = sweep_dynamic_range(
            file_path=file_path,
            pin_start_dbm=pin_start_dbm,
            pin_stop_dbm=pin_stop_dbm,
            step_db=step_db,
            antenna_id=antenna_id,
            monitor_ports=monitor_ports,
            power_budget=power_budget
        )
        return json.dumps(res, indent=2)
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)}, indent=2)


@mcp.tool()
def rf_optimize_chain_attenuation(
    file_path: str,
    targets: Optional[Dict[str, List[float]]] = None,
    adjustable_dsa_ids: Optional[List[str]] = None,
    objective: str = "max_linearity",
    apply_to_file: bool = False,
    power_budget: str = "primary",
    tolerance_db: float = 0.5
) -> str:
    """
    Automatically solve for optimal DSA attenuation words across sheets to bring
    channel outputs strictly within target operating windows (e.g. -5 dBm to -45 dBm for the AD9084 ADC).

    Args:
        file_path: Path to the .rfbd diagram file
        targets: Mapping of port keys to [min_dbm, max_dbm] thresholds.
                 Defaults to AD9084 ADC requirements: [-45.0, -5.0] for custom68-71 and rfout blocks.
        adjustable_dsa_ids: Optional explicit list of DSA block IDs to tune.
        objective: 'max_linearity' (attenuate early to protect downstream amps) or
                   'min_noise_figure' (attenuate late to preserve front-end NF).
        apply_to_file: Whether to save the optimized values directly to the file.
        power_budget: 'primary' or 'secondary' budget mode (default: 'primary').
        tolerance_db: Allowable margin in dB around targets (default: 0.5 dB).
    """
    try:
        res = optimize_chain_attenuation(
            file_path=file_path,
            targets=targets,
            adjustable_dsa_ids=adjustable_dsa_ids,
            objective=objective,
            apply_to_file=apply_to_file,
            power_budget=power_budget,
            tolerance_db=tolerance_db
        )
        return json.dumps(res, indent=2)
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)}, indent=2)


@mcp.tool()
def rf_export_touchstone(
    file_path: Optional[str] = None,
    schematic: Optional[Dict[str, Any]] = None,
    sheet_id: Optional[str] = None,
    start_freq_ghz: float = 1.0,
    stop_freq_ghz: float = 10.0,
    points: int = 101
) -> str:
    """
    Generate Touchstone .s2p text format from an .rfbd file or schematic object for
    co-simulation in Keysight ADS, Cadence AWR, or MATLAB RF Toolbox.

    Args:
        file_path: Optional path to the .rfbd file
        schematic: Optional schematic dict containing 'blocks' and 'conns'
        sheet_id: Specific sheet ID to export (if file has multiple sheets)
        start_freq_ghz: Sweep start frequency in GHz (default: 1.0)
        stop_freq_ghz: Sweep stop frequency in GHz (default: 10.0)
        points: Number of frequency points (default: 101)
    """
    try:
        res = export_touchstone(
            file_path=file_path,
            schematic=schematic,
            sheet_id=sheet_id,
            start_freq_ghz=start_freq_ghz,
            stop_freq_ghz=stop_freq_ghz,
            points=points
        )
        return res
    except Exception as e:
        return f"! Error generating Touchstone: {str(e)}"


def main():
    import argparse
    parser = argparse.ArgumentParser(description="RFBlock Model Context Protocol (MCP) Server")
    parser.add_argument("--transport", choices=["stdio", "sse"], default="stdio", help="Transport mechanism")
    parser.add_argument("--port", type=int, default=8001, help="Port for SSE transport")
    args = parser.parse_args()

    if args.transport == "sse":
        print(f"📡 Starting RFBlock MCP Server over SSE on port {args.port}...", file=sys.stderr)
        mcp.run("sse", port=args.port)
    else:
        mcp.run("stdio")

if __name__ == "__main__":
    main()

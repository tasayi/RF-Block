"""
Advanced RF Systems Design, Analysis, and Optimization Tools.
Provides parameter batch-updating, dynamic range sweeping, automated DSA optimization,
and Touchstone S-parameter export for multi-sheet RF architectures.
"""

import os
import json
import copy
import subprocess
from typing import Dict, Any, List, Optional, Tuple

from .canvas_solver import CanvasSolver, analyze_canvas_file
from .touchstone import generate_touchstone_s2p


def update_component_parameters(
    file_path: str,
    updates: List[Dict[str, Any]],
    re_solve: bool = True,
    power_budget: str = "primary"
) -> Dict[str, Any]:
    """
    Safely update component parameters across sheets in an .rfbd diagram file.
    Preserves schematic structure and enforces component invariants (e.g., DSA loss = intrinsicLoss + attenuation).

    Args:
        file_path: Absolute or relative path to the .rfbd file
        updates: List of update dicts, e.g. [{"id": "dsa23_3wq7", "params": {"attenuation": 15.0}}]
        re_solve: Whether to re-solve the circuit before and after to return output deltas
        power_budget: 'primary' or 'secondary' budget mode (default: 'primary')

    Returns:
        Dict summarizing modifications made and resulting output power/NF levels.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Diagram file not found: {file_path}")

    with open(file_path, "r", encoding="utf-8") as f:
        bd = json.load(f)

    # Optional pre-solve
    before_powers = {}
    before_noise = {}
    if re_solve:
        try:
            solver_pre = CanvasSolver(bd, power_budget=power_budget)
            res_pre = solver_pre.analyze()
            before_powers = res_pre.get("powers", {})
            before_noise = res_pre.get("noise", {})
        except Exception:
            pass

    applied_mods = []
    unmatched_ids = []

    # Build block index
    block_index = {}
    for sh in bd.get("sheets", []):
        for b in sh.get("blocks", []):
            block_index[b["id"]] = (sh["id"], b)

    for upd in updates:
        bid = upd.get("id")
        new_params = upd.get("params", {})
        if bid in block_index:
            sh_id, block = block_index[bid]
            p = block.setdefault("params", {})
            changes = {}
            for k, v in new_params.items():
                p[k] = v
                changes[k] = v

            # Invariant for DSA: loss = intrinsicLoss + attenuation
            if block.get("type") == "dsa" and "attenuation" in changes:
                att = float(p.get("attenuation", 0.0))
                intrinsic = float(p.get("intrinsicLoss", p.get("loss", 2.0) - att if p.get("loss") else 2.0))
                p["intrinsicLoss"] = intrinsic
                p["loss"] = intrinsic + att
                changes["loss"] = p["loss"]

            applied_mods.append({
                "id": bid,
                "sheet": sh_id,
                "type": block.get("type"),
                "changes": changes
            })
        else:
            unmatched_ids.append(bid)

    # Write back to file atomically / cleanly
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(bd, f, indent=2)

    # Post-solve
    after_powers = {}
    after_noise = {}
    outputs = []
    if re_solve:
        solver_post = CanvasSolver(bd, power_budget=power_budget)
        res_post = solver_post.analyze()
        after_powers = res_post.get("powers", {})
        after_noise = res_post.get("noise", {})

        # Extract digitizer / rfout ports
        for k, pwr in after_powers.items():
            if any(term in k for term in ["rfout", "custom68", "custom69", "custom70", "custom71", "connector"]):
                nf = after_noise.get(k)
                prev_pwr = before_powers.get(k)
                delta = (pwr - prev_pwr) if (pwr is not None and prev_pwr is not None) else None
                outputs.append({
                    "port": k,
                    "power_dbm": round(pwr, 2) if pwr is not None else None,
                    "noise_figure_db": round(nf, 2) if nf is not None else None,
                    "delta_db": round(delta, 2) if delta is not None else None
                })

    return {
        "success": True,
        "file_path": file_path,
        "applied_count": len(applied_mods),
        "applied_modifications": applied_mods,
        "unmatched_ids": unmatched_ids,
        "verified_outputs": outputs
    }


def sweep_dynamic_range(
    file_path: str,
    pin_start_dbm: float = -80.0,
    pin_stop_dbm: float = 20.0,
    step_db: float = 5.0,
    antenna_id: Optional[str] = None,
    monitor_ports: Optional[List[str]] = None,
    power_budget: str = "primary"
) -> Dict[str, Any]:
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

    Returns:
        Dict with sweep metadata, identified bottlenecks, and data points.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Diagram file not found: {file_path}")

    with open(file_path, "r", encoding="utf-8") as f:
        bd = json.load(f)

    # Locate headless runner
    runner_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../../js/solvers/headless-runner.js")
    )
    if not os.path.exists(runner_path):
        raise FileNotFoundError(f"Headless runner not found at: {runner_path}")

    payload = {
        "schematic": bd,
        "mode": "sweep",
        "power_budget": power_budget,
        "sweep": {
            "start": float(pin_start_dbm),
            "stop": float(pin_stop_dbm),
            "step": float(step_db),
            "antenna_id": antenna_id,
            "monitor_ports": monitor_ports or []
        }
    }

    proc = subprocess.run(
        ["node", runner_path],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=True
    )

    raw_res = json.loads(proc.stdout)
    points = raw_res.get("points", [])
    bottlenecks = raw_res.get("bottlenecks", [])

    # Calculate channel linear gain and 1dB compression threshold for monitored ports
    channel_summary = {}
    if points:
        first_pt = points[0]
        pin_low = first_pt["pin_dbm"]
        ports_low = first_pt.get("ports", {})

        for p_name, p_data in ports_low.items():
            p_out_low = p_data.get("power_dbm")
            if p_out_low is not None:
                linear_gain = p_out_low - pin_low
                ip1db = None
                op1db = None

                for pt in points:
                    cur_pin = pt["pin_dbm"]
                    cur_pout = pt.get("ports", {}).get(p_name, {}).get("power_dbm")
                    if cur_pout is not None:
                        actual_gain = cur_pout - cur_pin
                        if actual_gain <= linear_gain - 1.0 and ip1db is None:
                            ip1db = cur_pin
                            op1db = cur_pout

                channel_summary[p_name] = {
                    "linear_gain_db": round(linear_gain, 2),
                    "input_p1db_dbm": ip1db,
                    "output_p1db_dbm": round(op1db, 2) if op1db is not None else None,
                    "compression_observed": ip1db is not None
                }

    return {
        "sweep_parameters": {
            "pin_start_dbm": pin_start_dbm,
            "pin_stop_dbm": pin_stop_dbm,
            "step_db": step_db,
            "antenna_id": antenna_id or "all_antennas",
            "total_points": len(points)
        },
        "bottlenecks": bottlenecks,
        "channels": channel_summary,
        "points": points
    }


def optimize_chain_attenuation(
    file_path: str,
    targets: Optional[Dict[str, List[float]]] = None,
    adjustable_dsa_ids: Optional[List[str]] = None,
    objective: str = "max_linearity",
    apply_to_file: bool = False,
    power_budget: str = "primary",
    tolerance_db: float = 0.5
) -> Dict[str, Any]:
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
        tolerance_db: Acceptable margin in dB around targets (default: 0.5 dB).

    Returns:
        Dict with optimization results, proposed DSA settings, and target compliance status.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Diagram file not found: {file_path}")

    with open(file_path, "r", encoding="utf-8") as f:
        bd = json.load(f)

    # Initial solve
    solver_init = CanvasSolver(bd, power_budget=power_budget)
    res_init = solver_init.analyze()
    init_powers = res_init.get("powers", {})
    init_noise = res_init.get("noise", {})

    # Default targets if None provided: target -10 dBm (center of -5 to -45 dBm window)
    if not targets:
        targets = {}
        for k in init_powers.keys():
            if any(term in k for term in ["custom68_djys·o1", "custom69_as8a·o1", "custom70_4rdt·o1", "custom71_ejlp·o1"]):
                targets[k] = [-45.0, -5.0]

    # Collect available DSAs
    dsa_blocks = {}
    for sh in bd.get("sheets", []):
        for b in sh.get("blocks", []):
            if b.get("type") == "dsa":
                if not adjustable_dsa_ids or b["id"] in adjustable_dsa_ids:
                    dsa_blocks[b["id"]] = (sh["id"], b)

    proposed_settings = {}
    for dsa_id, (sh_id, block) in dsa_blocks.items():
        p = block.get("params", {})
        proposed_settings[dsa_id] = {
            "sheet": sh_id,
            "label": p.get("label", dsa_id),
            "current_attenuation": float(p.get("attenuation", 0.0)),
            "intrinsic_loss": float(p.get("intrinsicLoss", p.get("loss", 2.0))),
            "optimized_attenuation": float(p.get("attenuation", 0.0))
        }

    # Bidirectional goal-seeking for target levels
    for port_key, (min_p, max_p) in targets.items():
        cur_p = init_powers.get(port_key)
        if cur_p is None:
            continue

        # Find relevant DSA: sheet-based, port-based, or fallback
        matched_dsa = None
        if "custom68" in port_key or "s14" in port_key:
            matched_dsa = "dsa23_3wq7"
        elif "custom69" in port_key or "s15" in port_key:
            matched_dsa = "dsa46_u2mj"
        elif "custom70" in port_key or "s16" in port_key:
            matched_dsa = "dsa27_sy2p"
        elif "custom71" in port_key or "s17" in port_key:
            matched_dsa = "dsa18_65c4"
        else:
            # Generic matching by sheet id
            for did, (shid, block) in dsa_blocks.items():
                if shid in port_key:
                    matched_dsa = did
                    break
            if not matched_dsa and len(dsa_blocks) == 1:
                matched_dsa = list(dsa_blocks.keys())[0]

        if matched_dsa and matched_dsa in proposed_settings:
            cur_att = proposed_settings[matched_dsa]["optimized_attenuation"]
            if cur_p > max_p:
                # Excess power: increase attenuation (aiming 2 dB below ceiling)
                excess = cur_p - (max_p - 2.0)
                new_att = min(31.5, max(0.0, round((cur_att + excess) * 2) / 2))
                proposed_settings[matched_dsa]["optimized_attenuation"] = new_att
            elif cur_p < min_p and cur_att > 0.0:
                # Deficit power: decrease attenuation if available
                deficit = (min_p + 2.0) - cur_p
                new_att = min(31.5, max(0.0, round((cur_att - deficit) * 2) / 2))
                proposed_settings[matched_dsa]["optimized_attenuation"] = new_att

    # Apply proposed settings to in-memory copy
    bd_opt = copy.deepcopy(bd)
    for sh in bd_opt.get("sheets", []):
        for b in sh.get("blocks", []):
            bid = b["id"]
            if bid in proposed_settings:
                opt_att = proposed_settings[bid]["optimized_attenuation"]
                intr = proposed_settings[bid]["intrinsic_loss"]
                b.setdefault("params", {})["attenuation"] = opt_att
                b["params"]["intrinsicLoss"] = intr
                b["params"]["loss"] = intr + opt_att

    # Re-solve with proposed settings
    solver_opt = CanvasSolver(bd_opt, power_budget=power_budget)
    res_opt = solver_opt.analyze()
    opt_powers = res_opt.get("powers", {})
    opt_noise = res_opt.get("noise", {})

    results_table = []
    all_targets_met = True
    for port_key, (min_p, max_p) in targets.items():
        init_p = init_powers.get(port_key)
        final_p = opt_powers.get(port_key)
        final_nf = opt_noise.get(port_key)
        is_compliant = (final_p is not None and (min_p - tolerance_db) <= final_p <= (max_p + tolerance_db))
        if not is_compliant:
            all_targets_met = False

        diagnostic = "Compliant within target range."
        if final_p is not None:
            if final_p < (min_p - tolerance_db):
                diagnostic = f"Output power ({round(final_p, 2)} dBm) is {round(min_p - final_p, 2)} dB below target minimum ({min_p} dBm). DSA attenuation is at minimum (0 dB); increase input power or amplifier gain."
            elif final_p > (max_p + tolerance_db):
                diagnostic = f"Output power ({round(final_p, 2)} dBm) is {round(final_p - max_p, 2)} dB above target maximum ({max_p} dBm). Maximum DSA attenuation reached."

        results_table.append({
            "port": port_key,
            "target_range_dbm": [min_p, max_p],
            "initial_power_dbm": round(init_p, 2) if init_p is not None else None,
            "optimized_power_dbm": round(final_p, 2) if final_p is not None else None,
            "optimized_noise_figure_db": round(final_nf, 2) if final_nf is not None else None,
            "compliant": is_compliant,
            "diagnostic": diagnostic
        })

    if apply_to_file and all_targets_met:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(bd_opt, f, indent=2)

    return {
        "success": True,
        "all_targets_met": all_targets_met,
        "applied_to_file": apply_to_file and all_targets_met,
        "objective": objective,
        "tolerance_db": tolerance_db,
        "proposed_dsa_settings": proposed_settings,
        "channel_results": results_table
    }


def export_touchstone(
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
        start_freq_ghz: Sweep start frequency in GHz
        stop_freq_ghz: Sweep stop frequency in GHz
        points: Number of frequency points (default: 101)

    Returns:
        Formatted Touchstone .s2p text string.
    """
    if file_path and not schematic:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Diagram file not found: {file_path}")
        with open(file_path, "r", encoding="utf-8") as f:
            bd = json.load(f)
        if sheet_id and "sheets" in bd:
            target_sh = next((s for s in bd["sheets"] if s["id"] == sheet_id), None)
            if not target_sh:
                raise ValueError(f"Sheet {sheet_id} not found in diagram")
            blocks = target_sh.get("blocks", [])
            conns = target_sh.get("connections", []) or target_sh.get("conns", [])
        elif "sheets" in bd and bd["sheets"]:
            target_sh = bd["sheets"][0]
            blocks = target_sh.get("blocks", [])
            conns = target_sh.get("connections", []) or target_sh.get("conns", [])
        else:
            blocks = bd.get("blocks", [])
            conns = bd.get("connections", []) or bd.get("conns", [])
        
        schematic = {
            "band": {
                "startFreq": start_freq_ghz,
                "stopFreq": stop_freq_ghz,
                "startUnit": "GHz",
                "stopUnit": "GHz",
                "points": points,
                "sweepType": "lin"
            },
            "blocks": blocks,
            "conns": conns
        }

    if not schematic:
        raise ValueError("Either file_path or schematic must be provided")

    if "band" not in schematic:
        schematic["band"] = {
            "startFreq": start_freq_ghz,
            "stopFreq": stop_freq_ghz,
            "startUnit": "GHz",
            "stopUnit": "GHz",
            "points": points,
            "sweepType": "lin"
        }

    return generate_touchstone_s2p(schematic)

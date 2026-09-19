"""
Multi-path S-parameter Matrix Cascade & Network Analysis Engine using scikit-rf.
"""

from typing import Dict, Any, List
import numpy as np
import skrf
from .network_builder import build_block_network
from .path_finder import find_all_signal_paths

from functools import reduce

import tempfile
import os

def export_network_touchstone_str(net: skrf.Network) -> str:
    """Helper to convert skrf.Network to Touchstone text string."""
    try:
        tmp = tempfile.NamedTemporaryFile(suffix=".s2p", delete=False)
        tmp.close()
        net.write_touchstone(tmp.name)
        with open(tmp.name, "r", encoding="utf-8") as f:
            txt = f.read()
        os.unlink(tmp.name)
        return txt
    except Exception as e:
        return f"! Touchstone export error: {e}"

def compute_group_delay_ns(net: skrf.Network) -> List[float]:
    """
    Computes Group Delay in nanoseconds: tau_g = - d(phase_deg) / (360 * df_ghz)
    """
    freq_hz = net.f
    if len(freq_hz) < 2:
        return [0.0] * len(freq_hz)

    s21_rad = np.unwrap(np.angle(net.s[:, 1, 0]))
    df = np.gradient(freq_hz)
    dphi = np.gradient(s21_rad)

    # tau = - dphi / domega = - dphi / (2 * pi * df)
    tau_sec = - dphi / (2.0 * np.pi * df)
    tau_ns = (tau_sec * 1e9).tolist()
    return tau_ns


def analyze_schematic_cascade(schematic: Dict[str, Any]) -> Dict[str, Any]:
    """
    Discovers all signal paths, cascades skrf.Network matrices for each path,
    and returns frequency-domain S-parameters, Group Delay, and Stability Factors.
    """
    band = schematic.get("band", {})
    f_start = float(band.get("startFreq", 1))
    f_stop = float(band.get("stopFreq", 10))
    f_unit = (band.get("startUnit", "GHz") or "GHz").lower()
    n_pts = max(2, min(2001, int(band.get("points", 101))))

    freq = skrf.Frequency(start=f_start, stop=f_stop, npoints=n_pts, unit=f_unit)

    blocks_dict = {b["id"]: b for b in schematic.get("blocks", [])}
    if not blocks_dict:
        return {
            "status": "empty",
            "message": "No components in schematic",
            "paths": []
        }

    # Discover topological signal paths
    discovered_paths = find_all_signal_paths(schematic)

    analyzed_paths: List[Dict[str, Any]] = []
    primary_touchstone = ""

    for idx, path_info in enumerate(discovered_paths):
        path_bids = path_info["block_ids"]
        networks: List[skrf.Network] = []

        for bid in path_bids:
            if bid in blocks_dict:
                net = build_block_network(blocks_dict[bid], freq)
                networks.append(net)

        if networks:
            total_net = reduce(lambda a, b: a ** b, networks)
        else:
            total_net = skrf.Network(frequency=freq, s=np.zeros((n_pts, 2, 2), dtype=complex))

        s11_db = total_net.s11.s_db.flatten().tolist()
        s21_db = total_net.s21.s_db.flatten().tolist()
        s12_db = total_net.s12.s_db.flatten().tolist()
        s22_db = total_net.s22.s_db.flatten().tolist()

        try:
            k_factor = total_net.stability_factor.flatten().tolist()
        except Exception:
            k_factor = [1.0] * n_pts

        group_delay_ns = compute_group_delay_ns(total_net)

        if idx == 0:
            primary_touchstone = export_network_touchstone_str(total_net)

        analyzed_paths.append({
            "id": path_info["id"],
            "name": path_info["name"],
            "block_ids": path_bids,
            "s11_db": s11_db,
            "s21_db": s21_db,
            "s12_db": s12_db,
            "s22_db": s22_db,
            "group_delay_ns": group_delay_ns,
            "k_factor": k_factor
        })

    # Return primary path curves at top level for backwards compatibility + paths array
    first_p = analyzed_paths[0] if analyzed_paths else {}

    return {
        "status": "success",
        "freq_hz": (freq.f).tolist(),
        "freq_ghz": (freq.f / 1e9).tolist(),
        "s11_db": first_p.get("s11_db", []),
        "s21_db": first_p.get("s21_db", []),
        "s12_db": first_p.get("s12_db", []),
        "s22_db": first_p.get("s22_db", []),
        "group_delay_ns": first_p.get("group_delay_ns", []),
        "k_factor": first_p.get("k_factor", []),
        "num_paths": len(analyzed_paths),
        "paths": analyzed_paths,
        "touchstone_s2p": primary_touchstone
    }

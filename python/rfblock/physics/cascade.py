"""
Multi-port S-parameter Matrix Cascade & Network Analysis Engine using scikit-rf.
"""

from typing import Dict, Any, List
import numpy as np
import skrf
from .network_builder import build_block_network

def analyze_schematic_cascade(schematic: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build frequency vector, construct block networks, cascade matrices,
    and return frequency-domain S-parameter vectors and stability factors.
    """
    band = schematic.get("band", {})
    f_start = float(band.get("startFreq", 1))
    f_stop = float(band.get("stopFreq", 10))
    f_unit = (band.get("startUnit", "GHz") or "GHz").lower()
    n_pts = max(2, min(2001, int(band.get("points", 101))))

    freq = skrf.Frequency(start=f_start, stop=f_stop, npoints=n_pts, unit=f_unit)

    blocks = schematic.get("blocks", [])
    if not blocks:
        return {
            "status": "empty",
            "message": "No components in schematic"
        }

    networks: List[skrf.Network] = []
    for b in blocks:
        net = build_block_network(b, freq)
        networks.append(net)

    if networks:
        total_net = skrf.cascade_list(networks)
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

    touchstone_s2p = total_net.to_string(file_format="touchstone")

    return {
        "status": "success",
        "freq_hz": total_net.f.tolist(),
        "freq_ghz": (total_net.f / 1e9).tolist(),
        "s11_db": s11_db,
        "s21_db": s21_db,
        "s12_db": s12_db,
        "s22_db": s22_db,
        "k_factor": k_factor,
        "touchstone_s2p": touchstone_s2p
    }

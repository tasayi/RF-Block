"""
Network Builder: Converts front-end schematic block definitions into scikit-rf Network objects.
"""

from typing import Dict, Any, List
import numpy as np
import skrf

def build_block_network(block: Dict[str, Any], freq: skrf.Frequency) -> skrf.Network:
    """
    Construct a 2-port skrf.Network for a single component block.
    """
    btype = block.get("type", "")
    params = block.get("params", {})
    label = params.get("label", btype)
    
    n_pts = len(freq)
    s_mat = np.zeros((n_pts, 2, 2), dtype=complex)

    gain_db = float(params.get("gain", params.get("g", 0)))
    il_db = float(params.get("il", 0))
    net_gain = gain_db - il_db
    
    s21_mag = 10.0 ** (net_gain / 20.0)
    s11_mag = 10.0 ** (-20.0 / 20.0) # -20 dB return loss default match

    s_mat[:, 1, 0] = s21_mag # Forward transmission S21
    s_mat[:, 0, 1] = s21_mag # Reverse transmission S12
    s_mat[:, 0, 0] = s11_mag # Input reflection S11
    s_mat[:, 1, 1] = s11_mag # Output reflection S22

    return skrf.Network(frequency=freq, s=s_mat, name=label)

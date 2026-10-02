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

    # Determine forward gain/loss (in dB)
    gain_db = float(params.get("gain", params.get("g", 0)))
    il_db = float(params.get("il", params.get("atten", params.get("loss", params.get("conv_loss", 0)))))
    if btype in ("splitter", "combiner") and "exloss" in params:
        ways = int(params.get("ways", 2))
        exloss = float(params.get("exloss", 0.3))
        il_db = 10.0 * np.log10(max(1, ways)) + exloss
    elif btype == "eq":
        min_loss = float(params.get("minLoss", 1.0))
        slope = float(params.get("slope", 3.0))
        il_db = min_loss + (slope / 2.0)
    net_gain = gain_db - il_db
    
    # Return Loss & Isolation
    rl_db = float(params.get("s11", params.get("rl", -20.0))) # Default -20 dB return loss
    iso_db = float(params.get("s12", params.get("iso", -30.0 if btype == "amp" else net_gain)))
    
    s21_mag = 10.0 ** (net_gain / 20.0)
    s12_mag = 10.0 ** (iso_db / 20.0)
    s11_mag = 10.0 ** (rl_db / 20.0) if rl_db < 0 else 0.0
    s22_mag = s11_mag

    s_mat[:, 1, 0] = s21_mag # Forward transmission S21
    s_mat[:, 0, 1] = s12_mag # Reverse transmission S12
    s_mat[:, 0, 0] = s11_mag # Input reflection S11
    s_mat[:, 1, 1] = s22_mag # Output reflection S22

    return skrf.Network(frequency=freq, s=s_mat, name=label)

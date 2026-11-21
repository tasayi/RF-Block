"""
RF Cascade Budget Calculator.
Implements Friis noise figure, cumulative gain, cascade IP3, P1dB, and dynamic range.
"""

import math
from typing import Dict, List, Any, Optional

def calculate_cascade_budget(
    stages: List[Dict[str, Any]],
    input_power_dbm: float = -50.0,
    bandwidth_hz: float = 1.0e6,
    temperature_k: float = 290.0
) -> Dict[str, Any]:
    """
    Computes cumulative cascade RF budget metrics across a chain of stages.
    
    Parameters:
        stages: List of dicts, each containing:
            - name (str): Component label
            - type (str): Component type (amp, filter, atten, mixer, etc.)
            - gain (float): Stage gain in dB (negative for loss)
            - nf (float): Stage noise figure in dB
            - oip3 (float, optional): Stage output IP3 in dBm
            - op1db (float, optional): Stage output 1dB compression point in dBm
        input_power_dbm: Input signal power in dBm
        bandwidth_hz: Noise integration bandwidth in Hz
        temperature_k: Reference ambient temperature in Kelvin (default 290 K)
        
    Returns:
        Dict with overall metrics and stage-by-stage row data.
    """
    if not stages:
        return {
            "total_gain_db": 0.0,
            "total_nf_db": 0.0,
            "output_power_dbm": input_power_dbm,
            "oip3_dbm": None,
            "iip3_dbm": None,
            "op1db_dbm": None,
            "ip1db_dbm": None,
            "noise_floor_dbm": -173.98 + 10.0 * math.log10(max(1.0, bandwidth_hz)),
            "snr_db": 0.0,
            "stages": []
        }

    k_boltzmann = 1.380649e-23
    thermal_noise_density_dbm = 10.0 * math.log10(k_boltzmann * temperature_k * 1000.0)  # ~ -173.98 dBm/Hz
    kTB_dbm = thermal_noise_density_dbm + 10.0 * math.log10(max(1.0, bandwidth_hz))

    cum_gain_lin = 1.0
    cum_noise_factor = 1.0
    inv_oip3_lin = 0.0
    inv_op1db_lin = 0.0

    stage_results = []

    for i, s in enumerate(stages):
        name = s.get("name") or f"Stage_{i+1}"
        stype = s.get("type", "generic")
        gain_db = float(s.get("gain", 0.0))
        nf_db = float(s.get("nf", 0.0))
        stage_oip3_dbm = s.get("oip3")
        stage_op1db_dbm = s.get("op1db")

        # Linear conversions
        g_lin = 10.0 ** (gain_db / 10.0)
        f_lin = 10.0 ** (nf_db / 10.0)

        # Friis Cascade Noise Factor: F_total = F_prev + (F_curr - 1) / G_prev_total
        if i == 0:
            cum_noise_factor = f_lin
            cum_gain_lin = g_lin
        else:
            cum_noise_factor = cum_noise_factor + (f_lin - 1.0) / cum_gain_lin
            cum_gain_lin *= g_lin

        cum_gain_db = 10.0 * math.log10(max(1e-12, cum_gain_lin))
        cum_nf_db = 10.0 * math.log10(max(1.0, cum_noise_factor))

        p_out_dbm = input_power_dbm + cum_gain_db
        noise_floor_dbm = kTB_dbm + cum_nf_db + cum_gain_db
        snr_db = p_out_dbm - noise_floor_dbm

        # Cascade IP3 (referred to output of current stage)
        # 1/OIP3_tot = 1/(OIP3_prev * g_curr) + 1/OIP3_curr
        cum_oip3_dbm = None
        cum_iip3_dbm = None
        if stage_oip3_dbm is not None:
            stage_oip3_lin = 10.0 ** (float(stage_oip3_dbm) / 10.0)
            if i == 0 or inv_oip3_lin == 0.0:
                inv_oip3_lin = 1.0 / max(1e-9, stage_oip3_lin)
            else:
                inv_oip3_lin = (inv_oip3_lin / max(1e-9, g_lin)) + (1.0 / max(1e-9, stage_oip3_lin))
            if inv_oip3_lin > 0:
                cum_oip3_dbm = round(10.0 * math.log10(1.0 / inv_oip3_lin), 2)
                cum_iip3_dbm = round(cum_oip3_dbm - cum_gain_db, 2)

        # Cascade P1dB
        cum_op1db_dbm = None
        cum_ip1db_dbm = None
        if stage_op1db_dbm is not None:
            stage_op1db_lin = 10.0 ** (float(stage_op1db_dbm) / 10.0)
            if i == 0 or inv_op1db_lin == 0.0:
                inv_op1db_lin = 1.0 / max(1e-9, stage_op1db_lin)
            else:
                inv_op1db_lin = (inv_op1db_lin / max(1e-9, g_lin)) + (1.0 / max(1e-9, stage_op1db_lin))
            if inv_op1db_lin > 0:
                cum_op1db_dbm = round(10.0 * math.log10(1.0 / inv_op1db_lin), 2)
                cum_ip1db_dbm = round(cum_op1db_dbm - cum_gain_db, 2)

        # Spurious-Free Dynamic Range (SFDR)
        sfdr_db = None
        if cum_oip3_dbm is not None:
            sfdr_db = round((2.0 / 3.0) * (cum_oip3_dbm - noise_floor_dbm), 2)

        stage_results.append({
            "stage_index": i + 1,
            "name": name,
            "type": stype,
            "gain_db": round(gain_db, 2),
            "cum_gain_db": round(cum_gain_db, 2),
            "nf_db": round(nf_db, 2),
            "cum_nf_db": round(cum_nf_db, 2),
            "power_out_dbm": round(p_out_dbm, 2),
            "noise_floor_dbm": round(noise_floor_dbm, 2),
            "snr_db": round(snr_db, 2),
            "oip3_dbm": cum_oip3_dbm,
            "iip3_dbm": cum_iip3_dbm,
            "op1db_dbm": cum_op1db_dbm,
            "ip1db_dbm": cum_ip1db_dbm,
            "sfdr_db": sfdr_db
        })

    last_stage = stage_results[-1]
    return {
        "total_gain_db": last_stage["cum_gain_db"],
        "total_nf_db": last_stage["cum_nf_db"],
        "output_power_dbm": last_stage["power_out_dbm"],
        "oip3_dbm": last_stage["oip3_dbm"],
        "iip3_dbm": last_stage["iip3_dbm"],
        "op1db_dbm": last_stage["op1db_dbm"],
        "ip1db_dbm": last_stage["ip1db_dbm"],
        "noise_floor_dbm": last_stage["noise_floor_dbm"],
        "snr_db": last_stage["snr_db"],
        "bandwidth_hz": bandwidth_hz,
        "stages": stage_results
    }

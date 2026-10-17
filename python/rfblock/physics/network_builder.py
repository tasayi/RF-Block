"""
Network Builder: Converts front-end schematic block definitions into scikit-rf Network objects
using physical Pi-network synthesis for passive loss elements and behavioral S-matrices for active blocks.
"""

from typing import Dict, Any, Optional
import numpy as np
import skrf
from .synthesizer import synthesize_pi_network


def extract_component_loss_db(
    block: Dict[str, Any],
    in_port: Optional[str] = None,
    out_port: Optional[str] = None
) -> float:
    """
    Determines effective insertion loss (in dB) between specified in_port and out_port.
    Takes into account component directionality, switch states, and coupler arms.
    """
    btype = block.get("type", "")
    params = block.get("params", {})

    if btype == "switch":
        state = str(params.get("state", "1"))
        il = float(params.get("il", 0.8))
        iso = float(params.get("iso", 40.0))
        if out_port is not None:
            return il if out_port == f"o{state}" else iso
        return il

    if btype == "coupler":
        ctype = params.get("ctype", "Directional")
        il = float(params.get("il", 0.5))
        cpl = float(params.get("cpl", 10.0))
        directivity = float(params.get("directivity", 20.0))

        if ctype == "Directional":
            if out_port == "cpl":
                return cpl
            if out_port == "iso":
                return cpl + directivity
            return il

        if ctype == "Bi-directional":
            if out_port in ("fwd", "rev"):
                return cpl
            return il

        if ctype == "Power tap":
            tap = float(params.get("tap", cpl))
            return tap if out_port == "tap" else il

        if ctype == "Resistive":
            return 6.0

        if "hybrid" in ctype.lower():
            exloss = float(params.get("exloss", 0.3))
            return 3.0 + exloss

        return il

    if btype in ("splitter", "combiner"):
        ways = int(params.get("ways", 2))
        exloss = float(params.get("exloss", 0.3))
        return 10.0 * np.log10(max(1, ways)) + exloss

    if btype in ("filter", "tfilter"):
        band = params.get("band", "passband")
        if band == "stopband":
            return float(params.get("rej", 40.0))
        return float(params.get("il", 1.5))

    if btype == "eq":
        min_loss = float(params.get("minLoss", 1.0))
        slope = float(params.get("slope", 3.0))
        return min_loss + (slope / 2.0)

    if btype == "isolator":
        if (in_port, out_port) == ("out", "in"):
            return float(params.get("iso", 25.0))
        return float(params.get("il", 0.4))

    if btype == "circulator":
        # Forward circulation
        valid_forward = {("p1", "p2"), ("p2", "p3"), ("p3", "p1")}
        if in_port and out_port and (in_port, out_port) not in valid_forward:
            return float(params.get("iso", 20.0))
        return float(params.get("il", 0.4))

    if btype == "bamp" and params.get("mode") == "Bypass Mode":
        return float(params.get("bypLoss", 1.5))

    # General attenuator, DSA, trace, limiter, termination, etc.
    return float(params.get("atten", params.get("il", params.get("loss", params.get("conv_loss", 0.0)))))


from .synthesizer import (
    synthesize_pi_network,
    synthesize_switch_network,
    synthesize_splitter_network,
    synthesize_combiner_network,
    synthesize_coupler_network,
    extract_subnetwork_2port
)


def get_block_port_index(btype: str, port_name: Optional[str], block_params: Dict[str, Any]) -> int:
    """
    Returns 0-based port index for a given block type and terminal port name.
    """
    if not port_name:
        if btype == "switch":
            st = block_params.get("state", "1")
            return int(st) if str(st).isdigit() else 1
        return 0
    p = str(port_name).lower()

    if btype == "switch":
        if p == "in":
            return 0
        if p.startswith("o") and p[1:].isdigit():
            return int(p[1:])
        return 0

    if btype == "splitter":
        if p == "in":
            return 0
        if p.startswith("o") and p[1:].isdigit():
            return int(p[1:])
        return 0

    if btype == "combiner":
        if p == "out":
            return 0
        if p.startswith("i") and p[1:].isdigit():
            return int(p[1:])
        return 0

    if btype == "coupler":
        if p == "in":
            return 0
        if p in ("thru", "out"):
            return 1
        if p == "cpl":
            return 2
        if p == "iso":
            return 3
        if p in ("o1", "out0"):
            return 1
        if p in ("o2", "out90", "tap"):
            return 2
        return 0

    if btype == "circulator":
        if p == "p1":
            return 0
        if p == "p2":
            return 1
        if p == "p3":
            return 2
        return 0

    return 1 if p in ("out", "p2") else 0


def load_touchstone_network(s2p_text: str, freq: skrf.Frequency, label: str = "") -> Optional[skrf.Network]:
    """
    Parses a Touchstone (.s1p, .s2p, .s3p, .s4p) text string into an interpolated skrf.Network object.
    """
    if not s2p_text or not isinstance(s2p_text, str) or not s2p_text.strip():
        return None
    import tempfile
    import os

    for sfx in [".s2p", ".s3p", ".s4p", ".s1p"]:
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile("w", suffix=sfx, delete=False) as f:
                f.write(s2p_text)
                f.flush()
                tmp_path = f.name
            raw_net = skrf.Network(tmp_path)
            net = raw_net.interpolate(freq)
            if label:
                net.name = label
            return net
        except Exception:
            continue
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
    return None


def build_block_network(
    block: Dict[str, Any],
    freq: skrf.Frequency,
    in_port: Optional[str] = None,
    out_port: Optional[str] = None
) -> skrf.Network:
    """
    Construct a 2-port skrf.Network for a single component block along the traversed signal path.
    Prioritizes attached Touchstone data (2-port or N-port), then synthesizes behavioral multi-port
    models (Switch, Splitter, Combiner, Coupler) or physical Pi-networks for 2-port loss elements.
    """
    btype = block.get("type", "")
    params = block.get("params", {})
    label = params.get("label", btype)
    n_pts = len(freq)

    # Check for attached Touchstone data
    s2p_text = None
    if btype == "bamp":
        is_byp = (params.get("mode") == "Bypass Mode")
        s2p_text = params.get("s2pData_byp") if is_byp else params.get("s2pData_amp")
    elif btype == "switch" and out_port and out_port.startswith("o"):
        throw_num = out_port[1:]
        s2p_text = params.get(f"s2pData_st{throw_num}")

    if not s2p_text:
        s2p_text = params.get("s2pData") or params.get("s3pData") or params.get("snpData")

    if s2p_text:
        loaded_net = load_touchstone_network(s2p_text, freq=freq, label=label)
        if loaded_net is not None:
            if loaded_net.nports >= 3:
                idx_a = get_block_port_index(btype, in_port, params)
                idx_b = get_block_port_index(btype, out_port, params)
                return extract_subnetwork_2port(loaded_net, idx_a, idx_b)
            return loaded_net

    # Return Loss & Port impedance
    rl_db = float(params.get("s11", params.get("rl", -20.0)))
    z0 = float(params.get("z0", 50.0))

    # Active Amplifier handling (amp or active bamp)
    is_active_amp = (btype == "amp") or (btype == "bamp" and params.get("mode") != "Bypass Mode")
    if is_active_amp:
        gain_db = float(params.get("gain", params.get("g", 0.0)))
        iso_db = float(params.get("s12", params.get("iso", -30.0)))

        s_mat = np.zeros((n_pts, 2, 2), dtype=complex)
        s_mat[:, 1, 0] = 10.0 ** (gain_db / 20.0)   # S21
        s_mat[:, 0, 1] = 10.0 ** (iso_db / 20.0)    # S12

        s11_mag = 10.0 ** (rl_db / 20.0) if rl_db < 0 else 0.0
        s_mat[:, 0, 0] = s11_mag                     # S11
        s_mat[:, 1, 1] = s11_mag                     # S22
        return skrf.Network(frequency=freq, s=s_mat, z0=z0, name=label)

    # Multi-port behavioral synthesis for Switch
    if btype == "switch":
        throws = int(params.get("throws", 2))
        st_raw = params.get("state", "1")
        state = int(st_raw) if str(st_raw).isdigit() else 1
        il_db = float(params.get("il", 0.8))
        iso_db = float(params.get("iso", 40.0))
        full_net = synthesize_switch_network(
            throws=throws,
            state=state,
            il_db=il_db,
            iso_db=iso_db,
            freq=freq,
            z0=z0,
            return_loss_db=rl_db,
            name=label
        )
        idx_a = get_block_port_index(btype, in_port, params)
        idx_b = get_block_port_index(btype, out_port, params)
        return extract_subnetwork_2port(full_net, idx_a, idx_b)

    # Multi-port behavioral synthesis for Splitter
    if btype == "splitter":
        ways = int(params.get("ways", 2))
        exloss = float(params.get("exloss", 0.3))
        iso_db = float(params.get("iso", 25.0))
        full_net = synthesize_splitter_network(
            ways=ways,
            exloss_db=exloss,
            freq=freq,
            z0=z0,
            iso_db=iso_db,
            return_loss_db=rl_db,
            name=label
        )
        idx_a = get_block_port_index(btype, in_port, params)
        idx_b = get_block_port_index(btype, out_port, params)
        return extract_subnetwork_2port(full_net, idx_a, idx_b)

    # Multi-port behavioral synthesis for Combiner
    if btype == "combiner":
        ways = int(params.get("ways", 2))
        exloss = float(params.get("exloss", 0.3))
        iso_db = float(params.get("iso", 25.0))
        full_net = synthesize_combiner_network(
            ways=ways,
            exloss_db=exloss,
            freq=freq,
            z0=z0,
            iso_db=iso_db,
            return_loss_db=rl_db,
            name=label
        )
        idx_a = get_block_port_index(btype, in_port, params)
        idx_b = get_block_port_index(btype, out_port, params)
        return extract_subnetwork_2port(full_net, idx_a, idx_b)

    # Multi-port behavioral synthesis for Coupler
    if btype == "coupler":
        cpl_db = float(params.get("cpl", 10.0))
        il_db = float(params.get("il", 0.5))
        dir_db = float(params.get("directivity", 20.0))
        full_net = synthesize_coupler_network(
            coupling_db=cpl_db,
            il_db=il_db,
            directivity_db=dir_db,
            freq=freq,
            z0=z0,
            return_loss_db=rl_db,
            name=label
        )
        idx_a = get_block_port_index(btype, in_port, params)
        idx_b = get_block_port_index(btype, out_port, params)
        return extract_subnetwork_2port(full_net, idx_a, idx_b)

    # For all other 2-port passive elements, synthesize using Pi-network model
    loss_db = extract_component_loss_db(block, in_port=in_port, out_port=out_port)
    return synthesize_pi_network(
        loss_db=loss_db,
        freq=freq,
        z0=z0,
        return_loss_db=rl_db,
        name=label
    )

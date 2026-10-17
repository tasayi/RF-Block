"""
Network Builder: Converts front-end schematic block definitions into scikit-rf Network objects
using physical synthesizers and Touchstone data.
"""

from typing import Dict, Any, Optional, Tuple
import os
import tempfile
import numpy as np
import skrf
from .synthesizer import (
    synthesize_pi_network,
    synthesize_switch_network,
    synthesize_splitter_network,
    synthesize_combiner_network,
    synthesize_coupler_network,
    synthesize_isolator_network,
    synthesize_circulator_network,
    synthesize_phase_shifter,
    synthesize_transmission_line,
    synthesize_filter_network,
    synthesize_mixer_network,
    extract_subnetwork_2port
)


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
        valid_forward = {("p1", "p2"), ("p2", "p3"), ("p3", "p1")}
        if in_port and out_port and (in_port, out_port) not in valid_forward:
            return float(params.get("iso", 20.0))
        return float(params.get("il", 0.4))

    if btype == "bamp" and params.get("mode") == "Bypass Mode":
        return float(params.get("bypLoss", 1.5))

    if btype == "mixer":
        return float(params.get("cl", params.get("conv_loss", 7.0)))

    if btype == "phase":
        return float(params.get("il", 1.0))

    return float(params.get("atten", params.get("il", params.get("loss", params.get("cl", params.get("conv_loss", 0.0))))))


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
        if p in ("in", "p1"):
            return 0
        if p.startswith("o") and p[1:].isdigit():
            return int(p[1:])
        return 0

    if btype == "splitter":
        if p in ("in", "p1"):
            return 0
        if p.startswith("o") and p[1:].isdigit():
            return int(p[1:])
        return 0

    if btype == "combiner":
        if p in ("out", "p1"):
            return 0
        if p.startswith("i") and p[1:].isdigit():
            return int(p[1:])
        return 0

    if btype == "coupler":
        if p in ("in", "p1"):
            return 0
        if p in ("thru", "out", "o1", "out0", "p2"):
            return 1
        if p in ("cpl", "o2", "out90", "tap", "fwd", "p3"):
            return 2
        if p in ("iso", "rev", "p4"):
            return 3
        return 0

    if btype == "circulator":
        if p in ("p1", "in"):
            return 0
        if p in ("p2", "out"):
            return 1
        if p == "p3":
            return 2
        return 0

    if btype == "mixer":
        if p in ("rf", "in", "p1"):
            return 0
        if p in ("if", "out", "p2"):
            return 1
        if p in ("lo", "p3"):
            return 2
        return 0

    if btype == "antenna":
        return 0

    return 1 if p in ("out", "p2") else 0


def load_touchstone_network(s2p_text: str, freq: skrf.Frequency, label: str = "") -> Optional[skrf.Network]:
    """
    Parses a Touchstone (.s1p, .s2p, .s3p, .s4p, .snp) text string into an
    extrapolated/interpolated skrf.Network object.
    """
    if not s2p_text or not isinstance(s2p_text, str) or not s2p_text.strip():
        return None

    for sfx in [".s2p", ".s3p", ".s4p", ".s1p", ".snp"]:
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile("w", suffix=sfx, delete=False) as f:
                f.write(s2p_text)
                f.flush()
                tmp_path = f.name
            raw_net = skrf.Network(tmp_path)
            # Extrapolate cleanly if frequency band extends beyond measured points
            net = raw_net.interpolate(freq, bounds_error=False, fill_value="extrapolate")
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
    out_port: Optional[str] = None,
    full_ports: bool = False
) -> skrf.Network:
    """
    Construct a skrf.Network for a component block.
    If full_ports is True or (in_port is None and out_port is None for multi-port),
    returns the complete N-port network. Otherwise extracts the 2-port subnetwork
    between in_port and out_port.
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
        s2p_text = params.get("s2pData") or params.get("s3pData") or params.get("snpData") or params.get("s4pData")

    if s2p_text:
        loaded_net = load_touchstone_network(s2p_text, freq=freq, label=label)
        if loaded_net is not None:
            if full_ports or (in_port is None and out_port is None):
                return loaded_net
            if loaded_net.nports >= 3:
                idx_a = get_block_port_index(btype, in_port, params)
                idx_b = get_block_port_index(btype, out_port, params)
                return extract_subnetwork_2port(loaded_net, idx_a, idx_b)
            return loaded_net

    rl_db = float(params.get("s11", params.get("rl", -20.0)))
    z0 = float(params.get("z0", 50.0))

    # Active Amplifier handling
    is_active_amp = (btype == "amp") or (btype == "bamp" and params.get("mode") != "Bypass Mode")
    if is_active_amp:
        gain_db = float(params.get("gain", params.get("g", 0.0)))
        # Reverse isolation: always negative dB
        iso_param = float(params.get("s12", params.get("iso", 30.0)))
        iso_db = -abs(iso_param)

        s_mat = np.zeros((n_pts, 2, 2), dtype=complex)
        s_mat[:, 1, 0] = 10.0 ** (gain_db / 20.0)
        s_mat[:, 0, 1] = 10.0 ** (iso_db / 20.0)
        s11_mag = 10.0 ** (rl_db / 20.0) if rl_db < 0 else 0.01
        s_mat[:, 0, 0] = s11_mag
        s_mat[:, 1, 1] = s11_mag
        return skrf.Network(frequency=freq, s=s_mat, z0=z0, name=label)

    # SPnT Switch
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
        if full_ports or (in_port is None and out_port is None):
            return full_net
        idx_a = get_block_port_index(btype, in_port, params)
        idx_b = get_block_port_index(btype, out_port, params)
        return extract_subnetwork_2port(full_net, idx_a, idx_b)

    # Splitter
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
        if full_ports or (in_port is None and out_port is None):
            return full_net
        idx_a = get_block_port_index(btype, in_port, params)
        idx_b = get_block_port_index(btype, out_port, params)
        return extract_subnetwork_2port(full_net, idx_a, idx_b)

    # Combiner
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
        if full_ports or (in_port is None and out_port is None):
            return full_net
        idx_a = get_block_port_index(btype, in_port, params)
        idx_b = get_block_port_index(btype, out_port, params)
        return extract_subnetwork_2port(full_net, idx_a, idx_b)

    # Directional Coupler
    if btype == "coupler":
        cpl_db = float(params.get("cpl", params.get("coupling", 10.0)))
        il_db = float(params.get("il", 0.5))
        dir_db = float(params.get("directivity", params.get("iso", 20.0)))
        full_net = synthesize_coupler_network(
            coupling_db=cpl_db,
            il_db=il_db,
            directivity_db=dir_db,
            freq=freq,
            z0=z0,
            return_loss_db=rl_db,
            name=label
        )
        if full_ports or (in_port is None and out_port is None):
            return full_net
        idx_a = get_block_port_index(btype, in_port, params)
        idx_b = get_block_port_index(btype, out_port, params)
        return extract_subnetwork_2port(full_net, idx_a, idx_b)

    # Circulator
    if btype == "circulator":
        il_db = float(params.get("il", 0.5))
        iso_db = float(params.get("iso", 20.0))
        full_net = synthesize_circulator_network(
            il_db=il_db,
            iso_db=iso_db,
            freq=freq,
            z0=z0,
            return_loss_db=rl_db,
            name=label
        )
        if full_ports or (in_port is None and out_port is None):
            return full_net
        idx_a = get_block_port_index(btype, in_port, params)
        idx_b = get_block_port_index(btype, out_port, params)
        return extract_subnetwork_2port(full_net, idx_a, idx_b)

    # Isolator
    if btype == "isolator":
        il_db = float(params.get("il", 0.6))
        iso_db = float(params.get("iso", 25.0))
        return synthesize_isolator_network(
            il_db=il_db,
            iso_db=iso_db,
            freq=freq,
            z0=z0,
            return_loss_db=rl_db,
            name=label
        )

    # Phase Shifter
    if btype == "phase":
        phase_deg = float(params.get("phase", params.get("shift", params.get("deg", 0.0))))
        il_db = float(params.get("il", 1.0))
        return synthesize_phase_shifter(
            phase_deg=phase_deg,
            il_db=il_db,
            freq=freq,
            z0=z0,
            return_loss_db=rl_db,
            name=label
        )

    # Transmission Line / Trace
    if btype == "trace":
        loss_db = float(params.get("loss", 1.0))
        length_m = float(params.get("length", params.get("len", 0.01)))
        return synthesize_transmission_line(
            loss_db=loss_db,
            length_m=length_m,
            freq=freq,
            z0=z0,
            return_loss_db=rl_db,
            name=label
        )

    # Filters
    if btype in ("filter", "tfilter"):
        ftype = params.get("ftype", "BPF")
        fc_val = params.get("fc", "")
        il_db = float(params.get("il", 1.5))
        rej_db = float(params.get("rej", 40.0))
        band_state = params.get("band", "passband")
        return synthesize_filter_network(
            ftype=ftype,
            fc_val=fc_val,
            il_db=il_db,
            rej_db=rej_db,
            freq=freq,
            band_state=band_state,
            z0=z0,
            return_loss_db=rl_db,
            name=label
        )

    # Mixer
    if btype == "mixer":
        cl_db = float(params.get("cl", params.get("conv_loss", 7.0)))
        iso_db = float(params.get("iso", 30.0))
        full_net = synthesize_mixer_network(
            cl_db=cl_db,
            iso_db=iso_db,
            freq=freq,
            z0=z0,
            name=label
        )
        if full_ports or (in_port is None and out_port is None):
            return full_net
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

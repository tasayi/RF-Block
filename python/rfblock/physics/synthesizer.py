"""
Synthesizer: Synthesizes physical and behavioral S-parameter models for RF components
with specified loss, attenuation, phase, isolation, filtering, or return loss.
"""

from typing import Tuple, Dict, Any, Optional
import re
import numpy as np
import skrf


def calculate_pi_resistors(loss_db: float, z0: float = 50.0) -> Tuple[float, float]:
    """
    Calculates the physical resistor values for a symmetric Pi-attenuator network
    matching system impedance z0.

    Returns:
        (r_shunt, r_series):
            r_shunt: Resistor from Port 1 and Port 2 to ground (Ohms).
            r_series: Resistor between Port 1 and Port 2 (Ohms).
    """
    loss_db = max(0.0, float(loss_db))
    if loss_db == 0.0:
        return (float("inf"), 0.0)

    # Voltage attenuation factor k = Vin / Vout >= 1
    k = 10.0 ** (loss_db / 20.0)

    # Symmetric Pi-pad analytical formulas
    r_shunt = z0 * (k + 1.0) / (k - 1.0)
    r_series = z0 * (k ** 2 - 1.0) / (2.0 * k)

    return (float(r_shunt), float(r_series))


def synthesize_pi_network(
    loss_db: float,
    freq: skrf.Frequency,
    z0: float = 50.0,
    return_loss_db: Optional[float] = None,
    name: str = "pi_network"
) -> skrf.Network:
    """
    Synthesizes a physical/behavioral 2-port skrf.Network based on a symmetric
    Pi-attenuator network.
    """
    n_pts = len(freq)
    loss_db = max(0.0, float(loss_db))
    r_shunt, r_series = calculate_pi_resistors(loss_db, z0=z0)

    # Transmission magnitude S21 and S12 (reciprocal)
    s21_mag = 10.0 ** (-loss_db / 20.0)
    s12_mag = s21_mag

    # Reflection magnitude S11 and S22
    if return_loss_db is not None and return_loss_db < 0:
        s11_mag = 10.0 ** (float(return_loss_db) / 20.0)
    else:
        s11_mag = 10.0 ** (-60.0 / 20.0)  # Effectively matched (-60 dB = 0.001)

    # Enforce energy conservation / passivity: |S11|^2 + |S21|^2 <= 1.0
    max_s11_sq = max(0.0, 1.0 - (s21_mag ** 2))
    if (s11_mag ** 2) > max_s11_sq:
        s11_mag = np.sqrt(max_s11_sq)

    s22_mag = s11_mag

    # Construct frequency-domain S-matrix
    s_mat = np.zeros((n_pts, 2, 2), dtype=complex)
    s_mat[:, 1, 0] = s21_mag
    s_mat[:, 0, 1] = s12_mag
    s_mat[:, 0, 0] = s11_mag
    s_mat[:, 1, 1] = s22_mag

    net = skrf.Network(frequency=freq, s=s_mat, z0=z0, name=name)
    net.params = {
        "r_shunt": r_shunt,
        "r_series": r_series,
        "loss_db": loss_db,
        "z0": z0,
        "s11_db": 20.0 * np.log10(max(1e-12, s11_mag)),
        "s21_db": -loss_db
    }
    return net


def synthesize_switch_network(
    throws: int,
    state: int,
    il_db: float,
    iso_db: float,
    freq: skrf.Frequency,
    z0: float = 50.0,
    return_loss_db: float = -20.0,
    name: str = "switch",
    throw_networks: Optional[Dict[int, skrf.Network]] = None
) -> skrf.Network:
    """
    Synthesizes an (N+1)-port behavioral skrf.Network for an SPnT switch.
    Port 0: Common ('in')
    Port k (1 <= k <= throws): Throw k ('ok')

    If throw_networks is provided, measured Touchstone data is embedded for the
    respective throws, taking strict precedence over scalar il_db/iso_db.
    """
    throws = max(1, int(throws))
    state = int(state)
    n_pts = len(freq)
    num_ports = throws + 1

    s_mat = np.zeros((n_pts, num_ports, num_ports), dtype=complex)

    # Return Loss magnitude for each port
    rl_mag = 10.0 ** (float(return_loss_db) / 20.0) if return_loss_db < 0 else 0.01
    for p in range(num_ports):
        s_mat[:, p, p] = rl_mag

    # Off-diagonal elements: Common to each throw
    il_mag = 10.0 ** (-abs(float(il_db)) / 20.0)
    iso_mag = 10.0 ** (-abs(float(iso_db)) / 20.0)

    for k in range(1, num_ports):
        mag = il_mag if (k == state and state > 0) else iso_mag
        s_mat[:, 0, k] = mag
        s_mat[:, k, 0] = mag

    # Inter-throw isolation (between throws j and k)
    for j in range(1, num_ports):
        for k in range(j + 1, num_ports):
            s_mat[:, j, k] = iso_mag
            s_mat[:, k, j] = iso_mag

    # Embed measured Touchstone networks where present
    if throw_networks:
        for k, t_net in throw_networks.items():
            if 1 <= k <= throws and t_net is not None and t_net.nports >= 2:
                if k == state and state > 0:
                    s_mat[:, 0, 0] = t_net.s[:, 0, 0]
                    s_mat[:, 0, k] = t_net.s[:, 0, 1]
                    s_mat[:, k, 0] = t_net.s[:, 1, 0]
                    s_mat[:, k, k] = t_net.s[:, 1, 1]
                else:
                    # Inactive / isolated throw:
                    # If this file specifically characterizes an isolation state (mean transmission < -15 dB), embed it.
                    # Otherwise, the throw is off in this state, so retain physical switch isolation.
                    mean_trans_db = float(20.0 * np.log10(np.maximum(1e-12, np.mean(np.abs(t_net.s[:, 1, 0])))))
                    if mean_trans_db < -15.0:
                        s_mat[:, 0, k] = t_net.s[:, 0, 1]
                        s_mat[:, k, 0] = t_net.s[:, 1, 0]
                        s_mat[:, k, k] = t_net.s[:, 1, 1]

    net = skrf.Network(frequency=freq, s=s_mat, z0=z0, name=name)
    net.params = {
        "throws": throws,
        "state": state,
        "il_db": il_db,
        "iso_db": iso_db,
        "z0": z0,
        "num_ports": num_ports
    }
    return net


def synthesize_splitter_network(
    ways: int,
    exloss_db: float,
    freq: skrf.Frequency,
    z0: float = 50.0,
    iso_db: float = 25.0,
    return_loss_db: float = -20.0,
    name: str = "splitter"
) -> skrf.Network:
    """
    Synthesizes an (N+1)-port behavioral skrf.Network for a 1:N power splitter.
    Port 0: Common input ('in')
    Port k (1 <= k <= ways): Output k ('ok')
    """
    ways = max(1, int(ways))
    n_pts = len(freq)
    num_ports = ways + 1

    s_mat = np.zeros((n_pts, num_ports, num_ports), dtype=complex)

    rl_mag = 10.0 ** (float(return_loss_db) / 20.0) if return_loss_db < 0 else 0.01
    for p in range(num_ports):
        s_mat[:, p, p] = rl_mag

    split_loss_db = 10.0 * np.log10(ways) + max(0.0, float(exloss_db))
    split_mag = 10.0 ** (-split_loss_db / 20.0)
    iso_mag = 10.0 ** (-abs(float(iso_db)) / 20.0)

    for k in range(1, num_ports):
        s_mat[:, 0, k] = split_mag
        s_mat[:, k, 0] = split_mag

    for j in range(1, num_ports):
        for k in range(j + 1, num_ports):
            s_mat[:, j, k] = iso_mag
            s_mat[:, k, j] = iso_mag

    net = skrf.Network(frequency=freq, s=s_mat, z0=z0, name=name)
    net.params = {
        "ways": ways,
        "exloss_db": exloss_db,
        "split_loss_db": split_loss_db,
        "iso_db": iso_db,
        "z0": z0,
        "num_ports": num_ports
    }
    return net


def synthesize_combiner_network(
    ways: int,
    exloss_db: float,
    freq: skrf.Frequency,
    z0: float = 50.0,
    iso_db: float = 25.0,
    return_loss_db: float = -20.0,
    name: str = "combiner"
) -> skrf.Network:
    """
    Synthesizes an (N+1)-port behavioral skrf.Network for an N:1 power combiner.
    Port 0: Common output ('out')
    Port k (1 <= k <= ways): Input k ('ik')
    """
    net = synthesize_splitter_network(
        ways=ways,
        exloss_db=exloss_db,
        freq=freq,
        z0=z0,
        iso_db=iso_db,
        return_loss_db=return_loss_db,
        name=name
    )
    return net


def synthesize_coupler_network(
    coupling_db: float,
    il_db: float,
    directivity_db: float,
    freq: skrf.Frequency,
    z0: float = 50.0,
    return_loss_db: float = -20.0,
    name: str = "coupler"
) -> skrf.Network:
    """
    Synthesizes a 4-port behavioral skrf.Network for a directional coupler.
    Port 0: IN ('in')
    Port 1: OUT/THRU ('thru' or 'out')
    Port 2: CPL ('cpl')
    Port 3: ISO ('iso')
    """
    n_pts = len(freq)
    num_ports = 4
    s_mat = np.zeros((n_pts, num_ports, num_ports), dtype=complex)

    rl_mag = 10.0 ** (float(return_loss_db) / 20.0) if return_loss_db < 0 else 0.01
    for p in range(num_ports):
        s_mat[:, p, p] = rl_mag

    il_mag = 10.0 ** (-abs(float(il_db)) / 20.0)
    cpl_mag = 10.0 ** (-abs(float(coupling_db)) / 20.0)
    iso_mag = 10.0 ** (-(abs(float(coupling_db)) + abs(float(directivity_db))) / 20.0)

    # Port 0 (IN) connections:
    s_mat[:, 0, 1] = s_mat[:, 1, 0] = il_mag
    # Coupled port has 90 deg (-j) phase in quadrature directional couplers
    s_mat[:, 0, 2] = s_mat[:, 2, 0] = -1j * cpl_mag
    s_mat[:, 0, 3] = s_mat[:, 3, 0] = iso_mag

    # Port 1 (THRU) connections:
    s_mat[:, 1, 2] = s_mat[:, 2, 1] = iso_mag
    s_mat[:, 1, 3] = s_mat[:, 3, 1] = -1j * cpl_mag

    # Port 2 (CPL) to Port 3 (ISO):
    s_mat[:, 2, 3] = s_mat[:, 3, 2] = il_mag

    net = skrf.Network(frequency=freq, s=s_mat, z0=z0, name=name)
    net.params = {
        "coupling_db": coupling_db,
        "il_db": il_db,
        "directivity_db": directivity_db,
        "z0": z0,
        "num_ports": num_ports
    }
    return net


def synthesize_isolator_network(
    il_db: float,
    iso_db: float,
    freq: skrf.Frequency,
    z0: float = 50.0,
    return_loss_db: float = -20.0,
    name: str = "isolator"
) -> skrf.Network:
    """
    Synthesizes a 2-port non-reciprocal skrf.Network for an RF isolator.
    Port 0: IN ('in')
    Port 1: OUT ('out')
    Forward S21 = -il_db, Reverse S12 = -iso_db.
    """
    n_pts = len(freq)
    s_mat = np.zeros((n_pts, 2, 2), dtype=complex)
    rl_mag = 10.0 ** (float(return_loss_db) / 20.0) if return_loss_db < 0 else 0.01

    il_mag = 10.0 ** (-abs(float(il_db)) / 20.0)
    iso_mag = 10.0 ** (-abs(float(iso_db)) / 20.0)

    s_mat[:, 0, 0] = s_mat[:, 1, 1] = rl_mag
    s_mat[:, 1, 0] = il_mag   # Forward S21
    s_mat[:, 0, 1] = iso_mag  # Reverse S12 (high isolation)

    return skrf.Network(frequency=freq, s=s_mat, z0=z0, name=name)


def synthesize_circulator_network(
    il_db: float,
    iso_db: float,
    freq: skrf.Frequency,
    z0: float = 50.0,
    return_loss_db: float = -20.0,
    name: str = "circulator"
) -> skrf.Network:
    """
    Synthesizes a 3-port non-reciprocal skrf.Network for a 3-port circulator.
    Port 0: P1 ('p1')
    Port 1: P2 ('p2')
    Port 2: P3 ('p3')
    Circulation: P1 -> P2, P2 -> P3, P3 -> P1 with insertion loss il_db.
    Reverse isolation: P2 -> P1, P3 -> P2, P1 -> P3 with isolation iso_db.
    """
    n_pts = len(freq)
    s_mat = np.zeros((n_pts, 3, 3), dtype=complex)
    rl_mag = 10.0 ** (float(return_loss_db) / 20.0) if return_loss_db < 0 else 0.01
    for p in range(3):
        s_mat[:, p, p] = rl_mag

    il_mag = 10.0 ** (-abs(float(il_db)) / 20.0)
    iso_mag = 10.0 ** (-abs(float(iso_db)) / 20.0)

    # Forward circulation
    s_mat[:, 1, 0] = il_mag  # P1 -> P2
    s_mat[:, 2, 1] = il_mag  # P2 -> P3
    s_mat[:, 0, 2] = il_mag  # P3 -> P1

    # Reverse isolation
    s_mat[:, 0, 1] = iso_mag  # P2 -> P1
    s_mat[:, 1, 2] = iso_mag  # P3 -> P2
    s_mat[:, 2, 0] = iso_mag  # P1 -> P3

    return skrf.Network(frequency=freq, s=s_mat, z0=z0, name=name)


def synthesize_phase_shifter(
    phase_deg: float,
    il_db: float,
    freq: skrf.Frequency,
    z0: float = 50.0,
    return_loss_db: float = -20.0,
    name: str = "phase_shifter"
) -> skrf.Network:
    """
    Synthesizes a 2-port skrf.Network for a phase shifter with specified phase and loss.
    """
    n_pts = len(freq)
    s_mat = np.zeros((n_pts, 2, 2), dtype=complex)
    rl_mag = 10.0 ** (float(return_loss_db) / 20.0) if return_loss_db < 0 else 0.01

    il_mag = 10.0 ** (-abs(float(il_db)) / 20.0)
    rad = np.deg2rad(float(phase_deg))
    phase_factor = np.exp(1j * rad)

    s_mat[:, 0, 0] = s_mat[:, 1, 1] = rl_mag
    s_mat[:, 1, 0] = il_mag * phase_factor
    s_mat[:, 0, 1] = il_mag * phase_factor

    return skrf.Network(frequency=freq, s=s_mat, z0=z0, name=name)


def synthesize_transmission_line(
    loss_db: float,
    length_m: float,
    freq: skrf.Frequency,
    z0: float = 50.0,
    return_loss_db: float = -20.0,
    vf: float = 0.66,
    name: str = "line"
) -> skrf.Network:
    """
    Synthesizes a 2-port skrf.Network for a transmission line with propagation delay and loss.
    """
    n_pts = len(freq)
    s_mat = np.zeros((n_pts, 2, 2), dtype=complex)
    rl_mag = 10.0 ** (float(return_loss_db) / 20.0) if return_loss_db < 0 else 0.01

    c_light = 2.99792458e8
    f_hz = freq.f
    vp = c_light * max(0.1, min(1.0, float(vf)))
    beta = 2.0 * np.pi * f_hz / vp
    phase_delay = np.exp(-1j * beta * float(length_m))

    il_mag = 10.0 ** (-abs(float(loss_db)) / 20.0)

    s_mat[:, 0, 0] = s_mat[:, 1, 1] = rl_mag
    s_mat[:, 1, 0] = il_mag * phase_delay
    s_mat[:, 0, 1] = il_mag * phase_delay

    return skrf.Network(frequency=freq, s=s_mat, z0=z0, name=name)


def parse_freq_value_hz(val: Any, default_hz: float = 2.0e9) -> Tuple[float, Optional[float]]:
    """
    Parses a frequency value or range string like '2.4 GHz' or '1-2 GHz' into Hz.
    """
    if val is None or val == "":
        return (default_hz, None)
    if isinstance(val, (int, float)):
        return (float(val), None)
    s = str(val).strip().lower()
    m_range = re.match(r"^([\d.]+)\s*-\s*([\d.]+)\s*(ghz|mhz|khz|hz|thz)?$", s)
    if m_range:
        v1, v2, unit = m_range.groups()
        mult = 1e9 if not unit or unit == "ghz" else (1e6 if unit == "mhz" else 1e3 if unit == "khz" else 1e12 if unit == "thz" else 1.0)
        return (float(v1) * mult, float(v2) * mult)
    m_single = re.match(r"^([\d.]+)\s*(ghz|mhz|khz|hz|thz)?$", s)
    if m_single:
        v, unit = m_single.groups()
        mult = 1e9 if not unit or unit == "ghz" else (1e6 if unit == "mhz" else 1e3 if unit == "khz" else 1e12 if unit == "thz" else 1.0)
        return (float(v) * mult, None)
    return (default_hz, None)


def synthesize_filter_network(
    ftype: str,
    fc_val: Any,
    il_db: float,
    rej_db: float,
    freq: skrf.Frequency,
    band_state: str = "passband",
    z0: float = 50.0,
    return_loss_db: float = -20.0,
    name: str = "filter"
) -> skrf.Network:
    """
    Synthesizes a frequency-dependent 2-port skrf.Network modeling LPF, HPF, BPF, or BSF filters.
    """
    n_pts = len(freq)
    f_hz = freq.f
    ft = str(ftype or "BPF").upper()

    f1_hz, f2_hz = parse_freq_value_hz(fc_val, default_hz=float(np.median(f_hz)))
    il_mag = 10.0 ** (-abs(float(il_db)) / 20.0)
    min_mag = 10.0 ** (-abs(float(rej_db)) / 20.0)

    order = 3
    if ft == "LPF":
        fc = max(1.0, f1_hz)
        w = f_hz / fc
        mag = il_mag / np.sqrt(1.0 + (w ** (2 * order)))
    elif ft == "HPF":
        fc = max(1.0, f1_hz)
        w = fc / np.maximum(1.0, f_hz)
        mag = il_mag / np.sqrt(1.0 + (w ** (2 * order)))
    elif ft in ("BPF", "BSF"):
        if f2_hz is not None and f2_hz > f1_hz:
            f0 = np.sqrt(f1_hz * f2_hz)
            bw = max(1e6, f2_hz - f1_hz)
        else:
            f0 = max(1.0, f1_hz)
            bw = max(1e6, f0 * 0.2)  # 20% fractional bandwidth default

        w_norm = np.abs((f_hz ** 2 - f0 ** 2) / np.maximum(1.0, f_hz * bw))
        if ft == "BPF":
            mag = il_mag / np.sqrt(1.0 + (w_norm ** (2 * order)))
        else:
            mag = il_mag * np.sqrt(w_norm ** (2 * order) / (1.0 + (w_norm ** (2 * order))))
    else:
        mag = np.full(n_pts, il_mag)

    mag = np.maximum(mag, min_mag)

    # If user explicitly forced band to "stopband", apply rejection
    if band_state == "stopband":
        mag = np.minimum(mag, min_mag)

    # Compute reflection conserving passivity
    rl_floor = 10.0 ** (float(return_loss_db) / 20.0) if return_loss_db < 0 else 0.01
    s11_mag = np.sqrt(np.maximum(rl_floor ** 2, 1.0 - (mag ** 2)))
    s11_mag = np.minimum(1.0, s11_mag)

    s_mat = np.zeros((n_pts, 2, 2), dtype=complex)
    s_mat[:, 0, 0] = s_mat[:, 1, 1] = s11_mag
    s_mat[:, 1, 0] = s_mat[:, 0, 1] = mag

    return skrf.Network(frequency=freq, s=s_mat, z0=z0, name=name)


def synthesize_mixer_network(
    cl_db: float,
    iso_db: float,
    freq: skrf.Frequency,
    z0: float = 50.0,
    return_loss_db: float = -15.0,
    name: str = "mixer"
) -> skrf.Network:
    """
    Synthesizes a 3-port behavioral skrf.Network for an RF Mixer.
    Port 0: RF ('rf')
    Port 1: IF ('if')
    Port 2: LO ('lo')
    Conversion loss cl_db between RF and IF.
    Isolation iso_db between LO and RF/IF.
    """
    n_pts = len(freq)
    s_mat = np.zeros((n_pts, 3, 3), dtype=complex)
    rl_mag = 10.0 ** (float(return_loss_db) / 20.0) if return_loss_db < 0 else 0.05
    for p in range(3):
        s_mat[:, p, p] = rl_mag

    cl_mag = 10.0 ** (-abs(float(cl_db)) / 20.0)
    iso_mag = 10.0 ** (-abs(float(iso_db)) / 20.0)

    # RF <-> IF conversion transmission
    s_mat[:, 0, 1] = s_mat[:, 1, 0] = cl_mag

    # LO to RF / IF isolation
    s_mat[:, 0, 2] = s_mat[:, 2, 0] = iso_mag
    s_mat[:, 1, 2] = s_mat[:, 2, 1] = iso_mag

    return skrf.Network(frequency=freq, s=s_mat, z0=z0, name=name)


def synthesize_equalizer_network(
    slope_db: float,
    min_loss_db: float,
    f1_hz: float,
    f2_hz: float,
    slope_type: str,
    freq: skrf.Frequency,
    z0: float = 50.0,
    return_loss_db: float = 20.0,
    name: str = "Equalizer"
) -> skrf.Network:
    """
    Synthesizes a frequency-dependent 2-port skrf.Network modeling an RF slope equalizer.
    """
    n_pts = len(freq)
    f_arr = freq.f
    s_mat = np.zeros((n_pts, 2, 2), dtype=complex)
    s11_mag = 10.0 ** (-abs(return_loss_db) / 20.0)

    slope_val = abs(float(slope_db))
    min_loss_val = abs(float(min_loss_db))

    if f2_hz <= f1_hz:
        loss_arr = np.full(n_pts, min_loss_val + slope_val / 2.0)
    else:
        clamped_f = np.clip(f_arr, f1_hz, f2_hz)
        frac = (clamped_f - f1_hz) / (f2_hz - f1_hz)
        if str(slope_type).strip().lower() == "negative":
            loss_arr = min_loss_val + slope_val * frac
        else:
            loss_arr = min_loss_val + slope_val * (1.0 - frac)

    s21_mag = 10.0 ** (-np.maximum(0.0, loss_arr) / 20.0)

    for k in range(n_pts):
        s_mat[k, 0, 0] = s11_mag
        s_mat[k, 1, 1] = s11_mag
        s_mat[k, 0, 1] = s21_mag[k]
        s_mat[k, 1, 0] = s21_mag[k]

    return skrf.Network(frequency=freq, s=s_mat, z0=z0, name=name)


def extract_subnetwork_2port(
    network: skrf.Network,
    port_a_idx: int,
    port_b_idx: int
) -> skrf.Network:
    """
    Extracts a 2-port subnetwork between port_a_idx and port_b_idx
    with all other ports assumed terminated in characteristic impedance z0.
    """
    n_pts = len(network.frequency)
    num_ports = network.nports
    a = max(0, min(num_ports - 1, int(port_a_idx)))
    b = max(0, min(num_ports - 1, int(port_b_idx)))

    sub_s = np.zeros((n_pts, 2, 2), dtype=complex)
    sub_s[:, 0, 0] = network.s[:, a, a]
    sub_s[:, 0, 1] = network.s[:, a, b]
    sub_s[:, 1, 0] = network.s[:, b, a]
    sub_s[:, 1, 1] = network.s[:, b, b]

    z0 = float(np.real(network.z0[0, 0])) if np.ndim(network.z0) > 1 else float(np.real(network.z0[0] if np.ndim(network.z0) == 1 else network.z0))
    name = f"{network.name or 'net'}_p{a+1}_p{b+1}"
    return skrf.Network(frequency=network.frequency, s=sub_s, z0=z0, name=name)

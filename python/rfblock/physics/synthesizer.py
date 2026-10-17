"""
Synthesizer: Synthesizes physical 2-port Pi-attenuator networks and behavioral S-parameters
for RF components with specified loss, attenuation, or return loss.
"""

from typing import Tuple, Dict, Any, Optional
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

    Args:
        loss_db: Insertion loss or attenuation in dB (>= 0).
        freq: scikit-rf Frequency object.
        z0: Reference characteristic impedance (default 50.0 Ohms).
        return_loss_db: Optional Return Loss in dB (e.g. -20 dB).
                        If None, defaults to ideal matched (-60 dB).
        name: Name label for the network.

    Returns:
        A 2-port skrf.Network with computed S-parameters and resistor metadata.
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
    name: str = "switch"
) -> skrf.Network:
    """
    Synthesizes an (N+1)-port behavioral skrf.Network for an SPnT switch.
    Port 0: Common ('in')
    Port k (1 <= k <= throws): Throw k ('ok')
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
    il_mag = 10.0 ** (-max(0.0, float(il_db)) / 20.0)
    iso_mag = 10.0 ** (-max(0.0, float(iso_db)) / 20.0)

    for k in range(1, num_ports):
        mag = il_mag if (k == state and state > 0) else iso_mag
        s_mat[:, 0, k] = mag
        s_mat[:, k, 0] = mag

    # Inter-throw isolation (between throws j and k)
    for j in range(1, num_ports):
        for k in range(j + 1, num_ports):
            s_mat[:, j, k] = iso_mag
            s_mat[:, k, j] = iso_mag

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
    iso_mag = 10.0 ** (-max(0.0, float(iso_db)) / 20.0)

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

    il_mag = 10.0 ** (-max(0.0, float(il_db)) / 20.0)
    cpl_mag = 10.0 ** (-max(0.0, float(coupling_db)) / 20.0)
    iso_mag = 10.0 ** (-(max(0.0, float(coupling_db)) + max(0.0, float(directivity_db))) / 20.0)

    # Port 0 (IN) connections:
    s_mat[:, 0, 1] = s_mat[:, 1, 0] = il_mag
    s_mat[:, 0, 2] = s_mat[:, 2, 0] = cpl_mag
    s_mat[:, 0, 3] = s_mat[:, 3, 0] = iso_mag

    # Port 1 (THRU) connections:
    s_mat[:, 1, 2] = s_mat[:, 2, 1] = iso_mag
    s_mat[:, 1, 3] = s_mat[:, 3, 1] = cpl_mag

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

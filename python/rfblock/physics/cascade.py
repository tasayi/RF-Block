"""
Multi-path S-parameter Matrix Cascade & Circuit Solver Engine using native scikit-rf.circuit.Circuit.
"""

from typing import Dict, Any, List, Optional, Tuple, Set
from collections import defaultdict
from functools import reduce
import tempfile
import os
import numpy as np
import skrf
from skrf.circuit import Circuit

from .network_builder import build_block_network, get_block_port_index
from .path_finder import find_all_signal_paths, SOURCE_TYPES, SINK_TYPES


def unit_to_hz(unit_str: Optional[str]) -> float:
    """Converts a frequency unit string to its multiplier in Hz."""
    u = (unit_str or "").strip().lower()
    if u.startswith("hz"):
        return 1.0
    if u.startswith("khz"):
        return 1e3
    if u.startswith("mhz"):
        return 1e6
    if u.startswith("ghz"):
        return 1e9
    if u.startswith("thz"):
        return 1e12
    return 1e9


def extract_block_traversed_ports(node_chain: List[Any]) -> Dict[str, Tuple[Optional[str], Optional[str]]]:
    """
    Parses node_chain into a mapping of { block_id: (in_port, out_port) }.
    """
    ports_map: Dict[str, Tuple[Optional[str], Optional[str]]] = {}
    if not node_chain:
        return ports_map

    i = 0
    n = len(node_chain)
    while i < n:
        item = node_chain[i]
        if isinstance(item, (list, tuple)) and len(item) == 2:
            bid, pid = item
            if i + 1 < n and isinstance(node_chain[i+1], (list, tuple)) and len(node_chain[i+1]) == 2 and node_chain[i+1][0] == bid:
                ports_map[bid] = (pid, node_chain[i+1][1])
                i += 2
            else:
                ports_map[bid] = (pid, pid)
                i += 1
        else:
            i += 1
    return ports_map


def export_network_touchstone_str(net: skrf.Network) -> str:
    """Helper to convert skrf.Network to Touchstone text string for any number of ports."""
    try:
        sfx = f".s{net.nports}p" if net.nports > 0 else ".s2p"
        tmp = tempfile.NamedTemporaryFile(suffix=sfx, delete=False)
        tmp.close()
        net.write_touchstone(tmp.name)
        with open(tmp.name, "r", encoding="utf-8") as f:
            txt = f.read()
        os.unlink(tmp.name)
        return txt
    except Exception as e:
        return f"! Touchstone export error: {e}"


def compute_group_delay_ns(net: skrf.Network, port_out: int = 1, port_in: int = 0) -> List[float]:
    """
    Computes Group Delay in nanoseconds: tau_g = - d(phase_deg) / (360 * df_ghz)
    Uses native skrf.Network.group_delay with gradient fallback.
    """
    freq_hz = net.f
    n_pts = len(freq_hz)
    if n_pts < 2:
        return [0.0] * n_pts

    try:
        if net.nports >= 2 and net.nports > max(port_out, port_in):
            gd_mat = net.group_delay
            if gd_mat is not None and np.ndim(gd_mat) == 3:
                gd = np.real(gd_mat[:, port_out, port_in])
                return (gd * 1e9).tolist()
    except Exception:
        pass

    try:
        p_out = min(net.nports - 1, max(0, port_out))
        p_in = min(net.nports - 1, max(0, port_in))
        s_param = net.s[:, p_out, p_in]
        s_rad = np.unwrap(np.angle(s_param))
        df = np.gradient(freq_hz)
        dphi = np.gradient(s_rad)
        tau_sec = - dphi / (2.0 * np.pi * np.maximum(1e-12, df))
        return (tau_sec * 1e9).tolist()
    except Exception:
        return [0.0] * n_pts


class DisjointSet:
    """Disjoint Set (Union-Find) to merge connected electrical nodes."""
    def __init__(self):
        self.parent = {}

    def find(self, x):
        if x not in self.parent:
            self.parent[x] = x
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]

    def union(self, x, y):
        rx, ry = self.find(x), self.find(y)
        if rx != ry:
            self.parent[rx] = ry


def solve_schematic_circuit(
    schematic: Dict[str, Any],
    freq: skrf.Frequency
) -> Tuple[Optional[skrf.Network], List[Dict[str, Any]], Dict[str, int]]:
    """
    Solves the global schematic multi-port scattering matrix using skrf.circuit.Circuit.
    Handles split-and-combine topologies, multipath, branch loading, and multi-port components.
    """
    blocks = schematic.get("blocks", [])
    conns = schematic.get("conns", [])
    if not blocks or not conns:
        return None, [], {}

    blocks_dict = {b["id"]: b for b in blocks}

    # Identify external port blocks (terminals)
    assigned_block_ids: Set[str] = set()
    external_ports: List[Tuple[int, str, Dict[str, Any]]] = []

    # 1. Search for explicit analysis ports (P1 through P8)
    for b in blocks:
        params = b.get("params", {})
        p_tag = str(params.get("anaPort", "")).upper()
        if p_tag.startswith("P") and p_tag[1:].isdigit():
            p_num = int(p_tag[1:])
            external_ports.append((p_num, b["id"], b))
            assigned_block_ids.add(b["id"])

    # 2. Auto-assign P1 to first source if not set
    used_port_nums = {p[0] for p in external_ports}
    if 1 not in used_port_nums:
        for b in blocks:
            btype = b.get("type", "")
            if btype in SOURCE_TYPES and b["id"] not in assigned_block_ids:
                external_ports.append((1, b["id"], b))
                assigned_block_ids.add(b["id"])
                used_port_nums.add(1)
                break

    # 3. Auto-assign P2, P3... to unassigned sinks
    next_p = 2
    for b in blocks:
        btype = b.get("type", "")
        if btype in SINK_TYPES and b["id"] not in assigned_block_ids:
            while next_p in used_port_nums:
                next_p += 1
            external_ports.append((next_p, b["id"], b))
            assigned_block_ids.add(b["id"])
            used_port_nums.add(next_p)

    external_ports.sort(key=lambda x: x[0])

    # If fewer than 2 external ports were found, cannot form a multi-port circuit
    if not external_ports:
        return None, [], {}

    # Build Circuit.Port objects
    port_nets: Dict[str, skrf.Network] = {}
    port_bid_to_num: Dict[str, int] = {}
    ports_info: List[Dict[str, Any]] = []

    for p_num, bid, b in external_ports:
        z0 = float(b.get("params", {}).get("z0", 50.0))
        p_label = b.get("params", {}).get("label") or f"P{p_num}"
        p_net = Circuit.Port(freq, name=f"P{p_num}", z0=z0)
        port_nets[bid] = p_net
        port_bid_to_num[bid] = p_num
        ports_info.append({
            "num": p_num,
            "tag": f"P{p_num}",
            "label": p_label,
            "block_id": bid,
            "block": b
        })

    # Build internal component networks
    internal_nets: Dict[str, skrf.Network] = {}
    for b in blocks:
        bid = b["id"]
        if bid not in assigned_block_ids:
            net = build_block_network(b, freq, full_ports=True)
            # Give unique name required by Circuit
            net.name = f"net_{bid}_{b.get('type', 'blk')}"
            internal_nets[bid] = net

    # Use Union-Find to group connected terminals into electrical nodes
    uf = DisjointSet()
    all_terminals = set()

    for c in conns:
        t_from = (c["from"]["block"], str(c["from"]["port"]).lower())
        t_to = (c["to"]["block"], str(c["to"]["port"]).lower())
        uf.union(t_from, t_to)
        all_terminals.add(t_from)
        all_terminals.add(t_to)

    # Group terminals by root node
    nodes_map = defaultdict(list)
    for term in all_terminals:
        root = uf.find(term)
        nodes_map[root].append(term)

    # Build Circuit connections list
    circuit_connections = []
    direct_thru_count = 0

    for root, terms in nodes_map.items():
        conn_group = []
        ext_ports_in_node = []
        int_terms_in_node = []

        for bid, port_name in terms:
            if bid in port_nets:
                ext_ports_in_node.append((port_nets[bid], 0))
            elif bid in internal_nets:
                b_obj = blocks_dict.get(bid, {})
                idx = get_block_port_index(b_obj.get("type", ""), port_name, b_obj.get("params", {}))
                int_terms_in_node.append((internal_nets[bid], idx))

        # Case A: External port connected to internal component(s)
        if ext_ports_in_node and int_terms_in_node:
            for p_tuple in ext_ports_in_node:
                circuit_connections.append([p_tuple] + int_terms_in_node)
        # Case B: Direct connection between two external ports (requires ideal thru bridge)
        elif len(ext_ports_in_node) >= 2:
            thru_s = np.zeros((len(freq), 2, 2), dtype=complex)
            thru_s[:, 0, 1] = thru_s[:, 1, 0] = 1.0
            direct_thru_count += 1
            thru_net = skrf.Network(frequency=freq, s=thru_s, z0=50.0, name=f"thru_bridge_{direct_thru_count}")
            circuit_connections.append([ext_ports_in_node[0], (thru_net, 0)])
            circuit_connections.append([(thru_net, 1), ext_ports_in_node[1]])
        # Case C: Internal components connected together
        elif int_terms_in_node and len(int_terms_in_node) >= 2:
            circuit_connections.append(int_terms_in_node)

    if not circuit_connections:
        return None, ports_info, port_bid_to_num

    try:
        cir = Circuit(circuit_connections)
        solved_net = cir.network

        # Ensure solved_net ports are sorted in ascending order of port number (e.g. P1, P2, P3, ...)
        current_names = list(solved_net.port_names)
        desired_order = sorted(
            current_names,
            key=lambda name: int(name[1:]) if name.startswith("P") and name[1:].isdigit() else name
        )
        if current_names != desired_order:
            from_indices = [current_names.index(name) for name in desired_order]
            to_indices = list(range(len(desired_order)))
            solved_net.renumber(from_indices, to_indices)

        return solved_net, ports_info, port_bid_to_num
    except Exception:
        return None, ports_info, port_bid_to_num


def analyze_schematic_cascade(schematic: Dict[str, Any]) -> Dict[str, Any]:
    """
    Discovers all signal paths, solves the complete multi-port scattering matrix with skrf.circuit.Circuit,
    and returns frequency-domain S-parameters, Group Delay, and Stability Factors.
    """
    band = schematic.get("band", {})
    f_start_val = float(band.get("startFreq", 1.0))
    f_stop_val = float(band.get("stopFreq", 10.0))
    f_start_hz = f_start_val * unit_to_hz(band.get("startUnit", "GHz"))
    f_stop_hz = f_stop_val * unit_to_hz(band.get("stopUnit", "GHz"))

    if f_stop_hz <= f_start_hz:
        f_stop_hz = f_start_hz * 10.0

    n_pts = max(2, min(2001, int(band.get("points", 101))))
    sweep_type = str(band.get("sweepType", "lin")).lower()

    if sweep_type == "log" and f_start_hz > 0:
        freq = skrf.Frequency(start=f_start_hz, stop=f_stop_hz, npoints=n_pts, unit="hz", sweep_type="log")
    else:
        freq = skrf.Frequency(start=f_start_hz, stop=f_stop_hz, npoints=n_pts, unit="hz")

    blocks = schematic.get("blocks", [])
    blocks_dict = {b["id"]: b for b in blocks}

    if not blocks_dict:
        return {
            "status": "empty",
            "message": "No components in schematic",
            "paths": []
        }

    # Discover topological signal paths
    discovered_paths = find_all_signal_paths(schematic)

    # 1. Attempt global multi-port Circuit solve
    circuit_net, ports_info, port_bid_to_num = solve_schematic_circuit(schematic, freq)

    # Extract multi-port matrix from global solution
    global_matrix: Dict[str, List[float]] = {}
    primary_touchstone = ""

    if circuit_net is not None:
        primary_touchstone = export_network_touchstone_str(circuit_net)
        num_ports = circuit_net.nports
        port_names = list(circuit_net.port_names)

        for i in range(num_ports):
            p_out_name = port_names[i]
            p_out_num = int(p_out_name[1:]) if p_out_name.startswith("P") and p_out_name[1:].isdigit() else (i + 1)
            for j in range(num_ports):
                p_in_name = port_names[j]
                p_in_num = int(p_in_name[1:]) if p_in_name.startswith("P") and p_in_name[1:].isdigit() else (j + 1)
                s_key = f"S{p_out_num}{p_in_num}"
                db_vals = (20.0 * np.log10(np.maximum(1e-12, np.abs(circuit_net.s[:, i, j])))).tolist()
                global_matrix[s_key] = db_vals

                # Also ensure 1-based matrix index keys exist
                std_key = f"S{i+1}{j+1}"
                if std_key not in global_matrix:
                    global_matrix[std_key] = db_vals

    analyzed_paths: List[Dict[str, Any]] = []

    for idx, path_info in enumerate(discovered_paths):
        path_bids = path_info["block_ids"]
        node_chain = path_info.get("node_chain", [])
        start_bid = path_bids[0] if path_bids else None
        end_bid = path_bids[-1] if path_bids else None

        src_num = port_bid_to_num.get(start_bid, 1)
        dst_num = port_bid_to_num.get(end_bid, 2)
        if src_num == dst_num and len(path_bids) > 1:
            dst_num = 2

        fwd_key = f"S{dst_num}{src_num}"
        rev_key = f"S{src_num}{dst_num}"
        in_match_key = f"S{src_num}{src_num}"
        out_match_key = f"S{dst_num}{dst_num}"

        s21_db: List[float] = []
        s12_db: List[float] = []
        s11_db: List[float] = []
        s22_db: List[float] = []
        group_delay_ns: List[float] = []
        k_factor: List[float] = [1.0] * n_pts

        # If Circuit solved this path's ports
        if circuit_net is not None and fwd_key in global_matrix:
            s21_db = global_matrix[fwd_key]
            s12_db = global_matrix.get(rev_key, [-120.0] * n_pts)
            s11_db = global_matrix.get(in_match_key, [-20.0] * n_pts)
            s22_db = global_matrix.get(out_match_key, [-20.0] * n_pts)

            p_out_tag = f"P{dst_num}"
            p_in_tag = f"P{src_num}"
            p_out_idx = circuit_net.port_names.index(p_out_tag) if p_out_tag in circuit_net.port_names else min(circuit_net.nports - 1, max(0, dst_num - 1))
            p_in_idx = circuit_net.port_names.index(p_in_tag) if p_in_tag in circuit_net.port_names else min(circuit_net.nports - 1, max(0, src_num - 1))
            group_delay_ns = compute_group_delay_ns(circuit_net, port_out=p_out_idx, port_in=p_in_idx)

            try:
                if circuit_net.nports >= 2:
                    k_factor = np.real(circuit_net.stability).flatten().tolist()
            except Exception:
                k_factor = [1.0] * n_pts
        else:
            # Fallback 2-port linear cascade for isolated chains
            block_ports = extract_block_traversed_ports(node_chain)
            chain_networks: List[skrf.Network] = []

            for bid in path_bids:
                if bid in blocks_dict:
                    in_p, out_p = block_ports.get(bid, (None, None))
                    net = build_block_network(blocks_dict[bid], freq, in_port=in_p, out_port=out_p)
                    chain_networks.append(net)

            if chain_networks:
                path_net = reduce(lambda a, b: a ** b, chain_networks)
            else:
                path_net = skrf.Network(frequency=freq, s=np.zeros((n_pts, 2, 2), dtype=complex))

            s11_db = path_net.s11.s_db.flatten().tolist()
            s21_db = path_net.s21.s_db.flatten().tolist()
            s12_db = path_net.s12.s_db.flatten().tolist()
            s22_db = path_net.s22.s_db.flatten().tolist()

            try:
                k_factor = np.real(path_net.stability).flatten().tolist()
            except Exception:
                k_factor = [1.0] * n_pts

            group_delay_ns = compute_group_delay_ns(path_net, port_out=1, port_in=0)
            if not primary_touchstone and idx == 0:
                primary_touchstone = export_network_touchstone_str(path_net)

        path_matrix = {
            fwd_key: s21_db,
            rev_key: s12_db,
            in_match_key: s11_db,
            out_match_key: s22_db,
            "S21": s21_db,
            "S12": s12_db,
            "S11": s11_db,
            "S22": s22_db
        }

        analyzed_paths.append({
            "id": path_info["id"],
            "name": path_info["name"],
            "block_ids": path_bids,
            "node_chain": node_chain,
            "s11_db": s11_db,
            "s21_db": s21_db,
            "s12_db": s12_db,
            "s22_db": s22_db,
            "matrix": path_matrix,
            "group_delay_ns": group_delay_ns,
            "k_factor": k_factor,
            "is_active": path_info.get("is_active", True),
            "fwdKey": fwd_key,
            "revKey": rev_key,
            "srcPort": src_num,
            "dstPort": dst_num
        })

    # Top-level active or first path
    active_p = next((p for p in analyzed_paths if p.get("is_active")), None)
    first_p = active_p or (analyzed_paths[0] if analyzed_paths else {})

    # Ensure global_matrix has S21, S12, S11, S22 populated
    if "S21" not in global_matrix and first_p.get("s21_db"):
        global_matrix["S21"] = first_p.get("s21_db", [])
        global_matrix["S12"] = first_p.get("s12_db", [])
        global_matrix["S11"] = first_p.get("s11_db", [])
        global_matrix["S22"] = first_p.get("s22_db", [])

    return {
        "status": "success",
        "freq_hz": (freq.f).tolist(),
        "freq_ghz": (freq.f / 1e9).tolist(),
        "freqs": (freq.f).tolist(),
        "matrix": global_matrix if global_matrix else first_p.get("matrix", {}),
        "s11_db": first_p.get("s11_db", []),
        "s21_db": first_p.get("s21_db", []),
        "s12_db": first_p.get("s12_db", []),
        "s22_db": first_p.get("s22_db", []),
        "group_delay_ns": first_p.get("group_delay_ns", []),
        "k_factor": first_p.get("k_factor", []),
        "num_paths": len(analyzed_paths),
        "paths": analyzed_paths,
        "portsList": ports_info,
        "touchstone_s2p": primary_touchstone
    }

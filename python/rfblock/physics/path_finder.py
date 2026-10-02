"""
Topological Graph Path Finder: Discovers all valid signal paths from Sources to Sinks in RF schematics.
"""

from typing import Dict, Any, List, Set, Tuple

# Block classification sets
SOURCE_TYPES = {"source", "rfin", "antenna", "pll", "lo"}
SINK_TYPES = {"rfout", "detector", "termination", "antenna"}

def get_block_internal_connections(block: Dict[str, Any], include_all_throws: bool = True) -> List[Tuple[str, str]]:
    """
    Returns valid internal (in_port -> out_port) pairs for a given component block,
    taking component directionality and structural paths into account.
    """
    btype = block.get("type", "")
    params = block.get("params", {})

    if btype in SOURCE_TYPES or btype in SINK_TYPES:
        return []

    # Handle SPnT Switch positions
    if btype == "switch":
        throws = int(params.get("throws", 2))
        if include_all_throws:
            return [("in", f"o{i}") for i in range(1, throws + 1)]
        state = str(params.get("state", "1"))
        if state == "open" or state == "0":
            return [] # Isolated / open state
        selected_throw = int(state) if state.isdigit() else 1
        return [("in", f"o{selected_throw}")]

    # Handle 3-Port Circulator (P1 -> P2, P2 -> P3, P3 -> P1)
    if btype == "circulator":
        return [("p1", "p2"), ("p2", "p3"), ("p3", "p1")]

    # Handle Splitter (in -> o1, o2 ... oN)
    if btype == "splitter":
        ways = int(params.get("ways", 2))
        return [("in", f"o{i}") for i in range(1, ways + 1)]

    # Handle Combiner (i1, i2 ... iN -> out)
    if btype == "combiner":
        ways = int(params.get("ways", 2))
        return [(f"i{i}", "out") for i in range(1, ways + 1)]

    # Handle Couplers
    if btype == "coupler":
        ctype = params.get("ctype", "Directional")
        if ctype == "Bi-directional":
            return [("in", "thru"), ("in", "fwd"), ("thru", "rev")]
        if ctype == "Power tap":
            return [("in", "thru"), ("in", "tap")]
        if ctype == "Resistive":
            return [("in", "o1"), ("in", "o2")]
        if ctype in ("90° hybrid", "90\u00b0 hybrid"):
            return [("in", "out0"), ("in", "out90")]
        if ctype in ("180° hybrid", "180\u00b0 hybrid"):
            return [("sum", "o1"), ("sum", "o2")]
        # Standard Directional
        return [("in", "thru"), ("in", "cpl")]

    # Default 2-port component (In -> Out)
    return [("in", "out")]


def find_all_signal_paths(schematic: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Finds all valid topological signal paths from Sources to Sinks in the schematic.
    Returns a list of path objects: [{ id, name, block_ids, node_chain }].
    """
    blocks = {b["id"]: b for b in schematic.get("blocks", [])}
    conns = schematic.get("conns", [])

    if not blocks:
        return []

    # Map external connections: (from_block, from_port) -> list of (to_block, to_port)
    wire_map: Dict[Tuple[str, str], List[Tuple[str, str]]] = {}
    for c in conns:
        src = (c["from"]["block"], c["from"]["port"])
        dst = (c["to"]["block"], c["to"]["port"])
        wire_map.setdefault(src, []).append(dst)

    # Identify source start nodes: (block_id, out_port_id)
    start_nodes: List[Tuple[str, str]] = []
    for bid, b in blocks.items():
        if b.get("type") in SOURCE_TYPES:
            out_port = "out" if b.get("type") != "lo" else "out"
            start_nodes.append((bid, out_port))

    # Identify sink blocks
    sink_block_ids: Set[str] = {bid for bid, b in blocks.items() if b.get("type") in SINK_TYPES}

    discovered_paths: List[Dict[str, Any]] = []
    path_counter = 1

    def dfs(current_node: Tuple[str, str], current_path: List[Tuple[str, str]], visited_blocks: Set[str]):
        cb_id, cp_id = current_node

        # External wire transition from (cb_id, cp_id)
        next_dsts = wire_map.get((cb_id, cp_id), [])
        for nb_id, np_id in next_dsts:
            if nb_id not in blocks or nb_id in visited_blocks:
                continue

            target_block = blocks[nb_id]

            # Check if we reached a sink block
            if nb_id in sink_block_ids:
                final_node = (nb_id, np_id)
                full_path = current_path + [final_node]
                block_chain = list(dict.fromkeys([b for b, p in full_path]))
                
                # Format human-readable path name
                path_labels = []
                for b_id in block_chain:
                    b_obj = blocks.get(b_id, {})
                    label = b_obj.get("params", {}).get("label") or b_obj.get("type", "blk")
                    path_labels.append(label)
                
                path_name = f"Path {len(discovered_paths) + 1}: " + " ➔ ".join(path_labels)

                discovered_paths.append({
                    "id": f"path_{len(discovered_paths) + 1}",
                    "name": path_name,
                    "block_ids": block_chain,
                    "node_chain": full_path
                })
                continue

            # Follow internal component connections
            internal_pairs = get_block_internal_connections(target_block)
            for in_p, out_p in internal_pairs:
                if in_p == np_id:
                    new_visited = visited_blocks | {nb_id}
                    dfs((nb_id, out_p), current_path + [(nb_id, in_p), (nb_id, out_p)], new_visited)

    # Launch DFS from each source node
    for sn in start_nodes:
        dfs(sn, [sn], {sn[0]})

    # Fallback: if no sources/sinks found, return sequential chain of all blocks
    if not discovered_paths and blocks:
        all_bids = list(blocks.keys())
        labels = [blocks[b].get("params", {}).get("label", blocks[b].get("type")) for b in all_bids]
        return [{
            "id": "path_1",
            "name": "Default Main Path: " + " ➔ ".join(labels),
            "block_ids": all_bids,
            "node_chain": []
        }]

    return discovered_paths

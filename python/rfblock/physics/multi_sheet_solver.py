"""
Hierarchical Multi-Sheet RF Schematic Solver & Cascade Analyzer.
Provides full parity with the RFBlock browser canvas solvers (power-solver.js and noise-solver.js).
Resolves inter-sheet interconnect tags (§subsystem.port) and subsystem boundaries.
"""

import json
import math
import os
import re
from typing import Dict, Any, List, Optional, Tuple, Set

def sub_tag(block_id: str, port_id: str) -> str:
    return f"§{block_id}.{port_id}"

def key(block_id: str, port_id: str) -> str:
    return f"{block_id}·{port_id}"

def sum_dbm(powers: List[float]) -> float:
    valid = [p for p in powers if p is not None and math.isfinite(p)]
    if not valid:
        return -float("inf")
    if len(valid) == 1:
        return valid[0]
    mw_sum = sum(10.0 ** (p / 10.0) for p in valid)
    return 10.0 * math.log10(max(1e-18, mw_sum))

def parse_freq_hz(val: Any) -> Optional[float]:
    if val is None or val == "":
        return None
    if isinstance(val, (int, float)):
        return float(val) if math.isfinite(val) else None
    s = str(val).strip().lower()
    m = re.match(r"^([\d.]+)\s*(ghz|mhz|khz|hz|thz)?$", s)
    if not m:
        return None
    num = float(m.group(1))
    u = m.group(2) or "ghz"
    mult = 1e9 if u == "ghz" else (1e6 if u == "mhz" else (1e3 if u == "khz" else (1e12 if u == "thz" else 1.0)))
    return num * mult

def eq_loss(p: Dict[str, Any]) -> float:
    min_loss = abs(float(p.get("minLoss", 0.0)))
    slope = abs(float(p.get("slope", 0.0)))
    f1 = parse_freq_hz(p.get("f1"))
    f2 = parse_freq_hz(p.get("f2"))
    f_op = parse_freq_hz(p.get("opFreq") or p.get("freq"))
    
    if f1 is None or f2 is None or f2 <= f1 or f_op is None:
        return min_loss + slope / 2.0
        
    clamped_f = max(f1, min(f2, f_op))
    frac = (clamped_f - f1) / (f2 - f1)
    is_neg = (p.get("slopeType") == "Negative")
    loss = (min_loss + slope * frac) if is_neg else (min_loss + slope * (1.0 - frac))
    return max(0.0, loss)

def tap_thru_loss(c_db: float) -> float:
    c_lin = 10.0 ** (-abs(c_db) / 10.0)
    return -10.0 * math.log10(max(1e-9, 1.0 - c_lin))

def coupler_matrix(p: Dict[str, Any]) -> Dict[str, Dict[str, float]]:
    ctype = p.get("ctype", "Directional")
    il = abs(float(p.get("il", 0.0)))
    c_val = abs(float(p.get("coupling", 10.0)))
    iso = abs(float(p.get("iso", 30.0)))
    ex = abs(float(p.get("exloss", 0.0)))
    M: Dict[str, Dict[str, float]] = {}
    def put(a, b, d):
        M.setdefault(a, {})[b] = d
        M.setdefault(b, {})[a] = d
    if ctype == "Power tap":
        thru = il + tap_thru_loss(c_val)
        put("in", "thru", thru)
        put("in", "tap", c_val)
        put("thru", "tap", c_val)
        return M
    if ctype == "Resistive":
        half = 6.02 + ex
        put("in", "o1", half)
        put("in", "o2", half)
        put("o1", "o2", half)
        return M
    if ctype == "Bi-directional":
        put("in", "thru", il)
        put("in", "fwd", c_val)
        put("thru", "rev", c_val)
        put("in", "rev", iso)
        put("thru", "fwd", iso)
        put("fwd", "rev", iso)
        return M
    if ctype in ("90° hybrid", "90\u00b0 hybrid", "180° hybrid", "180\u00b0 hybrid"):
        a = ["in", "out0", "out90", "iso"] if "90" in ctype else ["sum", "o1", "o2", "dif"]
        half = 3.01 + il
        put(a[0], a[1], half)
        put(a[0], a[2], half)
        put(a[3], a[1], half)
        put(a[3], a[2], half)
        put(a[0], a[3], iso)
        put(a[1], a[2], iso)
        return M
    put("in", "thru", il)
    put("in", "cpl", c_val)
    put("thru", "iso", c_val)
    put("in", "iso", iso)
    put("thru", "cpl", iso)
    put("cpl", "iso", il)
    return M

class MultiSheetSolver:
    def __init__(self, schematic: Dict[str, Any], power_budget: str = "primary", bandwidth_hz: float = 1e6):
        self.schematic = schematic
        self.power_budget = power_budget.lower()
        self.bandwidth_hz = bandwidth_hz
        
        # Normalize sheets
        if "sheets" in schematic and isinstance(schematic["sheets"], list):
            self.sheets = schematic["sheets"]
        else:
            self.sheets = [{
                "id": "s1",
                "name": "Main",
                "blocks": schematic.get("blocks", []),
                "connections": schematic.get("conns", []) or schematic.get("connections", [])
            }]
            
        self.all_blocks: List[Dict[str, Any]] = []
        self.all_conns: List[Dict[str, Any]] = []
        self.block_sheet_map: Dict[str, str] = {}
        
        for s in self.sheets:
            s_name = s.get("name", s.get("id", ""))
            b_list = s.get("blocks", [])
            c_list = s.get("connections", []) or s.get("conns", [])
            for b in b_list:
                self.all_blocks.append(b)
                self.block_sheet_map[b["id"]] = s_name
            for c in c_list:
                self.all_conns.append(c)
                
        self.blocks_dict = {b["id"]: b for b in self.all_blocks}

    def get_ports(self, block: Dict[str, Any]) -> List[Dict[str, Any]]:
        btype = block.get("type", "")
        params = block.get("params", {})
        
        if btype in ("source", "rfin"):
            return [{"id": "out", "kind": "out"}]
        if btype == "antenna":
            role = params.get("role", "Tx")
            kind = "in" if role == "Tx" else "out"
            return [{"id": "ant", "kind": kind}]
        if btype in ("rfout", "termination"):
            return [{"id": "in", "kind": "in"}]
        if btype == "detector":
            return [{"id": "in", "kind": "in"}, {"id": "out", "kind": "out"}]
        if btype in ("amp", "limiter", "trace"):
            return [{"id": "in", "kind": "in"}, {"id": "out", "kind": "out"}]
        if btype == "bamp":
            return [{"id": "in", "kind": "inout"}, {"id": "out", "kind": "out"}]
        if btype in ("atten", "dsa", "eq"):
            return [{"id": "in", "kind": "inout"}, {"id": "out", "kind": "inout"}]
        if btype in ("filter", "tfilter"):
            return [{"id": "in", "kind": "inout"}, {"id": "out", "kind": "inout"}]
        if btype == "splitter":
            ways = int(params.get("ways", 2))
            pts = [{"id": "in", "kind": "inout"}]
            for i in range(1, ways + 1):
                pts.append({"id": f"o{i}", "kind": "inout"})
            return pts
        if btype == "combiner":
            ways = int(params.get("ways", 2))
            pts = []
            for i in range(1, ways + 1):
                pts.append({"id": f"i{i}", "kind": "inout"})
            pts.append({"id": "out", "kind": "inout"})
            return pts
        if btype == "coupler":
            ctype = params.get("ctype", "Directional")
            if ctype == "Power tap":
                return [{"id": "in", "kind": "inout"}, {"id": "thru", "kind": "inout"}, {"id": "tap", "kind": "out"}]
            elif ctype == "Bi-directional":
                return [{"id": "in", "kind": "inout"}, {"id": "thru", "kind": "inout"}, {"id": "fwd", "kind": "out"}, {"id": "rev", "kind": "out"}]
            elif ctype == "Resistive":
                return [{"id": "in", "kind": "inout"}, {"id": "o1", "kind": "inout"}, {"id": "o2", "kind": "inout"}]
            elif ctype in ("90° hybrid", "90\u00b0 hybrid"):
                return [{"id": "in", "kind": "inout"}, {"id": "out0", "kind": "inout"}, {"id": "out90", "kind": "inout"}, {"id": "iso", "kind": "inout"}]
            elif ctype in ("180° hybrid", "180\u00b0 hybrid"):
                return [{"id": "sum", "kind": "inout"}, {"id": "dif", "kind": "inout"}, {"id": "o1", "kind": "inout"}, {"id": "o2", "kind": "inout"}]
            return [{"id": "in", "kind": "inout"}, {"id": "thru", "kind": "inout"}, {"id": "cpl", "kind": "out"}]
        if btype == "switch":
            throws = int(params.get("throws", 2))
            pts = [{"id": "in", "kind": "inout"}]
            for i in range(1, throws + 1):
                pts.append({"id": f"o{i}", "kind": "inout"})
            return pts
        if btype == "interconnect":
            role = params.get("role", "receive")
            return [{"id": "p", "kind": "in" if role == "send" else "out"}]
        if btype == "subsystem":
            ins = int(params.get("ins", 1))
            outs = int(params.get("outs", 1))
            pts = []
            for i in range(1, ins + 1):
                pts.append({"id": f"i{i}", "kind": "in"})
            for i in range(1, outs + 1):
                pts.append({"id": f"o{i}", "kind": "out"})
            return pts
        if btype == "custom":
            ins = int(params.get("ins", 1))
            outs = int(params.get("outs", 1))
            pts = []
            for i in range(1, ins + 1):
                pts.append({"id": f"i{i}", "kind": "in"})
            for i in range(1, outs + 1):
                pts.append({"id": f"o{i}", "kind": "out"})
            return pts
        return [{"id": "in", "kind": "in"}, {"id": "out", "kind": "out"}]

    def evaluate_bidi_transfer(self, block: Dict[str, Any], in_map: Dict[str, float]) -> Dict[str, float]:
        btype = block.get("type", "")
        params = block.get("params", {})
        res: Dict[str, float] = {}

        if btype in ("atten", "dsa"):
            loss = abs(float(params.get("loss", 0.0)))
            if "in" in in_map:
                res["out"] = in_map["in"] - loss
            if "out" in in_map:
                res["in"] = in_map["out"] - loss
            return res

        if btype in ("filter", "tfilter"):
            il = abs(float(params.get("il", 0.0)))
            if "in" in in_map:
                res["out"] = in_map["in"] - il
            if "out" in in_map:
                res["in"] = in_map["out"] - il
            return res

        if btype == "eq":
            loss = eq_loss(params)
            if "in" in in_map:
                res["out"] = in_map["in"] - loss
            if "out" in in_map:
                res["in"] = in_map["out"] - loss
            return res

        if btype == "limiter":
            thresh = float(params.get("thresh", 10.0))
            il = abs(float(params.get("il", 0.5)))
            if "in" in in_map:
                res["out"] = min(in_map["in"], thresh) - il
            if "out" in in_map:
                res["in"] = min(in_map["out"], thresh) - il
            return res

        if btype == "switch":
            throws = int(params.get("throws", 2))
            st_raw = params.get("state", "1")
            st = int(st_raw) if str(st_raw).isdigit() else 1
            il = abs(float(params.get("il", 0.4)))
            iso = float(params.get("iso", 60.0))
            if "in" in in_map:
                for i in range(1, throws + 1):
                    res[f"o{i}"] = in_map["in"] - (il if i == st else iso)
            if st > 0 and f"o{st}" in in_map:
                res["in"] = in_map[f"o{st}"] - il
            return res

        if btype == "splitter":
            ways = int(params.get("ways", 2))
            exloss = abs(float(params.get("exloss", 0.3)))
            split_loss = 10.0 * math.log10(ways) + exloss
            if "in" in in_map:
                for i in range(1, ways + 1):
                    res[f"o{i}"] = in_map["in"] - split_loss
            out_powers = [in_map[f"o{i}"] for i in range(1, ways + 1) if f"o{i}" in in_map]
            if out_powers:
                res["in"] = sum_dbm(out_powers) - exloss
            return res

        if btype == "combiner":
            ways = int(params.get("ways", 2))
            exloss = abs(float(params.get("exloss", 0.3)))
            v_sum = sum(math.sqrt(10.0 ** (in_map[f"i{i}"] / 10.0)) for i in range(1, ways + 1) if f"i{i}" in in_map)
            if v_sum > 0:
                res["out"] = 10.0 * math.log10((v_sum * v_sum / ways) * (10.0 ** (-exloss / 10.0)))
            if "out" in in_map:
                for i in range(1, ways + 1):
                    res[f"i{i}"] = in_map["out"] - (10.0 * math.log10(ways) + exloss)
            return res

        if btype == "coupler":
            M = coupler_matrix(params)
            for src, lv in in_map.items():
                if src in M:
                    for dst, loss in M[src].items():
                        res[dst] = lv - loss
            return res

        if btype == "bamp":
            mode = params.get("mode", "Amp Mode")
            if mode == "Bypass Mode":
                byp = abs(float(params.get("bypLoss", 1.8)))
                if "in" in in_map:
                    res["out"] = in_map["in"] - byp
                if "out" in in_map:
                    res["in"] = in_map["out"] - byp
            else:
                gain = float(params.get("gain", 18.0))
                if "in" in in_map:
                    res["out"] = in_map["in"] + gain

        elif btype == "amp":
            gain = float(params.get("gain", 15.0))
            if "in" in in_map:
                res["out"] = in_map["in"] + gain

        elif btype == "custom":
            outs = int(params.get("outs", 1))
            gain = float(params.get("gain", 0.0))
            if "i1" in in_map:
                for i in range(1, outs + 1):
                    res[f"o{i}"] = in_map["i1"] + gain

        cap = self.get_cap_p1(block)
        if cap is not None:
            for k in res:
                if res[k] > cap:
                    res[k] = cap
        return res

        cap = self.get_cap_p1(block)
        if cap is not None:
            for k in res:
                if res[k] > cap:
                    res[k] = cap
        return res

    def get_cap_p1(self, block: Dict[str, Any]) -> Optional[float]:
        btype = block.get("type", "")
        params = block.get("params", {})
        if btype == "amp":
            v = params.get("p1db")
            if v not in ("", None):
                try:
                    return float(v)
                except Exception:
                    pass
        elif btype == "bamp":
            if params.get("mode") != "Bypass Mode":
                v = params.get("p1db")
                if v not in ("", None):
                    try:
                        return float(v)
                    except Exception:
                        pass
        elif btype == "custom":
            v = params.get("p1db")
            if v not in ("", None):
                try:
                    return float(v)
                except Exception:
                    pass
        elif btype == "mixer":
            v = params.get("p1db", 5)
            if v not in ("", None):
                try:
                    return float(v)
                except Exception:
                    pass
        return None

    def get_component_nf(self, block: Dict[str, Any]) -> float:
        btype = block.get("type", "")
        params = block.get("params", {})
        
        if btype == "amp":
            return abs(float(params.get("nf", 0.0)))
        if btype == "bamp":
            mode = params.get("mode", "Amp Mode")
            if mode == "Bypass Mode":
                return abs(float(params.get("bypLoss", 1.8)))
            return abs(float(params.get("nf", 1.2)))
        if btype in ("atten", "dsa"):
            return abs(float(params.get("loss", 0.0)))
        if btype == "eq":
            return eq_loss(params)
        if btype == "limiter":
            return abs(float(params.get("il", 0.5)))
        if btype == "trace":
            return abs(float(params.get("loss", 1.0)))
        if btype in ("filter", "tfilter"):
            return abs(float(params.get("il", 1.5)))
        if btype == "splitter":
            ways = int(params.get("ways", 2))
            exloss = abs(float(params.get("exloss", 0.3)))
            return 10.0 * math.log10(ways) + exloss
        if btype == "combiner":
            ways = int(params.get("ways", 2))
            exloss = abs(float(params.get("exloss", 0.3)))
            return 10.0 * math.log10(ways) + exloss
        if btype == "coupler":
            ctype = params.get("ctype", "Directional")
            il = abs(float(params.get("il", 0.0)))
            c_val = abs(float(params.get("coupling", 10.0)))
            if ctype == "Power tap":
                return il + tap_thru_loss(c_val)
            return il
        if btype == "switch":
            return abs(float(params.get("il", 0.4)))
        if btype == "custom":
            return abs(float(params.get("nf", 0.0)))
        return 0.0

    def compute_powers(self) -> Dict[str, float]:
        out: Dict[str, float] = {}
        
        # Initialize sources
        for b in self.all_blocks:
            btype = b.get("type", "")
            params = b.get("params", {})
            is_src = False
            pwr = 0.0
            
            if btype in ("source", "rfin"):
                is_src = True
                p_key = "secondaryPower" if self.power_budget == "secondary" else "primaryPower"
                if p_key in params and params[p_key] != "":
                    pwr = float(params[p_key])
                else:
                    pwr = float(params.get("power", 0.0))
            elif btype == "antenna" and params.get("role") == "Rx":
                is_src = True
                p_key = "secondaryPower" if self.power_budget == "secondary" else "primaryPower"
                if p_key in params and params[p_key] != "":
                    pwr = float(params[p_key])
                else:
                    pwr = float(params.get("power", 0.0))
            elif btype == "custom" and int(params.get("ins", 1)) == 0 and int(params.get("outs", 1)) > 0:
                is_src = True
                p_key = "secondaryPower" if self.power_budget == "secondary" else "primaryPower"
                pwr = float(params.get(p_key, params.get("power", 0.0)))
                
            if is_src:
                ports = self.get_ports(b)
                for pt in ports:
                    if pt["kind"] == "out":
                        out[key(b["id"], pt["id"])] = pwr

        max_iter = len(self.all_blocks) + 20
        for _ in range(max_iter):
            changed = False
            tag_level: Dict[str, float] = {}
            
            # Subsystem inputs -> tag
            for b in self.all_blocks:
                if b.get("type") != "subsystem":
                    continue
                for pt in self.get_ports(b):
                    if pt["kind"] != "in":
                        continue
                    in_levels = []
                    for cn in self.all_conns:
                        if cn["to"]["block"] == b["id"] and cn["to"]["port"] == pt["id"]:
                            k = key(cn["from"]["block"], cn["from"]["port"])
                            if k in out and math.isfinite(out[k]):
                                in_levels.append(out[k])
                    if in_levels:
                        lv = sum_dbm(in_levels)
                        t = sub_tag(b["id"], pt["id"])
                        tag_level[t] = max(tag_level.get(t, -float("inf")), lv)

            # Interconnect senders -> tag
            for b in self.all_blocks:
                if b.get("type") != "interconnect" or b.get("params", {}).get("role") != "send":
                    continue
                pt = self.get_ports(b)[0]
                in_levels = []
                for cn in self.all_conns:
                    if cn["to"]["block"] == b["id"] and cn["to"]["port"] == pt["id"]:
                        k = key(cn["from"]["block"], cn["from"]["port"])
                        if k in out and math.isfinite(out[k]):
                            in_levels.append(out[k])
                if in_levels:
                    lv = sum_dbm(in_levels)
                    t = (b.get("params", {}).get("tag") or "").strip()
                    tag_level[t] = max(tag_level.get(t, -float("inf")), lv)

            # Interconnect receivers from tag
            for b in self.all_blocks:
                if b.get("type") != "interconnect" or b.get("params", {}).get("role") == "send":
                    continue
                t = (b.get("params", {}).get("tag") or "").strip()
                if t in tag_level:
                    lv = tag_level[t]
                    pt = self.get_ports(b)[0]
                    k = key(b["id"], pt["id"])
                    if out.get(k) != lv:
                        out[k] = lv
                        changed = True

            # Subsystem outputs from tag
            for b in self.all_blocks:
                if b.get("type") != "subsystem":
                    continue
                for pt in self.get_ports(b):
                    if pt["kind"] != "out":
                        continue
                    t = sub_tag(b["id"], pt["id"])
                    if t in tag_level:
                        lv = tag_level[t]
                        k = key(b["id"], pt["id"])
                        if out.get(k) != lv:
                            out[k] = lv
                            changed = True

            # Standard components
            for b in self.all_blocks:
                btype = b.get("type")
                if btype in ("interconnect", "subsystem", "label", "source", "rfin"):
                    continue
                if btype == "antenna" and b.get("params", {}).get("role") == "Rx":
                    continue
                    
                ports = self.get_ports(b)
                in_map: Dict[str, float] = {}
                for p in ports:
                    if p["kind"] in ("in", "inout"):
                        in_levels = []
                        for cn in self.all_conns:
                            if cn["to"]["block"] == b["id"] and cn["to"]["port"] == p["id"]:
                                k = key(cn["from"]["block"], cn["from"]["port"])
                                if k in out and math.isfinite(out[k]):
                                    in_levels.append(out[k])
                        if in_levels:
                            in_map[p["id"]] = sum_dbm(in_levels)
                            
                if not in_map:
                    continue
                    
                em = self.evaluate_bidi_transfer(b, in_map)
                for pid, nv in em.items():
                    if nv is not None and math.isfinite(nv):
                        k = key(b["id"], pid)
                        if out.get(k) != nv:
                            out[k] = nv
                            changed = True
                            
            if not changed:
                break
                
        return out

    def compute_noise(self, powers: Dict[str, float]) -> Dict[str, Dict[str, float]]:
        N: Dict[str, Dict[str, float]] = {}
        
        # Initialize sources with F=1, G=1
        for b in self.all_blocks:
            btype = b.get("type", "")
            params = b.get("params", {})
            is_src = (btype in ("source", "rfin")) or (btype == "antenna" and params.get("role") == "Rx")
            if is_src:
                for pt in self.get_ports(b):
                    if pt["kind"] == "out":
                        N[key(b["id"], pt["id"])] = {"F": 1.0, "G": 1.0}

        def near(a, b2):
            return a and b2 and abs(a["F"] - b2["F"]) < 1e-9 and abs(a["G"] - b2["G"]) < 1e-12

        max_iter = len(self.all_blocks) + 20
        for _ in range(max_iter):
            changed = False
            tag_n: Dict[str, Dict[str, float]] = {}

            # Interconnect senders -> tag
            for b in self.all_blocks:
                if b.get("type") != "interconnect" or b.get("params", {}).get("role") != "send":
                    continue
                pt = self.get_ports(b)[0]
                best_nn = None
                best_lvl = -float("inf")
                for cn in self.all_conns:
                    if cn["to"]["block"] == b["id"] and cn["to"]["port"] == pt["id"]:
                        k = key(cn["from"]["block"], cn["from"]["port"])
                        lv = powers.get(k)
                        nn = N.get(k)
                        if lv is not None and nn is not None and lv > best_lvl:
                            best_lvl = lv
                            best_nn = nn
                if best_nn:
                    tag_n[(b.get("params", {}).get("tag") or "").strip()] = best_nn

            # Subsystem inputs -> tag
            for b in self.all_blocks:
                if b.get("type") != "subsystem":
                    continue
                for pt in self.get_ports(b):
                    if pt["kind"] != "in":
                        continue
                    best_nn = None
                    best_lvl = -float("inf")
                    for cn in self.all_conns:
                        if cn["to"]["block"] == b["id"] and cn["to"]["port"] == pt["id"]:
                            k = key(cn["from"]["block"], cn["from"]["port"])
                            lv = powers.get(k)
                            nn = N.get(k)
                            if lv is not None and nn is not None and lv > best_lvl:
                                best_lvl = lv
                                best_nn = nn
                    if best_nn:
                        tag_n[sub_tag(b["id"], pt["id"])] = best_nn

            # Interconnect receivers from tag
            for b in self.all_blocks:
                if b.get("type") != "interconnect" or b.get("params", {}).get("role") == "send":
                    continue
                t = (b.get("params", {}).get("tag") or "").strip()
                nn = tag_n.get(t)
                if not nn:
                    continue
                k = key(b["id"], self.get_ports(b)[0]["id"])
                if not near(N.get(k), nn):
                    N[k] = {"F": nn["F"], "G": nn["G"]}
                    changed = True

            # Subsystem outputs from tag
            for b in self.all_blocks:
                if b.get("type") != "subsystem":
                    continue
                for pt in self.get_ports(b):
                    if pt["kind"] != "out":
                        continue
                    t = sub_tag(b["id"], pt["id"])
                    nn = tag_n.get(t)
                    if not nn:
                        continue
                    k = key(b["id"], pt["id"])
                    if not near(N.get(k), nn):
                        N[k] = {"F": nn["F"], "G": nn["G"]}
                        changed = True

            # Normal components
            for b in self.all_blocks:
                btype = b.get("type", "")
                if btype in ("interconnect", "subsystem", "label", "source", "rfin"):
                    continue
                if btype == "antenna" and b.get("params", {}).get("role") == "Rx":
                    continue
                    
                ports = self.get_ports(b)
                in_p = None
                in_lvl = -float("inf")
                in_n = None
                
                for p in ports:
                    if p["kind"] == "out":
                        continue
                    for cn in self.all_conns:
                        if cn["to"]["block"] == b["id"] and cn["to"]["port"] == p["id"]:
                            k = key(cn["from"]["block"], cn["from"]["port"])
                            lv = powers.get(k)
                            nn = N.get(k)
                            if lv is not None and nn is not None and lv > in_lvl:
                                in_lvl = lv
                                in_p = p["id"]
                                in_n = nn
                                
                if not in_n or not math.isfinite(in_lvl):
                    continue
                    
                stage_nf_db = self.get_component_nf(b)
                f_decl = 10.0 ** (stage_nf_db / 10.0)
                
                for p in ports:
                    if p["id"] == in_p:
                        continue
                    k = key(b["id"], p["id"])
                    lv = powers.get(k)
                    if lv is None or not math.isfinite(lv):
                        continue
                    g = 10.0 ** ((lv - in_lvl) / 10.0)
                    f = max(f_decl, 1.0 / g if g < 1.0 else 1.0)
                    cand = {
                        "F": in_n["F"] + (f - 1.0) / max(1e-12, in_n["G"]),
                        "G": in_n["G"] * g
                    }
                    if not near(N.get(k), cand):
                        N[k] = cand
                        changed = True

            if not changed:
                break
                
        # Attach readable NF in dB
        for k, v in N.items():
            v["nf_db"] = round(10.0 * math.log10(v["F"]), 2) if v["F"] > 0 else 0.0
            
        return N

    def analyze(self) -> Dict[str, Any]:
        powers = self.compute_powers()
        noise = self.compute_noise(powers)
        
        # Trace channel outputs at rfout blocks
        outputs = []
        for b in self.all_blocks:
            if b.get("type") == "rfout":
                bid = b["id"]
                label = b.get("params", {}).get("label") or bid
                sheet_name = self.block_sheet_map.get(bid, "")
                
                # incoming connection to this rfout
                pwr = None
                nf = None
                for cn in self.all_conns:
                    if cn["to"]["block"] == bid:
                        k = key(cn["from"]["block"], cn["from"]["port"])
                        pwr = powers.get(k)
                        nn = noise.get(k)
                        if nn:
                            nf = nn.get("nf_db")
                        break
                        
                outputs.append({
                    "id": bid,
                    "label": label,
                    "sheet": sheet_name,
                    "output_power_dbm": round(pwr, 2) if pwr is not None else None,
                    "noise_figure_db": nf
                })

        return {
            "power_budget": self.power_budget,
            "bandwidth_hz": self.bandwidth_hz,
            "outputs": sorted(outputs, key=lambda x: x["label"]),
            "powers": {k: round(v, 2) for k, v in powers.items()},
            "noise": {k: v["nf_db"] for k, v in noise.items() if "nf_db" in v}
        }

def analyze_rfbd_file(file_path: str, power_budget: str = "primary", bandwidth_hz: float = 1e6) -> Dict[str, Any]:
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    solver = MultiSheetSolver(data, power_budget=power_budget, bandwidth_hz=bandwidth_hz)
    return solver.analyze()

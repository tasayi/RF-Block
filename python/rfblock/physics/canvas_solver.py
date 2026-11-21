"""
Canvas Solver Bridge for RFBlock.
Executes the authoritative RFBlock Canvas JavaScript physics solvers (power-solver.js, noise-solver.js, budget-solver.js)
via headless Node.js runtime, establishing the Canvas calculator as the Single Source of Truth (SSOT).
Provides an automatic pure-Python fallback to MultiSheetSolver if Node.js is unavailable.
"""

import json
import logging
import os
import shutil
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional

from .multi_sheet_solver import MultiSheetSolver

logger = logging.getLogger("rfblock.physics.canvas_solver")

def get_project_root() -> Path:
    """Resolve RFBlock project root containing js/."""
    # From python/rfblock/physics/canvas_solver.py -> root is 3 levels up
    p = Path(__file__).resolve()
    for parent in [p.parent.parent.parent.parent, p.parent.parent.parent, Path.cwd()]:
        if (parent / "js" / "solvers" / "headless-runner.js").exists():
            return parent
        if (parent / "js" / "solvers" / "power-solver.js").exists():
            return parent
    return Path.cwd()

class CanvasSolver:
    """
    Executes the Canvas JavaScript solvers in headless Node.js runtime.
    Guarantees 100% mathematical parity with the RFBlock browser canvas.
    """

    def __init__(
        self,
        schematic: Dict[str, Any],
        power_budget: str = "primary",
        bandwidth_hz: float = 1e6
    ):
        self.schematic = schematic
        self.power_budget = power_budget.lower()
        self.bandwidth_hz = bandwidth_hz
        self.root = get_project_root()
        self.runner_path = self.root / "js" / "solvers" / "headless-runner.js"
        self.node_bin = shutil.which("node") or "/usr/bin/node"

    def analyze(self) -> Dict[str, Any]:
        """
        Run simulation via headless Node.js canvas runner.
        Falls back to pure-Python MultiSheetSolver if Node.js execution fails.
        """
        if self.node_bin and os.path.exists(self.node_bin) and self.runner_path.exists():
            try:
                payload = json.dumps({
                    "schematic": self.schematic,
                    "power_budget": self.power_budget,
                    "bandwidth_hz": self.bandwidth_hz
                })
                proc = subprocess.run(
                    [self.node_bin, str(self.runner_path)],
                    input=payload,
                    capture_output=True,
                    text=True,
                    timeout=15.0
                )
                if proc.returncode == 0 and proc.stdout.strip():
                    data = json.loads(proc.stdout)
                    data["engine"] = "Canvas JS Solver (Headless SSOT)"
                    data["power_budget"] = self.power_budget
                    data["bandwidth_hz"] = self.bandwidth_hz
                    return data
                else:
                    logger.warning(
                        "Canvas JS headless runner returned code %s: %s",
                        proc.returncode,
                        proc.stderr
                    )
            except Exception as e:
                logger.warning("Canvas JS headless runner failed, using Python fallback: %s", e)

        # Fallback to Python MultiSheetSolver
        fallback_solver = MultiSheetSolver(
            self.schematic,
            power_budget=self.power_budget,
            bandwidth_hz=self.bandwidth_hz
        )
        res = fallback_solver.analyze()
        res["engine"] = "Python MultiSheetSolver (Fallback)"
        return res

def analyze_canvas_file(
    file_path: str,
    power_budget: str = "primary",
    bandwidth_hz: float = 1e6
) -> Dict[str, Any]:
    """Read an .rfbd file and analyze using CanvasSolver."""
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    solver = CanvasSolver(data, power_budget=power_budget, bandwidth_hz=bandwidth_hz)
    return solver.analyze()

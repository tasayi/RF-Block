"""
Touchstone File I/O utilities powered by scikit-rf.
"""

from typing import Dict, Any
from .cascade import analyze_schematic_cascade

def generate_touchstone_s2p(schematic: Dict[str, Any]) -> str:
    """Generate Touchstone .s2p text format from schematic."""
    res = analyze_schematic_cascade(schematic)
    return res.get("touchstone_s2p", "")


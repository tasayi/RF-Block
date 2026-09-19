"""
Core configuration and path resolution utilities for RFBlock.
"""

import sys
import os

def get_project_root() -> str:
    """Return root directory of project."""
    if hasattr(sys, '_MEIPASS'):
        return getattr(sys, '_MEIPASS')
    # From python/rfblock/core/config.py up to project root
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))

def resource_path(relative_path: str) -> str:
    """Get absolute path to resource, works for development and PyInstaller bundle."""
    root = get_project_root()
    return os.path.join(root, relative_path)

def get_standalone_html_path() -> str:
    """Get absolute path to compiled standalone HTML distribution bundle."""
    return resource_path(os.path.join("dist", "rf-block-diagram-standalone.html"))


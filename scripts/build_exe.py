#!/usr/bin/env python3
"""
Build wrapper script for compiling single-file executable using uv.
"""

import os
import sys

# Ensure python directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "python")))

from rfblock.desktop.packager import build_single_file_exe

if __name__ == "__main__":
    build_single_file_exe()


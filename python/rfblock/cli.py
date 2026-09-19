"""
Command-Line Interface (CLI) entry points for RFBlock.
"""

import sys
from .desktop.launcher import run_desktop_app
from .desktop.packager import build_single_file_exe

def main_app():
    """Main CLI command for launching RFBlock app."""
    run_desktop_app()

def main_build():
    """Main CLI command for building single-file executable."""
    build_single_file_exe()

if __name__ == "__main__":
    main_app()


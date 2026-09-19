"""
PyInstaller Single-File Executable Packaging Module.
"""

import sys
import os
import subprocess

def build_single_file_exe():
    """Build single-file executable using PyInstaller."""
    print("=============================================================")
    print(" 📦 Packaging RFBlock into Single-File Executable (PyInstaller)")
    print("=============================================================")

    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    standalone_html = os.path.join(root_dir, "dist", "rf-block-diagram-standalone.html")

    if not os.path.exists(standalone_html):
        print("   Running node build.js to generate HTML bundle...")
        subprocess.run(["node", "build.js"], cwd=root_dir, check=True)
    else:
        print("   ✅ Found dist/rf-block-diagram-standalone.html")

    sep = ";" if os.name == "nt" else ":"
    add_data_arg = f"dist/rf-block-diagram-standalone.html{sep}dist"
    entry_script = os.path.join(root_dir, "python", "rfblock", "__main__.py")

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--name=RFBlock-Engine",
        f"--add-data={add_data_arg}",
        "--paths=python",
        "--hidden-import=uvicorn.logging",
        "--hidden-import=uvicorn.loops",
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols",
        "--hidden-import=uvicorn.protocols.http",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=uvicorn.lifespan",
        "--hidden-import=uvicorn.lifespan.on",
        "--hidden-import=skrf",
        "--hidden-import=fastapi",
        "--hidden-import=rfblock",
        entry_script
    ]

    print("\n2️⃣ Executing PyInstaller build command...")
    res = subprocess.run(cmd, cwd=root_dir)

    if res.returncode == 0:
        exe_path = os.path.join(root_dir, "dist", "RFBlock-Engine" + (".exe" if os.name == "nt" else ""))
        print("\n=============================================================")
        print(" ✅ SUCCESS! Single-File Standalone Executable Created:")
        print(f" 📄 {exe_path}")
        print("=============================================================")
    else:
        print("\n❌ PyInstaller build failed.")
        sys.exit(1)

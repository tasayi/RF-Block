# Release Notes — RF Chain v2.0.0

**Release Date**: September 20, 2026  
**Version**: `v2.0.0`  
**Repository**: `RFBlock`

---

## 🚀 Overview

`RF Chain v2.0.0` is a major upgrade introducing Python **`uv`** package management, a modular backend package architecture (`python/rfblock`), native **`scikit-rf` (`skrf`)** frequency-domain S-parameter matrix physics solvers, IEEE Std 315 schematic coupler symbols, and single-file binary executable packaging (`dist/RFBlock-Engine`).

---

## 🌟 Key Features & Improvements

### 1. 🐍 Modular Python Backend Package (`python/rfblock`)
- **`rfblock.core`**: Asset resource path resolution and standalone HTML bundle locator.
- **`rfblock.physics`**: Decoupled `scikit-rf` S-parameter matrix engine:
  - `network_builder.py`: Converts front-end schematic blocks into frequency-dependent `skrf.Network` objects.
  - `cascade.py`: Multi-port S-parameter matrix cascade ($S_{11}, S_{21}, S_{12}, S_{22}$) and Rollett stability factor ($K$) solver.
  - `touchstone.py`: Touchstone `.s2p` string generator and exporter.
- **`rfblock.api`**: FastAPI REST API server layer with Pydantic request/response validation models (`/api/v1/status`, `/api/v1/analyze/sparams`, `/api/v1/export/touchstone`).
- **`rfblock.desktop`**: Local port binder, Uvicorn server, PyWebView / browser launcher, and PyInstaller single-file binary packager.
- **`rfblock.cli`**: CLI entry points for application execution (`rfblock`) and binary packaging (`rfblock-build`).

---

### 2. ⚡ `uv` Package Manager Integration
- Full `pyproject.toml` definition with reproducible `uv.lock` dependency locking.
- **CLI Commands**:
  - `uv sync`: Installs and locks dependencies deterministically.
  - `uv run rfblock`: Runs the desktop application with live Python backend.
  - `uv run rfblock-build`: Compiles the single-file binary executable `dist/RFBlock-Engine`.

---

### 3. 📦 Single-File Executable Desktop App (`RFBlock-Engine`)
- Compiles the web application UI, FastAPI server, Uvicorn, and `scikit-rf` into a zero-setup single binary executable (`dist/RFBlock-Engine`).
- **Zero Setup**: Auto-starts local backend engine on a free port and launches the web interface seamlessly.

---

### 4. 📐 IEEE Std 315 / IEC 60617 RF Coupler Symbols & Port Alignment
- **Bi-directional Coupler**: Placed `fwd` at Bottom-Left (adjacent to `in`) and `rev` at Bottom-Right (adjacent to `thru`). Rendered crossed dual coupling arms ('X' symbol).
- **Directional Coupler**: Placed `cpl` at Bottom-Left (adjacent to `in`) and `iso` at Bottom-Right (adjacent to `thru`). Rendered single backward-coupling arm.
- **Resistive Splitter**: Rendered standard IEEE 315 3-resistor star (Y) divider topology.
- **90° Hybrid**: Rendered 4-port branch-line box with `90°` phase designation tag.
- **180° Hybrid**: Rendered circular Rat-Race ring coupler with feeds and $\Sigma$ / $\Delta$ port symbols.

---

# Release Notes — RF Chain v1.0.0

**Release Date**: September 19, 2026  
**Version**: `v1.0.0`  

## 🚀 Overview

`RF Chain v1.0.0` is a major release establishing a modular codebase architecture, physical non-linear power compression solvers, component catalog expansions, optimized canvas wire badging, and a zero-dependency standalone HTML distribution (`dist/rf-block-diagram-standalone.html`).

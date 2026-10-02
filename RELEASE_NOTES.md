# Release Notes — RF Chain v2.1.0

**Release Date**: October 2, 2026  
**Version**: `v2.1.0`  
**Repository**: `RFBlock`

---

## 🚀 Overview

`RF Chain v2.1.0` introduces **10 px fine grid snapping**, **always tightly cropped exports** across SVG, PNG, and native Microsoft Visio (`.vsdx`), a **dynamic symbol label clearance engine** for multi-indicator stacks, and the **4-indicator wire pill stack system** ($P_{wr1}$, $P_{wr2}$, $\text{NF}$, $N_{floor}$).

---

## 🌟 Key Features & Improvements

### 1. 📏 10 px Fine Grid Snapping & Visual Alignment
- **Fine Placement Resolution**: Updated `DEFAULT_SETTINGS.gridSize` from $40\text{ px}$ to **$10\text{ px}$**, allowing precise alignment and adjustment of components, wire jogs, and keyboard nudges.
- **Visual Canvas Grid**: Updated minor SVG grid pattern `#gridm` to $10\times 10\text{ px}$ with $100\times 100\text{ px}$ major divisions, providing 10 visual subdivisions per major grid line.

### 2. 🖼️ Always Tightly Cropped Exports (SVG, PNG, Visio VSDX)
- **Faithful Diagram Bounding**: All export formats (SVG, PNG, and Microsoft Visio `.vsdx`) now **always tightly crop to the authored diagram bounding box** plus a clean $24\text{ px}$ padding margin.
- **Decoupled Visual Guidelines**: Canvas layout presets (e.g. A4 Portrait, A3 Landscape) serve as on-screen design boundaries for layout organization, while exported figures remain unclipped, distortion-free, and margin-free for seamless insertion into Microsoft Word, PowerPoint, LibreOffice, and scientific publications.
- **Native 96 DPI Visio Packaging**: Visio VSDX pages are generated at native 96 DPI with exact 10 pt typography and matching pill dimensions, preventing text overspill across badges.

### 3. 🏷️ Dynamic Symbol Label Clearance Engine (`blockLabelY`)
- **Collision Avoidance**: Automatically calculates vertical clearance for symbol labels (`val`, `name`, `info`) above and below blocks based on the active indicator stack height:
  - **Above Symbol (`val`)**: Dynamically shifts to $y = -22\text{ px}$ when both $P_{wr1}$ and $\text{NF}$ are active, maintaining an $8\text{ px}$ visual clearance completely above the green NF pill. Remains at standard tight $y = -13\text{ px}$ when single indicators are shown.
  - **Below Symbol (`name` & `info`)**: Dynamically shifts to $y = f.h + 30\text{ px}$ and $f.h + 45\text{ px}$ when both $P_{wr2}$ and $N_{floor}$ are active, clearing the purple Noise Floor pill.
- **Independent Floating Offsets**: Preserves custom drag offsets (`_valOffY`, `_nameOffY`, `_infoOffY`) on top of the calculated dynamic baseline.

### 4. 📊 4-Indicator Wire Stack System
- **Symmetric Stacking**: Supports simultaneous cascading analysis and display of:
  - Above wire: **Noise Figure** (`nf`) and **Primary Power** (`pwr1`).
  - Below wire: **Secondary Power** (`pwr2`) and **Thermal Noise Floor** (`nfloor`).
- **Single-Line Pill Badges**: Clean single-line badges with $5\text{ px}$ horizontal padding and high-contrast color-coded themes.

---

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

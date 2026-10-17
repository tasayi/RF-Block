# Release Notes — RF Chain v2.2.0

**Release Date**: October 2, 2026  
**Version**: `v2.2.0`  
**Repository**: `RFBlock`

---

## 🚀 Overview

`RF Chain v2.2.0` is a major architectural milestone introducing **Domain-Modular Architecture** and **AI-Agentic Maintenance Optimization**. Monolithic JavaScript source files (700–1000 LOC each) have been refactored into clean, single-responsibility domain modules (~50–150 LOC each) across component catalogs, orthogonal Manhattan layout routing, Microsoft Visio OpenXML export generation, and S-parameter UI charting.

This reduces token context overhead by **70–87%** for AI coding agents inspecting or modifying specific submodules, establishes clear subsystem isolation, and provides dual-environment browser/Node.js compatibility.

---

## 🌟 Key Features & Improvements

### 1. 🧩 Domain-Modular Component Catalogs (`js/components/*.js`)
- **Decomposed Monolith**: Replaced monolithic `js/components.js` with 9 focused domain catalogs:
  - `helpers.js`: Shared math, validation, and port builders (`cint`, `gsign`, `cplPorts`, `L`).
  - `sources.js`: CW sources, LO generators, and signal references.
  - `gain-loss.js`: Amplifiers (LNA/PA), bypass amplifiers, fixed/digital attenuators, limiters, and transmission lines.
  - `filters.js`: Fixed filters (LPF, HPF, BPF, BSF) and tunable filters.
  - `converters.js`: Frequency mixers, multipliers ($\times N$), and dividers ($\div N$).
  - `routing.js`: Switches (SP1T–SP8T), Wilkinson splitters, combiners, directional/bi-directional couplers, and off-page interconnects.
  - `passives.js`: Ferrite isolators, 3-port circulators, and phase shifters.
  - `terminals.js`: Antennas (Tx/Rx), RF In/Out connectors, power detectors, and 50Ω load terminations.
  - `containers.js`: Hierarchical subsystems, custom multi-port blocks, and text annotations.
- **Unified Aggregator**: `js/components.js` cleanly aggregates all catalogs into `BLOCK_TYPES` and `COMP_CATEGORIES` while preserving 100% backwards compatibility.

### 2. 📐 Decomposed Layout & Routing Subsystem (`js/layout/`)
- **`manhattan-router.js`**: Isolated orthogonal Manhattan wire path finding, obstacle avoidance, bounding box margin calculations, and grid alignment logic.
- **`pill-layout.js`**: Dedicated engine for computing 4-indicator signal pill badges ($P_{wr1}$, $P_{wr2}$, $\text{NF}$, $N_{floor}$), single-line styling, dynamic vertical clearances, and label offsets.
- **`router.js`**: Lightweight coordination hub re-exporting layout primitives.

### 3. 📄 Modular Microsoft Visio OpenXML Exporter (`js/io/vsdx/`)
- **Pipeline Architecture**: Decomposed monolithic 927-line Visio generator into 4 specialized stages:
  - `templates.js`: OpenXML document templates, relationships (`.rels`), content types, and XML sanitization.
  - `geometry-converter.js`: SVG path to Visio vector geometry conversion (`MoveTo`, `LineTo`, `ArcTo`, `Ellipse`).
  - `shape-builder.js`: Component master shapes, connection pin calculation, stacked badges, and wire connectors.
  - `exporter.js`: Assembly, ZIP packaging via JSZip, and direct client file download.

### 4. 📈 Modular S-Parameter Charting & Trace Grid (`js/ui/sparams/`)
- **Decomposed Physics UI**: Refactored monolithic 802-line renderer into:
  - `graph-chart.js`: SVG Cartesian grid plotting, dB/linear scales, frequency axes, and multi-path trace rendering.
  - `trace-grid.js`: Tabular frequency point inspector, path selector dropdown, and data summary.
  - `modal-controller.js`: Modal dialog lifecycle, frequency sweep controls, Touchstone `.s2p` export triggers, and error banners.

### 5. 🤖 AI-Agentic Maintenance & Token Optimization
- **70–87% Prompt Token Reduction**: Future AI agents modifying a specific component (e.g. adding a filter response parameter) only need to load `filters.js` (64 lines) rather than the previous 713-line monolith, drastically reducing token consumption and latency.
- **Subsystem Isolation**: Eliminates cross-domain side-effects where modifications to UI charts or routing could inadvertently impact Visio vector math.
- **Dual Browser & Node.js Scoping**: Bulletproof scoping that runs seamlessly in flat browser script tags without identifier collisions (`SyntaxError: Identifier already declared`), while supporting Node.js CommonJS `require()` for standalone bundling.

### 6. 🌐 Unified Backend Engine Client (`js/api/engine-client.js`)
- Standardized REST client handling communication with the FastAPI backend (`POST /api/v1/analyze/sparams`, health checks, Touchstone export) with automatic graceful fallback when running in standalone offline mode.

---

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

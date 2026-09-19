# Release Notes — RF Chain v1.0.0

**Release Date**: September 19, 2026  
**Version**: `v1.0.0`  
**Repository**: `RFBlock`

---

## 🚀 Overview

`RF Chain v1.0.0` is a major release of the modern, fast, zero-dependency web application for designing, simulating, auditing, and exporting **Radio Frequency (RF) system block diagrams**. 

This milestone release establishes a modular codebase architecture, introduces physical non-linear power compression solvers, expands the component catalog with high-linearity components (such as Bypass LNAs, DSAs, and PLL Synthesizers with Reference inputs), optimizes canvas wire badging, and delivers a zero-dependency standalone HTML distribution.

---

## 🌟 Key Features & Improvements

### 1. 🏗️ Modular Architecture Refactoring
- Transformed the monolithic application into clean, maintainable ES6 modules under `js/`:
  - `js/config.js`: Component color tint registries and application configuration defaults.
  - `js/components.js`: Comprehensive component registry (`COMP`) with SVG symbol definitions and dynamic port rules.
  - `js/solvers/`: Isolated mathematical solver modules (`power-solver.js`, `noise-solver.js`, `budget-solver.js`).
  - `js/io/`: File I/O, `.rfbd` document state, vector exports (SVG/PNG), and binary XLSX BOM generator (`xlsx-exporter.js`).
  - `js/ui/`: UI renderers, canvas interaction state machine, toolbar controls, dynamic inspector forms, and cascade budget drawer.
- Implemented `build.js` node bundler script to package styles and JS modules into a zero-dependency single distributable file (`dist/rf-block-diagram-standalone.html`).

---

### 2. ⚡ Physical RF Solvers & Engine Upgrades
- **$P_{1\text{dB}}$ Power Compression Solver**:
  - Enforces physical power compression limits ($P_{out} = \min(P_{in} + \text{Gain}, P_{1\text{dB}})$) across active components (Amplifiers, Mixers, Limiters).
  - Propagates realistic compressed power levels downstream across interconnecting wires, waterfall budget drawers, and canvas overdrive alerts (`.block.hot`).
- **Friis Cascaded Noise Figure Engine**:
  - Computes stage-by-stage Noise Figure ($NF$) propagation across linear signal paths using Friis' formula.
  - Guarded against math edge cases, zero gain divisions, and unpowered floating nodes.
- **Waterfall Power Budget & DRC System**:
  - Interactive drawer displaying stage-by-stage Gain, Power Level, $P_{1\text{dB}}$ Headroom, Noise Figure, Output IP3, and Design Rule Check (DRC) alerts.

---

### 3. 📻 Expanded RF Component Catalog
- **Gain & Loss**:
  - **Amplifier (`amp`)**: Active gain stage with Output $P_{1\text{dB}}$ compression and Noise Figure.
  - **Bypass Amplifier (`bamp`)**: Dual-mode active/passive component inspired by Mini-Circuits TSY-83LN+. Features dynamic SVG switch toggling between `Amp Mode` (+18 dB gain, 1.2 dB NF, P1dB compression) and `Bypass Mode` (1.8 dB passive loss, bypasses active compression).
  - **Digital Step Attenuator (`dsa`)**: Digital control attenuation pad with 45° variable control arrow symbol.
  - **Attenuator (`atten`)**: Standardized vertical resistor wave symbol.
  - **Limiter (`limiter`)** & **Line / Trace (`trace`)**.
- **Filtering**:
  - **Filter (`filter`)**: Fixed response curve (LPF, HPF, BPF, BSF).
  - **Tunable Filter (`tfilter`)**: Variable filter response curve with 45° tuning arrow symbol.
- **Frequency Conversion**:
  - **Mixer (`mixer`)**: Down/Up-converter with top label layout preventing bottom `LO` port wire overlap.
  - **Multiplier (`multiplier`)** & **Divider (`divider`)**: Frequency multiplication ($\times N$) and division ($\div N$) stages.
  - **PLL Synthesizer (`pll`)**: Synthesizer featuring dedicated Reference Input port (`ref`) on the left and RF Output port on the right.
- **Routing & Switching**:
  - **SP1T to SP8T Switches (`switch`)**: Configurable 1 to 8 throw switches with `Open (Off)` position isolation state.
  - **Splitter (`splitter`)**, **Combiner (`combiner`)**, **Coupler (`coupler`)**, and **Interconnect (`interconnect`)**.
- **Passive Components & Terminals**:
  - **Isolator (`isolator`)**, **Circulator (`circulator`)**, **Phase Shift (`phase`)**.
  - **Antenna (`antenna`)**, **RF In/Out (`rfin`/`rfout`)**, **Detector (`detector`)**, **Load 50Ω (`termination`)**.

---

### 4. 🎨 Canvas UI & Wire Badging Enhancements
- **Single-Line Wire Level Pills**: Wire signal level badges format power and units on a clean single line (e.g. `+10.0 dBm`).
- **Universal Wire Labels Toggle**: Toolbar `Labels` toggle button to instantly turn ON or OFF all wire signal level badges across the canvas and exported graphics.
- **Responsive 100% Scale Toolbar**: Streamlined toolbar layout ensuring all 15 control buttons, toggles, zoom controls, and drawer action buttons fit without clipping at 100% monitor scale.
- **Default Figure Layout Spacing**: Increased component grid separation to 140px, giving single-line power badges ample breathing room on connecting wires.

---

### 5. 📁 Export & File Compatibility
- **Binary XLSX BOM Export**: Generates `.xlsx` Bill of Materials workbooks directly in-browser via a custom Uint8Array ZIP/XLSX builder.
- **Vector Graphics Export**: High-resolution SVG and PNG diagram export options.
- **Document Saving**: `.rfbd` native JSON project document format with full subsystem multi-sheet hierarchy support.

---

## 📦 Single Standalone Distribution File

The standalone distribution build is available at:
```
dist/rf-block-diagram-standalone.html (194.41 KB)
```
No web server, build tools, or internet connection required.

---

## 📜 Commit Summary

- `8978a6f`: Add Bypass Amplifier (`bamp`) component with dual-mode switch symbol and update documentation.
- `9d3b7e8`: Add project documentation (`README.md`, `ARCHITECTURE.md`, `INFO.md`).
- `4382c54`: Refactor codebase, add components (`DSA`, `Tunable Filter`, `Multiplier`, `Divider`, `PLL`), $P_{1\text{dB}}$ compression solver, and single-line wire labels.
- `a737f32`: Initial commit.


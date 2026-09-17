# RF Chain — Block Diagram Editor

A modern, fast, zero-dependency web application for designing, simulating, auditing, and exporting **Radio Frequency (RF) system block diagrams**.

Built with modular JavaScript (ES6+), SVG rendering, and embedded physics solvers for power budgets, $P_{1\text{dB}}$ compression capping, and Friis noise figure calculations.

---

## 🌟 Key Features

- **Comprehensive RF Component Library**:
  - **Sources & Generators**: CW Signal Sources, LO Oscillators, PLL Synthesizers (with Reference input).
  - **Gain & Loss**: Amplifiers (LNA / PA / Driver), Fixed Attenuators, Digital Control Attenuators (DSA), Limiters, Transmission Lines / Traces.
  - **Filtering**: Fixed Filters (LPF, HPF, BPF, BSF) and Tunable Filters with dynamic response curves and 45° tuning controls.
  - **Frequency Conversion**: Mixers (Down/Up-converters), Frequency Multipliers ($\times N$), Frequency Dividers / Prescalers ($\div N$).
  - **Routing & Switching**: SP1T through SP8T Switches (with `Open (Off)` isolation position), Wilkinson Power Splitters, Combiners, Directional Couplers, Power Taps, Hybrid Junctions, Off-page Interconnect tags.
  - **Passive Components**: Ferrite Isolators, 3-Port Circulators, Phase Shifters.
  - **Terminals**: Antennas (Tx/Rx), RF In/Out connectors, Video Power Detectors, 50Ω Dummy Load Terminations.

- **RF Physics & System Solvers**:
  - **$P_{1\text{dB}}$ Compression Solver**: Automatically caps RF signal power output at Output $P_{1\text{dB}}$ compression points ($P_{out} = \min(P_{in} + \text{Gain}, P_{1\text{dB}})$), propagating physically realistic compressed power levels downstream.
  - **Overdrive Warning System**: Highlights overdriven/compressed components in red (`.block.hot`) on the canvas and flags stage warnings in the budget table.
  - **Friis Noise Figure Engine**: Calculates cascaded noise figure stage-by-stage across signal paths.
  - **Waterfall Power Budget & DRC**: Interactive drawer displaying gain, power level, noise figure, cascade OIP3, $P_{1\text{dB}}$ headroom, and design rule warnings.

- **Clean UI & Single-Line Wire Badges**:
  - **Single-Line Power Pills**: Signal level badges format power and units on a clean single line (e.g. `+10.0 dBm`).
  - **Universal Labels Toggle**: Toolbar `Labels` toggle button to instantly turn ON or OFF all wire signal level badges across the canvas and exported graphics.
  - **Distinct Color System**: Category-based soft tints optimized for clean white canvas backgrounds.
  - **Multi-Sheet Hierarchy**: Multi-page subsystem folding and drill-down navigation.

- **Export & Single-File Distribution**:
  - **Excel BOM Export**: Generates binary `.xlsx` Bill of Materials workbooks directly in-browser using a built-in Uint8Array ZIP/XLSX generator.
  - **Vector Graphics Export**: Export high-resolution SVG and PNG block diagrams.
  - **Single Distributable File**: Rebuilds into a standalone, zero-dependency single HTML file (`dist/rf-block-diagram-standalone.html`).

---

## 🚀 Getting Started

### Option 1: Modular Source Files
Open `index.html` directly in any modern web browser:
```bash
# Simply open in browser
open index.html   # macOS
xdg-open index.html # Linux
```

### Option 2: Single Standalone HTML File
Open `dist/rf-block-diagram-standalone.html` directly in any browser. No web server, internet connection, or build step required.

---

## 🛠️ Build & Development

To rebuild the single standalone HTML distribution file after editing source files:

```bash
# Run node bundler
node build.js
```

This packages `css/styles.css` and all `js/*.js` modules into `dist/rf-block-diagram-standalone.html`.

---

## 📄 File Format

Diagrams are saved as `.rfbd` (JSON format), storing:
- Block configurations, positions, rotations, parameters, and custom color tints.
- Wire connections, routing offsets, and label visibility settings.
- Multi-sheet subsystem hierarchy tree.

---

## 📜 License

MIT License. Designed for RF system engineers, hardware designers, and communications researchers.

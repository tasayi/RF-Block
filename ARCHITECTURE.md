# Software Architecture — RF Chain Block Diagram Editor

This document details the architectural design, module breakdown, solver algorithms, and data flow of the RF Chain Block Diagram Editor.

---

## 🏛️ System Design Principles

1. **Zero External Dependencies**: Standard web technologies (HTML5, SVG, CSS3, ES6 Vanilla JS) without heavy third-party frameworks.
2. **Declarative Component Registry**: Components define their properties, ports, parameters, noise figure, $P_{1\text{dB}}$ limits, and SVG symbols (`sym()`) declaratively. Adding or modifying a component requires editing only `js/components.js`.
3. **Reactive Physics Solvers**: System solvers compute power levels, $P_{1\text{dB}}$ compression limits, noise figures, and cascaded IP3 dynamically upon any diagram change.
4. **Isolated Modular Architecture**: Clean separation of concerns between state management, vector math, physics solvers, wire routing, canvas rendering, and file IO.

---

## 📁 Directory & Module Breakdown

```
RFBlock/
├── index.html                  # Main application entry point & UI shell
├── build.js                    # Node.js bundler script for standalone HTML packaging
├── css/
│   └── styles.css              # Dark/light theme variables, toolbar, canvas & SVG styles
└── js/
    ├── config.js               # Category tints (TYPE_TINT), swatches, default settings
    ├── utils.js                # String escaping (esc), number formatting (fmt, dbm, sumDbm)
    ├── components.js           # Declarative component registry (COMP) & SVG glyphs (sym)
    ├── state.js                # Central state (blocks, conns, sheets), history, clipboard
    ├── geometry.js             # Vector math, bounding boxes (bboxOf), port point transforms
    ├── subsystems.js           # Multi-sheet subsystem hierarchy & off-page tag resolution
    ├── layout/
    │   └── router.js           # Orthogonal wire routing, obstacle avoidance, pill placement
    ├── solvers/
    │   ├── power-solver.js     # Fixed-point signal power solver with P1dB compression capping
    │   ├── noise-solver.js     # Cascaded Friis Noise Figure calculation engine
    │   └── budget-solver.js    # Waterfall power budget drawer & Design Rule Checker (DRC)
    ├── io/
    │   ├── xlsx-exporter.js    # Binary Uint8Array ZIP/XLSX BOM workbook generator
    │   └── file-io.js          # File System Access API, JSON save/load, SVG/PNG exporter
    └── ui/
        ├── canvas-renderer.js  # Main SVG canvas rendering loop & DOM updater
        ├── palette-renderer.js # Component sidebar palette renderer & search filter
        ├── inspector-renderer.js# Dynamic block parameter property inspector form
        ├── sheets-renderer.js   # Multi-sheet tab bar manager
        ├── budget-renderer.js   # Waterfall power budget drawer UI renderer
        ├── colorpicker-renderer.js# Custom color popover picker modal
        ├── contextmenu.js      # Right-click context menu handler
        ├── interactions.js     # Pointer drag state machine (move, wire, marquee, pan)
        └── main.js             # Application bootstrap, keyboard shortcuts & seed demo
```

---

## ⚡ Core Engine & Solver Algorithms

### 1. Power Level Solver (`js/solvers/power-solver.js`)
Calculates RF power levels at every port using a fixed-point iterative solver (`computePowersRaw()`):
- **Source Initialization**: Source blocks (`source`, `lo`, `rfin`, `antenna`, `pll`) seed initial power levels.
- **Interconnect & Multi-Sheet Resolution**: Passes signal power across sheet boundaries via off-page tags (`interconnect`, `subsystem`).
- **Transfer Functions & $P_{1\text{dB}}$ Compression Capping**:
  For each non-source component:
  - Input power `ref` is calculated from connected driving ports.
  - Linear output power is calculated via `c.out()`, `c.bidi()`, or `c.xfer()`.
  - **Compression Cap**: If component defines Output $P_{1\text{dB}}$ threshold (`c.p1db`), power is capped at $P_{1\text{dB}}$:
    $$P_{out} = \min(P_{linear}, P_{1\text{dB}})$$
  - Fixed-point iteration continues until all port levels converge (`changed === false`).

### 2. Cascaded Friis Noise Solver (`js/solvers/noise-solver.js`)
Computes Noise Figure ($NF$) stage-by-stage across signal pathways using Friis' formula:
$$F_{total} = F_1 + \frac{F_2 - 1}{G_1} + \frac{F_3 - 1}{G_1 G_2} + \dots + \frac{F_n - 1}{\prod_{i=1}^{n-1} G_i}$$
where $F_i = 10^{NF_i / 10}$ and $G_i = 10^{Gain_i / 10}$.

### 3. Waterfall Budget & DRC Engine (`js/solvers/budget-solver.js`)
Traverses signal chains from source to sink:
- Accumulates stage gain, total power, stage $NF$, cascaded $NF$, linear $OIP_3$, and $P_{1\text{dB}}$ headroom ($P_{1\text{dB}} - P_{out}$).
- Flags stage warnings (`over: true`) when $P_{out} \ge P_{1\text{dB}}$.

---

## 🎨 Layout & Wire Router (`js/layout/router.js`)

- **Orthogonal Wire Routing**: Computes Manhattan $L$-shaped and $Z$-shaped orthogonal wire paths between ports (`route()`).
- **Obstacle Avoidance**: `pickClear()` checks candidate label positions against surrounding block bounding boxes and wire segments.
- **Single-Line Pill Formatting**: `pillDims()` formats power levels into single horizontal badges (`+10.0 dBm`) and positions them centered over clear wire segments.

---

## 📦 Standalone Packager (`build.js`)

The Node.js build script `build.js` reads `index.html`, inline-injects `css/styles.css`, and concatenates all modules in `js/` in dependency order into a single standalone HTML document `dist/rf-block-diagram-standalone.html`.

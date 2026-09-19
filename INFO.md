# RF Component Catalog & Technical Specifications

This document provides a comprehensive specification of all supported RF components, their properties, parameters, physics transfer functions, and schematic symbol conventions.

---

## 📻 Component Groups & Catalog

### 1. Sources & Generators

| Type Key | Name | Ports | Default Parameters | Description & Specs |
| :--- | :--- | :--- | :--- | :--- |
| `source` | **Source** | 1 Out (Right) | `label: "SRC"`, `power: 0 dBm`, `freq: "1 GHz"` | CW RF Signal Source. Output power level ($dBm$) and center frequency. |
| `lo` | **LO / Osc** | 1 Out (Top) | `label: "LO"`, `power: 10 dBm`, `freq: "0.9 GHz"` | Local Oscillator / Synthesizer. Top port feeding Mixer LO inputs. |
| `pll` | **PLL Synthesizer** | 1 In (Ref Left), 1 Out (RF Right) | `label: "PLL"`, `power: 10 dBm`, `freq: "2.4 GHz"`, `refFreq: "10 MHz"` | Phase-Locked Loop Synthesizer. Accepts Reference Clock input on left. |

---

### 2. Gain & Loss

| Type Key | Name | Ports | Parameters | Transfer & Compression Physics |
| :--- | :--- | :--- | :--- | :--- |
| `amp` | **Amplifier** | In (Left), Out (Right) | `gain: 15 dB`, `nf: 2 dB`, `p1db: 20 dBm`, `oip3: 30 dBm` | Linear gain $P_{out} = P_{in} + \text{Gain}$, capped at Output $P_{1\text{dB}}$ ($P_{out} \le P_{1\text{dB}}$). |
| `bamp` | **Bypass Amplifier** | In (Left), Out (Right) | `label: "By_Amp"`, `mode: "Amp Mode"`, `gain: 18 dB`, `nf: 1.2 dB`, `bypLoss: 1.8 dB`, `p1db: 20 dBm`, `oip3: 32 dBm` | Dual-mode active/passive component inspired by Mini-Circuits TSY-83LN+. In **Amp Mode**, applies $+18\text{ dB}$ gain, $1.2\text{ dB}$ NF, and $P_{1\text{dB}}$ compression. In **Bypass Mode**, applies $1.8\text{ dB}$ passive loss and bypasses active compression. Enclosed in outer box with upper parallel SPST bypass switch and lower branch featuring amplifier triangle in series with SPST isolation switch. |
| `atten` | **Attenuator** | In (Left), Out (Right) | `loss: 10 dB` | Fixed attenuation pad. Symbol renders vertical triangular resistor wave. |
| `dsa` | **Digital Attenuator** | In (Left), Out (Right) | `loss: 10 dB` | Digital Step Attenuator (DSA). Symbol renders vertical resistor wave + 45° control arrow. |
| `limiter` | **Limiter** | In (Left), Out (Right) | `thresh: 10 dBm`, `il: 0.5 dB` | Power clamping protection. $P_{out} = \min(P_{in}, \text{thresh}) - \text{il}$. |
| `trace` | **Line / Trace** | In (Left), Out (Right) | `loss: 1 dB` | Microstrip line / Coaxial cable loss. |

---

### 3. Filtering

| Type Key | Name | Ports | Parameters | Features & Symbol Structure |
| :--- | :--- | :--- | :--- | :--- |
| `filter` | **Filter** | In (Left), Out (Right) | `ftype: "BPF"`, `il: 1.5 dB`, `rej: 40 dB`, `band: "passband"`, `fc: ""` | Supports `LPF`, `HPF`, `BPF`, `BSF`. Renders SVG response curve. |
| `tfilter` | **Tunable Filter** | In (Left), Out (Right) | `ftype: "BPF"`, `il: 2.0 dB`, `rej: 40 dB`, `band: "passband"`, `fc: "1-2 GHz"` | Variable/Tracking filter. Renders response curve + 45° tuning arrow. |

---

### 4. Frequency Conversion

| Type Key | Name | Ports | Parameters | Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `mixer` | **Mixer** | RF (Left In), IF (Right Out), LO (Bottom In) | `cl: 7 dB`, `p1db: 5 dBm`, `oip3: 15 dBm` | Frequency converter. $P_{IF} = P_{RF} - CL$, capped at Output $P_{1\text{dB}}$. Top label positioning prevents LO wire overlap. |
| `multiplier` | **Multiplier** | In (Left), Out (Right) | `factor: "2"`, `il: 0 dB` | Frequency Multiplier ($\times 2, \times 3, \times 4, \times 8$). |
| `divider` | **Divider / Prescaler** | In (Left), Out (Right) | `factor: "2"`, `il: 1.0 dB` | Frequency Divider ($\div 2, \div 4, \div 8, \div 16$). |

---

### 5. Routing & Switching

| Type Key | Name | Ports | Parameters | Dynamic Properties |
| :--- | :--- | :--- | :--- | :--- |
| `switch` | **Switch (SPnT)** | 1 In (Left), 1 to 8 Throws (Right) | `throws: "2"`, `state: "1"`, `il: 0.4 dB`, `iso: 60 dB` | Supports **SP1T to SP8T** throws plus **`Open (Off)`** position (0 state). Displays insertion loss label. |
| `splitter` | **Splitter** | 1 In (Left), $N$ Out (Right) | `ways: "2"`, `exloss: 0.3 dB` | 1:N Power Splitter ($N=2..8$). Power division: $10 \log_{10}(N) + \text{exloss}$. |
| `combiner` | **Combiner** | $N$ In (Left), 1 Out (Right) | `ways: "2"`, `exloss: 0.3 dB` | N:1 Power Combiner ($N=2..8$). Power summation: $\text{sumDbm}(P_{ins}) - 10 \log_{10}(N) - \text{exloss}$. |
| `coupler` | **Coupler** | In, Thru, Cpl / Iso | `ctype: "Directional"`, `coupling: 10 dB`, `il: 0.5 dB`, `iso: 30 dB` | Supports Directional, Power tap, Bi-directional, Resistive, 90° Hybrid, 180° Hybrid. |
| `interconnect` | **Interconnect** | 1 Port (Send/Recv) | `tag: "A"`, `role: "receive"` | Off-page tag matching across sheets. |

---

### 6. Passive Components

| Type Key | Name | Ports | Parameters | Symbol |
| :--- | :--- | :--- | :--- | :--- |
| `isolator` | **Isolator** | In (Left), Out (Right) | `il: 0.6 dB` | Non-reciprocal ferrite isolator (forward arrow symbol). |
| `circulator` | **Circulator** | P1 (Left In), P2 (Right Out), P3 (Bottom Out) | `il: 0.5 dB`, `iso: 20 dB` | 3-Port ferrite circulator with top label positioning. |
| `phase` | **Phase Shift** | In (Left), Out (Right) | `phase: 0°`, `il: 1 dB` | Phase shifter ($\phi$). |

---

### 7. Terminals & Annotations

| Type Key | Name | Ports | Parameters | Description |
| :--- | :--- | :--- | :--- | :--- |
| `rfin` | **In connector** | 1 Out (Right) | `power: 0 dBm`, `freq: ""` | SMA / Coaxial input connector. |
| `rfout` | **Out connector** | 1 In (Left) | — | SMA / Coaxial output connector. |
| `antenna` | **Antenna** | 1 Port (Tx In / Rx Out) | `role: "Tx"`, `power: -80 dBm` | Transmit or Receive antenna. |
| `detector` | **Detector** | 1 In (Left) | — | Diode / Video power detector. |
| `termination` | **Load 50Ω** | 1 In (Left) | — | 50Ω dummy load match (horizontal resistor + ground symbol). |

---

## 📐 Formulas & Units

- **Power Levels**: Expressed in **$\text{dBm}$** ($0\text{ dBm} = 1\text{ mW}$ into $50\,\Omega$).
- **Decibel Addition ($\text{sumDbm}$)**:
  $$P_{total} = 10 \log_{10} \left( \sum_{i} 10^{P_i / 10} \right)$$
- **$P_{1\text{dB}}$ Compression**:
  $$P_{out} = \min(P_{in} + \text{Gain}, P_{1\text{dB}})$$
- **Cascaded Friis Noise Figure**:
  $$F_{total} = F_1 + \frac{F_2 - 1}{G_1} + \frac{F_3 - 1}{G_1 G_2} + \dots$$

---

## 📈 S-Parameter Linear Analysis Engine

### 1. 2-Port ABCD Matrix Cascading
Converts 2-port S-parameters $[S]$ ($S_{11}, S_{21}, S_{12}, S_{22}$) into chain matrices $[ABCD]$:
$$A = \frac{(1 + S_{11})(1 - S_{22}) + S_{12}S_{21}}{2 S_{21}}, \quad B = Z_0 \frac{(1 + S_{11})(1 + S_{22}) - S_{12}S_{21}}{2 S_{21}}$$
$$C = \frac{1}{Z_0} \frac{(1 - S_{11})(1 - S_{22}) - S_{12}S_{21}}{2 S_{21}}, \quad D = \frac{(1 - S_{11})(1 + S_{22}) + S_{12}S_{21}}{2 S_{21}}$$

Chain multiplication across stages:
$$[ABCD]_{total}(f_k) = [ABCD]_1(f_k) \cdot [ABCD]_2(f_k) \dots [ABCD]_N(f_k)$$

### 3. Analyser Settings & Comparative Analysis Sheets
- **`Analyser` Settings Window**: Dedicated toolbar modal window configuring Start Frequency ($f_{start}$), Stop Frequency ($f_{stop}$), Sweep Points ($N$), Linear/Logarithmic Scale, and System Impedance ($Z_0$: $50\,\Omega, 75\,\Omega, 100\,\Omega$).
- **S-Params Results Tabs**: Stores multiple analysis runs as tabbed sheets (`Sweep 1`, `Sweep 2`). Allows renaming tabs for comparative analysis across design states (e.g. *LNA Active* vs *LNA Bypassed*).
- **Comparative Overlay**: Superimposes benchmark sweep curves (dashed lines) on top of the active sweep curves for direct visual comparison.
- **Graph & Data Exporters**:
  - **CSV Export**: Raw tabular data (`.csv`).
  - **SVG / PNG Vector & Image Export**: High-resolution chart graphics.
  - **Touchstone `.s2p` Export**: Synthesized system 2-port Touchstone data file export.


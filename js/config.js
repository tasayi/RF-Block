"use strict";

/* Group default tints (fallback) */
const GROUP_TINT = {
  "Terminals": "#eef2f7",
  "Sources": "#fdf1e3",
  "Gain / Loss": "#e9f3ea",
  "Filtering": "#eaf0fa",
  "Frequency": "#f6ecf7",
  "Routing": "#e8f2f5",
  "Passive": "#f2f0ea",
  "Hierarchy": "#eceef3",
  "Custom": "#f0eef8",
  "Annotate": "#ffffff"
};

/* Distinct individual component block type colors (optimized for crisp schematic readability) */
const TYPE_TINT = {
  /* Sources & Generators */
  "source":      "#fee2e2",  // Soft Rose / Coral
  "lo":          "#fef08a",  // Soft Gold / Yellow

  /* Terminals & Output */
  "rfin":        "#0284c7",  // Bright Azure Blue Connector
  "rfout":       "#2563eb",  // Bright Blue Connector
  "antenna":     "#38bdf8",  // Bright Sky Blue Antenna
  "detector":    "#0d9488",  // Teal Detector
  "termination": "#475569",  // Neutral Slate Load

  /* Gain & Loss */
  "amp":         "#bbf7d0",  // Crisp Emerald Green (Amplifier/LNA/PA)
  "bamp":        "#bbf7d0",  // Crisp Emerald Green (Bypass Amplifier)
  "atten":       "#fed7aa",  // Warm Peach (Attenuator)
  "dsa":         "#fed7aa",  // Warm Peach (Digital Attenuator)
  "limiter":     "#fde68a",  // Warm Yellow (Limiter)
  "trace":       "#e2e8f0",  // Light Slate Trace

  /* Filtering & Frequency */
  "filter":      "#bfdbfe",  // Royal Sky Blue (BPF/LPF/HPF)
  "tfilter":     "#bfdbfe",  // Royal Sky Blue (Tunable Filter)
  "mixer":       "#e9d5ff",  // Purple Lavender (Mixer)
  "multiplier":  "#e9d5ff",  // Purple Lavender (Multiplier)
  "divider":     "#e9d5ff",  // Purple Lavender (Divider)
  "pll":         "#fef08a",  // Gold Yellow (PLL Synthesizer)

  /* Routing & Switching */
  "splitter":    "#d9f99d",  // Lime Green
  "combiner":    "#d9f99d",  // Lime Green
  "coupler":     "#fef3c7",  // Warm Amber
  "switch":      "#fbcfe8",  // Soft Magenta / Pink (Switch)
  "interconnect":"#c7d2fe",  // Soft Indigo Tag

  /* Passive Components */
  "isolator":    "#fecdd3",  // Soft Rose
  "circulator":  "#ddd6fe",  // Soft Violet
  "phase":       "#a5f3fc",  // Soft Cyan

  /* Hierarchy & Annotation */
  "subsystem":   "#e2e8f0",  // Light Slate Container
  "custom":      "#fef3c7",  // Warm Cream
  "label":       "#ffffff"   // Pure White
};

/* Color picker preset swatches */
const SWATCHES = [
  "#ffffff", "#f4f6f8", "#eef2f7", "#e9f3ea", "#eaf0fa", "#f6ecf7",
  "#fdf1e3", "#f2f0ea", "#f5e6e6", "#fce8d5", "#fef3c7", "#dcfce7",
  "#e0f2fe", "#e0e7ff", "#f3e8ff", "#fce7f3", "#fee2e2", "#fef9c3"
];

/* Default application configuration settings */
const DEFAULT_SETTINGS = {
  snap: true,
  grid: true,
  gridSize: 20,
  showNF: false,
  showLabels: true,
  color: true,
  theme: "dark",
  analysisBand: { startFreq: 1, startUnit: "GHz", stopFreq: 10, stopUnit: "GHz", points: 101, sweepType: "lin" }
};

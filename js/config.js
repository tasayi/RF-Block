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

/* Distinct individual component block type colors (optimized for white backgrounds) */
const TYPE_TINT = {
  /* Sources & Generators */
  "source":      "#fee2e2",  // Soft Red/Coral
  "lo":          "#fef08a",  // Soft Gold/Yellow
  "rfin":        "#e0f2fe",  // Soft Sky Blue

  /* Terminals & Output */
  "rfout":       "#e2e8f0",  // Soft Slate
  "antenna":     "#bae6fd",  // Soft Azure Blue
  "detector":    "#ccfbf1",  // Soft Teal
  "termination": "#f3f4f6",  // Light Neutral Gray

  /* Gain & Loss */
  "amp":         "#dcfce7",  // Soft Mint Green (Amplifier/LNA/PA)
  "atten":       "#ffedd5",  // Soft Warm Peach/Orange (Attenuator)
  "dsa":         "#ffedd5",  // Soft Warm Peach/Orange (Digital Attenuator)
  "limiter":     "#fed7aa",  // Soft Amber (Limiter)
  "trace":       "#f1f5f9",  // Soft Gray Line

  /* Filtering & Frequency */
  "filter":      "#dbeafe",  // Soft Royal Blue (BPF/LPF/HPF)
  "tfilter":     "#dbeafe",  // Soft Royal Blue (Tunable Filter)
  "mixer":       "#f3e8ff",  // Soft Purple/Violet (Mixer)
  "multiplier":  "#f3e8ff",  // Soft Purple/Violet (Multiplier)
  "divider":     "#f3e8ff",  // Soft Purple/Violet (Divider)
  "pll":         "#fef08a",  // Soft Gold/Yellow (PLL Synthesizer)

  /* Routing & Switching */
  "splitter":    "#ecfccb",  // Soft Lime Green
  "combiner":    "#d9f99d",  // Soft Olive Lime
  "coupler":     "#fef3c7",  // Soft Warm Amber
  "switch":      "#fae8ff",  // Soft Magenta/Pink (Switch)
  "interconnect":"#e0e7ff",  // Soft Indigo (Off-page tag)

  /* Passive Components */
  "isolator":    "#ffe4e6",  // Soft Rose
  "circulator":  "#ede9fe",  // Soft Lavender
  "phase":       "#cff4fc",  // Soft Cyan

  /* Hierarchy & Annotation */
  "subsystem":   "#f1f5f9",  // Soft Slate Container
  "custom":      "#fef3c7",  // Soft Warm Cream
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
  color: true
};

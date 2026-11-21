# Feature Specification: Batch "Export All Sheets" Dialog with Numbered Naming & Destination Selection

## Title / High-Level Objective
Implement an **"Export All Sheets..."** option within the main toolbar's unified `Export ▾` menu. When clicked, it opens a dedicated configuration modal dialog that detects all sheets in the design, lets the user select their desired export format (`VDX`, `PNG`, or `SVG`), select a destination folder on their computer, and exports each sheet with sequential numbering: `01_<sheetname>.<ext>`, `02_<sheetname>.<ext>`, etc.

---

## Context & Scope
- **Affected Subsystems**:
  - Main Toolbar & Dropdown Menu: `index.html`, `js/main.js`, `css/styles.css`
  - Modal Dialog & Batch Exporter Controller: New module `js/io/batch-sheet-exporter.js` (or integrated in `js/io/document-io.js`)
  - Standalone Bundle: `build.js`, `dist/rf-block-diagram-standalone.html`
- **Background**:
  The application supports multi-sheet hierarchical RF block designs (`sheets` array with `id`, `name`, `blocks`, `conns`, `view`). Currently, users can only export the active sheet one at a time. This feature introduces automated multi-sheet batch exporting.

---

## Detailed Requirements & Specifications

### 1. Main Toolbar Menu Integration
- In `#exportDropPanel` (under `#exportDropWrap`), add a new section or entry:
  - **Menu Item**: `#menuExpAllSheets`
  - **Label**: "Export All Sheets..."
  - **Icon**: 📑
  - **Badge**: `All`
  - Clicking this closes the dropdown and opens the `#exportAllModal` dialog.

### 2. "Export All Sheets" Modal Dialog (`#exportAllModal`)
- Modal structure styled consistent with existing dialogs (`#sparamsModal`, `#analyserDrawer`, etc.):
  - **Header**: Title ("📑 Export All Sheets") and close button (`✕` / `#expAllClose`).
  - **Detected Sheets Summary**: Displays detected sheet count and list preview (e.g., `3 sheets detected: 01_Sheet 1, 02_Downconverter, 03_IF Filter Stage`).
  - **Format Selection**:
    - Radio button or interactive pill group for target export formats:
      - `VDX` (Open Drawing XML / Visio XML) — default
      - `PNG` (High-Resolution Raster Image)
      - `SVG` (Scalable Vector Graphic)
      - *(Optional option for `EMF` Enhanced Metafile)*
  - **Destination Selection**:
    - "Select Folder..." button triggering modern browser File System Access API (`window.showDirectoryPicker()`).
    - Destination status indicator displaying the selected folder name/path (e.g., `📁 Target: /home/user/Documents/RF_Exports/`).
    - If `window.showDirectoryPicker()` is unavailable (e.g., unsupported browser) or permission is denied, provide an automatic fallback option: **"Download All as ZIP Archive"** (`<project>_all_sheets.zip`).
  - **File Preview Table**:
    - Shows live preview of output file names based on current format selection:
      - `01_Sheet 1.vdx`
      - `02_Downconverter.vdx`
      - `03_IF Filter Stage.vdx`
  - **Action Footer**:
    - "Cancel" button (`#expAllCancel`)
    - "Export All Sheets" primary action button (`#expAllConfirm`) with progress indicator/spinner during generation.

### 3. File Naming Convention & Sanitization
- File naming pattern:
  ```
  ${String(index + 1).padStart(2, '0')}_${sanitizedSheetName}.${extension}
  ```
- **Numbering**: Two-digit zero-padded (e.g., `01`, `02`, ..., `10`).
- **Sanitization**: Remove or replace invalid filesystem characters (`/ \ : * ? " < > |`) with underscores to ensure valid filenames across Windows, Linux, and macOS.
- If sheet name is empty or whitespace, fall back to `Sheet_${index + 1}`.

### 4. Batch Export Execution & State Preservation
- **Preserve Canvas State**:
  - Store original active sheet index: `const originalCur = cur;`
  - Commit active canvas edits prior to batch loop: `commitSheet();`
- **Sequential Sheet Processing**:
  - Iterate through all sheets `0` to `sheets.length - 1`:
    - Switch sheet context (`adoptSheet(i)`).
    - If sheet has 0 blocks, either export empty template or prompt user; generate valid format output.
    - Render/generate:
      - **VDX**: Call `buildVsdxBlob(sh.blocks, sh.conns, P, NFm, PSecondary, null, settings)`.
      - **SVG**: Call `buildExportSVG(1)`.
      - **PNG**: Render `buildExportSVG(2)` to offscreen canvas and convert to PNG blob.
    - Write file directly into selected directory via `dirHandle.getFileHandle(filename, { create: true })` -> `createWritable()`, or append to ZIP package.
- **Restore State**:
  - Re-adopt original sheet: `adoptSheet(originalCur);`
  - Trigger `renderAll()`, `renderSheets()`, `applyView()`.
  - Close modal dialog and display a completion toast notification (e.g., `Successfully exported 3 sheets to folder "RF_Exports"`).

### 5. Distribution Build & Tests
- Include any new script in `index.html` and package into `dist/rf-block-diagram-standalone.html` via `node build.js`.
- Verify in headless Chromium and execute Python test suite.

---

## Constraints & Invariants
- **Client-Side Only**: 100% in-browser generation without requiring an external backend or node server.
- **Safety & Non-Destructive**: Batch processing must not alter block coordinates, connections, or undo/redo history of any sheet.
- **Zero Lock-In**: VDX, PNG, and SVG must be standard, valid formats opening in LibreOffice Draw, Visio, browsers, and standard viewers.

---

## Acceptance & Verification Criteria
1. Clicking **Export ▾ -> Export All Sheets...** opens the configuration dialog with detected sheets listed.
2. Selecting `VDX`, `PNG`, or `SVG` updates the live filename preview with padded numbers (`01_<name>.<ext>`).
3. Selecting a target folder via `showDirectoryPicker()` saves all generated files directly into that folder with the exact specified naming scheme.
4. If directory picker is cancelled or unsupported, fallback ZIP packaging exports all files in a single archive.
5. Canvas and active sheet state remain completely intact after export completion.
6. Standalone distribution file `dist/rf-block-diagram-standalone.html` compiles with 0 console errors and all tests pass.

# Refined Specification: Unify "Export All Sheets" with Standard `downloadFile` Location Picker

## 1. Title / High-Level Objective
Refactor the **"Export All Sheets"** dialog to reuse the universal `downloadFile()` function—the exact same mechanism powering normal PNG, SVG, EMF, and VDX exports. Eliminate the problematic `window.showDirectoryPicker()` dependency that triggered the *"Direct folder selection is not supported in this browser"* warning in Mozilla Firefox and Brave Browser, allowing users to save their batch-exported sheets through their browser's native location picker dialog.

---

## 2. Context & Scope
- **Background**:
  - Normal exports (PNG, SVG, EMF, VDX) throughout RFBlock call `downloadFile(blob, filename, mimeType)` defined in [js/utils.js](file:///home/satish/Documents/Code/core/RFBlock/js/utils.js#L170-L223).
  - In `downloadFile()`, the app uses `window.showSaveFilePicker()` (or the browser's native save workflow), which opens the standard OS file save location picker.
  - The batch exporter in `js/io/batch-sheet-exporter.js` introduced a separate "Choose Folder..." button calling `window.showDirectoryPicker()`. Because Firefox does not implement directory picking and Brave disables it by default, clicking that button triggered an error warning.
- **Affected Subsystems**:
  - [js/io/batch-sheet-exporter.js](file:///home/satish/Documents/Code/core/RFBlock/js/io/batch-sheet-exporter.js): Remove folder-picker dependencies; route all batch export actions through `downloadFile()`.
  - [index.html](file:///home/satish/Documents/Code/core/RFBlock/index.html): Clean up `#exportAllModal` to remove the confusing "Choose Folder" row and warning banners.
  - [css/styles.css](file:///home/satish/Documents/Code/core/RFBlock/css/styles.css): Simplify modal layout and package options.
  - `dist/rf-block-diagram-standalone.html`: Recompiled standalone file.

---

## 3. Detailed Requirements & Specifications

### 3.1 Standardized Location Picker via `downloadFile`
- Rather than attempting to pick an entire folder upfront with an unsupported directory API, batch export will directly invoke the standard `downloadFile()` routine:
  1. **ZIP Archive Mode (Default / Recommended - Single Location Picker)**:
     - Automatically renders all sheets and bundles the numbered files (`01_Sheet1.vdx`, `02_Sheet2.vdx`, etc.) into `<project>_all_sheets_<format>.zip`.
     - Calls `downloadFile(zipBlob, zipFileName, "application/zip")`.
     - Opens the exact same native OS location picker dialog as normal single-file exports, letting the user choose where to save the complete package.
  2. **Individual Files Mode (Option / Checkbox)**:
     - Iterates through all sheets and calls `downloadFile(blob, "01_Sheet1.vdx", mimeType)` for each sheet sequentially with a brief throttle to prevent browser blocking.
     - Lets the browser save each numbered file directly to the download location or prompt per file according to the user's browser preferences.

### 3.2 Modal UI Cleanup (`#exportAllModal`)
- **Remove**:
  - The "Choose Folder..." button (`#btnBatchChooseFolder`), "Clear" button, and folder path display row.
  - All warning toasts and hints regarding unsupported directory pickers.
- **Retain & Enhance**:
  - Format Selector: **VDX** (Visio XML), **PNG**, **SVG**, and **EMF**.
  - Package Toggle / Option:
    - `[●] Package into ZIP archive (Single file save picker)`
    - `[○] Download individual files sequentially (01_..., 02_...)`
  - Live preview list showing detected sheet count and numbered export filenames:
    - `01_SheetName.vdx`
    - `02_SheetName.vdx`
  - Primary button: **"Export All Sheets"**, which immediately opens the native location picker / save prompt via `downloadFile()`.

---

## 4. Constraints & Invariants
- **Consistency**: Batch export must behave identically to the single export buttons on the main toolbar.
- **Naming Rule**: Files must maintain zero-padded sheet numbering (`01_<name>.<ext>`, `02_<name>.<ext>`).
- **100% Client-Side**: No backend or external network dependencies; works completely offline in `rf-block-diagram-standalone.html`.
- **Zero Warnings**: No unsupported-browser warning toasts in Firefox, Brave, Chrome, Safari, or Edge.

---

## 5. Acceptance & Verification Criteria
1. **Firefox Verification**:
   - Open `#exportAllModal` in Firefox and click "Export All Sheets".
   - No warning toast is displayed.
   - The native file save dialog / download prompt opens for `<project>_all_sheets_<format>.zip` (or individual files).
2. **Brave Verification**:
   - Open in Brave Browser and click "Export All Sheets".
   - The native location picker opens cleanly without warnings.
3. **Archive Integrity**:
   - The saved ZIP contains clean, valid files for all sheets with correct zero-padded prefixes.
4. **Automated Testing & Build**:
   - `node build.js` compiles cleanly.
   - All 45 Python test cases pass with zero regressions.

---

<br>
<br>

---
# Refined Specification: AI Agent Integration Layer (MCP Server + M365 Copilot OpenAPI Plugin + Live Canvas Sync)

## 1. Title / High-Level Objective
Design and implement a unified AI agent integration subsystem for RFBlock. Provide native Model Context Protocol (MCP) tool support for local AI agents (Claude, Cursor, Antigravity, local LLMs) and a compliant OpenAPI 3.0 specification with an M365 Copilot plugin manifest for Microsoft 365 Copilot, ChatGPT, and Gemini.

---

## 2. Context & Scope
- **Backend Service Layer**:
  - `python/rfblock/mcp/`: New native Python MCP server package implementing standard JSON-RPC tools.
  - `python/rfblock/api/routes/agent.py`: New FastAPI router exposing high-level circuit manipulation, solving, and export endpoints.
  - `python/rfblock/api/routes/ws.py`: WebSocket bridge to stream agent actions live to the user's open UI.
- **M365 Copilot Integration Artifacts**:
  - `copilot/ai-plugin.json`: M365 Copilot API plugin manifest.
  - `copilot/openapi.yaml`: Annotated OpenAPI 3.0 contract compliant with Microsoft Copilot schema requirements.
- **Frontend Live Sync**:
  - `js/api/agent-sync.js`: Client-side WebSocket listener that receives agent mutations (add block, update params, change sheet) and invokes `renderAll()`.

---

## 3. Detailed Requirements & Specifications

### 3.1 Python MCP Server (`python/rfblock/mcp/server.py`)
- Built using the standard Python `mcp` SDK.
- Runnable as a standalone CLI command: `rfblock-mcp` or `python -m rfblock.mcp`.
- Exposes tools:
  - `rf_get_schematic`: Retrieves current blocks, connections, and metadata.
  - `rf_synthesize_chain`: Creates an RF cascade from a specification list (e.g. LNA -> BPF -> Mixer -> IF Amp).
  - `rf_calculate_cascade`: Runs cascade budget solver and returns NF, Gain, P1dB, and IP3.
  - `rf_solve_sparams`: Runs scikit-rf multi-port analysis and returns Touchstone S2P or magnitude/phase vectors.
  - `rf_export_diagram`: Exports drawings in VDX, EMF, SVG, or PNG format.

### 3.2 M365 Copilot / Generic LLM REST Endpoints (`python/rfblock/api/routes/agent.py`)
- Expose identical business logic via standard REST endpoints under `/api/v1/agent/`:
  - `POST /api/v1/agent/synthesize`: Generates and adds blocks to the design.
  - `GET /api/v1/agent/budget`: Returns JSON cascade table for Word/Excel synthesis.
  - `POST /api/v1/agent/export`: Generates binary files (VDX, XLSX, EMF, PNG).
- Provide `/copilot/ai-plugin.json` describing plugin capabilities for M365 Copilot.
- Provide clean OpenAPI 3.0 schema generation with rich docstrings and parameter descriptions so LLMs reliably generate valid inputs.

### 3.3 Live Canvas WebSocket Gateway (`python/rfblock/api/routes/ws.py`)
- WebSocket endpoint at `/ws/agent`.
- In `index.html` / `js/api/agent-sync.js`:
  - Automatically connects to `ws://localhost:<port>/ws/agent`.
  - When an AI agent performs an operation (e.g. `add_block`), the server broadcasts `{ type: "BLOCK_ADDED", data: ... }`.
  - UI updates live without requiring manual page reload.

---

## 4. Constraints & Invariants
- **No Cloud Lock-in**: The MCP and REST layers must run 100% locally without external cloud dependencies.
- **Zero-Breakage Guarantee**: Existing standalone single-file distribution (`dist/rf-block-diagram-standalone.html`) and desktop launcher remain fully operational without requiring the agent server to be running.
- **M365 Copilot Reachability**: Clear documentation and tunnel launcher script (`scripts/copilot_tunnel.sh` using free Azure Dev Tunnels / Cloudflare Tunnel) to expose the local API to M365 Copilot securely.

---

## 5. Acceptance & Verification Criteria
1. **MCP Verification**:
   - Launch `python -m rfblock.mcp` via stdio test harness.
   - Verify tool discovery (`tools/list`) and execution (`rf_calculate_cascade`, `rf_get_schematic`).
2. **M365 Copilot / OpenAPI Verification**:
   - Validate `copilot/openapi.yaml` against OpenAPI 3.0 validator.
   - Verify `/openapi.json` is consumable by ChatGPT / M365 Copilot declarative agents.
3. **Live Sync Verification**:
   - Send an agent synthesis call via REST or MCP; verify the diagram canvas in the browser updates immediately.
4. **Test Suite Integrity**:
   - All existing 45 unit tests pass with zero regressions.
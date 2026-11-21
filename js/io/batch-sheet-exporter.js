"use strict";

/* =====================================================================
 * RF Block Diagram Editor - Batch "Export All Sheets" Controller
 * Exports all project sheets with zero-padded numbering via downloadFile()
 * ===================================================================== */

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    Object.assign(root, exports);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  let batchSelectedFormat = "vdx";   // 'vdx' | 'png' | 'svg' | 'emf'
  let batchDeliveryMode = "zip";     // 'zip' | 'individual'

  function sanitizeSheetFileName(name, idx) {
    const fallback = `Sheet_${idx + 1}`;
    if (!name || typeof name !== "string") return fallback;
    const clean = name.trim().replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, "_");
    return clean || fallback;
  }

  function getSheetExportFileName(sheet, idx, ext) {
    const pad = String(idx + 1).padStart(2, "0");
    const safeName = sanitizeSheetFileName(sheet ? sheet.name : "", idx);
    return `${pad}_${safeName}.${ext}`;
  }

  function getProjectSheets() {
    if (typeof commitSheet === "function") commitSheet();
    return (typeof sheets !== "undefined" && Array.isArray(sheets)) ? sheets : [];
  }

  /* Generate File Content Blob for a Specific Sheet */
  async function generateSheetBlob(sheetIdx, format) {
    if (typeof commitSheet === "function") commitSheet();
    const allSheets = getProjectSheets();
    const targetSheet = allSheets[sheetIdx];
    if (!targetSheet) return null;

    // Temporarily adopt target sheet for accurate coordinate & solver resolution
    if (typeof adoptSheet === "function") adoptSheet(sheetIdx);

    const filename = getSheetExportFileName(targetSheet, sheetIdx, format);
    let blob = null;

    if (format === "vdx") {
      if (typeof buildVsdxBlob === "function") {
        const blks = (targetSheet.blocks && targetSheet.blocks.length)
          ? targetSheet.blocks
          : [{ id: "b_empty_1", type: "label", name: "Text note", x: 200, y: 150, params: { label: "", text: `${targetSheet.name || "Sheet"} (Empty)` } }];
        const conns = (targetSheet.blocks && targetSheet.blocks.length) ? (targetSheet.conns || []) : [];
        const P = (typeof computePowers === "function") ? computePowers("primary") : {};
        const PSecondary = (typeof computePowers === "function") ? computePowers("secondary") : {};
        const needNoise = !!(typeof settings !== "undefined" && (settings.showNF || settings.showNoiseFloor));
        const NFm = needNoise && (typeof computeNoise === "function") ? computeNoise(P) : null;
        const vdxRes = buildVsdxBlob(blks, conns, P, NFm, PSecondary, null, typeof settings !== "undefined" ? settings : {});
        blob = (vdxRes instanceof Blob) ? vdxRes : new Blob([vdxRes], { type: "application/vnd.visio" });
      } else {
        throw new Error("VDX export engine is unavailable.");
      }
    } else if (format === "svg") {
      let svgStr = (typeof buildExportSVG === "function") ? buildExportSVG(1) : null;
      if (!svgStr) {
        // Safe placeholder for empty canvas
        const safeTitle = sanitizeSheetFileName(targetSheet.name, sheetIdx);
        svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#0d121d"/><text x="400" y="300" fill="#94a3b8" font-family="sans-serif" font-size="16" text-anchor="middle">${safeTitle} (Empty Sheet)</text></svg>`;
      }
      blob = new Blob([svgStr], { type: "image/svg+xml" });
    } else if (format === "png") {
      let svgStr = (typeof buildExportSVG === "function") ? buildExportSVG(2) : null;
      if (!svgStr) {
        const safeTitle = sanitizeSheetFileName(targetSheet.name, sheetIdx);
        svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#ffffff"/><text x="400" y="300" fill="#334155" font-family="sans-serif" font-size="16" text-anchor="middle">${safeTitle} (Empty Sheet)</text></svg>`;
      }
      blob = await new Promise(resolve => {
        const img = new Image();
        const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
        img.onload = () => {
          const cv = document.createElement("canvas");
          cv.width = img.width || 1200;
          cv.height = img.height || 800;
          const g = cv.getContext("2d");
          g.fillStyle = "#ffffff";
          g.fillRect(0, 0, cv.width, cv.height);
          g.imageSmoothingEnabled = true;
          g.imageSmoothingQuality = "high";
          g.drawImage(img, 0, 0);
          cv.toBlob(b => resolve(b), "image/png");
        };
        img.onerror = () => {
          resolve(new Blob([""], { type: "image/png" }));
        };
        img.src = url;
      });
    } else if (format === "emf") {
      let svgStr = (typeof buildExportSVG === "function") ? buildExportSVG(1) : null;
      if (!svgStr) {
        const safeTitle = sanitizeSheetFileName(targetSheet.name, sheetIdx);
        svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#ffffff"/><text x="400" y="300" fill="#000000" font-family="sans-serif" font-size="16" text-anchor="middle">${safeTitle}</text></svg>`;
      }
      if (typeof svgToEmf === "function") {
        const emfBytes = svgToEmf(svgStr);
        blob = new Blob([emfBytes], { type: "image/emf" });
      } else {
        throw new Error("EMF export engine is unavailable.");
      }
    }

    return { filename, blob };
  }

  /* Update Live Filename Preview List in Modal */
  function updateBatchPreviewList() {
    const listEl = typeof $ === "function" ? $("expAllPreviewList") : document.getElementById("expAllPreviewList");
    const countEl = typeof $ === "function" ? $("expAllSheetCount") : document.getElementById("expAllSheetCount");
    const allSheets = getProjectSheets();

    if (countEl) {
      countEl.textContent = `${allSheets.length} sheet${allSheets.length === 1 ? "" : "s"}`;
    }

    if (!listEl) return;
    if (!allSheets.length) {
      listEl.innerHTML = `<div style="color:var(--ink-dim); padding:10px; font-style:italic; text-align:center;">No sheets found in design.</div>`;
      return;
    }

    let html = "";
    allSheets.forEach((sh, idx) => {
      const fileName = getSheetExportFileName(sh, idx, batchSelectedFormat);
      const blkCount = (sh.blocks && sh.blocks.length) || 0;
      html += `
        <div class="batch-preview-row">
          <span class="batch-preview-num">${String(idx + 1).padStart(2, "0")}</span>
          <span class="batch-preview-name">${typeof esc === "function" ? esc(sh.name || "Untitled") : sh.name}</span>
          <span class="batch-preview-blks">${blkCount} block${blkCount === 1 ? "" : "s"}</span>
          <span class="batch-preview-file">📄 ${typeof esc === "function" ? esc(fileName) : fileName}</span>
        </div>`;
    });
    listEl.innerHTML = html;
  }

  /* Sync Delivery Option Cards */
  function updateDeliveryCards() {
    const cardZip = typeof $ === "function" ? $("expCardZip") : document.getElementById("expCardZip");
    const cardIndiv = typeof $ === "function" ? $("expCardIndiv") : document.getElementById("expCardIndiv");
    const radioZip = typeof $ === "function" ? $("expModeZip") : document.getElementById("expModeZip");
    const radioIndiv = typeof $ === "function" ? $("expModeIndiv") : document.getElementById("expModeIndiv");

    if (cardZip) cardZip.classList.toggle("active", batchDeliveryMode === "zip");
    if (cardIndiv) cardIndiv.classList.toggle("active", batchDeliveryMode === "individual");
    if (radioZip) radioZip.checked = (batchDeliveryMode === "zip");
    if (radioIndiv) radioIndiv.checked = (batchDeliveryMode === "individual");
  }

  /* Open the "Export All Sheets" Modal Dialog */
  function openExportAllModal() {
    if (typeof commitSheet === "function") commitSheet();
    const modal = typeof $ === "function" ? $("exportAllModal") : document.getElementById("exportAllModal");
    if (!modal) return;

    // Reset status / progress
    const progressEl = typeof $ === "function" ? $("expAllProgress") : document.getElementById("expAllProgress");
    if (progressEl) {
      progressEl.style.display = "none";
      progressEl.textContent = "";
    }
    const confirmBtn = typeof $ === "function" ? $("expAllConfirm") : document.getElementById("expAllConfirm");
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Export All Sheets";
    }

    // Set active format radio/pill
    document.querySelectorAll(".exp-fmt-btn").forEach(btn => {
      const fmt = btn.getAttribute("data-fmt");
      btn.classList.toggle("active", fmt === batchSelectedFormat);
    });

    updateDeliveryCards();
    updateBatchPreviewList();
    modal.style.display = "flex";
  }

  /* Close the Modal Dialog */
  function closeExportAllModal() {
    const modal = typeof $ === "function" ? $("exportAllModal") : document.getElementById("exportAllModal");
    if (modal) modal.style.display = "none";
  }

  /* Execute Batch Export Across All Sheets */
  async function executeBatchExport() {
    const allSheets = getProjectSheets();
    if (!allSheets.length) {
      if (typeof hint === "function") hint("Cannot export: project contains no sheets.");
      return;
    }

    const confirmBtn = typeof $ === "function" ? $("expAllConfirm") : document.getElementById("expAllConfirm");
    const progressEl = typeof $ === "function" ? $("expAllProgress") : document.getElementById("expAllProgress");

    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Exporting...";
    }
    if (progressEl) {
      progressEl.style.display = "block";
      progressEl.textContent = "Preparing export...";
    }

    // Save active sheet index to restore state after batch loop
    const origCur = (typeof cur !== "undefined") ? cur : 0;
    const format = batchSelectedFormat;
    const generatedFiles = [];

    try {
      for (let i = 0; i < allSheets.length; i++) {
        const shName = allSheets[i].name || `Sheet ${i + 1}`;
        if (progressEl) {
          progressEl.textContent = `Rendering sheet ${i + 1} of ${allSheets.length}: ${shName}...`;
        }
        // Yield to browser UI thread
        await new Promise(r => setTimeout(r, 20));

        const res = await generateSheetBlob(i, format);
        if (res && res.blob) {
          generatedFiles.push(res);
        }
      }

      if (!generatedFiles.length) {
        throw new Error("No files were generated.");
      }

      if (batchDeliveryMode === "zip") {
        if (progressEl) {
          progressEl.textContent = `Packaging ${generatedFiles.length} sheets into ZIP archive...`;
        }
        // Build ZIP using built-in zipStore
        if (typeof zipStore !== "function") {
          throw new Error("ZIP packaging engine is unavailable.");
        }
        const zipEntries = [];
        for (const item of generatedFiles) {
          const arrayBuf = await item.blob.arrayBuffer();
          zipEntries.push({
            name: item.filename,
            data: new Uint8Array(arrayBuf)
          });
        }
        const rawZip = zipStore(zipEntries);
        const zipBlob = new Blob([rawZip], { type: "application/zip" });
        const baseName = (typeof fileName !== "undefined" && fileName)
          ? fileName.replace(/\.[^.]+$/, "")
          : "rf-project";
        const zipFileName = `${baseName}_all_sheets_${format}.zip`;

        if (typeof downloadFile === "function") {
          await downloadFile(zipBlob, zipFileName, "application/zip");
        } else {
          throw new Error("File download handler is unavailable.");
        }

        if (typeof hint === "function") {
          hint(`Saved all ${generatedFiles.length} sheets in archive '${zipFileName}'.`);
        }
      } else {
        // Individual sequential downloads
        if (progressEl) {
          progressEl.textContent = `Downloading ${generatedFiles.length} files...`;
        }
        for (let i = 0; i < generatedFiles.length; i++) {
          const item = generatedFiles[i];
          if (progressEl) {
            progressEl.textContent = `Downloading file ${i + 1} of ${generatedFiles.length}: ${item.filename}...`;
          }
          if (typeof downloadFile === "function") {
            await downloadFile(item.blob, item.filename, item.blob.type || "application/octet-stream");
          }
          if (i < generatedFiles.length - 1) {
            await new Promise(r => setTimeout(r, 250)); // throttle to prevent download blockage
          }
        }
        if (typeof hint === "function") {
          hint(`Exported ${generatedFiles.length} sheet files.`);
        }
      }

      closeExportAllModal();
    } catch (err) {
      console.error("Batch export error:", err);
      if (typeof hint === "function") {
        hint("Batch export failed: " + (err.message || err));
      }
    } finally {
      // Restore original sheet and canvas view state
      if (typeof adoptSheet === "function") adoptSheet(origCur);
      if (typeof applyView === "function") applyView();
      if (typeof renderAll === "function") renderAll();
      if (typeof renderSheets === "function") renderSheets();

      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Export All Sheets";
      }
      if (progressEl) {
        progressEl.style.display = "none";
      }
    }
  }

  /* Initialize Event Listeners for Batch Modal */
  function initBatchExporterUI() {
    // Format selector buttons
    document.querySelectorAll(".exp-fmt-btn").forEach(btn => {
      btn.onclick = () => {
        batchSelectedFormat = btn.getAttribute("data-fmt") || "vdx";
        document.querySelectorAll(".exp-fmt-btn").forEach(b => {
          b.classList.toggle("active", b === btn);
        });
        updateBatchPreviewList();
      };
    });

    // Delivery mode options
    const cardZip = typeof $ === "function" ? $("expCardZip") : document.getElementById("expCardZip");
    if (cardZip) {
      cardZip.onclick = () => {
        batchDeliveryMode = "zip";
        updateDeliveryCards();
      };
    }

    const cardIndiv = typeof $ === "function" ? $("expCardIndiv") : document.getElementById("expCardIndiv");
    if (cardIndiv) {
      cardIndiv.onclick = () => {
        batchDeliveryMode = "individual";
        updateDeliveryCards();
      };
    }

    document.querySelectorAll("input[name='batchDeliveryMode']").forEach(radio => {
      radio.onchange = () => {
        batchDeliveryMode = radio.value || "zip";
        updateDeliveryCards();
      };
    });

    const closeBtn = typeof $ === "function" ? $("expAllClose") : document.getElementById("expAllClose");
    if (closeBtn) {
      closeBtn.onclick = closeExportAllModal;
    }

    const cancelBtn = typeof $ === "function" ? $("expAllCancel") : document.getElementById("expAllCancel");
    if (cancelBtn) {
      cancelBtn.onclick = closeExportAllModal;
    }

    const confirmBtn = typeof $ === "function" ? $("expAllConfirm") : document.getElementById("expAllConfirm");
    if (confirmBtn) {
      confirmBtn.onclick = executeBatchExport;
    }

    // Close when clicking modal backdrop
    const modal = typeof $ === "function" ? $("exportAllModal") : document.getElementById("exportAllModal");
    if (modal) {
      modal.onclick = e => {
        if (e.target === modal) closeExportAllModal();
      };
    }
  }

  return {
    sanitizeSheetFileName,
    getSheetExportFileName,
    openExportAllModal,
    closeExportAllModal,
    executeBatchExport,
    initBatchExporterUI,
    updateBatchPreviewList
  };
});

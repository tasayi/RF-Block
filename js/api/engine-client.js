"use strict";

/* =====================================================================
 * RF Block Diagram Editor - Python Backend (scikit-rf) Engine Client
 * ===================================================================== */

const EngineClient = {
  baseUrl: (typeof window !== "undefined" && window.RFBLOCK_API_URL) ? window.RFBLOCK_API_URL : "",
  status: {
    connected: false,
    version: null,
    skrfVersion: null,
    lastChecked: null
  },

  /**
   * Check connection and health of the Python scikit-rf backend.
   */
  async checkStatus() {
    try {
      const resp = await fetch(`${this.baseUrl}/api/v1/status`, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      if (resp.ok) {
        const data = await resp.json();
        this.status.connected = (data.status === "online");
        this.status.version = data.version || null;
        this.status.skrfVersion = data.skrf_version || null;
        this.status.lastChecked = Date.now();
        this.notifyStatusChange();
        return this.status;
      }
    } catch (e) {
      // Backend not running or inaccessible (client operates in standalone JS mode)
    }
    this.status.connected = false;
    this.status.lastChecked = Date.now();
    this.notifyStatusChange();
    return this.status;
  },

  /**
   * Run full S-Parameter cascade physics analysis via the Python scikit-rf solver.
   */
  async solveSParams(schematicPayload) {
    if (!this.status.connected) {
      await this.checkStatus();
    }
    const resp = await fetch(`${this.baseUrl}/api/v1/analyze/sparams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schematicPayload)
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: "Engine analysis failed" }));
      throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    return await resp.json();
  },

  /**
   * Export Touchstone (.s2p) file from Python backend.
   */
  async exportTouchstone(schematicPayload) {
    const resp = await fetch(`${this.baseUrl}/api/v1/export/touchstone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schematicPayload)
    });
    if (!resp.ok) {
      throw new Error(`Touchstone export failed (HTTP ${resp.status})`);
    }
    return await resp.text();
  },

  /**
   * Dispatches custom event to notify UI components of engine status changes.
   */
  notifyStatusChange() {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("rfblock:engine-status", { detail: { ...this.status } }));
    }
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { EngineClient };
}

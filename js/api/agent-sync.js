"use strict";

/* =====================================================================
 * RF Block Diagram Editor - AI Agent WebSocket Sync Bridge
 * Connects to backend /ws/canvas to allow live real-time updates from
 * AI Agents (MCP, Microsoft 365 Copilot, ChatGPT, local LLMs).
 * ===================================================================== */

(function (root) {
  let ws = null;
  let reconnectTimer = null;
  let isConnected = false;

  function getWsUrl() {
    if (typeof window === "undefined" || !window.location) return "ws://127.0.0.1:8000/ws/canvas";
    const loc = window.location;
    if (loc.protocol === "http:") {
      return `ws://${loc.hostname}:${loc.port || 8000}/ws/canvas`;
    }
    if (loc.protocol === "https:") {
      return `wss://${loc.hostname}:${loc.port || 443}/ws/canvas`;
    }
    // file:// protocol default to localhost 8000
    return "ws://127.0.0.1:8000/ws/canvas";
  }

  function updateStatusBadge(connected) {
    let badge = document.getElementById("agentSyncBadge");
    if (!badge) {
      // Look for a suitable container in toolbar or status bar
      const container = document.getElementById("tbRight") || document.querySelector(".tb-right") || document.body;
      if (container) {
        badge = document.createElement("div");
        badge.id = "agentSyncBadge";
        badge.style.display = "inline-flex";
        badge.style.alignItems = "center";
        badge.style.gap = "5px";
        badge.style.fontSize = "11px";
        badge.style.padding = "2px 8px";
        badge.style.borderRadius = "10px";
        badge.style.border = "1px solid var(--line,#2d3748)";
        badge.style.marginLeft = "8px";
        badge.style.transition = "all 0.2s ease";
        container.appendChild(badge);
      }
    }

    if (badge) {
      if (connected) {
        badge.style.display = "inline-flex";
        badge.style.background = "rgba(16, 185, 129, 0.12)";
        badge.style.borderColor = "rgba(16, 185, 129, 0.4)";
        badge.style.color = "#10b981";
        badge.innerHTML = `<span style="font-size:10px;">🟢</span> <b>AI Agent Sync</b>`;
        badge.title = "Connected to RFBlock AI Agent Gateway. Live mutations will update canvas automatically.";
      } else {
        badge.style.display = "none";
      }
    }
  }

  function handleAgentMessage(msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "LOAD_SCHEMATIC":
        if (msg.data && Array.isArray(msg.data.blocks)) {
          if (typeof sheets !== "undefined" && typeof cur !== "undefined" && sheets[cur]) {
            sheets[cur].blocks = msg.data.blocks;
            sheets[cur].conns = msg.data.conns || [];
            if (msg.data.name) sheets[cur].name = msg.data.name;

            if (typeof commitSheet === "function") commitSheet();
            if (typeof renderAll === "function") renderAll();
            if (typeof renderSheets === "function") renderSheets();
            if (typeof autoFit === "function") autoFit();
          }
        }
        break;

      case "ADD_BLOCK":
        if (msg.data && msg.data.id && typeof blocks !== "undefined") {
          blocks.push(msg.data);
          if (typeof commitSheet === "function") commitSheet();
          if (typeof renderAll === "function") renderAll();
        }
        break;

      case "UPDATE_PARAMS":
        if (msg.data && msg.data.id && typeof blocks !== "undefined") {
          const blk = blocks.find(b => b.id === msg.data.id);
          if (blk) {
            blk.params = Object.assign(blk.params || {}, msg.data.params || {});
            if (typeof commitSheet === "function") commitSheet();
            if (typeof renderAll === "function") renderAll();
          }
        }
        break;

      case "SHOW_NOTIFICATION":
        if (msg.message && typeof hint === "function") {
          hint(msg.message);
        }
        break;

      default:
        console.log("Agent sync event:", msg);
        break;
    }
  }

  function connectAgentWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const url = getWsUrl();
      ws = new WebSocket(url);

      ws.onopen = () => {
        isConnected = true;
        updateStatusBadge(true);
        console.log("🤖 Connected to RFBlock AI Agent WebSocket Gateway");
      };

      ws.onmessage = evt => {
        try {
          const msg = JSON.parse(evt.data);
          handleAgentMessage(msg);
        } catch (e) {
          console.warn("Failed to parse agent message:", e);
        }
      };

      ws.onclose = () => {
        isConnected = false;
        updateStatusBadge(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        isConnected = false;
        updateStatusBadge(false);
        try { ws.close(); } catch(e) {}
      };
    } catch (err) {
      isConnected = false;
      updateStatusBadge(false);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectAgentWebSocket, 4000);
  }

  // Auto-init on page load
  if (typeof window !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", connectAgentWebSocket);
    } else {
      setTimeout(connectAgentWebSocket, 500);
    }
  }

  root.AgentSync = {
    connect: connectAgentWebSocket,
    isConnected: () => isConnected,
    getStatusBadge: () => document.getElementById("agentSyncBadge")
  };

})(typeof globalThis !== "undefined" ? globalThis : this);

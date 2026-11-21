"""
WebSocket Gateway for live synchronization between AI Agents and the RFBlock Canvas UI.
"""

import json
from typing import Set, Dict, Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["Agent WebSocket"])

class CanvasConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        dead_connections = set()
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                dead_connections.add(connection)
        for dead in dead_connections:
            self.active_connections.discard(dead)

manager = CanvasConnectionManager()

@router.websocket("/ws/canvas")
async def websocket_canvas_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Receive client ping or UI state messages
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                # If client sends schematic state update, can route or acknowledge
                if msg.get("type") == "PING":
                    await websocket.send_json({"type": "PONG"})
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

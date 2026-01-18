from typing import Dict, List
from fastapi import WebSocket
import json
import asyncio

class StatusManager:
    """
    Manages WebSocket connections for real-time status updates.
    """
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(StatusManager, cls).__new__(cls)
            cls._instance.active_connections: Dict[str, List[WebSocket]] = {}
        return cls._instance

    async def connect(self, client_id: str, websocket: WebSocket):
        await websocket.accept()
        if client_id not in self.active_connections:
            self.active_connections[client_id] = []
        self.active_connections[client_id].append(websocket)
        print(f"[StatusManager] Client {client_id} connected. Total clients for this ID: {len(self.active_connections[client_id])}")

    def disconnect(self, client_id: str, websocket: WebSocket):
        if client_id in self.active_connections:
            if websocket in self.active_connections[client_id]:
                self.active_connections[client_id].remove(websocket)
            if not self.active_connections[client_id]:
                del self.active_connections[client_id]
        print(f"[StatusManager] Client {client_id} disconnected.")

    async def send_status(self, client_id: str, status: str, step: str = None, data: dict = None):
        """
        Send a status update to all connected clients for a specific client_id.
        """
        if not client_id or client_id not in self.active_connections:
            return

        message = {
            "status": status,
            "step": step,
            "data": data or {}
        }
        
        payload = json.dumps(message)
        
        # Create a list of tasks to send to all connections
        dead_connections = []
        for websocket in self.active_connections[client_id]:
            try:
                await websocket.send_text(payload)
            except Exception as e:
                print(f"[StatusManager] Error sending to {client_id}: {e}")
                dead_connections.append(websocket)
        
        # Clean up dead connections
        for dead in dead_connections:
            self.disconnect(client_id, dead)

status_manager = StatusManager()

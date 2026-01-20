from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import uuid

from .models import UserQuery, TripPlan, UserQueryWithClientId
from .orchestrator import Orchestrator
from . import database as db
from .status_manager import status_manager
from fastapi import WebSocket, WebSocketDisconnect

app = FastAPI(title="Multi-Agent Travel Assistant")

# CORS setup for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For dev only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for API


class CreateSessionRequest(BaseModel):
    title: str
    destination: Optional[str] = None


class SessionResponse(BaseModel):
    id: str
    title: str
    destination: Optional[str]
    created_at: str
    updated_at: str


class MessageResponse(BaseModel):
    id: int
    session_id: str
    role: str
    content: str
    trip_plan: Optional[dict] = None
    created_at: str


class MemoryResponse(BaseModel):
    id: int
    memory_type: str
    content: str
    confidence: float
    created_at: str


class CreateMemoryRequest(BaseModel):
    memory_type: str
    content: str


@app.get("/")
async def root():
    return {"message": "Travel Agent API is running"}


@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await status_manager.connect(client_id, websocket)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        status_manager.disconnect(client_id, websocket)
    except Exception as e:
        print(f"[WebSocket] Error: {e}")
        status_manager.disconnect(client_id, websocket)

# Trip Planning


@app.post("/plan_trip_with_session")
async def plan_trip_with_session(query: UserQueryWithClientId, session_id: Optional[str] = None):
    """Plan a trip and save to a chat session"""

    # TODO: Implement memory-based personalization in the future
    # This will include fetching user memories, injecting them into prompts/agents,
    # and extracting new memories from interactions for future personalization.

    orchestrator = Orchestrator()

    # Create or get session
    if not session_id:
        session_id = str(uuid.uuid4())
        title = f"Trip to {query.destination}" if query.destination else "New Trip"
        db.create_session(session_id, title, query.destination)

    # Save user message
    user_content = f"Plan a trip to {query.destination}"
    if query.dates:
        user_content += f" on {query.dates}"
    if query.origin:
        user_content += f" from {query.origin}"
    db.add_message(session_id, "user", user_content)

    # Plan the trip
    result = await orchestrator.plan_trip(query, client_id=query.client_id)

    # Save assistant response with trip plan
    db.add_message(
        session_id,
        "assistant",
        f"I've planned your trip to {result.destination}!",
        result.model_dump()
    )

    return {
        "session_id": session_id,
        "trip_plan": result
    }

# Chat Sessions API


@app.get("/sessions")
async def get_sessions():
    """Get all chat sessions"""
    sessions = db.get_all_sessions()
    return {"sessions": sessions}


@app.post("/sessions")
async def create_session(request: CreateSessionRequest):
    """Create a new chat session"""
    session_id = str(uuid.uuid4())
    session = db.create_session(session_id, request.title, request.destination)
    return session


@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """Get a specific session with its messages"""
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = db.get_session_messages(session_id)
    return {
        "session": session,
        "messages": messages
    }


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a chat session"""
    success = db.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session deleted"}

# Memories API


@app.get("/memories")
async def get_memories(memory_type: Optional[str] = None):
    """Get all user memories"""
    memories = db.get_memories(memory_type)
    return {"memories": memories}


@app.post("/memories")
async def create_memory(request: CreateMemoryRequest):
    """Create a new memory manually"""
    memory = db.add_memory(request.memory_type, request.content)
    return memory


@app.delete("/memories/{memory_id}")
async def delete_memory(memory_id: int):
    """Delete a specific memory"""
    success = db.delete_memory(memory_id)
    if not success:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"message": "Memory deleted"}


@app.delete("/memories")
async def clear_memories():
    """Clear all memories"""
    count = db.clear_all_memories()
    return {"message": f"Cleared {count} memories"}

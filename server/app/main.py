import json
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.types import Command
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from pydantic import BaseModel, Field

from . import limits
from .flights import serpapi
from .graph import build_graph
from .models import Brief

load_dotenv()

# A Vercel function can only write to /tmp, and that disk is not shared between instances.
DATA_DIR = Path("/tmp") if os.environ.get("VERCEL") else Path(__file__).resolve().parent.parent / "data"
STATIC_DIR = Path(os.environ.get("STATIC_DIR", Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        # prepare_threshold=0 is required behind Neon's PgBouncer pooler.
        pool = AsyncConnectionPool(
            database_url,
            open=False,
            min_size=0,
            max_size=5,
            check=AsyncConnectionPool.check_connection,
            kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
        )
        await pool.open()
        saver = AsyncPostgresSaver(pool)
        await saver.setup()
        await limits.setup(pool)
        app.state.pool = pool
        app.state.graph = build_graph(saver)
        yield
        await pool.close()
    else:
        app.state.pool = None
        DATA_DIR.mkdir(exist_ok=True)
        async with AsyncSqliteSaver.from_conn_string(str(DATA_DIR / "threads.db")) as saver:
            app.state.graph = build_graph(saver)
            yield


app = FastAPI(title="Travel Lust", lifespan=lifespan)


class TurnRequest(BaseModel):
    thread_id: Optional[str] = None
    currency: Optional[str] = None
    type: str = "text"
    text: Optional[str] = Field(None, max_length=1000)
    label: Optional[str] = None
    itinerary_id: Optional[str] = None
    patch: Optional[dict] = None
    filters: Optional[dict] = None


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _pending_card(graph, config) -> Optional[dict]:
    snapshot = await graph.aget_state(config)
    for task in snapshot.tasks:
        for pending in task.interrupts:
            return pending.value
    return None


@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "serpapi": bool(serpapi.api_key()),
        "gemini": bool(os.environ.get("GOOGLE_API_KEY")),
        "storage": "postgres" if os.environ.get("DATABASE_URL") else "sqlite",
    }


@app.get("/api/threads/{thread_id}")
async def get_thread(thread_id: str):
    graph = app.state.graph
    config = {"configurable": {"thread_id": thread_id}}
    snapshot = await graph.aget_state(config)
    if not snapshot.values:
        raise HTTPException(404, "No such conversation")
    return {
        "thread_id": thread_id,
        "transcript": snapshot.values.get("transcript", []),
        "card": await _pending_card(graph, config),
    }


def _client_ip(request: Request) -> str:
    # Vercel sets this header itself, so a visitor cannot spoof it there.
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")


@app.post("/api/turn")
async def turn(body: TurnRequest, request: Request):
    limited = await limits.check(app.state.pool, _client_ip(request))
    if limited:
        return JSONResponse({"detail": limited}, status_code=429)

    graph = app.state.graph
    thread_id = body.thread_id or uuid.uuid4().hex
    config = {"configurable": {"thread_id": thread_id}}
    value = body.model_dump(exclude={"thread_id", "currency"}, exclude_none=True)

    if body.type == "text" and not (body.text or "").strip():
        raise HTTPException(422, "Message is empty")

    resuming = await _pending_card(graph, config) is not None
    if resuming:
        graph_input = Command(resume=value)
    else:
        brief = Brief(currency=(body.currency or "USD").upper()[:3])
        graph_input = {"input": value, "brief": brief.model_dump(), "stage": "gather"}

    async def stream():
        yield _sse("thread", {"thread_id": thread_id})
        try:
            async for mode, chunk in graph.astream(graph_input, config, stream_mode=["custom", "updates"]):
                if mode == "custom" and "status" in chunk:
                    yield _sse("status", {"label": chunk["status"]})
                elif mode == "updates" and "plan" in chunk and chunk["plan"].get("next") == "search":
                    leg = chunk["plan"]["stage"]
                    count = len(chunk["plan"]["search_tasks"])
                    what = "return flights" if leg == "return" else "flights"
                    yield _sse("status", {"label": f"Searching {what} on Google Flights ({count} live queries)"})
            card = await _pending_card(graph, config)
            yield _sse("card", card or {})
        except Exception as exc:
            yield _sse("error", {"message": "Something went wrong on my side. Please try that again.", "detail": str(exc)[:300]})
        yield _sse("done", {})

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# On Vercel the frontend is its own service, so this only runs for a single-process deploy.
if STATIC_DIR.exists() and not os.environ.get("VERCEL"):
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}")
    async def spa(path: str):
        return FileResponse(STATIC_DIR / "index.html")

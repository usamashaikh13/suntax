"""
SunTax FastAPI Application Entry Point
"""
import logging
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import settings
from app.core.database import engine
from app.api.v1 import auth, tax_returns, documents, admin, tax_engine, ai_assistant
from app.models import Base

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Sentry
# ---------------------------------------------------------------------------
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        # Do NOT send PII to Sentry
        send_default_pii=False,
    )

# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address)

# ---------------------------------------------------------------------------
# WebSocket connection manager (simple in-memory; use Redis pub/sub for prod scale)
# ---------------------------------------------------------------------------
class ConnectionManager:
    def __init__(self):
        # Map tax_return_id -> list of WebSocket connections
        self.active: dict[str, list[WebSocket]] = {}

    async def connect(self, tax_return_id: str, ws: WebSocket):
        await ws.accept()
        self.active.setdefault(tax_return_id, []).append(ws)

    def disconnect(self, tax_return_id: str, ws: WebSocket):
        conns = self.active.get(tax_return_id, [])
        if ws in conns:
            conns.remove(ws)

    async def broadcast(self, tax_return_id: str, message: dict):
        import json
        for ws in list(self.active.get(tax_return_id, [])):
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                self.disconnect(tax_return_id, ws)


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("SunTax starting up...")
    yield
    logger.info("SunTax shutting down...")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="SunTax API",
    description="AI-Powered Swiss Tax Return Platform",
    version="1.0.0",
    docs_url="/api/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/api/redoc" if settings.ENVIRONMENT != "production" else None,
    lifespan=lifespan,
)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
PREFIX = "/api/v1"

app.include_router(auth.router, prefix=PREFIX, tags=["auth"])
app.include_router(tax_returns.router, prefix=PREFIX, tags=["tax-returns"])
app.include_router(documents.router, prefix=PREFIX, tags=["documents"])
app.include_router(tax_engine.router, prefix=PREFIX, tags=["tax-engine"])
app.include_router(ai_assistant.router, prefix=PREFIX, tags=["ai-assistant"])
app.include_router(admin.router, prefix=PREFIX, tags=["admin"])


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "environment": settings.ENVIRONMENT}


# ---------------------------------------------------------------------------
# WebSocket – document processing status
# ---------------------------------------------------------------------------
@app.websocket("/ws/{tax_return_id}")
async def websocket_endpoint(websocket: WebSocket, tax_return_id: str):
    await manager.connect(tax_return_id, websocket)
    try:
        while True:
            # Keep alive; clients send pings
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(tax_return_id, websocket)


# ---------------------------------------------------------------------------
# Global exception handlers
# ---------------------------------------------------------------------------
@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred."},
    )

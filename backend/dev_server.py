"""
Dev server entry point — applies dev patches then starts FastAPI with uvicorn.
Usage: python dev_server.py
"""
import sys, os

# Must be first — patches redis, SQLite, storage before any app imports
import dev_patch  # noqa: F401

# Now import the app (after patches are applied)
from app.core.database import Base, engine as _engine_placeholder

import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from app.models import *  # noqa — ensures all models are imported for table creation


async def create_tables():
    """Create all SQLite tables from SQLAlchemy models."""
    from app.core.database import Base
    from sqlalchemy.ext.asyncio import create_async_engine

    # SQLite-specific engine (no pool kwargs)
    engine = create_async_engine(
        "sqlite+aiosqlite:///./suntax_dev.db",
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    print("✅ SQLite tables created")


asyncio.run(create_tables())

import uvicorn
from app.main import app

if __name__ == "__main__":
    print("\n" + "="*60)
    print("  SunTax Dev Server")
    print("  API:  http://localhost:8000")
    print("  Docs: http://localhost:8000/api/docs")
    print("="*60 + "\n")
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )

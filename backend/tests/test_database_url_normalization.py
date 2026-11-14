"""
Tests for Database URL normalization and asyncpg compatibility on Render.
"""

from app.core.database import _prepare_db_url_and_args


def test_render_postgres_url_converted_to_asyncpg():
    raw = "postgres://suntax_user:secret123@dpg-abcde-a/suntax_db"
    clean, args = _prepare_db_url_and_args(raw)
    assert clean == "postgresql+asyncpg://suntax_user:secret123@dpg-abcde-a/suntax_db"
    assert args == {}


def test_render_postgres_url_with_sslmode_stripped_and_mapped():
    raw = "postgres://suntax_user:secret123@dpg-abcde-a.oregon-postgres.render.com/suntax_db?sslmode=require"
    clean, args = _prepare_db_url_and_args(raw)
    assert "sslmode" not in clean
    assert clean == "postgresql+asyncpg://suntax_user:secret123@dpg-abcde-a.oregon-postgres.render.com/suntax_db"
    assert args == {"ssl": "require"}


def test_sqlite_url_preserved():
    raw = "sqlite+aiosqlite:///./suntax_dev.db"
    clean, args = _prepare_db_url_and_args(raw)
    assert clean == raw
    assert args == {}

#!/bin/zsh
# Start SunTax backend in dev mode (SQLite + fakeredis + local file storage)
export DATABASE_URL="sqlite+aiosqlite:///./suntax_dev.db"
export ENVIRONMENT="development"
export SECRET_KEY="15f53083bb141c9c60e30917b96c9bcfccdb64ba732383f96059f8a860e4128f"
export GEMINI_API_KEY="${GEMINI_API_KEY:-placeholder}"
export BACKEND_CORS_ORIGINS='["http://localhost:3000","http://localhost:3001","http://localhost:8000"]'
export REDIS_URL="redis://localhost:6379/0"
export MINIO_ENDPOINT="localhost:9000"
export MINIO_ACCESS_KEY="minioadmin"
export MINIO_SECRET_KEY="minioadmin"
export MINIO_BUCKET_NAME="suntax-documents"
export MINIO_USE_SSL="false"
export RESEND_API_KEY=""
export EMAIL_FROM="noreply@suntax.local"
export PYTHONWARNINGS="ignore"

echo "🚀 Starting SunTax backend on http://localhost:8000"
echo "📖 API Docs: http://localhost:8000/api/docs"

exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level info

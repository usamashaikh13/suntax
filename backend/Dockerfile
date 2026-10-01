# ─────────────────────────────────────────────────────────────
#  SunTax Backend – Multi-stage Dockerfile
#  Stages: builder → development | production
# ─────────────────────────────────────────────────────────────

# ── Stage 1: Builder ─────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files first for layer caching
COPY requirements.txt .

# Install Python deps into a local prefix so we can copy them later
RUN pip install --upgrade pip && \
    pip install --prefix=/install --no-cache-dir -r requirements.txt

# ── Stage 2: Development (with hot-reload support) ────────────
FROM python:3.12-slim AS development

WORKDIR /app

# Runtime system libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Create non-root user (dev uses volume mount so we keep root for convenience,
# but still define the user for parity with production)
RUN groupadd --gid 1000 suntax && \
    useradd --uid 1000 --gid suntax --shell /bin/bash --create-home suntax

# In dev the source is mounted as a volume; this COPY is just a fallback
COPY --chown=suntax:suntax . .

EXPOSE 8000

# Default dev command (overridden by docker-compose)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ── Stage 3: Production ───────────────────────────────────────
FROM python:3.12-slim AS production

WORKDIR /app

# Runtime system libraries only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --gid 1000 suntax && \
    useradd --uid 1000 --gid suntax --shell /bin/bash --create-home suntax

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application source
COPY --chown=suntax:suntax . .

# Switch to non-root user
USER suntax

EXPOSE 8000

# Health check (requires curl installed above)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--log-level", "info"]

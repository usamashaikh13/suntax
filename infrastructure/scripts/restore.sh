#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  SunTax – PostgreSQL Restore Script
#
#  Usage:
#    ./restore.sh /opt/suntax/backups/suntax_db_20260101_020000.sql.gz
#
#  ⚠️  WARNING: This will DESTROY the current database and replace it
#      with the backup. Only run on confirmed intention.
#
#  Requirements: pg_restore or psql, docker (if running containerized)
# ─────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────
PROJECT_DIR="${PROJECT_DIR:-/opt/suntax}"
ENV_FILE="${PROJECT_DIR}/.env"

# Load .env
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^(POSTGRES_|DB_)' "$ENV_FILE" | sed 's/#.*//')
  set +a
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-suntax}"
DB_USER="${POSTGRES_USER:-suntax}"
DB_PASSWORD="${POSTGRES_PASSWORD:-}"

# ── Logging ───────────────────────────────────────────────────
log()   { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
error() { log "ERROR: $*" >&2; }
warn()  { log "WARNING: $*"; }

# ── Validate arguments ────────────────────────────────────────
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup-file.sql.gz>"
  echo ""
  echo "  Available backups in ${PROJECT_DIR}/backups/:"
  ls -lh "${PROJECT_DIR}/backups/"*.sql.gz 2>/dev/null || echo "  (none found)"
  exit 1
fi

BACKUP_FILE="$1"

if [[ ! -f "$BACKUP_FILE" ]]; then
  error "Backup file not found: $BACKUP_FILE"
  exit 1
fi

# ── Confirmation prompt ───────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║          ⚠️  DESTRUCTIVE OPERATION WARNING ⚠️          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  This will:"
echo "    1. Stop the SunTax application"
echo "    2. DROP the existing database: $DB_NAME"
echo "    3. Restore from: $(basename "$BACKUP_FILE")"
echo "    4. Restart the application"
echo ""
read -r -p "Type 'RESTORE' to confirm: " CONFIRM

if [[ "$CONFIRM" != "RESTORE" ]]; then
  log "Restore cancelled by user."
  exit 0
fi

# ── Stop Application ──────────────────────────────────────────
log "Stopping application services..."
cd "$PROJECT_DIR"

if [[ -f "docker-compose.prod.yml" ]]; then
  docker compose -f docker-compose.yml -f docker-compose.prod.yml stop backend worker beat frontend
elif [[ -f "docker-compose.yml" ]]; then
  docker compose stop backend worker beat frontend
fi
log "✅ Application stopped"

# ── Decompress backup ─────────────────────────────────────────
log "Decompressing backup..."
TMPDIR=$(mktemp -d)
DUMP_FILE="${TMPDIR}/restore.dump"

gunzip -c "$BACKUP_FILE" > "$DUMP_FILE"
log "✅ Decompressed to $DUMP_FILE ($(du -sh "$DUMP_FILE" | cut -f1))"

# ── Restore ───────────────────────────────────────────────────
log "Starting database restore..."
log "  Backup: $BACKUP_FILE"
log "  Target: $DB_NAME @ $DB_HOST:$DB_PORT"

if command -v docker &>/dev/null && docker ps --filter "name=suntax_postgres" --format "{{.Names}}" | grep -q "suntax_postgres"; then
  log "Using Docker container for restore..."

  # Copy dump into container
  docker cp "$DUMP_FILE" "suntax_postgres:/tmp/restore.dump"

  # Drop & recreate database
  docker exec suntax_postgres \
    psql --username="$DB_USER" --dbname=postgres \
      --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();"

  docker exec suntax_postgres \
    psql --username="$DB_USER" --dbname=postgres \
      --command="DROP DATABASE IF EXISTS ${DB_NAME};"

  docker exec suntax_postgres \
    psql --username="$DB_USER" --dbname=postgres \
      --command="CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

  # Restore
  docker exec suntax_postgres \
    pg_restore \
      --username="$DB_USER" \
      --dbname="$DB_NAME" \
      --no-acl \
      --no-owner \
      --clean \
      --if-exists \
      --verbose \
      /tmp/restore.dump

  # Clean up dump inside container
  docker exec suntax_postgres rm -f /tmp/restore.dump

else
  log "Using direct psql/pg_restore..."

  # Terminate active connections
  PGPASSWORD="$DB_PASSWORD" psql \
    --host="$DB_HOST" --port="$DB_PORT" \
    --username="$DB_USER" --dbname=postgres \
    --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();"

  # Drop & recreate
  PGPASSWORD="$DB_PASSWORD" psql \
    --host="$DB_HOST" --port="$DB_PORT" \
    --username="$DB_USER" --dbname=postgres \
    --command="DROP DATABASE IF EXISTS ${DB_NAME};"

  PGPASSWORD="$DB_PASSWORD" psql \
    --host="$DB_HOST" --port="$DB_PORT" \
    --username="$DB_USER" --dbname=postgres \
    --command="CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

  # Restore
  PGPASSWORD="$DB_PASSWORD" pg_restore \
    --host="$DB_HOST" --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --no-acl \
    --no-owner \
    --clean \
    --if-exists \
    --verbose \
    "$DUMP_FILE"
fi

log "✅ Database restored successfully"

# ── Clean up temp files ───────────────────────────────────────
rm -rf "$TMPDIR"

# ── Run migrations to ensure schema is current ───────────────
log "Running Alembic migrations to ensure schema currency..."
if [[ -f "docker-compose.prod.yml" ]]; then
  docker compose -f docker-compose.yml -f docker-compose.prod.yml \
    run --rm --no-deps backend alembic upgrade head
elif [[ -f "docker-compose.yml" ]]; then
  docker compose run --rm --no-deps backend alembic upgrade head
fi
log "✅ Migrations applied"

# ── Restart Application ───────────────────────────────────────
log "Restarting application services..."
if [[ -f "docker-compose.prod.yml" ]]; then
  docker compose -f docker-compose.yml -f docker-compose.prod.yml start backend worker beat frontend
elif [[ -f "docker-compose.yml" ]]; then
  docker compose start backend worker beat frontend
fi
log "✅ Application restarted"

# ── Health check ──────────────────────────────────────────────
log "Waiting for health check (up to 60s)..."
sleep 5

for i in $(seq 1 12); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    http://localhost:8000/api/v1/health 2>/dev/null || echo "000")
  if [[ "$STATUS" == "200" ]]; then
    log "✅ Health check passed (attempt $i)"
    break
  fi
  if [[ $i -eq 12 ]]; then
    error "Health check failed after 60s. Check logs: docker compose logs backend"
    exit 1
  fi
  log "⏳ Attempt $i/12: status=$STATUS — waiting 5s..."
  sleep 5
done

log ""
log "════════════════════════════════════════════"
log "✅ RESTORE COMPLETE"
log "   Restored: $(basename "$BACKUP_FILE")"
log "   Database: $DB_NAME"
log "════════════════════════════════════════════"

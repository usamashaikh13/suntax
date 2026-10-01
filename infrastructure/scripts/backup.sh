#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  SunTax – PostgreSQL Backup Script
#
#  Usage:
#    ./backup.sh                  # manual run
#    Run via cron: 0 2 * * * /opt/suntax/infrastructure/scripts/backup.sh
#
#  Requirements: pg_dump, gzip, aws-cli (for S3 upload) or mc (MinIO)
#  Environment: Reads from /opt/suntax/.env or environment variables
# ─────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-/opt/suntax}"
ENV_FILE="${PROJECT_DIR}/.env"

# Load .env if it exists
if [[ -f "$ENV_FILE" ]]; then
  # Export only the variables we need (avoid exporting everything)
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^(POSTGRES_|MINIO_|EMAIL_|BACKUP_)' "$ENV_FILE" | sed 's/#.*//')
  set +a
fi

# Database configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-suntax}"
DB_USER="${POSTGRES_USER:-suntax}"
DB_PASSWORD="${POSTGRES_PASSWORD:-}"

# Backup storage configuration
BACKUP_DIR="${BACKUP_DIR:-/opt/suntax/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILENAME="suntax_db_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILENAME}"

# Secondary (remote) storage — set BACKUP_S3_BUCKET to enable S3 upload
BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-}"
BACKUP_S3_PREFIX="${BACKUP_S3_PREFIX:-backups/postgres}"

# Notification email (optional; requires 'mail' command)
ADMIN_EMAIL="${BACKUP_ADMIN_EMAIL:-}"

# ── Logging ───────────────────────────────────────────────────
LOG_FILE="${BACKUP_DIR}/backup.log"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
error() { log "ERROR: $*" >&2; }

# ── Helper: send failure email ─────────────────────────────────
send_failure_email() {
  local msg="$1"
  if [[ -n "$ADMIN_EMAIL" ]] && command -v mail &>/dev/null; then
    echo "$msg" | mail \
      -s "[SunTax] ❌ Backup FAILED on $(hostname) at $(date)" \
      "$ADMIN_EMAIL"
    log "Failure notification sent to $ADMIN_EMAIL"
  fi
}

# ── Trap errors ────────────────────────────────────────────────
trap 'error "Backup failed at line $LINENO. Exit code: $?"; send_failure_email "Backup script failed at line $LINENO"; exit 1' ERR

# ── Pre-flight checks ─────────────────────────────────────────
log "================================================="
log "Starting SunTax database backup..."
log "Database: $DB_NAME @ $DB_HOST:$DB_PORT"

if ! command -v pg_dump &>/dev/null; then
  error "pg_dump not found. Install postgresql-client."
  exit 1
fi

if ! command -v gzip &>/dev/null; then
  error "gzip not found."
  exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"
chmod 750 "$BACKUP_DIR"

# ── Perform Backup ────────────────────────────────────────────
log "Creating backup: $BACKUP_FILENAME"

# If running inside Docker, use docker exec to reach the container
if command -v docker &>/dev/null && docker ps --filter "name=suntax_postgres" --format "{{.Names}}" | grep -q "suntax_postgres"; then
  log "Using Docker container for pg_dump..."
  docker exec suntax_postgres \
    pg_dump \
      --username="$DB_USER" \
      --dbname="$DB_NAME" \
      --format=custom \
      --no-acl \
      --no-owner \
      --compress=0 \
    | gzip -9 > "$BACKUP_PATH"
else
  log "Using direct pg_dump..."
  PGPASSWORD="$DB_PASSWORD" pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --format=custom \
    --no-acl \
    --no-owner \
    --compress=0 \
  | gzip -9 > "$BACKUP_PATH"
fi

BACKUP_SIZE=$(du -sh "$BACKUP_PATH" | cut -f1)
log "✅ Backup created: $BACKUP_PATH ($BACKUP_SIZE)"

# ── Upload to Secondary Storage ───────────────────────────────
if [[ -n "$BACKUP_S3_BUCKET" ]]; then
  log "Uploading to S3/MinIO: s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/${BACKUP_FILENAME}"

  if command -v aws &>/dev/null; then
    aws s3 cp "$BACKUP_PATH" "s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/${BACKUP_FILENAME}" \
      --storage-class STANDARD_IA
    log "✅ Uploaded to S3 using aws-cli"

  elif command -v mc &>/dev/null; then
    mc cp "$BACKUP_PATH" "${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/${BACKUP_FILENAME}"
    log "✅ Uploaded to MinIO using mc"

  else
    log "WARNING: Neither aws-cli nor mc found. Skipping remote upload."
  fi
fi

# ── Rotate Old Backups (local) ────────────────────────────────
log "Rotating backups older than ${BACKUP_RETENTION_DAYS} days..."
DELETED_COUNT=$(find "$BACKUP_DIR" -name "suntax_db_*.sql.gz" \
  -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete | wc -l)
log "Deleted $DELETED_COUNT old backup(s)"

# ── Rotate Old Backups (remote S3) ───────────────────────────
if [[ -n "$BACKUP_S3_BUCKET" ]] && command -v aws &>/dev/null; then
  CUTOFF_DATE=$(date -d "-${BACKUP_RETENTION_DAYS} days" +%Y-%m-%d 2>/dev/null \
    || date -v "-${BACKUP_RETENTION_DAYS}d" +%Y-%m-%d)  # macOS fallback

  log "Rotating remote backups older than $CUTOFF_DATE..."
  aws s3 ls "s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/" \
    | awk '{print $4}' \
    | while read -r KEY; do
        FILE_DATE=$(echo "$KEY" | grep -oP '\d{8}' | head -1 \
          | sed 's/\(....\)\(..\)\(..\)/\1-\2-\3/')
        if [[ -n "$FILE_DATE" && "$FILE_DATE" < "$CUTOFF_DATE" ]]; then
          aws s3 rm "s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/$KEY"
          log "  Deleted remote: $KEY"
        fi
      done
fi

# ── Final Report ──────────────────────────────────────────────
REMAINING=$(find "$BACKUP_DIR" -name "suntax_db_*.sql.gz" | wc -l)
log "✅ Backup complete. Local backups retained: $REMAINING"
log "================================================="

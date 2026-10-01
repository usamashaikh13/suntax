#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  SunTax – One-time Production Setup Script
#
#  Run ONCE on a fresh server before starting the application.
#  After this script completes, start with:
#    docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
# ─────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/suntax}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Logging ───────────────────────────────────────────────────
log()     { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅  $*"; }
warn()    { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  $*"; }
error()   { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌  $*" >&2; }
section() { echo ""; echo "══════════════════════════════════════════════"; echo "  $*"; echo "══════════════════════════════════════════════"; }

section "SunTax Production Setup"
echo "  Project directory: $PROJECT_DIR"
echo "  Date: $(date)"
echo ""

# ── Pre-flight checks ─────────────────────────────────────────
section "Pre-flight checks"

if ! command -v docker &>/dev/null; then
  error "Docker not found. Please install Docker first."
  exit 1
fi
log "Docker found: $(docker --version)"

if ! docker compose version &>/dev/null; then
  error "Docker Compose plugin not found."
  exit 1
fi
log "Docker Compose found: $(docker compose version)"

if [[ ! -f "${PROJECT_DIR}/.env" ]]; then
  if [[ -f "${PROJECT_DIR}/.env.example" ]]; then
    warn ".env not found. Copying from .env.example..."
    cp "${PROJECT_DIR}/.env.example" "${PROJECT_DIR}/.env"
    warn "⚠️  IMPORTANT: Edit ${PROJECT_DIR}/.env and set all required values before continuing!"
    echo ""
    echo "  Required edits:"
    echo "    - POSTGRES_PASSWORD"
    echo "    - REDIS_PASSWORD"
    echo "    - SECRET_KEY  (generate: python3 -c \"import secrets; print(secrets.token_hex(32))\")"
    echo "    - MINIO_ACCESS_KEY / MINIO_SECRET_KEY"
    echo "    - GEMINI_API_KEY"
    echo "    - DOMAIN_NAME"
    echo "    - RESEND_API_KEY"
    echo ""
    read -r -p "Have you edited .env with real values? [y/N] " CONFIRM
    if [[ "${CONFIRM,,}" != "y" ]]; then
      echo "Please edit .env and re-run this script."
      exit 1
    fi
  else
    error ".env.example not found in $PROJECT_DIR"
    exit 1
  fi
fi

# Load env
set -a
# shellcheck disable=SC1090
source "${PROJECT_DIR}/.env"
set +a

log ".env loaded"

# ── Validate critical env vars ────────────────────────────────
section "Validating environment variables"

REQUIRED_VARS=(
  "POSTGRES_PASSWORD"
  "REDIS_PASSWORD"
  "SECRET_KEY"
  "MINIO_ACCESS_KEY"
  "MINIO_SECRET_KEY"
  "DOMAIN_NAME"
)

for VAR in "${REQUIRED_VARS[@]}"; do
  VALUE="${!VAR:-}"
  if [[ -z "$VALUE" || "$VALUE" == "CHANGE_ME"* || "$VALUE" == "GENERATE_"* ]]; then
    error "Variable $VAR is not set or still has placeholder value."
    exit 1
  fi
  log "$VAR is set"
done

# Validate SECRET_KEY length
if [[ ${#SECRET_KEY} -lt 32 ]]; then
  error "SECRET_KEY is too short (must be at least 32 characters)."
  exit 1
fi
log "SECRET_KEY length: ${#SECRET_KEY} chars ✅"

# ── Create directories ────────────────────────────────────────
section "Creating directories"
mkdir -p "${PROJECT_DIR}/backups"
mkdir -p "${PROJECT_DIR}/infrastructure/nginx/conf.d"
mkdir -p "${PROJECT_DIR}/logs"
chmod 750 "${PROJECT_DIR}/backups"
log "Directories created"

# ── Generate Nginx DH params ──────────────────────────────────
DHPARAM_FILE="${PROJECT_DIR}/infrastructure/nginx/dhparam.pem"
if [[ ! -f "$DHPARAM_FILE" ]]; then
  section "Generating Diffie-Hellman parameters (this takes a few minutes)..."
  openssl dhparam -out "$DHPARAM_FILE" 2048
  log "DH params generated: $DHPARAM_FILE"
else
  log "DH params already exist, skipping"
fi

# ── Pull Docker images ────────────────────────────────────────
section "Pulling Docker images"
cd "$PROJECT_DIR"
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
log "Images pulled"

# ── Start infrastructure services ─────────────────────────────
section "Starting infrastructure services"
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  up -d postgres redis minio
log "Waiting 15s for services to be healthy..."
sleep 15

# ── Run database migrations ───────────────────────────────────
section "Running database migrations"
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm --no-deps backend alembic upgrade head
log "Migrations applied"

# ── Seed initial data ─────────────────────────────────────────
section "Seeding initial data"
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm --no-deps backend python -m app.scripts.seed_data
log "Initial data seeded (cantons, tax rules)"

# ── Create admin user ─────────────────────────────────────────
section "Creating admin user"
echo ""
read -r -p "Admin email address: " ADMIN_EMAIL
read -r -s -p "Admin password (min 12 chars): " ADMIN_PASSWORD
echo ""

docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm --no-deps \
  -e "ADMIN_EMAIL=${ADMIN_EMAIL}" \
  -e "ADMIN_PASSWORD=${ADMIN_PASSWORD}" \
  backend python -m app.scripts.create_admin
log "Admin user created: $ADMIN_EMAIL"

# ── Set up cron job for backups ───────────────────────────────
section "Setting up backup cron job"
BACKUP_SCRIPT="${PROJECT_DIR}/infrastructure/scripts/backup.sh"
chmod +x "$BACKUP_SCRIPT"

CRON_LINE="0 2 * * * ${BACKUP_SCRIPT} >> ${PROJECT_DIR}/logs/backup.log 2>&1"

# Add to crontab if not already present
if crontab -l 2>/dev/null | grep -qF "$BACKUP_SCRIPT"; then
  log "Backup cron job already exists"
else
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  log "Backup cron job added: daily at 02:00"
fi

# ── Make scripts executable ───────────────────────────────────
section "Making scripts executable"
chmod +x "${PROJECT_DIR}/infrastructure/scripts/"*.sh
log "Scripts made executable"

# ── Start all services ────────────────────────────────────────
section "Starting all services"
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  up -d --remove-orphans
log "All services started"

# ── Final health check ────────────────────────────────────────
section "Health check"
sleep 10

for i in $(seq 1 12); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://localhost:8000/api/v1/health" 2>/dev/null || echo "000")
  if [[ "$STATUS" == "200" ]]; then
    log "Backend health check passed"
    break
  fi
  if [[ $i -eq 12 ]]; then
    warn "Backend health check did not pass after 60s. Check: docker compose logs backend"
  fi
  sleep 5
done

# ── Done ──────────────────────────────────────────────────────
section "Setup Complete!"
echo ""
echo "  🚀 SunTax is now running in production!"
echo ""
echo "  Next steps:"
echo "    1. Configure your DNS: point ${DOMAIN_NAME} → this server's IP"
echo "    2. Obtain TLS certificate:"
echo "       certbot certonly --standalone -d ${DOMAIN_NAME}"
echo "    3. Restart Nginx:"
echo "       docker compose -f docker-compose.yml -f docker-compose.prod.yml restart nginx"
echo ""
echo "  Useful commands:"
echo "    Logs:    docker compose logs -f backend"
echo "    Status:  docker compose ps"
echo "    Backup:  ${BACKUP_SCRIPT}"
echo ""

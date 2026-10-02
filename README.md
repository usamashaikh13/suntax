# ☀️ SunTax — AI-Powered Swiss Tax Return Platform

> **AI-assisted Swiss tax preparation** — upload your salary certificates, bank statements, and other documents, and let SunTax extract, organise and calculate your tax return automatically.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js)](https://nextjs.org)
[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?logo=python)](https://python.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Features

- 📄 **Document OCR** — Upload PDFs, images and salary slips; AI extracts tax-relevant data automatically
- 🤖 **AI Tax Assistant** — Powered by Google Gemini 2.0 Flash; answers questions in German, English & French
- 🏔️ **All 26 Swiss Cantons** — Deterministic tax calculations per canton and municipality
- 🔒 **Security-first** — JWT with refresh-token rotation, bcrypt passwords, row-level security
- 📑 **eCH XML Export** — Standards-compliant XML for submission to cantonal tax authorities
- 🔍 **Audit Trail** — Every action logged for compliance

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend API** | FastAPI (Python 3.9+), SQLAlchemy async |
| **Database** | SQLite (dev) · PostgreSQL via asyncpg (prod) |
| **AI** | Google Gemini 2.0 Flash |
| **Background jobs** | Celery + Redis (optional in dev) |
| **Object storage** | MinIO / AWS S3 (local filesystem in dev) |
| **Email** | Resend API (console output in dev) |
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS |
| **Error tracking** | Sentry (optional) |

---

## Quick Start

### 1 — Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
.venv/bin/pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env — only GEMINI_API_KEY is required for full functionality

# Start the development server (SQLite + fakeredis, no Docker needed)
./start_dev.sh
```

API is available at **http://localhost:8000**
Interactive docs at **http://localhost:8000/api/docs**

### 2 — Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend is available at **http://localhost:3000**

---

## Environment Variables

> Copy `backend/.env.example` to `backend/.env` and fill in the values.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | `sqlite+aiosqlite:///./suntax_dev.db` | Database connection string |
| `SECRET_KEY` | ✅ | — | 64-char random hex for JWT signing |
| `GEMINI_API_KEY` | ✅ | — | Google AI Studio API key |
| `ENVIRONMENT` | ✅ | `development` | `development` or `production` |
| `BACKEND_CORS_ORIGINS` | ✅ | `["http://localhost:3000"]` | Allowed CORS origins (JSON array) |
| `REDIS_URL` | ⬜ | `redis://localhost:6379/0` | fakeredis used in dev if Redis absent |
| `MINIO_ENDPOINT` | ⬜ | `localhost:9000` | MinIO / S3 endpoint |
| `MINIO_ACCESS_KEY` | ⬜ | `minioadmin` | S3 access key |
| `MINIO_SECRET_KEY` | ⬜ | `minioadmin` | S3 secret key |
| `MINIO_BUCKET_NAME` | ⬜ | `suntax-documents` | Storage bucket name |
| `RESEND_API_KEY` | ⬜ | — | Resend API key (emails printed to console if blank) |
| `EMAIL_FROM` | ⬜ | `noreply@suntax.ch` | From address for outgoing emails |
| `SENTRY_DSN` | ⬜ | — | Sentry DSN for error tracking |
| `FRONTEND_URL` | ⬜ | `http://localhost:3000` | Used in email verification links |

> **Generate a SECRET_KEY:**
> ```bash
> python -c "import secrets; print(secrets.token_hex(32))"
> ```

---

## API Endpoints

### Authentication (`/api/v1/auth`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | Create a new account |
| `GET` | `/auth/verify-email?token=…` | Verify email address |
| `POST` | `/auth/login` | Obtain JWT access + refresh tokens |
| `POST` | `/auth/refresh` | Rotate refresh token |
| `POST` | `/auth/logout` | Revoke token |
| `POST` | `/auth/forgot-password` | Request password-reset email |
| `POST` | `/auth/reset-password` | Confirm password reset |
| `GET` | `/auth/me` | Get current user profile |
| `PUT` | `/auth/me` | Update profile |
| `POST` | `/auth/me/change-password` | Change password |

### Tax Returns (`/api/v1`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/tax-returns` | List current user's returns |
| `POST` | `/tax-returns` | Create a new tax return |
| `GET` | `/tax-returns/{id}` | Get a specific return |
| `PATCH` | `/tax-returns/{id}` | Update status |
| `DELETE` | `/tax-returns/{id}` | Delete a draft return |
| `GET` | `/tax-returns/{id}/profile` | Get editable taxpayer profile |
| `PATCH` | `/tax-returns/{id}/profile` | Update taxpayer profile |
| `GET` | `/cantons` | List all supported cantons |
| `GET` | `/cantons/{code}/municipalities` | List municipalities |

### Documents (`/api/v1`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/documents/upload` | Upload documents (multipart) |
| `GET` | `/documents` | List current user's documents |
| `GET` | `/documents/{id}` | Get document metadata |
| `GET` | `/documents/{id}/download` | Presigned download URL |
| `GET` | `/documents/{id}/status` | Processing status |
| `PUT` | `/documents/{id}` | Update type or association |
| `DELETE` | `/documents/{id}` | Delete document |

### Tax Engine (`/api/v1`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/tax-returns/{id}/calculate` | Run deterministic calculation |
| `GET` | `/tax-returns/{id}/calculation` | Get latest result |
| `POST` | `/tax-returns/{id}/export/pdf` | Download PDF |
| `POST` | `/tax-returns/{id}/export/xml` | Download eCH XML |
| `POST` | `/tax-returns/{id}/confirm` | Finalize and confirm |

### AI Assistant (`/api/v1`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/tax-returns/{id}/chat` | Send message to AI assistant |
| `GET` | `/tax-returns/{id}/chat/history` | Retrieve conversation |
| `DELETE` | `/tax-returns/{id}/chat/history` | Clear conversation |

### Admin (`/api/v1/admin`) — requires admin role

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/users` | Paginated user list |
| `GET` | `/admin/users/{id}` | User detail |
| `PUT` | `/admin/users/{id}/activate` | Toggle user active status |
| `GET` | `/admin/stats` | System-wide statistics |
| `GET` | `/admin/audit-logs` | Paginated audit log |

---

## Supported Swiss Cantons

All 26 cantons are supported:

| | | | |
|---|---|---|---|
| AG — Aargau | AI — Appenzell Innerrhoden | AR — Appenzell Ausserrhoden | BE — Bern |
| BL — Basel-Landschaft | BS — Basel-Stadt | FR — Fribourg | GE — Geneva |
| GL — Glarus | GR — Graubünden | JU — Jura | LU — Lucerne |
| NE — Neuchâtel | NW — Nidwalden | OW — Obwalden | SG — St. Gallen |
| SH — Schaffhausen | SO — Solothurn | SZ — Schwyz | TG — Thurgau |
| TI — Ticino | UR — Uri | VD — Vaud | VS — Valais |
| ZG — Zug | ZH — Zurich | | |

---

## Development Notes

### No external services required in dev

The backend is designed to work without any external services in development:

- **Database**: SQLite file (`suntax_dev.db`) — created automatically on first run
- **Redis**: `fakeredis` is used automatically if Redis is not running
- **Storage**: Local filesystem if MinIO is not configured
- **Email**: Token and link printed to the console if no `RESEND_API_KEY` is set
- **Celery**: Document upload succeeds even if workers are not running (processing skipped with a warning)

### Running tests

```bash
cd backend
.venv/bin/pytest tests/ -v
```

---

## Production Deployment

> [!IMPORTANT]
> For production, set `ENVIRONMENT=production` and use a PostgreSQL database. Swagger UI is automatically disabled in production mode.

The recommended production setup uses **Docker Compose**:

```bash
# Build and start all services
docker compose -f docker-compose.prod.yml up -d
```

Services included:
- `api` — FastAPI backend (uvicorn with multiple workers)
- `worker` — Celery worker for OCR processing  
- `db` — PostgreSQL 16
- `redis` — Redis 7
- `minio` — MinIO object storage
- `nginx` — Reverse proxy with TLS termination

Refer to `docker-compose.prod.yml` (coming soon) for the full configuration.

---

## License

MIT © 2025 SunTax GmbH

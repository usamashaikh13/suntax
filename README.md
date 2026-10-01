# SunTax 🇨🇭

[![CI](https://github.com/your-org/suntax/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/suntax/actions/workflows/ci.yml)
[![Deploy](https://github.com/your-org/suntax/actions/workflows/deploy.yml/badge.svg)](https://github.com/your-org/suntax/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**SunTax** is an AI-powered Swiss tax return platform that guides individuals through their annual federal and cantonal tax filing. It extracts data from uploaded documents (salary certificates, bank statements, insurance policies) using Google Gemini, auto-populates tax forms, applies the correct cantonal rules, and produces a ready-to-submit return — all with a clean, bilingual (DE/EN) web interface.

---

## Features

- 📄 **AI Document Extraction** — upload PDFs/images; Gemini extracts structured data automatically
- 🏔️ **All 26 Swiss Cantons** — canton-specific deduction rules and tax rates
- 🔄 **Real-time Calculation** — instant federal and cantonal tax estimates as you fill in data
- 🔒 **Privacy by Design** — Row-Level Security ensures users can only access their own data
- 📦 **Secure Document Storage** — encrypted storage with MinIO (S3-compatible)
- 🌍 **Multilingual** — German, French, Italian, English
- 📧 **Email Notifications** — filing reminders, submission confirmations

---

## Architecture

```
┌──────────────┐     HTTPS      ┌──────────────────────────────────────┐
│   Browser    │◄──────────────►│           Nginx (TLS)                │
└──────────────┘                └────────┬─────────────┬───────────────┘
                                         │ /api/       │ /
                               ┌─────────▼──────┐  ┌──▼──────────────┐
                               │  FastAPI        │  │  Next.js 14     │
                               │  (Python 3.12)  │  │  (App Router)   │
                               └────────┬────────┘  └─────────────────┘
                                        │
                  ┌─────────────────────┼─────────────────────┐
                  │                     │                       │
          ┌───────▼───────┐   ┌─────────▼──────┐   ┌──────────▼─────┐
          │  PostgreSQL16  │   │   Redis 7       │   │   MinIO         │
          │  (+ RLS)       │   │  (Cache+Queue)  │   │  (Documents)    │
          └───────────────┘   └────────┬────────┘   └────────────────┘
                                        │
                               ┌─────────▼──────┐
                               │  Celery Worker  │
                               │  (AI Tasks,     │
                               │   OCR, Email)   │
                               └─────────────────┘
```

---

## Supported Cantons

| Canton | Code | Federal Tax | Cantonal Rules |
|--------|------|-------------|----------------|
| Zürich | ZH | ✅ | ✅ |
| Bern | BE | ✅ | ✅ |
| Luzern | LU | ✅ | ✅ |
| Uri | UR | ✅ | ✅ |
| Schwyz | SZ | ✅ | ✅ |
| Obwalden | OW | ✅ | ✅ |
| Nidwalden | NW | ✅ | ✅ |
| Glarus | GL | ✅ | ✅ |
| Zug | ZG | ✅ | ✅ |
| Freiburg | FR | ✅ | ✅ |
| Solothurn | SO | ✅ | ✅ |
| Basel-Stadt | BS | ✅ | ✅ |
| Basel-Landschaft | BL | ✅ | ✅ |
| Schaffhausen | SH | ✅ | ✅ |
| Appenzell Ausserrhoden | AR | ✅ | ✅ |
| Appenzell Innerrhoden | AI | ✅ | ✅ |
| St. Gallen | SG | ✅ | ✅ |
| Graubünden | GR | ✅ | ✅ |
| Aargau | AG | ✅ | ✅ |
| Thurgau | TG | ✅ | ✅ |
| Ticino | TI | ✅ | ✅ |
| Vaud | VD | ✅ | ✅ |
| Valais | VS | ✅ | ✅ |
| Neuchâtel | NE | ✅ | ✅ |
| Genève | GE | ✅ | ✅ |
| Jura | JU | ✅ | ✅ |

---

## Quick Start (Development)

### Prerequisites

- Docker Desktop ≥ 24
- Docker Compose plugin ≥ 2.20
- Node.js 20 (for local frontend dev without Docker)
- Python 3.12 (for local backend dev without Docker)

### 1. Clone and configure

```bash
git clone https://github.com/your-org/suntax.git
cd suntax
cp .env.example .env
# Edit .env — at minimum set GEMINI_API_KEY
```

### 2. Start all services

```bash
docker compose up --build
```

This starts:
- **Frontend** → http://localhost:3000
- **Backend API** → http://localhost:8000
- **API Docs** → http://localhost:8000/docs
- **MinIO Console** → http://localhost:9001

### 3. Run migrations (first time)

```bash
docker compose exec backend alembic upgrade head
```

### 4. Seed data

```bash
docker compose exec backend python -m app.scripts.seed_data
```

### 5. Create admin user

```bash
docker compose exec backend python -m app.scripts.create_admin
```

---

## Environment Setup

All configuration is done via environment variables. See [`.env.example`](.env.example) for the full list.

Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL async connection string |
| `REDIS_URL` | Redis connection string |
| `SECRET_KEY` | 64-char random string for JWT signing |
| `GEMINI_API_KEY` | Google Gemini API key |
| `MINIO_*` | MinIO object storage credentials |
| `RESEND_API_KEY` | Transactional email via Resend |

---

## Running Tests

### Backend

```bash
cd backend
pip install -r requirements-dev.txt
pytest tests/ -v --cov=app
```

### Frontend

```bash
cd frontend
npm install
npm run test
npm run lint
npm run type-check
```

### Security tests

```bash
cd backend
pytest tests/security/ -v
```

---

## Production Deployment

See the full guide at [`docs/deployment.md`](docs/deployment.md).

Quick overview:
1. Provision a server (min 4 GB RAM, 2 vCPU) — Hetzner CX21 recommended
2. Install Docker
3. Clone repo to `/opt/suntax`
4. Configure `.env`
5. Run `./infrastructure/scripts/setup_production.sh`
6. Configure DNS + TLS with Certbot

---

## Project Structure

```
suntax/
├── backend/                  # FastAPI application
│   ├── app/
│   │   ├── api/             # Route handlers
│   │   ├── core/            # Config, security, dependencies
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── schemas/         # Pydantic v2 schemas
│   │   ├── services/        # Business logic
│   │   ├── worker/          # Celery tasks
│   │   └── scripts/         # One-off admin scripts
│   ├── alembic/             # Database migrations
│   ├── tests/               # Pytest tests
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                 # Next.js 14 application
│   ├── app/                 # App Router pages
│   ├── components/          # React components
│   ├── lib/                 # Utilities, API client
│   ├── Dockerfile
│   └── Dockerfile.dev
├── infrastructure/
│   ├── nginx/               # Nginx configuration
│   └── scripts/             # Operational scripts
├── docs/                    # Documentation
├── .github/
│   └── workflows/           # CI/CD pipelines
├── docker-compose.yml        # Development
├── docker-compose.prod.yml   # Production override
└── .env.example
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Write tests for your changes
4. Ensure all tests pass: `docker compose run --rm backend pytest`
5. Run linting: `docker compose run --rm backend ruff check app/`
6. Submit a pull request to `main`

### Code Standards

- **Python**: PEP 8, type annotations everywhere, docstrings for public functions
- **TypeScript**: strict mode, no `any`, prefer functional components
- **Commits**: Conventional Commits format (`feat:`, `fix:`, `docs:`, etc.)

---

## License

MIT License — see [LICENSE](LICENSE)

---

> ⚠️ **Tax Law Disclaimer**: SunTax is a tool to assist with tax preparation. Always verify the output against current official Swiss tax authority publications. Tax laws change annually. The developers are not liable for any errors in tax calculations.

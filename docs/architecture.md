# SunTax Architecture

This document describes the technical architecture of the SunTax platform in detail.

---

## High-Level Overview

SunTax follows a classic **three-tier web architecture** with a separate **async task layer** for AI/document processing:

```
┌─────────────────────────────────────────────────────────────┐
│                        Internet                              │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS (443) / HTTP→HTTPS (80)
┌──────────────────────────▼──────────────────────────────────┐
│                    Nginx Reverse Proxy                        │
│  - TLS termination (Let's Encrypt)                           │
│  - Rate limiting (10 req/s per IP)                           │
│  - Security headers (HSTS, CSP, X-Frame-Options)             │
│  - WebSocket upgrade                                          │
│  - Gzip compression                                           │
└────────────┬───────────────────────────────┬─────────────────┘
             │ /api/*  /ws/*                  │ /*
┌────────────▼──────────────┐  ┌─────────────▼─────────────────┐
│     FastAPI Backend        │  │      Next.js 14 Frontend       │
│     Python 3.12            │  │      TypeScript + Tailwind     │
│                            │  │      App Router (RSC)          │
│  ┌──────────────────────┐  │  │                                │
│  │ Routers (API v1)     │  │  │  ┌────────────────────────┐   │
│  │  /auth               │  │  │  │  Server Components      │   │
│  │  /users              │  │  │  │  Client Components       │   │
│  │  /tax-returns        │  │  │  │  shadcn/ui + Radix      │   │
│  │  /documents          │  │  │  └────────────────────────┘   │
│  │  /tax-calculations   │  │  └───────────────────────────────┘
│  │  /health             │  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │ Services             │  │
│  │  AuthService         │  │
│  │  TaxCalculationSvc   │  │
│  │  DocumentService     │  │
│  │  GeminiAIService     │  │
│  │  StorageService      │  │
│  └──────────────────────┘  │
└────────────┬───────────────┘
             │
┌────────────▼────────────────────────────────────────────────┐
│                     Data Layer                                │
│                                                               │
│  ┌──────────────────────┐   ┌──────────────────────────────┐ │
│  │   PostgreSQL 16       │   │         Redis 7              │ │
│  │                       │   │                              │ │
│  │  Tables:              │   │  - JWT denylist              │ │
│  │  - users              │   │  - Rate limit counters       │ │
│  │  - tax_returns        │   │  - Celery message broker     │ │
│  │  - tax_profiles       │   │  - Celery result backend     │ │
│  │  - documents          │   │  - RedBeat schedules         │ │
│  │  - tax_calculations   │   │  - Session cache             │ │
│  │  - cantons            │   └──────────────────────────────┘ │
│  │  - tax_rules          │                                     │
│  │  - audit_logs         │   ┌──────────────────────────────┐ │
│  │                       │   │         MinIO                │ │
│  │  Row-Level Security   │   │                              │ │
│  │  enabled on all       │   │  - User uploaded documents   │ │
│  │  user-owned tables    │   │  - Generated PDF returns     │ │
│  └──────────────────────┘   │  - Audit evidence files      │ │
│                               └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────────┐
│                   Async Task Layer (Celery)                   │
│                                                               │
│  Queues:                    Workers:                          │
│  - celery (default)         - Document OCR                   │
│  - ai_tasks                 - Gemini data extraction         │
│  - document_processing      - PDF generation                 │
│                             - Email notifications            │
│  Scheduler (RedBeat):       - Tax rule sync                  │
│  - Daily backup trigger     - Cleanup jobs                   │
│  - Reminder emails                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Backend (FastAPI)

| Component | Technology | Version | Rationale |
|-----------|------------|---------|-----------|
| Web framework | FastAPI | 0.115+ | High performance, native async, auto OpenAPI |
| ORM | SQLAlchemy | 2.0 (async) | Type-safe queries, async support |
| Migrations | Alembic | 1.13+ | SQL migration versioning |
| Data validation | Pydantic | v2 | Fast, type-safe schema validation |
| Task queue | Celery | 5+ | Mature, Redis-backed, retry support |
| Authentication | PyJWT | 2+ | JWT RS256 or HS256 |
| AI | google-genai | latest | Gemini 2.0 Flash for doc extraction |
| Object storage | boto3 / minio-py | latest | S3-compatible MinIO client |
| Email | Resend | — | Reliable transactional email |

### Frontend (Next.js)

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | Next.js 14 (App Router) | RSC, streaming, built-in optimization |
| Language | TypeScript 5 | Type safety, developer experience |
| Styling | Tailwind CSS 3 | Utility-first, design system consistent |
| UI Components | shadcn/ui + Radix | Accessible, composable, unstyled primitives |
| Forms | React Hook Form + Zod | Performant, type-safe form validation |
| State | Zustand | Lightweight, no boilerplate |
| Data fetching | TanStack Query | Caching, background sync, optimistic updates |
| i18n | next-intl | SSR-compatible internationalization |

### Infrastructure

| Component | Technology | Notes |
|-----------|------------|-------|
| Container runtime | Docker + Compose | Dev and prod parity |
| Reverse proxy | Nginx 1.25 | TLS, rate limiting, compression |
| Database | PostgreSQL 16 | ACID, RLS, JSON support |
| Cache / Broker | Redis 7 | Persistence enabled |
| Object storage | MinIO | S3-compatible, self-hosted |
| TLS | Let's Encrypt + Certbot | Automatic cert renewal |
| CI/CD | GitHub Actions | Build, test, deploy |

---

## Database Schema

```
users
  id UUID PK
  email VARCHAR UNIQUE NOT NULL
  hashed_password VARCHAR NOT NULL
  full_name VARCHAR
  is_active BOOLEAN DEFAULT true
  is_admin BOOLEAN DEFAULT false
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ

tax_profiles
  id UUID PK
  user_id UUID FK→users(id)  [RLS: user_id = current_user]
  canton VARCHAR(2) NOT NULL
  tax_year INT NOT NULL
  civil_status VARCHAR
  has_children BOOLEAN
  church_tax BOOLEAN
  created_at TIMESTAMPTZ

tax_returns
  id UUID PK
  user_id UUID FK→users(id)  [RLS]
  tax_profile_id UUID FK→tax_profiles(id)
  status VARCHAR  (draft|in_review|submitted)
  data JSONB  (all form fields)
  federal_tax NUMERIC(12,2)
  cantonal_tax NUMERIC(12,2)
  submitted_at TIMESTAMPTZ
  created_at TIMESTAMPTZ
  updated_at TIMESTAMPTZ

documents
  id UUID PK
  user_id UUID FK→users(id)  [RLS]
  tax_return_id UUID FK→tax_returns(id)
  filename VARCHAR
  content_type VARCHAR
  storage_key VARCHAR  (MinIO object key)
  file_size BIGINT
  extracted_data JSONB
  processing_status VARCHAR
  uploaded_at TIMESTAMPTZ

cantons
  code VARCHAR(2) PK
  name_de VARCHAR NOT NULL
  name_fr VARCHAR
  name_it VARCHAR
  name_en VARCHAR

tax_rules
  id UUID PK
  canton_code VARCHAR(2) FK→cantons(code)
  tax_year INT NOT NULL
  rule_type VARCHAR  (deduction|rate|allowance)
  rule_key VARCHAR
  rule_data JSONB
  effective_from DATE
  effective_to DATE
  source_url VARCHAR
  verified_at TIMESTAMPTZ

audit_logs
  id UUID PK
  user_id UUID  (nullable for system events)
  action VARCHAR NOT NULL
  resource_type VARCHAR
  resource_id UUID
  ip_address INET
  user_agent TEXT
  occurred_at TIMESTAMPTZ
```

---

## Authentication Flow

```
Client                        FastAPI                   PostgreSQL / Redis
  │                              │                              │
  │──POST /auth/login ──────────►│                              │
  │   {email, password}          │──SELECT user WHERE email────►│
  │                              │◄─ user row ─────────────────│
  │                              │  verify bcrypt hash         │
  │                              │──SET jwt_denylist:* ────────►│ (Redis)
  │◄── {access_token,           │                              │
  │     refresh_token} ─────────│                              │
  │                              │                              │
  │──GET /api/v1/me ────────────►│                              │
  │   Authorization: Bearer ...  │  decode JWT, check expiry   │
  │                              │──CHECK denylist ────────────►│ (Redis)
  │                              │  inject user into request   │
  │◄── {user data} ─────────────│                              │
  │                              │                              │
  │──POST /auth/refresh ────────►│                              │
  │   {refresh_token}            │  verify refresh token       │
  │◄── {new access_token} ──────│                              │
  │                              │                              │
  │──POST /auth/logout ─────────►│                              │
  │                              │──SETEX denylist:jti ────────►│ (Redis, TTL=exp)
  │◄── 204 No Content ──────────│                              │
```

---

## AI Document Processing Flow

```
User                FastAPI              Celery Worker          Gemini API
 │                     │                      │                     │
 │─POST /documents ───►│                      │                     │
 │  (multipart PDF)     │  save to MinIO       │                     │
 │                     │  INSERT document     │                     │
 │                     │  status=pending      │                     │
 │◄─ 202 {task_id} ────│  enqueue task ──────►│                     │
 │                     │                      │  download from MinIO │
 │─WS /ws/task_id ────►│                      │  extract text/images │
 │   (subscribe)        │                      │─── Gemini request ──►│
 │                     │                      │  prompt: extract     │
 │                     │                      │  structured JSON     │
 │                     │                      │◄── JSON response ───│
 │                     │                      │  UPDATE document     │
 │                     │                      │  extracted_data={}   │
 │◄─ WS: {status,      │◄── WS push ─────────│  status=completed    │
 │    data} ───────────│                      │                     │
```

---

## Security Architecture

See [`docs/security.md`](security.md) for the full security document.

Key points:
- **Row-Level Security** on all user-owned tables
- **JWT** with short-lived access tokens (30 min) + long-lived refresh tokens (30 days)
- **JWT denylist** in Redis for immediate logout
- **bcrypt** password hashing (cost factor 12)
- **TLS 1.3** only in production
- **Content-Security-Policy** enforced by Nginx
- **Rate limiting** at Nginx (10 req/s) and FastAPI middleware
- **Audit log** for all sensitive actions

---

## Deployment Environments

| Environment | Branch | URL | Deploy |
|-------------|--------|-----|--------|
| Development | any | http://localhost:3000 | `docker compose up` |
| Staging | `staging` | https://staging.suntax.ch | GitHub Actions on push |
| Production | `main` | https://suntax.ch | GitHub Actions on push (after CI) |

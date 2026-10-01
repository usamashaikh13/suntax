# Third-Party Services

This document covers every external service SunTax depends on, including setup instructions, costs, data stored, and migration paths.

> [!IMPORTANT]
> All accounts should be registered under the **client's** company name and payment method — not the developer's personal account. This ensures the client retains full control if the development relationship ends.

---

## Account Setup Checklist

Complete in order before going live:

- [ ] **Google AI Studio** — obtain Gemini API key
- [ ] **Resend** — email provider account + domain verification
- [ ] **Sentry** — error monitoring (optional but recommended)
- [ ] **UptimeRobot** — uptime monitoring (free tier sufficient)
- [ ] **Hetzner** — production server (or alternate cloud provider)
- [ ] **GitHub** — source code repository + Actions CI/CD
- [ ] **Domain registrar** — domain for the application

---

## 1. Google Gemini (AI Document Extraction)

**Purpose**: Extract structured data from uploaded tax documents (salary certificates, bank statements, insurance policies).

**Used in**: Celery worker tasks (`app.worker.tasks.document_processing`)

### Setup
1. Go to https://aistudio.google.com
2. Sign in with a Google account (use client's Google Workspace account)
3. Click **Get API Key** → **Create API key**
4. Copy the key into `.env`: `GEMINI_API_KEY=...`

### Model
- Default: `gemini-2.0-flash` (fast, cost-effective for document extraction)
- Upgrade to `gemini-2.0-pro` for higher accuracy if needed

### Cost
| Usage | Price |
|-------|-------|
| Input tokens | $0.075 / 1M tokens |
| Output tokens | $0.30 / 1M tokens |
| Images (≤ 384px) | $0.001316 / image |
| Images (> 384px) | varies |

Estimate: ~CHF 0.05–0.15 per tax document processed.

### Data Stored
Google processes the document content (text + images) during the API call. Data is not retained beyond the request per Google's data usage policy. Review: https://ai.google.dev/gemini-api/terms

### How to Migrate Away
Replace `app.services.gemini_service.py` with an implementation using:
- **OpenAI GPT-4o** (similar multimodal capability)
- **Anthropic Claude 3.5** (strong document understanding)
- **Azure AI Document Intelligence** (specialized for structured documents)
- **Self-hosted**: Ollama + LLaVA for complete data sovereignty

---

## 2. Resend (Transactional Email)

**Purpose**: Send verification emails, password resets, tax filing reminders, and submission confirmations.

**Used in**: `app.services.email_service.py`

### Setup
1. Go to https://resend.com → Sign up
2. Add your domain: **Domains** → **Add Domain** → `your-domain.com`
3. Add the DNS records shown (SPF, DKIM, DMARC)
4. Wait for verification (usually 5–15 minutes)
5. Go to **API Keys** → **Create API Key**
6. Set in `.env`: `RESEND_API_KEY=re_...`
7. Set `EMAIL_FROM=noreply@your-domain.com`

### Cost
| Plan | Price | Emails/month |
|------|-------|--------------|
| Free | $0 | 3,000 |
| Pro | $20/mo | 50,000 |
| Scale | $90/mo | 100,000+ |

### Data Stored
Resend stores email logs (to, subject, status) for 30 days on paid plans.

### How to Migrate Away
The `EmailService` class uses a simple `send_email(to, subject, html)` interface. Replace the Resend client with:
- **SendGrid**: `sendgrid` Python package
- **Postmark**: `postmarker` package
- **AWS SES**: `boto3` (cheapest at scale: $0.10/1000 emails)
- **Self-hosted**: Postal or Mailu

---

## 3. Sentry (Error Monitoring)

**Purpose**: Capture and alert on runtime exceptions in both the FastAPI backend and Next.js frontend.

**Used in**: `app/core/config.py` (backend), `sentry.client.config.ts` (frontend)

### Setup
1. Go to https://sentry.io → Create account
2. Create a new **Organization** (use client company name)
3. Create two projects:
   - **suntax-backend** (Python/FastAPI)
   - **suntax-frontend** (Next.js)
4. Copy the DSN for each project into `.env`:
   ```
   SENTRY_DSN=https://...@sentry.io/...
   ```

### Cost
| Plan | Price | Events/month |
|------|-------|--------------|
| Developer | $0 | 5,000 |
| Team | $26/mo | 50,000 |
| Business | $80/mo | 100,000+ |

### Data Stored
Sentry stores stack traces, request context, and user identifiers. Configure PII scrubbing:
- Enable **Data Scrubbing** in project settings
- Add sensitive fields: `password`, `token`, `secret_key`, `ahv_number`

### How to Migrate Away
- **GlitchTip** (open-source Sentry alternative, self-hostable)
- **Rollbar**
- Remove Sentry SDK entirely and rely on structured logging to a log aggregator

---

## 4. Hetzner (Cloud Server)

**Purpose**: Host the production Docker environment.

### Setup
1. Go to https://www.hetzner.com/cloud → Register
2. Create project: `suntax-production`
3. Add SSH key under **Security** → **SSH Keys**
4. Create server: type **CX31**, location **Nuremberg** (nbg1) or **Helsinki** (hel1)
5. Note the IP address

### Cost
| Server | vCPU | RAM | Price |
|--------|------|-----|-------|
| CX21 | 2 | 4 GB | €5.83/mo |
| CX31 | 2 | 8 GB | €10.59/mo ✅ |
| CX41 | 4 | 16 GB | €19.49/mo |

Add:
- **Volume**: 100 GB block storage for backups → €4.90/mo
- **Snapshot**: €0.0119/GB/month

### Data Stored
All application data, database, and uploaded documents are stored on this server. Ensure the server region complies with Swiss data residency requirements (use Nuremberg for EU; consider Hetzner's Falkenstein/Germany data center).

### How to Migrate Away
1. Run a full backup: `./infrastructure/scripts/backup.sh`
2. Provision a new server on any cloud provider (AWS, GCP, Azure, DigitalOcean)
3. Install Docker
4. Run `setup_production.sh`
5. Restore from backup: `./infrastructure/scripts/restore.sh`

---

## 5. GitHub (Source Code & CI/CD)

**Purpose**: Version control, code review (PRs), and automated CI/CD pipelines via GitHub Actions.

### Setup
1. Create a GitHub organization: `your-org-name`
2. Create repository: `suntax` (private)
3. Push code: `git remote add origin git@github.com:your-org/suntax.git`
4. Set up branch protection on `main`:
   - Require PR reviews (1 approver)
   - Require status checks (CI must pass)
   - Block force pushes
5. Add GitHub Secrets (Settings → Secrets → Actions):
   - `DEPLOY_SSH_KEY` — private SSH key for production server
   - `DEPLOY_HOST` — production server IP
   - `DEPLOY_USER` — `deploy`
   - `NEXT_PUBLIC_API_URL` — production API URL
   - `NEXT_PUBLIC_WS_URL` — production WebSocket URL
   - `SLACK_WEBHOOK_URL` — for deployment notifications

### Cost
| Plan | Price | Features |
|------|-------|---------|
| Free | $0 | Public repos, 2000 Actions min/mo |
| Team | $4/user/mo | Private repos, 3000 min/mo |

### Data Stored
Source code, commit history, CI logs, and secrets (encrypted at rest).

### How to Migrate Away
The CI/CD workflows (`.github/workflows/`) can be ported to:
- **GitLab CI** (`.gitlab-ci.yml`)
- **Bitbucket Pipelines** (`bitbucket-pipelines.yml`)
- **Gitea + Woodpecker CI** (fully self-hosted)

---

## 6. UptimeRobot (Uptime Monitoring)

**Purpose**: Monitor the health endpoint and alert on downtime.

### Setup
1. Go to https://uptimerobot.com → Create free account
2. **Add New Monitor**:
   - Type: HTTPS
   - URL: `https://your-domain.com/api/v1/health`
   - Name: `SunTax Production API`
   - Check interval: 5 minutes
3. Add alert contacts (email, SMS, Slack)

### Cost
Free tier: 50 monitors, 5-minute checks, email alerts.

### Data Stored
Uptime logs and response times. No user data.

### How to Migrate Away
- **Better Uptime** (https://betteruptime.com)
- **Freshping** (free tier available)
- **Grafana + Prometheus** (self-hosted, integrated with your observability stack)

---

## Domain Registrar

**Purpose**: DNS management and domain ownership.

### Recommended Registrars
| Registrar | Notes |
|-----------|-------|
| Infomaniak | Swiss company, GDPR-compliant, good support |
| Cloudflare Registrar | At-cost pricing, free DNS, DDoS protection |
| Namecheap | Affordable, good UX |

> [!IMPORTANT]
> Always register the domain under the **client's name and email**, not the developer's. Domain ownership is critical — losing control of the domain means losing the service.

---

## Data Flow Summary

```
User uploads document
       │
       ▼
  MinIO (self-hosted)   ← document stored here permanently
       │
       ▼
  Gemini API            ← document content sent for extraction (not retained)
       │
       ▼
  PostgreSQL (self-hosted) ← extracted structured data stored here
       │
       ▼
  Resend                ← confirmation email sent to user
       │
       ▼
  Sentry                ← any errors captured (no document content)
```

Only **Gemini API** receives document content and it does not retain it beyond the API call.

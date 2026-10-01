# Production Deployment Guide

This guide walks through deploying SunTax to a fresh production server from scratch.

---

## Server Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Storage | 40 GB SSD | 100 GB SSD |
| Network | 100 Mbps | 1 Gbps |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

> **Cost estimate**: Hetzner CX21 (2 vCPU, 4 GB RAM) costs ~€5.83/month. Recommended: CX31 (2 vCPU, 8 GB) at ~€10.59/month.

---

## 1. Provision the Server (Hetzner Example)

```bash
# Install Hetzner CLI
brew install hcloud

# Authenticate
hcloud context create suntax

# Create server
hcloud server create \
  --name suntax-prod \
  --type cx31 \
  --image ubuntu-22.04 \
  --location nbg1 \
  --ssh-key your-ssh-key-name

# Get IP
hcloud server ip suntax-prod
```

---

## 2. Initial Server Configuration

```bash
# SSH in as root
ssh root@<SERVER_IP>

# Create deploy user
adduser deploy
usermod -aG sudo docker deploy

# Copy SSH key to deploy user
mkdir -p /home/deploy/.ssh
cat /root/.ssh/authorized_keys >> /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# Disable root SSH login
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart sshd

# Update system
apt-get update && apt-get upgrade -y

# Install essentials
apt-get install -y curl git ufw fail2ban
```

---

## 3. Configure Firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

---

## 4. Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Add deploy user to docker group
usermod -aG docker deploy

# Enable Docker on boot
systemctl enable docker
systemctl start docker

# Verify
docker --version
docker compose version
```

---

## 5. Clone the Repository

```bash
su - deploy
mkdir -p /opt/suntax
cd /opt/suntax
git clone https://github.com/your-org/suntax.git .
```

---

## 6. Configure Environment

```bash
cp .env.example .env
nano .env  # or vim .env
```

Required values to fill in:

```bash
# Generate a secret key
python3 -c "import secrets; print(secrets.token_hex(32))"

# Generate strong passwords
openssl rand -base64 24
```

Minimum required changes:
- `POSTGRES_PASSWORD` → strong random password
- `REDIS_PASSWORD` → strong random password
- `SECRET_KEY` → 64-char random hex
- `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` → strong credentials
- `GEMINI_API_KEY` → your Google AI Studio key
- `DOMAIN_NAME` → your actual domain
- `FRONTEND_URL` → `https://your-domain.com`
- `RESEND_API_KEY` → your Resend API key

---

## 7. Configure DNS

In your DNS provider, add:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `@` | `<SERVER_IP>` | 300 |
| A | `www` | `<SERVER_IP>` | 300 |
| MX | `@` | (your email provider) | 3600 |

Wait for DNS propagation (5–30 minutes):
```bash
dig +short your-domain.com
```

---

## 8. Obtain TLS Certificate (Let's Encrypt)

```bash
# Install Certbot
apt-get install -y certbot

# Stop any existing web server
docker compose down nginx 2>/dev/null || true

# Obtain certificate (standalone mode)
certbot certonly \
  --standalone \
  --email admin@your-domain.com \
  --agree-tos \
  --no-eff-email \
  -d your-domain.com \
  -d www.your-domain.com

# Verify certificate
ls /etc/letsencrypt/live/your-domain.com/
# Should contain: fullchain.pem, privkey.pem, chain.pem

# Set up auto-renewal
systemctl enable certbot.timer
systemctl start certbot.timer

# Test renewal (dry run)
certbot renew --dry-run
```

---

## 9. First Deployment

```bash
cd /opt/suntax

# Run setup script (interactive)
chmod +x infrastructure/scripts/setup_production.sh
./infrastructure/scripts/setup_production.sh
```

This script:
1. Validates all environment variables
2. Generates Nginx DH parameters
3. Pulls Docker images
4. Starts infrastructure services
5. Runs Alembic migrations
6. Seeds canton and tax rule data
7. Creates the first admin user
8. Sets up backup cron job
9. Starts all services

---

## 10. Verify the Deployment

```bash
# Check all containers are running
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Check backend health
curl -s https://your-domain.com/api/v1/health | jq

# Check frontend
curl -s -o /dev/null -w "%{http_code}" https://your-domain.com/

# Check SSL
curl -I https://your-domain.com

# View logs
docker compose logs -f backend
docker compose logs -f worker
```

---

## 11. Updating the Application

### Automatic (GitHub Actions)
Push to `main` branch — CI runs tests, then deploys automatically.

### Manual
```bash
cd /opt/suntax

# Pull latest code
git pull origin main

# Pull new images (if built externally)
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull

# Run migrations
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm --no-deps backend alembic upgrade head

# Rolling restart
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  up -d --no-deps backend worker beat frontend nginx

# Verify
curl -s https://your-domain.com/api/v1/health
```

---

## 12. Monitoring Setup

### View resource usage
```bash
docker stats
```

### Set up basic monitoring with UptimeRobot (free tier)
1. Go to https://uptimerobot.com
2. Create a monitor for: `https://your-domain.com/api/v1/health`
3. Set check interval: 5 minutes
4. Add email/Slack alert contacts

### Application Logs
```bash
# Backend
docker compose logs -f backend --tail=100

# Worker
docker compose logs -f worker --tail=100

# Nginx access log
docker compose exec nginx tail -f /var/log/nginx/access.log
```

### Log rotation
Logs are configured with Docker's `json-file` driver:
- Max size: 100 MB per file
- Max files: 10 per service

---

## 13. Backup Configuration

Backups run automatically at 02:00 UTC via cron (set up by `setup_production.sh`).

### Manual backup
```bash
./infrastructure/scripts/backup.sh
```

### Restore from backup
```bash
./infrastructure/scripts/restore.sh /opt/suntax/backups/suntax_db_20260101_020000.sql.gz
```

### Configure remote backup storage (optional)
Set in `.env`:
```bash
BACKUP_S3_BUCKET=your-s3-bucket
# AWS credentials or MinIO endpoint in your shell
```

---

## 14. SSL Certificate Renewal

Let's Encrypt certificates expire every 90 days. Certbot's systemd timer handles renewal automatically. To manually renew:

```bash
certbot renew
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart nginx
```

---

## 15. Rollback

If a deployment breaks production:

```bash
cd /opt/suntax

# Roll back to previous git commit
git log --oneline -5
git checkout <previous-commit-hash>

# Restart with previous code
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  up -d --build backend worker beat frontend
```

Or roll back the database:
```bash
# Roll back one migration
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm --no-deps backend alembic downgrade -1
```

---

## Troubleshooting

### Container won't start
```bash
docker compose logs <service>
```

### Database connection refused
```bash
docker compose exec postgres pg_isready -U suntax -d suntax
```

### Out of disk space
```bash
df -h
docker system prune -f
docker image prune -f --filter "until=48h"
```

### Certificate not renewing
```bash
certbot renew --dry-run --verbose
# Check /var/log/letsencrypt/letsencrypt.log
```

# PSHA School Portal — Production Deployment Notes

## Prerequisites

- Node.js 18+
- MySQL 8.0+
- Reverse proxy with TLS (Nginx or Caddy recommended)
- Optional: Redis for session store (multi-instance)

## 1. Server setup

```bash
# Create app user and directory
sudo useradd -r -m -d /opt/psha psha
sudo mkdir -p /opt/psha/app /opt/psha/uploads /opt/psha/logs
```

## 2. Application

```bash
cd /opt/psha/app
# Extract release zip here
cp .env.example .env
# Edit .env — set NODE_ENV=production, strong secrets, DB credentials
npm ci --omit=dev
npm run migrate
npm run seed   # first deploy only; change all default passwords immediately
```

## 3. Environment checklist

| Variable | Production requirement |
|----------|------------------------|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | ≥ 64 random characters |
| `COOKIE_SECURE` | `true` (HTTPS only) |
| `COOKIE_SAME_SITE` | `strict` or `lax` |
| `DATABASE_*` | Dedicated DB user with least privilege |
| `BIOMETRIC_API_KEY` | Strong secret shared only with devices |
| `BASE_URL` | Public HTTPS URL |

## 4. Process manager

Example with systemd:

```ini
[Unit]
Description=PSHA School Portal
After=network.target mysql.service

[Service]
Type=simple
User=psha
WorkingDirectory=/opt/psha/app
EnvironmentFile=/opt/psha/app/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 5. Nginx (TLS termination)

```nginx
server {
  listen 443 ssl http2;
  server_name portal.psha.edu.ng;

  # ssl_certificate ...;
  # ssl_certificate_key ...;

  client_max_body_size 6m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-Id $request_id;
  }
}
```

App has `trust proxy` enabled so rate limits and audit IPs use the real client address.

## 6. Session store (multi-instance)

Default MemoryStore is **not** suitable for multiple Node processes.  
Integrate `express-mysql-session` or `connect-redis` before horizontal scaling.

## 7. Backups

- Daily MySQL dumps of `psha_portal`
- Backup `public/uploads` (admission documents)
- Store secrets and backups offline / encrypted

## 8. Post-deploy security

1. Log in as admin → change password immediately  
2. Disable or rotate all seed account passwords  
3. Visit `/admin/security` and resolve any failing checks  
4. Register real biometric devices; set `BIOMETRIC_API_KEY`  
5. Restrict MySQL to localhost or private network only  

## 9. Health check

```bash
curl -s https://portal.psha.edu.ng/health
```

Expect JSON with `"status":"ok"` when the database is reachable.

## 10. Updates

```bash
# Deploy new release beside current, migrate, switch symlink, restart
npm ci --omit=dev
npm run migrate
sudo systemctl restart psha
```

Never run seed on an existing production database unless intentionally resetting demo data.

# Deploy PSHA School Portal on any platform

This app is a standard **Node.js 18+ Express** process. It runs the same way on VPS, Docker, Railway, Render, Fly.io, Heroku-style PaaS, or (with limits) Vercel serverless.

## Required environment variables

| Variable | Required | Notes |
|----------|----------|--------|
| `SESSION_SECRET` | **Yes** | ≥ 16 characters (use 32–64 random) |
| `DATABASE_HOST` | **Yes** | MySQL host |
| `DATABASE_PORT` | No | Default `3306` |
| `DATABASE_NAME` | **Yes** | Database name |
| `DATABASE_USER` | **Yes** | MySQL user |
| `DATABASE_PASSWORD` | **Yes** | MySQL password |
| `NODE_ENV` | Recommended | `production` |
| `PORT` | Auto | Platforms inject this; default `3000` |
| `HOST` | No | Default `0.0.0.0` (bind all interfaces) |
| `COOKIE_SECURE` | Production | `true` when using HTTPS |
| `COOKIE_SAME_SITE` | No | `lax` or `strict` |
| `BASE_URL` | Recommended | Public URL e.g. `https://portal.example.com` |
| `RUN_MIGRATIONS_ON_BOOT` | No | Default on for `server.js`; set `false` on serverless |
| `AUTO_SEED` | No | Seed when `users` is empty (`true` / `false`) |
| `BIOMETRIC_API_KEY` | Optional | Device API |

Copy from `.env.example` and fill real values. **Never commit `.env`.**

## Database (any host)

MySQL **8.0+** (or compatible: PlanetScale, Aiven, Railway MySQL, RDS, etc.).

```bash
# From your machine or CI, against the remote DB:
export DATABASE_HOST=... DATABASE_USER=... DATABASE_PASSWORD=... DATABASE_NAME=...
npm run migrate
npm run seed   # first time only
```

Or let `server.js` auto-migrate on boot (`RUN_MIGRATIONS_ON_BOOT` not `false`).

---

## Option A — Docker (works everywhere)

```bash
docker compose up -d --build
# App: http://localhost:3000
```

Or build/run alone (external MySQL):

```bash
docker build -t psha-portal .
docker run -p 3000:3000 --env-file .env psha-portal
```

Deploy the same image to: Railway, Render, Fly.io, AWS ECS, Google Cloud Run, DigitalOcean App Platform, any Kubernetes cluster.

---

## Option B — Railway / Render / Fly.io / Heroku-style

1. Connect the Git repo.
2. **Start command:** `node server.js` (or leave default — `Procfile` / `npm start`).
3. Add all env vars from the table above.
4. Attach a MySQL plugin **or** point `DATABASE_*` at an external MySQL.
5. Deploy.

```bash
npm start
# equivalent: node server.js
```

Health check path: **`/health`**

---

## Option C — Traditional VPS (Ubuntu + Nginx)

```bash
# On server
git clone <your-repo> /opt/psha && cd /opt/psha
cp .env.example .env   # edit secrets + DATABASE_*
npm ci --omit=dev
npm run migrate && npm run seed

# systemd (see PRODUCTION.md) or:
npm start
```

Put Nginx in front with TLS; proxy to `http://127.0.0.1:3000`.

---

## Option D — Vercel (serverless — limited)

Files included: `api/index.js` + `vercel.json`.

1. Import repo in Vercel.
2. Set env vars (same table). Use an **external** MySQL (not localhost).
3. Run migrate/seed **once** against that DB from your laptop.
4. Deploy.

**Limits:** in-memory sessions do not stick across serverless instances; uploads are ephemeral. Prefer Docker/VPS for production school use.

---

## Option E — Local development

```bash
cp .env.example .env
npm install
npm run migrate && npm run seed
npm run dev
```

Or full stack: `docker compose up --build`

---

## After deploy — verify

```bash
curl -s https://YOUR_DOMAIN/health
# expect: {"status":"ok", ...}

# Login
# https://YOUR_DOMAIN/auth/login
# admin@psha.edu.ng  (password from seed output)
```

---

## Platform recommendation

| Goal | Best fit |
|------|----------|
| Production school portal | **Railway / Render / Docker VPS** |
| Quick demo | Docker Compose or Railway |
| Serverless only | Vercel (with external MySQL; expect session quirks) |

The app code is the same everywhere: **`node server.js`** (long-running) or **`api/index.js`** (serverless export).

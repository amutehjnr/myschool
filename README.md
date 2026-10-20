# Precious Star Heritage Academy — School Management Portal

Production-oriented **Advanced School Management Portal** for Precious Star Heritage Academy (PSHA).

**Stack:** Node.js · Express · EJS · MySQL (mysql2) · Argon2id · server-side sessions · Helmet · CSRF · RBAC

---

## Features (Phases 1–15)

| Area | Capabilities |
|------|----------------|
| **Auth & security** | Argon2id, sessions, CSRF, Helmet, rate limits, audit log, security checklist |
| **Admin** | Users, roles, teachers, students, admissions review, fees, results, attendance, announcements, events |
| **Teachers** | Classes/subjects, assignments, assessments, score entry, result generation, class attendance, own biometric history |
| **Students** | Dashboard, attendance, published results, fees |
| **Parents** | Child selector, attendance, results, fees (object-level isolation) |
| **Admissions** | Public apply flow, document uploads, status tracking, admin approve/reject |
| **Fees** | Definitions, assign bills, record payments, printable receipts |
| **Results** | Weighted calculation, grading, submit → approve → publish, report cards |
| **Biometric** | Device registry, idempotent event API, teacher attendance processing |
| **Public site** | Home, about, admissions, gallery, contact form |
| **Communications** | Announcements (audience targeting), notifications, events |

---

## Quick start

### Requirements

- Node.js **≥ 18**
- MySQL **8.0+**

### 1. Database

```sql
CREATE DATABASE psha_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'psha_user'@'localhost' IDENTIFIED BY 'change_me_strong_password';
GRANT ALL ON psha_portal.* TO 'psha_user'@'localhost';
FLUSH PRIVILEGES;
```

### 2. Install

```bash
cd psha-school-portal
cp .env.example .env
# Edit .env — set SESSION_SECRET (≥ 16 chars) and database credentials

npm install
npm run migrate
npm run seed
npm run dev
```

Open **http://localhost:3000**

### 3. Seeded accounts (change after first login)

| Role | Email | Password |
|------|--------|----------|
| Administrator | `admin@psha.edu.ng` | `Admin@PSHA2025!` (must change on first login) |
| Teacher | `adebayo.okafor@psha.edu.ng` | `Password@123` |
| Student | `stu-2025-001@student.psha.edu.ng` | `Password@123` |
| Parent | `parent.nwosu@example.com` | `Password@123` |

---

## Project structure

```
psha-school-portal/
├── app.js                 # Express app, middleware order
├── server.js              # HTTP server, boot checks
├── config/                # database, session, security, env
├── controllers/
├── services/
├── repositories/
├── routes/                # public, auth, admin, teacher, student, parent, admissions, API
├── middleware/            # auth, rbac, csrf, rateLimiter, upload, deviceAuth
├── validators/
├── views/                 # EJS (public + role portals)
├── public/                # css, js, uploads
├── database/
│   ├── migrations/        # 001–006 SQL
│   ├── seeders/
│   ├── migrate.js
│   └── seed.js
├── utils/
├── tests/
├── PRODUCTION.md          # Deployment guide
└── package.json
```

---

## Key URLs

| URL | Description |
|-----|-------------|
| `/` | Public home |
| `/admissions` | Admissions info |
| `/admissions/apply` | Online application |
| `/admissions/status` | Track application |
| `/auth/login` | Portal login |
| `/auth/register` | Parent self-registration |
| `/admin/dashboard` | Admin home |
| `/admin/audit` | Audit log |
| `/admin/security` | Security checklist |
| `/api/attendance/events` | Biometric ingest (API key) |
| `/health` | Health check (JSON) |

---

## Biometric device API

```bash
curl -X POST http://localhost:3000/api/attendance/events \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: $BIOMETRIC_API_KEY" \
  -d '{
    "device_code": "GATE-01",
    "staff_id": "TCH-001",
    "event_type": "check_in",
    "event_timestamp": "2026-10-05 07:50:00"
  }'
```

Idempotent via `idempotency_key` or auto hash of device + staff + type + timestamp.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development (nodemon) |
| `npm start` | Production process |
| `npm run migrate` | Run SQL migrations |
| `npm run seed` | Seed roles, admin, sample data |
| `npm test` | Unit tests (if present) |

---

## Security model (summary)

- **Passwords:** Argon2id; forced change when `must_change_password`
- **Sessions:** httpOnly, SameSite, regeneration after login
- **CSRF:** All browser POST forms
- **RBAC:** administrator · teacher · student · parent
- **Object-level:** parents only linked children; teachers only assigned classes/subjects
- **Uploads:** type/size limits, randomised filenames
- **Audit:** sensitive actions logged with IP and metadata
- **Boot:** refuses to start without `SESSION_SECRET`

See `PRODUCTION.md` for deployment hardening.

---

## Development phases completed

1. Project foundation & security baseline  
2. Database schema, migrations, seeds  
3. Authentication & session management  
4. Admin foundation (users, roles, dashboard)  
5. Teacher management & teacher portal  
6. Students, parents, object-level access  
7. Online admissions  
8. Academics (assignments, assessments, scores)  
9. Results & report cards  
10. Fees & payments  
11. Communications & events  
12. Biometric attendance  
13. Public website  
14. Audit UI & security checklist  
15. Final packaging  

---

## License

UNLICENSED — proprietary for Precious Star Heritage Academy / project stakeholders.

---

## Deploy on any platform

See **[DEPLOY.md](./DEPLOY.md)** for Docker, Railway, Render, VPS, Vercel, and environment variables.

## Support

For deployment issues, verify:

1. MySQL is running and credentials in `.env` match  
2. `npm run migrate` completed without errors  
3. `SESSION_SECRET` is set  
4. `/health` returns `"status":"ok"`  

# Multi Meter Management Portal

**Live URL:** https://consumer.enertsol.com
**Local dev:** http://localhost:3002

---

## Overview

A standalone customer-facing portal for managing electricity meter enrollments and cancellations. Customers log in, select meters, and submit add/cancel requests. All activity is logged and notifications are emailed to the admin.

Migrated from legacy PHP (XAMPP) to Next.js + FastAPI to match the main AmeriPower stack.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 |
| Backend | FastAPI (shared with main AmeriPower API) |
| Database | MySQL — `consumer` database |
| Auth | JWT (HS256), same secret as main app |
| Email | Python smtplib → Hostinger SMTP → amit@enertsol.com |

---

## Roles

| Role | Value | Access |
|---|---|---|
| Admin | 1 | Full access — manage users, upload data, view logs |
| Customer | 2 | Portal access — add/cancel meters only |

---

## Pages

### Customer
| Route | Description |
|---|---|
| `/login` | Login page |
| `/dashboard` | Choose Add or Cancel meters |
| `/meters/add` | Select meters to enroll |
| `/meters/cancel` | Select meters to cancel |
| `/meters/confirm` | Review selection, enter contact details, submit |
| `/meters/add-location` | Add a new ESI ID / service address |

### Admin
| Route | Description |
|---|---|
| `/admin` | Dashboard with stats |
| `/admin/users` | Create, edit, activate/deactivate users |
| `/admin/upload` | Upload Excel file to replace customer meters |
| `/admin/logs` | View all add/cancel request history |

---

## API Routes

All routes under `/api/consumer/` (FastAPI, port 8002 on VPS).

| Method | Route | Description |
|---|---|---|
| POST | `/consumer/auth/login` | Login |
| GET | `/consumer/auth/me` | Current user |
| GET | `/consumer/admin/users` | List all users |
| POST | `/consumer/admin/users` | Create user |
| PUT | `/consumer/admin/users/{uid}` | Edit user |
| PATCH | `/consumer/admin/users/{uid}/status` | Toggle active/inactive |
| POST | `/consumer/admin/upload` | Upload Excel (replaces meters) |
| GET | `/consumer/admin/logs` | All activity logs |
| GET | `/consumer/meters` | Customer's meters |
| POST | `/consumer/meters/esiid` | Add new ESI ID location |
| POST | `/consumer/meters/request` | Submit add/cancel request |

---

## Database Tables (MySQL: `consumer`)

| Table | Description |
|---|---|
| `users` | Login accounts (role 1=admin, 2=customer) |
| `user_information` | ESI IDs / meter locations per customer |
| `user_log_add_meter` | Audit trail for new ESI additions |

### Meter Status Codes
| Code | Meaning |
|---|---|
| 0 | Pending (uploaded, not yet requested) |
| 1 | Add Requested |
| 2 | Cancel Requested |
| 3 | Failed |
| 4 | Archived (hidden from portal) |

---

## Excel Upload Format

Columns A–E, row 1 = headers (skipped), data from row 2:

| A | B | C | D | E |
|---|---|---|---|---|
| ESI ID | Service Address | Unit Number | City | ZIP Code |

Upload replaces **all** existing meter data for the selected customer.

---

## Email Notifications

All emails go to `amit@enertsol.com` (configured via `CONSUMER_NOTIFY_EMAIL` in `.env`).

Triggers:
- Meter add/cancel request submitted
- New ESI ID location added
- New user account created

---

## Environment Variables

Add to `/var/www/energyapp/api/.env`:

```
CONSUMER_DB_NAME=consumer
CONSUMER_NOTIFY_EMAIL=amit@enertsol.com
```

---

## Local Development

```bash
# Start backend (from /api)
uvicorn main:app --port 8001 --reload

# Start consumer frontend (from /consumer)
npm run dev     # runs on port 3002
```

---

## Deployment

```bash
# On VPS after git pull
cd /var/www/energyapp/consumer
API_PORT=8002 npm run build
pm2 restart energyapp-consumer
pm2 restart energyapp-api
```

---

## Default Admin Credentials

| Field | Value |
|---|---|
| Username | `admin` |
| Default password | `Portal@2024` |

Change after first login via Admin → Users → edit the admin row.

---

## File Locations (VPS)

- App: `/var/www/energyapp/consumer`
- Nginx: `/etc/nginx/sites-available/consumer`
- API routes: `/var/www/energyapp/api/routers/consumer.py`
- API logic: `/var/www/energyapp/api/controllers/consumer.py`
- DB connection: `/var/www/energyapp/api/utils/consumer_database.py`

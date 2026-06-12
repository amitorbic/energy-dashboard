# Orbic Broker Portal

**URL:** https://broker.enertsol.com  
**Stack:** Next.js 16 (Pages Router) + FastAPI (Python)  
**Migrated from:** PHP (Orbic legacy portal, ~100 files)

---

## Architecture

```
Browser
  └─▶ nginx (broker.enertsol.com:443)
        └─▶ Next.js (localhost:3003)
              ├─▶ Static pages / SSR
              └─▶ /api/* rewrite ─▶ FastAPI (localhost:8002)
                                          └─▶ MySQL (energyapp DB)
```

### Frontend
- **Path:** `/var/www/energyapp/broker/`
- **Framework:** Next.js 16, Pages Router, TypeScript, Tailwind CSS v4
- **Port:** 3003
- **API utility:** `broker/utils/api.ts` — baseURL = `/api/broker`
  - All calls use paths WITHOUT `/broker/` prefix (e.g. `api.get("/home/portfolio")`)
  - Forms pages use `process.env.NEXT_PUBLIC_API_URL` directly with `/broker/` in the path

### Backend
- **Path:** `/var/www/energyapp/api/`
- **Framework:** FastAPI + SQLAlchemy async (aiomysql)
- **Port:** 8002 (uvicorn via PM2 `energyapp-api`)
- **Broker routes prefix:** `/api/broker/`

### Database
- **Name:** `energyapp`
- **Key tables:**
  - `contract_user` — broker user accounts (auth)
  - `broker_new` — broker business info (commission, pricing email)
  - `contract_renewal` — active customer accounts per broker
  - `renewal_offer` — pipeline accounts (priced, not yet active) *(table may need creation)*
  - `ercot_data` / `day_ahead_data` — market pricing data

---

## Authentication

- **Table:** `contract_user` only — completely separate from main app users
- **Password hashing:** MD5 (`hashlib.md5(password.encode()).hexdigest()`)
- **Plaintext stored in:** `md5_decode` column
- **JWT claims:** `user_id`, `username`, `role`, `email`, `broker_id`, `has_commission`
- **Storage:** `broker_token` + `broker_user` in localStorage
- **Admin role:** `role = '1'` — unlocks broker selector, user management, contract log, etc.

**Login credentials (live):**
- Username: `Admin`
- Password: `Amit@2025`
- Email: `amit@enertsol.in`

**Check/reset password:**
```sql
-- View users
SELECT name, email, md5_decode, role FROM contract_user;

-- Reset password
UPDATE contract_user 
SET password = MD5('NewPassword'), md5_decode = 'NewPassword' 
WHERE name = 'Admin';
```

---

## Pages & Features

### Navigation Structure

| Menu | Page | Route | Admin Only |
|------|------|--------|------------|
| Home | Portfolio Dashboard | `/home` | No |
| Pricing | Daily Pricing | `/pricing` | No |
| Pricing | Active Quotes | `/pricing/active-quotes` | No |
| Renewals | Select Broker | `/renewals` | Yes |
| Renewals | Active Renewals | `/renewals/active` | No |
| Renewals | Price Renewals | `/renewals/price-renewals` | No |
| Renewals | Renewal Offer Upload | `/renewals/offer-upload` | Yes |
| Renewals | Change Company Name | `/renewals/change-company` | Yes |
| Forms | Commercial Contract | `/forms/contract-commercial` | No |
| Forms | Residential Contract | `/forms/contract-residential` | No |
| Forms | Generate LOA | `/forms/loa` | No |
| Forms | Upload LOA | `/forms/loa-upload` | No |
| Forms | ACH Form | `/forms/ach` | No |
| Forms | Credit Card | `/forms/credit-card` | No |
| Forms | Personal Guarantee | `/forms/personal-guarantee` | No |
| Forms | Corporate Guarantee | `/forms/corporate-guarantee` | No |
| Forms | Credit Check | `/forms/credit-check` | No |
| Forms | Account Transfer | `/forms/account-transfer` | No |
| Forms | Cancellation | `/forms/cancellation` | No |
| Forms | Add On Form | `/forms/meter-add` | No |
| Forms | Payment Plan | `/forms/payment-plan` | Yes |
| Bill Sample | Bill Sample | `/bill-sample` | No |
| ESIID Lookup | ESIID Lookup | `/esiid-lookup` | No |
| Profile | View Profile | `/profile` | No |
| Profile | Change Password | `/profile/change-password` | No |
| Profile | Download Commission | `/profile/commission` | No (non-admin, has_commission flag) |
| Profile | Contract Log | `/profile/contract-log` | Yes |
| Profile | Sign Up New User | `/profile/admin/signup` | Yes |
| Profile | Edit User | `/profile/admin/users` | Yes |
| Profile | Upload User | `/profile/admin/upload` | Yes |
| Profile | Forgot Password List | `/profile/admin/forgot-list` | Yes |

### Home Page — Portfolio Dashboard
Replaces the old RTM/DAM market price tables. Shows:
- **Active Companies** — distinct companies in `contract_renewal`
- **Active ESIIDs** — total premise IDs
- **Expiring ≤ 30 days** — companies with contract end date within 30 days (red alert)
- **Expiring ≤ 90 days** — companies expiring within 90 days
- **Pipeline Accounts** — from `renewal_offer` table (deals in pricing, not yet signed)
- **Upcoming Renewals** — top 8 companies sorted by soonest end date
- **Deals in Pipeline** — recent `renewal_offer` entries with Active/Expired status
- **Quick Actions** — shortcut buttons to most-used pages

### Forms (PDF Generation)
All forms generate PDF via **reportlab** on the backend. Forms pages use direct axios to `NEXT_PUBLIC_API_URL` (not the api.ts utility).

| Form | Backend Route |
|------|--------------|
| Commercial Contract | `POST /api/broker/forms/contract-commercial` |
| Residential Contract | `POST /api/broker/forms/contract-residential` |
| LOA (Generate) | `POST /api/broker/forms/loa` |
| LOA Upload | `POST /api/broker/forms/loa-upload` (sends email to TDSP) |
| ACH | `POST /api/broker/forms/ach` |
| Credit Card | `POST /api/broker/forms/credit-card` |
| Personal Guarantee | `POST /api/broker/forms/personal-guarantee` |
| Corporate Guarantee | `POST /api/broker/forms/corporate-guarantee` |
| Credit Check | `POST /api/broker/forms/credit-check` |
| Account Transfer | `POST /api/broker/forms/account-transfer` |
| Cancellation | `POST /api/broker/forms/cancellation` |
| Meter Add-On | `POST /api/broker/forms/meter-add` |
| Payment Plan | `POST /api/broker/forms/payment-plan` |

### Pricing Pages (Stubs)
Daily Pricing, Custom Price, Pricing Dashboard — currently placeholder pages. The original PHP (`daily_quotes.php` — 1738 lines) performs complex DB calculations + Excel generation + email. Not yet implemented.

---

## API Routes

All broker routes are prefixed `/api/broker/`:

```
POST   /api/broker/auth/login
POST   /api/broker/auth/logout
GET    /api/broker/home/portfolio
GET    /api/broker/home/market-data
GET    /api/broker/profile/me
PUT    /api/broker/profile/me
POST   /api/broker/profile/change-password
GET    /api/broker/profile/commission-email
GET    /api/broker/profile/contract-log
GET    /api/broker/profile/admin/users
POST   /api/broker/profile/admin/users
PUT    /api/broker/profile/admin/users/{uid}
DELETE /api/broker/profile/admin/users/{uid}
POST   /api/broker/profile/admin/users/upload
GET    /api/broker/profile/admin/forgot-list
DELETE /api/broker/profile/admin/forgot-list/{uid}
POST   /api/broker/profile/admin/signup
GET    /api/broker/renewals/brokers
GET    /api/broker/renewals/active
POST   /api/broker/renewals/change-company
POST   /api/broker/renewals/offer-upload
GET    /api/broker/esiid/lookup
GET    /api/broker/bill/sample
POST   /api/broker/forms/*  (13 form endpoints)
```

---

## Environment Variables

### Frontend — `/var/www/energyapp/broker/.env.local`
```env
NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_COMMISSION_BASE_URL=http://ameripowerpricing.com/
API_PORT=8002
```
> **Note:** `NEXT_PUBLIC_*` vars are baked in at build time. `API_PORT` sets the rewrite destination — change requires a rebuild.

### Backend — `/var/www/energyapp/api/.env`
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=<password>
DB_NAME=energyapp
DB_PORT=3306
SECRET_KEY=<jwt-secret>
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=info@enertsol.com
SMTP_PASS=<password>
SMTP_FROM=Pricing <info@enertsol.com>
COMMISSION_BASE_URL=http://ameripowerpricing.com/
BROKER_PORTAL_PORT=3003
TDSP_EMAIL_ONCOR=
TDSP_EMAIL_CENTERPOINT=
TDSP_EMAIL_AEP=
TDSP_EMAIL_TNMP=
```
> **TDSP emails** are required for LOA upload functionality — fill these in when known.

---

## Pending / Known Issues

1. **Pricing engine** — `daily_quotes.php` (1738 lines), `custom_price.php` — stubs only, not yet implemented
2. **Renewal Offer Sheet** — `amendment_form.php` equivalent not built; `/renewals/offer-redirect` loops back to active as fallback
3. **TDSP email addresses** — `TDSP_EMAIL_*` in `api/.env` are empty (needed for LOA upload emails)
4. **`renewal_offer` table** — may not exist in DB; pipeline dashboard handles gracefully (shows 0)

---

## Local Development

```bash
# Backend (FastAPI)
cd api
uvicorn main:app --reload --port 8001

# Frontend (Next.js)
cd broker
npm run dev   # runs on port 3003
```

Local `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8001/api
API_PORT=8001
```

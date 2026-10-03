# Tenant Onboarding Runbook

How to actually bring a new REP tenant online today, in order. This is the
ground-truth checklist — cross-referenced against what `api/scripts/provision_tenant.py`
actually does (not what earlier docs claimed it does; see the correction note
in `MULTI_TENANT.md`'s "Phase 2" section, 2026-09-22).

**Automated by the script:** steps 1–3.
**Manual, no tooling exists yet:** steps 4–8.

---

## 1. Confirm the source DB is actually complete

`provision_tenant.py` clones whatever schema the DB in `DB_NAME` (api/.env)
currently has — it does not run migration files. As of this script version,
step 2/6 of the run itself checks this automatically and **will refuse to
proceed** if any table/column from `api/migrations/` is missing from that
source DB. If it fails here, stop and fix the source DB first:

```bash
cd api
python scripts/provision_tenant.py --company "..." --subdomain "..." --modules "..."
# ERROR: Source DB `u972964962_orbic` looks incomplete relative to api/migrations/ ...
```

Cross-check the reported missing migration(s) against `docs/DB_MIGRATIONS.md`'s
"Pending" table, run them against the source DB by hand (see that doc's "How
to apply a migration" section), then retry.

As of 2026-09-22, running this check against the local dev DB found
migrations **032, 033, and 039 missing** — not merely "unverified" as
`docs/DB_MIGRATIONS.md` previously assumed. Confirm those (or whatever the
check currently reports) are resolved before provisioning a Portfolio/forecasting
pilot customer specifically, since 032/033 are ERCOT DAM/RTM settlement price
tables that forecasting depends on.

## 2. Decide the tenant's module entitlements *before* running the script

Know which of `sales`, `operations`, `portfolio`, `audit` this customer
actually purchased. Don't guess or default to "all" out of convenience.

## 3. Run the provisioning script

```bash
cd api
python scripts/provision_tenant.py --company "Acme Energy" --subdomain acme --modules portfolio
```

This does, fully automated:
1. Pre-flight checks (subdomain/db_name conflicts, orphaned DB from a prior failed run)
2. Source-DB migration completeness check (step 1 above)
3. `CREATE DATABASE`
4. Clone schema (structure only, zero data) from the source DB
5. Insert one bootstrap admin user (temp password printed once — not stored anywhere else)
6. Register the tenant in `orbic_master.reps` (the commit point — if anything above fails, the new DB is dropped, no orphan left behind)
7. Write a filled-in `.env` template to `api/provisioned_envs/<subdomain>.env`

If you didn't pass `--modules`, the script prints a loud warning and the
generated `.env` leaves `TENANT_MODULES` commented out — **meaning every
module is enabled for that tenant** until someone fixes it. Don't let this
slip through to a real deployment for a partial-module customer.

Total time for this step: well under a minute (DB creation + schema clone
only — no data is copied).

## 4. Review and complete the generated `.env`

Open `api/provisioned_envs/<subdomain>.env`. It is pre-filled with DB
credentials, a fresh `SECRET_KEY`, `TENANT_REP_ID`/`TENANT_COMPANY_NAME`, and
`TENANT_MODULES` (if you passed `--modules`). Everything else is a `TODO`
placeholder that must be filled in by hand — the script has no way to know
these:

```env
TENANT_WEBSITE=              # TODO: real website
TENANT_ADDRESS=              # TODO: real business address
TENANT_PHONE=                # TODO: real phone number
TENANT_EMAIL_DEFAULT=        # TODO: required — outbound email hard-fails without this
TENANT_EMAIL_COMMISSION=     # optional
TENANT_EMAIL_PRICING=        # optional
TENANT_EMAIL_OPERATIONS=     # optional
CONSUMER_NOTIFY_EMAIL=       # TODO
```

`TENANT_EMAIL_DEFAULT` is not optional in practice — `get_tenant_email()`
(`api/utils/email_routing.py`) raises at send time if neither it nor a
purpose-specific override is set, so leaving it blank means this tenant's
outbound email is broken until it's filled in.

**Re-check `TENANT_MODULES` here even if you passed `--modules`.** This is
the single highest-risk field in the whole file — a blank or wrong value
silently grants (or denies) product access with no error anywhere in the
app. Valid values: `sales`, `operations`, `portfolio`, `audit`
(comma-separated), or `enterprise` for all. See
`api/utils/tenant_module_config.py` for the exact parsing rules.

Copy this file to wherever the new tenant's app process will actually read
its `.env` from — it is not deployed automatically.

## 5. Stand up a new app process on its own port

No tooling exists for this (no ecosystem-config generator, no per-tenant pm2
template checked into the repo). Manually:
- Pick an unused port
- Point that process's working copy at the `.env` from step 4
- Start it under whatever process manager this environment already uses
  (see `docs/AMERIPOWER_RISK_PORTFOLIO_MD.md` for the existing `pm2 start ...`
  patterns used for the backend/monitoring processes as a reference — there
  is no established per-tenant frontend process pattern to copy from)

Confirm separately whether the Next.js frontend can be shared across tenants
via the relative `/api/` proxy (see `MULTI_TENANT.md` Stage 2) or needs its
own process per tenant — this has not been established in this codebase and
should be verified before assuming either way.

## 6. Configure Nginx

Manually add a `server` block routing the new subdomain to the new port.
Nothing in the repo generates this — despite earlier (incorrect) documentation
claiming otherwise, `provision_tenant.py` does not output an Nginx config
block. Reload Nginx after.

## 7. Configure DNS

Point the new subdomain at the server. Nothing in this repo touches DNS in
any way — this is entirely outside the codebase's scope today.

## 8. First login and handoff

- Log in as the bootstrap admin (email/temp password printed by the script
  at the end of step 3) and change the password immediately
- Update the admin email to the real address
- Ingest the tenant's market reference data and business data (separate,
  not-yet-built step — see `provision_tenant.py`'s own "NEXT STEPS" output)

---

## Realistic time estimate

Steps 1–3 (the script itself): **minutes**, assuming the source DB already
passes its own completeness check.

Steps 4–8 (everything the script doesn't touch — `.env` completion, app
process, Nginx, DNS, admin handoff, data ingest): **hours**, done by hand,
today. There is no single-command path from "customer signed" to "tenant is
live" — treat this runbook as the actual current process, not the script
alone.

## Known gaps this runbook doesn't close

- No automation for app-process/port assignment, Nginx, or DNS (steps 5–7)
- No confirmation either way on shared-vs-per-tenant frontend process (step 5)
- The migration completeness check (step 1) is a structural best-effort
  parse of `api/migrations/*.sql`, not a real migration ledger — it can catch
  a missing table/column but can't tell you *why* a migration wasn't run or
  verify anything about the live VPS DB, only whatever DB is configured via
  `DB_NAME` when you run it

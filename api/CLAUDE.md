# Database migrations

Every schema change is a new numbered file in `api/migrations/` (never edit
an already-numbered one — a fix is a new, later-numbered file). Nothing
runs these automatically; they're written for manual review and run by
hand on the VPS.

Before/after creating a migration, read and update
[`docs/DB_MIGRATIONS.md`](../docs/DB_MIGRATIONS.md) — it tracks which
migrations are applied on live (VPS `/var/www/energyapp/`, db `energyapp`)
vs. only local, and has the exact SSH/`mysql` commands to run one. Add new
migrations to its "Pending" table as soon as you create them. Only move a
row to "Applied to live" once the user explicitly confirms they ran it —
never mark it yourself.

# Database migrations

Any schema change (new table, new/altered column) is a new numbered file
under `api/migrations/` — never edit an already-numbered one. Nothing runs
these automatically; they're reviewed and run by hand over SSH on the VPS.

Before/after creating a migration, read and update
[`docs/DB_MIGRATIONS.md`](docs/DB_MIGRATIONS.md) — it tracks which
migrations are applied on live (VPS `/var/www/energyapp/`, db `energyapp`)
vs. only local, and has the exact SSH/`mysql` commands to run one. Add new
migrations to its "Pending" table as soon as you create them. Only move a
row to "Applied to live" once the user explicitly confirms they ran it —
never mark it yourself.

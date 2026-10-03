module.exports = {
  apps: [
    {
      name: "reference-data-reconcile",
      script: "scripts/sync_reference_data.py",
      args: "--mode reconcile",
      interpreter: "python3",
      cwd: "/var/www/energyapp/api",
      // 2:00 AM CT -- after the 1:00 AM market-prices scrape and clear of
      // the LFC scraper's 7/8 AM always-save window. Catches drift/gaps
      // for every table in SHARED_REFERENCE_TABLES, and is the ONLY sync
      // path for the tables with no live scraper trigger (ercot_load_history,
      // ercot_shape_loadzone, ercot_holidays -- see
      // utils/shared_reference_tables.py).
      cron_restart: "0 2 * * *",
      autorestart: false,
      watch: false,
      env: {
        PYTHONPATH: "/var/www/energyapp/api",
      },
    },
    {
      name: "portfolio-contracts-reconcile",
      script: "scripts/reconcile_portfolio_contracts.py",
      interpreter: "python3",
      cwd: "/var/www/energyapp/api",
      // 2:15 AM CT -- offset 15 min after reference-data-reconcile above so
      // the two don't contend for DB connections at the same instant.
      // Backstop for migration 048's contract_renewal -> portfolio_contracts
      // sync triggers: catches whatever TRUNCATE TABLE contract_renewal
      // (the existing bulk contract upload) leaves orphaned, since TRUNCATE
      // doesn't fire DELETE triggers. No-ops for portfolio-only tenants
      // (is_full_tenant=0) -- see scripts/reconcile_portfolio_contracts.py.
      cron_restart: "15 2 * * *",
      autorestart: false,
      watch: false,
      env: {
        PYTHONPATH: "/var/www/energyapp/api",
      },
    },
  ],
};

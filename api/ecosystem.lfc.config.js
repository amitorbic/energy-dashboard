module.exports = {
  apps: [
    {
      name: "ercot-lfc-scraper",
      script: "scraper_ercot_lfc.py",
      interpreter: "python3",
      cwd: "/var/www/energyapp/api",
      // 7AM/8AM CT = always-save (DAM-critical); 12PM/4PM/8PM/midnight CT =
      // deviation-check runs (scraper_ercot_lfc.py's own hour-based smart-
      // save branch handles these identically to any other non-7/8 hour --
      // no code change needed here, see main()'s save-decision logic).
      cron_restart: "0 0,7,8,12,16,20 * * *",
      autorestart: false,
      watch: false,
      env: {
        PYTHONPATH: "/var/www/energyapp/api",
      },
    },
  ],
};

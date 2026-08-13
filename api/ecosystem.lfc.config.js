module.exports = {
  apps: [
    {
      name: "ercot-lfc-scraper",
      script: "scraper_ercot_lfc.py",
      interpreter: "python3",
      cwd: "/var/www/energyapp/api",
      cron_restart: "0 * * * *",
      autorestart: false,
      watch: false,
      env: {
        PYTHONPATH: "/var/www/energyapp/api",
      },
    },
  ],
};

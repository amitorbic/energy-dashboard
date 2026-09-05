module.exports = {
  apps: [
    {
      name: "ercot-market-prices-scraper",
      script: "scraper_ercot_market_prices.py",
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

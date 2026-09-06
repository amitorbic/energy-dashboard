module.exports = {
  apps: [
    {
      name: "ercot-weather-scraper",
      script: "scraper_ercot_weather.py",
      interpreter: "python3",
      cwd: "/var/www/energyapp/api",
      // Monday 6:00 AM Central (CDT, UTC-5). VPS cron runs in UTC and this
      // does not self-correct for DST the way the hourly scrapers do -- a
      // 1-hour drift twice a year (effectively 5:00 AM CST in winter) is
      // acceptable for this non-deadline weekly job.
      cron_restart: "0 11 * * 1",
      autorestart: false,
      watch: false,
      env: {
        PYTHONPATH: "/var/www/energyapp/api",
      },
    },
  ],
};

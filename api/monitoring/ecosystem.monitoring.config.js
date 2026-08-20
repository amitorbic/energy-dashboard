module.exports = {
  apps: [
    {
      name: "forecast-checkpoints",
      script: "monitoring/checkpoint_runner.py",
      interpreter: "python3",
      cwd: "/var/www/energyapp/api",
      cron_restart: "0 0 * * *",
      autorestart: false,
      watch: false,
    },
  ],
};

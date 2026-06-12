module.exports = {
  apps: [
    {
      name: "broker-portal",
      script: "node_modules/.bin/next",
      args: "start -p 3003",
      cwd: "/root/energyapp/broker",
      env: {
        NODE_ENV: "production",
        API_PORT: "8001",
      },
    },
  ],
};

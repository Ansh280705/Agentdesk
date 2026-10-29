/**
 * PM2 Ecosystem Config — used on the VM for production
 * Start with: pm2 start ecosystem.config.js
 * Update with: pm2 reload ecosystem.config.js
 */
module.exports = {
  apps: [
    {
      name: 'agentdesk-api',
      script: 'npx',
      args: 'ts-node-dev --respawn --transpile-only src/index.ts',
      cwd: './apps/api',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};

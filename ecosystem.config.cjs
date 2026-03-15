module.exports = {
  apps: [{
    name: 'opskrew',
    script: 'dist/runtime.js',
    max_memory_restart: '500M',
    restart_delay: 3000,
    max_restarts: 50,
    min_uptime: '10s',
    kill_timeout: 5000,
    exp_backoff_restart_delay: 100,
    env: {
      NODE_ENV: 'production'
    }
  }]
};

module.exports = {
  apps: [
    {
      name: 'college-twitter',
      script: 'server.js',
      cwd: '/home/ec2-user/projects/college-twitter',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};

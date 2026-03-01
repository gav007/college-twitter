# Deployment

## Server: AWS t2.micro, Amazon Linux 2023

### 1. Install Node.js 20
```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
node -v  # should be v20.x
```

### 2. Install PM2 globally
```bash
sudo npm install -g pm2
```

### 3. Install nginx
```bash
sudo dnf install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 4. Create data directory for SQLite
```bash
mkdir -p /home/ec2-user/data
# The app writes the SQLite DB here. Keep it outside the project folder
# so it survives git pulls and deployments.
```

### 5. Set up the project
```bash
cd /home/ec2-user/projects/college-twitter
npm install
cp .env.example .env
nano .env  # fill in SESSION_SECRET with a long random string
```

### 6. .env file
```
NODE_ENV=production
PORT=3000
SESSION_SECRET=replace_this_with_a_long_random_string_at_least_32_chars
DB_PATH=/home/ec2-user/data/college-twitter.db
```

Generate a good secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 7. PM2 config (`ecosystem.config.js`)
```js
module.exports = {
  apps: [{
    name: 'loopfeed',
    script: 'server.js',
    cwd: '/home/ec2-user/projects/college-twitter',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '400M',
    env_production: {
      NODE_ENV: 'production',
    }
  }]
};
```

Start and enable on reboot:
```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup  # follow the printed command to enable on boot
```

### 8. nginx config
Create `/etc/nginx/conf.d/college-twitter.conf`:

```nginx
server {
    listen 80;
    server_name _;  # replace with your domain or EC2 public IP

    # Serve static files directly (bypass Node)
    location /public/ {
        alias /home/ec2-user/projects/college-twitter/public/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # Everything else goes to Node
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }
}
```

```bash
sudo nginx -t          # test config
sudo systemctl reload nginx
```

### 9. Firewall / Security Groups
In AWS console, ensure your EC2 security group allows:
- Port 22 (SSH) — your IP only
- Port 80 (HTTP) — 0.0.0.0/0
- Port 443 (HTTPS) — 0.0.0.0/0 (when you add SSL)

### 10. (Optional) Free SSL with Let's Encrypt
```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
# certbot auto-renews via a systemd timer
```

After SSL, update your session cookie in `.env` / app.js:
```
# nginx handles SSL, Node sees plain HTTP, so cookie secure: false is correct
# But set the proxy trust:
app.set('trust proxy', 1);
```

## Deployment Workflow (updates)
```bash
cd /home/ec2-user/projects/college-twitter
git pull
npm install           # only if package.json changed
pm2 restart loopfeed
```

## Useful Commands
```bash
pm2 status             # check app is running
pm2 logs loopfeed  # tail logs
pm2 logs loopfeed --lines 100  # last 100 lines
pm2 monit              # live CPU/RAM dashboard

# SQLite quick checks
sqlite3 /home/ec2-user/data/college-twitter.db ".tables"
sqlite3 /home/ec2-user/data/college-twitter.db "SELECT COUNT(*) FROM users;"
```

## Backup SQLite (add to crontab)
```bash
crontab -e
# Add:
0 3 * * * cp /home/ec2-user/data/college-twitter.db /home/ec2-user/data/backups/college-twitter-$(date +\%Y\%m\%d).db 2>/dev/null
```

## Monitoring RAM
On t2.micro with 1GB RAM, watch memory:
```bash
free -m
pm2 monit
```
If Node starts using over 400MB, check for memory leaks. PM2's `max_memory_restart: '400M'` will auto-restart if it exceeds this.

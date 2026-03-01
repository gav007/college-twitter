# Runbook

Commands and procedures to build, run, deploy, and debug College Twitter.

## Local Development

- Install deps:
  - `npm install`
- Create env:
  - `cp .env.example .env`
  - Fill `SESSION_SECRET` (long random string)
- Run dev:
  - `npm run dev` (or `node --watch server.js`)
- Run prod-like:
  - `npm start` (or `node server.js`)

## Smoke Checks

- App responds:
  - `curl -i http://localhost:3000/`
- Explore page:
  - `curl -i http://localhost:3000/explore`

## EC2 Deployment (Amazon Linux 2023)

### One-time Setup

- Install Node 20:
  - `curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -`
  - `sudo dnf install -y nodejs`
- Install PM2:
  - `sudo npm install -g pm2`
- Install nginx:
  - `sudo dnf install -y nginx`
  - `sudo systemctl enable nginx`
  - `sudo systemctl start nginx`
- Create DB dir:
  - `mkdir -p /home/ec2-user/data`

### App Setup

- `cd /home/ec2-user/projects/college-twitter`
- `npm install`
- `cp .env.example .env`
- Set `.env`:
  - `NODE_ENV=production`
  - `PORT=3000`
  - `SESSION_SECRET=...`
  - `DB_PATH=/home/ec2-user/data/college-twitter.db`

Generate a secret:
- `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

### PM2

- Start:
  - `pm2 start ecosystem.config.js --env production`
- Status:
  - `pm2 status`
- Logs:
  - `pm2 logs college-twitter --lines 200`
- Restart:
  - `pm2 restart college-twitter`
- Boot persistence:
  - `pm2 save`
  - `pm2 startup` (run the printed command)

### nginx

- Config file:
  - `/etc/nginx/conf.d/college-twitter.conf`
- Test + reload:
  - `sudo nginx -t`
  - `sudo systemctl reload nginx`
- Service status:
  - `sudo systemctl status nginx`

### DB Inspection

- Tables:
  - `sqlite3 /home/ec2-user/data/college-twitter.db ".tables"`
- Row counts:
  - `sqlite3 /home/ec2-user/data/college-twitter.db "SELECT COUNT(*) FROM users;"`

## Update Workflow

- `cd /home/ec2-user/projects/college-twitter`
- `git pull`
- `npm install` (only if dependencies changed)
- `pm2 restart college-twitter`

## Backups

- Backup script:
  - `/home/ec2-user/projects/college-twitter/scripts/backup_sqlite.sh`
- Manual backup run:
  - `DB_PATH=/home/ec2-user/data/college-twitter.db /home/ec2-user/projects/college-twitter/scripts/backup_sqlite.sh`
- Backup location:
  - `/home/ec2-user/data/backups`
- Retention:
  - Keeps latest 7 backup files.
- Schedule (daily at 03:00):
  - `0 3 * * * DB_PATH=/home/ec2-user/data/college-twitter.db /home/ec2-user/projects/college-twitter/scripts/backup_sqlite.sh >> /home/ec2-user/data/backups/backup.log 2>&1`

## Restore Drill

1. Pick latest backup:
   - `LATEST=$(ls -1t /home/ec2-user/data/backups/college-twitter-*.db | head -1)`
2. Restore to test file:
   - `cp "$LATEST" /tmp/college-twitter-restore.db`
3. Verify schema and rows:
   - `sqlite3 /tmp/college-twitter-restore.db ".tables"`
   - `sqlite3 /tmp/college-twitter-restore.db "SELECT COUNT(*) FROM users;"`
4. Verify app boot against restored DB:
   - `DB_PATH=/tmp/college-twitter-restore.db NODE_ENV=production node -e "require('./config/db'); console.log('restore-db-ok')"`

# Release Process (Binding Spec)

## Purpose
Define a safe, repeatable deployment workflow for Loopfeed changes.

## Pre-Deploy Checks (Required)
- Working tree is clean or intentionally scoped.
- `npm test` (or project verification script) passes.
- `pm2 status` shows app online before release.
- `sudo nginx -t` passes.
- Backup exists for current day or a manual backup is created.

## Deploy Sequence (Required)
1. `cd /home/ec2-user/projects/college-twitter`
2. `git pull`
3. `npm install` (only if `package.json` changed)
4. `pm2 restart loopfeed`
5. `sudo nginx -t && sudo systemctl reload nginx`
6. Smoke test:
   - `curl -I https://loopfeed.duckdns.org/login`
   - Register/login/post flow check

## Post-Deploy Validation (Required)
- `pm2 status` shows `loopfeed` online.
- `sudo systemctl status nginx --no-pager` is active.
- HTTPS endpoint returns expected status.
- No new critical errors in:
  - `pm2 logs loopfeed --lines 100 --nostream`
  - `/var/log/nginx/error.log`

## Rollback (Required)
If deployment fails:
1. Identify last known-good commit SHA.
2. `git checkout <good-sha>`
3. `npm install` (if lockfile/package changed between SHAs)
4. `pm2 restart loopfeed`
5. `sudo nginx -t && sudo systemctl reload nginx`
6. Re-run smoke checks.

## Emergency Rollback Note
For critical outage, restore app availability first (rollback), then debug on a separate branch.

## Definition of Done
- [ ] Every deploy follows this file exactly.
- [ ] Rollback procedure has been tested at least once.

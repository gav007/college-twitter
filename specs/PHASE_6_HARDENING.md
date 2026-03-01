# Phase 6 - Hardening and Reliability (Binding Spec)

## Objective
Move the live MVP from "working" to "operationally safe" by adding baseline web security controls, abuse protection, and recovery hygiene.

## Scope
This phase is mandatory before adding major new product features.

## Current Baseline (March 1, 2026)
- Domain live: `https://loopfeed.duckdns.org`
- HTTP redirects to HTTPS: yes
- Certificate installed and valid: yes (`loopfeed.duckdns.org`, expires `2026-05-30`)
- nginx active: yes
- pm2 app online: yes
- certbot renewal timer: currently disabled (must be fixed in this phase)

### Baseline Verification Outputs
```text
$ sudo systemctl status nginx --no-pager
Active: active (running)

$ pm2 status
loopfeed ... status online

$ sudo certbot certificates
Domains: loopfeed.duckdns.org
Expiry Date: 2026-05-30 10:30:27+00:00 (VALID: 89 days)

$ systemctl status certbot-renew.timer --no-pager
Loaded: ... disabled
Active: inactive (dead)

$ curl -I https://loopfeed.duckdns.org/login
HTTP/1.1 200 OK
```

## Required Changes

### 1. Session and Proxy Correctness

#### Requirements
- Set `app.set('trust proxy', 1)` in production.
- Session cookie must be:
  - `httpOnly: true`
  - `secure: true` in production
  - `sameSite: 'lax'`
  - `maxAge: 30 days`
- Session name remains `ct_session`.

#### Files
- `app.js`

#### Verify
- `curl -s -D - https://<domain>/login -o /dev/null`
- Response must include `Set-Cookie` with `Secure; HttpOnly; SameSite=Lax` after login/register.

### 2. CSRF Protection

#### Requirements
- Protect all state-changing POST routes:
  - `/register`
  - `/login`
  - `/logout`
  - `/tweets`
  - `/tweets/:id/delete`
  - `/tweets/:id/like`
  - `/users/:username/follow`
- Use synchronizer token pattern (server-generated token stored in session and validated on POST).
- Include CSRF token hidden fields in all HTML forms.
- For fetch-based like endpoint, send CSRF token header and validate server-side.

#### Files
- `app.js`
- `middleware/csrf.js` (new)
- `public/js/app.js`
- all form views under `views/`

#### Verify
- POST without valid token returns `403`.
- Normal browser form submissions continue to work.

### 3. Rate Limiting

#### Requirements
- Apply route-level limits:
  - Auth endpoints (`/login`, `/register`): strict
  - Write endpoints (`/tweets`, follow, like, delete): moderate
  - Read endpoints: no hard limit for now
- Use IP-based limiter with short and long windows.

#### Files
- `app.js`
- `middleware/rateLimit.js` (new)

#### Verify
- Repeated failed login attempts eventually return `429`.
- Normal usage remains unaffected.

### 4. Security Headers

#### Requirements
- Add baseline headers (via Helmet or equivalent):
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Referrer-Policy`
  - basic CSP suitable for current app
- Disable `X-Powered-By`.
- Add HSTS on HTTPS responses in nginx.

#### Files
- `app.js`
- `/etc/nginx/conf.d/college-twitter.conf`

#### Verify
- `curl -s -D - https://<domain>/login -o /dev/null`
- Headers above must be present.

### 5. TLS Renewal Automation

#### Requirements
- Ensure certbot renewal scheduler is enabled.
- Ensure renewal reloads nginx on success.

#### Files
- systemd timer/service (OS-level)

#### Verify
- `systemctl status certbot-renew.timer --no-pager`
- `sudo certbot renew --dry-run`

### 6. Backups and Restore Drill

#### Requirements
- Create daily SQLite backup job to `/home/ec2-user/data/backups/`.
- Keep at least 7 rolling backups.
- Run and document one restore drill.

#### Files
- cron or systemd timer entry
- `RUNBOOK.md` update with backup/restore steps

#### Verify
- Backup file appears daily.
- Manual restore test starts app successfully with restored DB.

## Non-Goals
- Full observability platform.
- WAF/CDN setup.
- Multi-region failover.

## Definition of Done
- [ ] Secure cookie behavior verified in production.
- [ ] CSRF validation active on all state-changing routes.
- [ ] Auth and write route rate limiting active.
- [ ] Security headers present on HTTPS responses.
- [ ] Cert renewal automation enabled and dry-run passes.
- [ ] Daily backups enabled and one restore drill documented.

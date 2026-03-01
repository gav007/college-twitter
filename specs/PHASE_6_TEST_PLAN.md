# Phase 6 - Test Plan (Binding Spec)

## Purpose
Validate hardening controls from `PHASE_6_HARDENING.md` with explicit pass/fail checks.

## Preconditions
- App deployed behind nginx on HTTPS domain.
- PM2 and nginx active.

## Test Matrix

### A. Session and Cookie Security
1. Register a new user over HTTPS.
2. Inspect response headers.
3. Expected:
   - `Set-Cookie` contains `Secure`, `HttpOnly`, `SameSite=Lax`.

### B. CSRF Protection
1. Submit a valid form with CSRF token.
2. Expected: success (302 or 200 as route-defined).
3. Submit same POST without token.
4. Expected: `403`.
5. Submit fetch like request without CSRF header.
6. Expected: `403`.

### C. Rate Limiting
1. Hit `/login` repeatedly with bad credentials from one IP.
2. Expected: eventually `429` with retry behavior.
3. Hit `/tweets` spam-like rapid requests from one account.
4. Expected: eventually `429`.

### D. Security Headers
1. `curl -s -D - https://<domain>/login -o /dev/null`
2. Expected headers include:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: SAMEORIGIN`
   - `Referrer-Policy`
   - `Strict-Transport-Security`

### E. Core App Regression
1. Register -> Login -> Post -> Follow -> Feed -> Explore -> Like.
2. Expected: all flows still pass after hardening.

### F. Reboot Recovery
1. Reboot instance.
2. Verify:
   - `pm2 status` shows `loopfeed` online.
   - `systemctl status nginx` active.
   - HTTPS URL responds.

### G. Backup and Restore
1. Trigger backup job manually.
2. Confirm backup file exists in `/home/ec2-user/data/backups`.
3. Restore from latest backup to a test DB path.
4. Start app against restored DB.
5. Expected: app boots and key data exists.

## Pass Criteria
- All sections A-G pass with no critical failures.
- Any failure blocks Phase 7 work until fixed.

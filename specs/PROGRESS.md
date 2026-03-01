# Build Progress

This file tracks what has been built. Update checkboxes as you complete each item.

## Phase 1: Project Setup
- [x] `package.json` initialized with all dependencies listed below
- [x] `.env.example` created with all required env vars
- [x] `.gitignore` created (node_modules, .env, *.db, *.db-wal, *.db-shm)
- [x] `config/db.js` — SQLite connection, WAL mode, all tables created on startup
- [x] `app.js` — Express app with middleware (session, body-parser, static, currentUser, formatTime)
- [x] `server.js` — HTTP server that imports and starts app.js
- [x] `ecosystem.config.js` — PM2 config

## Phase 2: Auth
- [x] `middleware/requireAuth.js`
- [x] `middleware/currentUser.js`
- [x] `routes/auth.js` — register, login, logout
- [x] `views/login.ejs`
- [x] `views/register.ejs`
- [x] `views/layout/header.ejs`
- [x] `views/layout/nav.ejs`
- [x] Password hashing with bcrypt working
- [x] Session persisting correctly

## Phase 3: Core Features
- [x] `routes/feed.js` — home feed query working
- [x] `routes/tweets.js` — create, delete, like
- [x] `routes/users.js` — profile page, follow/unfollow
- [x] `routes/explore.js` — recent tweets, search
- [x] `views/home.ejs`
- [x] `views/profile.ejs`
- [x] `views/explore.ejs`
- [x] `views/partials/tweet-card.ejs`
- [x] `views/error.ejs`

## Phase 4: Frontend Polish
- [x] `public/css/main.css` — full styles, mobile-friendly
- [x] `public/js/app.js` — char counter + like button fetch

## Phase 5: Deployment
- [x] nginx config in place and tested
- [x] PM2 running and configured for boot startup
- [x] `.env` filled in on server
- [x] App accessible at server IP on port 80
- [x] (Optional) SSL cert installed

## Phase 6: Hardening
- [x] Proxy trust and secure cookie flags configured for HTTPS behind nginx
- [x] CSRF protection enabled for all state-changing POST endpoints
- [x] Rate limiting enabled (strict auth, moderate write)
- [x] Security headers baseline enabled
- [x] Certbot renewal timer enabled
- [x] Certbot dry-run renewal verified
- [x] Daily SQLite backup job configured with retention
- [x] Restore drill executed and documented
- [x] Reboot recovery test (manual run still needed)

## Phase 7: Replies and Thread View
- [x] Reply table migrated successfully.
- [x] Users can add replies to tweets.
- [x] Thread page renders parent + replies.
- [x] Reply count visible on tweet card.
- [x] All Phase 6 protections apply on reply endpoint.

## Phase 8: Automated Tests and CI
- [x] Static asset caching set to short-cache for active development.
- [x] Playwright E2E suite added for core register/login/post, reply, and follow/feed/explore flows.
- [x] GitHub Actions workflow added for push/PR E2E execution.
- [ ] CI run on GitHub validated green at least once.

## Phase 10: Branding and UI
- [x] Title/header/footer branding switched to `Loopfeed`.
- [x] PM2 process renamed to `loopfeed`.
- [x] Rebrand completed without route or behavior regressions.

## Phase 11: Dark Mode
- [x] Theme tokens and system-preference dark mode implemented.
- [x] Manual theme toggle added with `localStorage` persistence.
- [x] Playwright test verifies theme persistence after refresh.

---

## Required npm Dependencies

```json
{
  "dependencies": {
    "bcrypt": "^5.1.1",
    "better-sqlite3": "^9.4.3",
    "connect-better-sqlite3": "^1.0.0",
    "ejs": "^3.1.10",
    "express": "^4.19.2",
    "express-session": "^1.18.0",
    "dotenv": "^16.4.5"
  }
}
```

Install with:
```bash
npm install bcrypt better-sqlite3 connect-better-sqlite3 ejs express express-session dotenv
```

## Notes / Decisions Log
_Add notes here as you build so the next session has context._

- `connect-better-sqlite3` is only published as `0.1.8`, so `package.json` uses that plus `overrides` to force `better-sqlite3@^9.4.3` for Node 20 compatibility.
- nginx static access to `/home/ec2-user/...` required ACLs for `nginx` user on `/home/ec2-user` path segments.
- EC2 metadata query required IMDSv2 token flow to retrieve public IPv4.
- Domain live: `https://loopfeed.duckdns.org`.
- HTTP endpoint redirects to HTTPS.
- Certbot certificate installed; renewal timer enabled during Phase 6 hardening.

## Phase 6 Verification Outputs (March 1, 2026)

```text
$ curl -s -D - https://loopfeed.duckdns.org/register (then POST register with csrf)
HTTP/1.1 302 Found
Set-Cookie: ct_session=...; HttpOnly; Secure; SameSite=Lax
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; ...
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

```text
$ CSRF tests
VALID_POST_CODE=302
INVALID_POST_CODE=403
LIKE_NO_CSRF_CODE=403
LIKE_NO_CSRF_BODY={"error":"Invalid CSRF token"}
LIKE_WITH_CSRF_CODE=200
LIKE_WITH_CSRF_BODY={"liked":true,"like_count":1}
```

```text
$ Rate limit test on /login (18 bad attempts)
ATTEMPT_15=401
ATTEMPT_16=429
ATTEMPT_17=429
ATTEMPT_18=429
```

```text
$ systemctl status certbot-renew.timer --no-pager
Loaded: ... enabled
Active: active (waiting)
```

```text
$ sudo certbot renew --dry-run --no-random-sleep-on-renew
Congratulations, all simulated renewals succeeded:
  /etc/letsencrypt/live/loopfeed.duckdns.org/fullchain.pem (success)
```

```text
$ backup + restore drill
Backup created: /home/ec2-user/data/backups/college-twitter-20260301-120510.db
TABLES=follows likes sessions tweets users
USER_COUNT=11
RESTORE_BOOT=restore-db-ok
```

```text
$ pm2 status
loopfeed ... status online

$ sudo systemctl status nginx --no-pager
Active: active (running)
```

## Phase 7 Verification Outputs (March 1, 2026)

```text
$ DB_PATH=/tmp/phase7-migration.db node (sqlite_master check)
index:idx_replies_created_at
index:idx_replies_tweet_id
index:idx_replies_user_id
table:replies
REPLIES_TABLE_COUNT_QUERY_OK=0
```

```text
$ Phase 7 HTTP verification flow on local server (DB_PATH=/tmp/phase7-e2e.db, PORT=3110)
REGISTER_A_STATUS=302
REGISTER_A_LOCATION=/
REGISTER_B_STATUS=302
REGISTER_B_LOCATION=/
PARENT_POST_STATUS=302
PARENT_TWEET_ID=1
REPLY_CREATE_STATUS=302
REPLY_CREATE_LOCATION=/tweets/1
THREAD_STATUS=200
THREAD_HAS_PARENT=true
THREAD_HAS_REPLY=true
HOME_HAS_REPLY_COUNT=true
REPLY_EMPTY_STATUS=302
REPLY_EMPTY_LOCATION=/tweets/1?error=Reply%20cannot%20be%20empty
REPLY_281_STATUS=302
REPLY_281_LOCATION=/tweets/1?error=Reply%20cannot%20exceed%20280%20characters
REPLY_LOGGED_OUT_STATUS=302
REPLY_LOGGED_OUT_LOCATION=/login
REPLY_NO_CSRF_STATUS=403
REPLY_NO_CSRF_HAS_MESSAGE=true
THREAD_ORDER_LINE_A=113
THREAD_ORDER_LINE_B=124
THREAD_ORDER_ASC=true
RATE_LIMIT_FIRST_429_ATTEMPT=26
RATE_LIMIT_LAST_CODE=429
REG_POST_STATUS=302
REG_FOLLOW_STATUS=302
REG_LIKE_STATUS=200
REG_LIKE_PAYLOAD={"liked":true,"like_count":1}
REG_EXPLORE_STATUS=200
REG_EXPLORE_HAS_TWEET=true
```

## Phase 8 Verification Outputs (March 1, 2026)

```text
$ sudo nginx -t && sudo systemctl reload nginx
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
NGINX_RELOADED
```

```text
$ curl -sI https://loopfeed.duckdns.org/public/css/main.css | rg -i "cache-control|expires|etag|last-modified"
Last-Modified: Sun, 01 Mar 2026 12:43:58 GMT
ETag: "69a4348e-f9d"
Expires: Sun, 01 Mar 2026 13:13:02 GMT
Cache-Control: max-age=300
Cache-Control: public
```

```text
$ npm run test:e2e
Running 3 tests using 1 worker
  ✓ register -> login -> create tweet
  ✓ thread reply flow increments reply count
  ✓ follow user then verify feed and explore regression
3 passed (8.7s)
```

## Phase 10 Verification Outputs (March 1, 2026)

```text
$ pm2 status
│ 0  │ loopfeed │ ... │ status online │
```

```text
$ curl -s -o /tmp/phase10-login.html -w "HTTP=%{http_code}\n" https://loopfeed.duckdns.org/login
HTTP=200

$ rg -n "<title>|class=\"brand\"|Loopfeed - lightweight social feed|id=\"theme-toggle\"" /tmp/phase10-login.html
6:  <title>Login | Loopfeed</title>
14:    <a href="/" class="brand">Loopfeed</a>
17:      <button type="button" id="theme-toggle" class="link-btn theme-toggle" aria-label="Toggle theme">
48:    <p>Loopfeed - lightweight social feed</p>
```

## Phase 11 Verification Outputs (March 1, 2026)

```text
$ npm run test:e2e
Running 4 tests using 1 worker
  ✓ register -> login -> create tweet
  ✓ thread reply flow increments reply count
  ✓ follow user then verify feed and explore regression
  ✓ theme toggle persists after refresh
4 passed (8.8s)
```

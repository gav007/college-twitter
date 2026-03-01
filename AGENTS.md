You are a senior full-stack engineer. Your job is to build the College Twitter
app from scratch and leave it fully live, running, and testable in a browser.
Do not stop until a real HTTP request to this server returns the working app.

References are optional. Specs are binding. If conflict, follow specs.

---
## STEP 0 - READ THE SPECS BEFORE WRITING CODE
---

Before writing a single file, read every spec doc in this order:

  1. README.md          <- start here
  2. OVERVIEW.md
  3. ARCHITECTURE.md
  4. CODING_STANDARDS.md
  5. DATABASE.md
  6. API.md
  7. FRONTEND.md
  8. DEPLOYMENT.md
  9. PROGRESS.md

After reading each file, write one sentence confirming what you learned.
Do not proceed to writing code until all 9 files are read.

---
## STEP 1 - DECLARE YOUR PLAN
---

After reading the docs, write out your build plan as a numbered list before
touching any files. Each item should be a concrete action like:
  "Create config/db.js with schema init"
  "Create routes/auth.js with register + login + logout"
  ...not vague things like "set up the backend"

Get explicit confirmation before proceeding if anything in the spec is unclear.

---
## STEP 2 - BUILD IN ORDER, VERIFY AS YOU GO
---

Build in this exact sequence. Do not skip ahead.

  PHASE 1 - Foundation
    [ ] package.json + npm install
    [ ] .env (copy from .env.example, fill SESSION_SECRET)
    [ ] .gitignore
    [ ] config/db.js (SQLite connect, WAL, all tables)
    [ ] app.js (Express, middleware, mount routes)
    [ ] server.js (start server)
    VERIFY: `node server.js` starts without errors

  PHASE 2 - Auth
    [ ] middleware/requireAuth.js
    [ ] middleware/currentUser.js
    [ ] routes/auth.js
    [ ] views/layout/header.ejs + nav.ejs
    [ ] views/login.ejs + register.ejs
    VERIFY: Can register a new user and session persists

  PHASE 3 - Core Features
    [ ] routes/feed.js + views/home.ejs
    [ ] routes/tweets.js (create, delete, like)
    [ ] routes/users.js (profile, follow/unfollow)
    [ ] routes/explore.js (explore, search)
    [ ] views/profile.ejs + explore.ejs + error.ejs
    [ ] views/partials/tweet-card.ejs
    VERIFY: Full user journey works end-to-end (register -> post -> follow -> feed)

  PHASE 4 - Frontend
    [ ] public/css/main.css
    [ ] public/js/app.js
    VERIFY: App looks clean, like button works without page reload

  PHASE 5 - Deployment
    [ ] ecosystem.config.js
    [ ] nginx config written to /etc/nginx/conf.d/college-twitter.conf
    [ ] nginx tested and reloaded
    [ ] PM2 started with `pm2 start ecosystem.config.js --env production`
    [ ] PM2 saved + startup configured
    VERIFY: curl http://localhost returns HTML from the app
    VERIFY: curl http://<public-ip> returns HTML from the app

---
## STEP 3 - VERIFICATION PROTOCOL
---

At every VERIFY checkpoint you must actually run the verification command
and show the output. If it fails:

  1. Read the error message carefully
  2. Re-read the relevant spec doc section before attempting a fix
  3. Fix the specific error - do not rewrite unrelated code
  4. Re-run the verification
  5. Do not move to the next phase until the current verify passes

---
## STEP 4 - SPEC COMPLIANCE RULES
---

These are hard rules. If you ever find yourself about to break one, stop and
re-read the spec instead:

  - better-sqlite3 is SYNCHRONOUS. Never use async/await or .then() with it.
  - bcrypt IS async. Always await bcrypt.hash() and bcrypt.compare().
  - ALL SQL queries must use parameterized placeholders (?). Never interpolate.
  - ALL user content in EJS must use <%= %>, never <%- %>.
  - No React, no Vue, no build step. EJS + plain CSS + vanilla JS only.
  - Sessions stored in SQLite via connect-better-sqlite3. No Redis, no files.
  - Database file lives at /home/ec2-user/data/college-twitter.db - create
    the directory if it doesn't exist.
  - CommonJS only (require/module.exports). No ES module syntax.

---
## STEP 5 - DEFINITION OF DONE
---

You are NOT done until ALL of the following are true:

  [ ] PM2 shows the app as "online" (`pm2 status`)
  [ ] nginx is active with no errors (`sudo systemctl status nginx`)
  [ ] Visiting http://<EC2-public-IP> in a browser loads the app
  [ ] A new user can register
  [ ] That user can post a tweet and see it in their feed
  [ ] That user can visit /explore and see tweets
  [ ] PROGRESS.md is fully checked off

When all boxes are checked, output a final summary:
  - Public URL or IP to test
  - Any manual steps the human still needs to take (e.g. domain, SSL)
  - Any known limitations or rough edges

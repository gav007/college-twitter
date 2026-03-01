# Build Progress

This file tracks what has been built. Update checkboxes as you complete each item.

## Phase 1: Project Setup
- [ ] `package.json` initialized with all dependencies listed below
- [ ] `.env.example` created with all required env vars
- [ ] `.gitignore` created (node_modules, .env, *.db, *.db-wal, *.db-shm)
- [ ] `config/db.js` — SQLite connection, WAL mode, all tables created on startup
- [ ] `app.js` — Express app with middleware (session, body-parser, static, currentUser, formatTime)
- [ ] `server.js` — HTTP server that imports and starts app.js
- [ ] `ecosystem.config.js` — PM2 config

## Phase 2: Auth
- [ ] `middleware/requireAuth.js`
- [ ] `middleware/currentUser.js`
- [ ] `routes/auth.js` — register, login, logout
- [ ] `views/login.ejs`
- [ ] `views/register.ejs`
- [ ] `views/layout/header.ejs`
- [ ] `views/layout/nav.ejs`
- [ ] Password hashing with bcrypt working
- [ ] Session persisting correctly

## Phase 3: Core Features
- [ ] `routes/feed.js` — home feed query working
- [ ] `routes/tweets.js` — create, delete, like
- [ ] `routes/users.js` — profile page, follow/unfollow
- [ ] `routes/explore.js` — recent tweets, search
- [ ] `views/home.ejs`
- [ ] `views/profile.ejs`
- [ ] `views/explore.ejs`
- [ ] `views/partials/tweet-card.ejs`
- [ ] `views/error.ejs`

## Phase 4: Frontend Polish
- [ ] `public/css/main.css` — full styles, mobile-friendly
- [ ] `public/js/app.js` — char counter + like button fetch

## Phase 5: Deployment
- [ ] nginx config in place and tested
- [ ] PM2 running and configured for boot startup
- [ ] `.env` filled in on server
- [ ] App accessible at server IP on port 80
- [ ] (Optional) SSL cert installed

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

- 

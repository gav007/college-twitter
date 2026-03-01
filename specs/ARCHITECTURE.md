# Architecture

## Folder Structure

```
/home/ec2-user/projects/college-twitter/
├── app.js                  # Express app setup, middleware, route mounting
├── server.js               # HTTP server entry point (starts app.js)
├── package.json
├── .env                    # Secrets — never commit this
│
├── config/
│   └── db.js               # SQLite connection + schema init (runs migrations on start)
│
├── routes/
│   ├── auth.js             # GET/POST /login, /register, /logout
│   ├── tweets.js           # POST /tweets, DELETE /tweets/:id, POST /tweets/:id/like
│   ├── users.js            # GET /users/:username, POST /users/:username/follow
│   ├── feed.js             # GET / (home feed)
│   └── explore.js          # GET /explore, GET /search
│
├── middleware/
│   ├── requireAuth.js      # Redirects to /login if not authenticated
│   └── currentUser.js      # Attaches res.locals.currentUser for all views
│
├── views/                  # EJS templates
│   ├── layout/
│   │   ├── header.ejs      # <head> tag, CSS links
│   │   └── nav.ejs         # Top nav bar
│   ├── partials/
│   │   └── tweet-card.ejs  # Reusable single tweet component
│   ├── home.ejs            # Home feed
│   ├── explore.ejs         # Explore / search results
│   ├── profile.ejs         # User profile page
│   ├── login.ejs
│   ├── register.ejs
│   └── error.ejs           # Generic error page
│
├── public/                 # Static assets served by nginx
│   ├── css/
│   │   └── main.css
│   └── js/
│       └── app.js          # Minimal vanilla JS (likes, char counter)
│
└── ecosystem.config.js     # PM2 config
```

## Request Flow

```
Browser
  │
  ▼
nginx (port 80/443)
  │  static files → served directly from /public
  │  everything else →
  ▼
Node.js / Express (port 3000, localhost only)
  │
  ├── middleware: sessions, currentUser
  │
  ├── routes/auth.js
  ├── routes/feed.js
  ├── routes/tweets.js
  ├── routes/users.js
  └── routes/explore.js
        │
        ▼
    config/db.js (better-sqlite3, synchronous queries)
        │
        ▼
    /home/ec2-user/data/college-twitter.db (SQLite file)
```

## Key Architectural Decisions

**Synchronous SQLite**: `better-sqlite3` uses synchronous calls. This is fine because SQLite with WAL mode is extremely fast for this workload and avoids callback/promise complexity. Do not mix async patterns with better-sqlite3.

**Session storage**: Express sessions stored in SQLite via `connect-better-sqlite3` session store. No separate session file or Redis needed.

**No build step**: EJS renders on the server. CSS and JS are plain files. A developer can edit a file and refresh — no `npm run build` needed.

**Server-side forms**: All mutations (post tweet, follow, like) are standard HTML form POST requests. JavaScript progressively enhances likes to avoid full page reload, but the form works without JS too.

**nginx serves static files**: Configure nginx to serve `/public` directly without hitting Node. This keeps the Node process free for dynamic requests.

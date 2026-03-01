# College Twitter — Agent README

**READ THIS FIRST.** This file tells you what every doc is for and in what order to read them.

## You Are Building
A lightweight Twitter clone for college students. Cheap, fast, no fluff. Single server. See `OVERVIEW.md` for the full picture.

## Doc Index

| File | Read When |
|---|---|
| `OVERVIEW.md` | Start here — stack, philosophy, feature list |
| `ARCHITECTURE.md` | Before creating any files — folder layout, request flow |
| `DATABASE.md` | Before touching any data — schema, indexes, common queries |
| `API.md` | Before writing routes — all endpoints, inputs, outputs |
| `FRONTEND.md` | Before writing views — EJS patterns, CSS classes, JS features |
| `CODING_STANDARDS.md` | Before writing any code — rules you must follow |
| `DEPLOYMENT.md` | When setting up or deploying to the EC2 server |
| `PROGRESS.md` | Check off tasks as you complete them. Add notes at the bottom. |

## Quick Start — Build Order

1. Read `OVERVIEW.md` → `ARCHITECTURE.md` → `CODING_STANDARDS.md`
2. Create project structure (folders only)
3. `npm install` the dependencies listed in `PROGRESS.md`
4. Build `config/db.js` (see `DATABASE.md`)
5. Build `app.js` + `server.js`
6. Build auth (register/login/logout) + views
7. Build feed, tweets, users, explore routes + views
8. Build CSS + JS
9. Test everything locally with `npm run dev`
10. Deploy using `DEPLOYMENT.md`

## Working Directory
```
/home/ec2-user/projects/college-twitter/
```

## Key Constraints to Never Forget
- SQLite only — no external DB
- `better-sqlite3` is **synchronous** — no async/await in DB calls
- EJS templating — no React, no build step
- Max ~300MB Node.js RAM on t2.micro
- bcrypt IS async — use await for password operations
- Always parameterize SQL queries — never interpolate user input
- Always `<%= %>` for user content in EJS — never `<%-`

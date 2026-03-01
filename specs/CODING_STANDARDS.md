# Coding Standards

These rules apply to every file you write in this project. Follow them without exception.

## General

- **Language**: JavaScript (CommonJS `require`, not ES modules). Use `.js` files.
- **Node version target**: Node 20 LTS
- **No TypeScript**: Keep it simple and fast to iterate.
- **No ORM**: Write raw SQL with `better-sqlite3`. It's readable and fast.
- **No async in DB layer**: `better-sqlite3` is synchronous. Do not wrap calls in Promises or use async/await for DB operations.
- **Error handling**: Always handle errors. Never silently swallow exceptions. Pass errors to `next(err)` in Express routes.

## File & Module Style

```js
// ✅ Good — CommonJS
const express = require('express');
const db = require('../config/db');

// ❌ Bad — ES modules
import express from 'express';
```

- One concern per file. Routes in `routes/`, DB setup in `config/db.js`.
- Export a single thing from each file where possible.

## Express Routes

- Always use `try/catch` in route handlers and call `next(err)` on error.
- Validate input before touching the database.
- Use the Post/Redirect/Get pattern for all form submissions.
- Never `res.json()` except for the like endpoint.

```js
// ✅ Good route pattern
router.post('/tweets', requireAuth, (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content || content.trim().length === 0) {
      return res.redirect('/?error=empty');
    }
    if (content.length > 280) {
      return res.redirect('/?error=toolong');
    }
    db.prepare('INSERT INTO tweets (user_id, content) VALUES (?, ?)').run(
      req.session.userId,
      content.trim()
    );
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});
```

## Database (`config/db.js`)

- Prepare statements once and reuse them (or prepare inline — `better-sqlite3` caches).
- Always use parameterized queries — never string interpolation for user input.
- Run schema creation on startup in `db.js` using `db.exec()`.

```js
// ✅ Good
const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
const user = stmt.get(username);

// ❌ Bad — SQL injection risk
const user = db.prepare(`SELECT * FROM users WHERE username = '${username}'`).get();
```

## Security Checklist

Every time you write a route, verify:
- [ ] Is user input validated before use?
- [ ] Are all DB queries parameterized?
- [ ] Is authorization checked (does the user own this resource)?
- [ ] Is user content rendered with `<%= %>` (not `<%-`) in EJS?
- [ ] Are passwords hashed with bcrypt (never stored plain)?

## Passwords

```js
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;

// Hashing
const hash = await bcrypt.hash(password, SALT_ROUNDS);  // bcrypt IS async

// Verifying  
const match = await bcrypt.compare(password, hash);
```

Note: bcrypt uses async/await because it's CPU-intensive. This is the one exception to the "no async" preference in this project.

## Naming Conventions

- Files: `kebab-case.js`
- Variables/functions: `camelCase`
- SQL columns: `snake_case`
- CSS classes: `kebab-case`
- Constants: `UPPER_SNAKE_CASE`

## HTML / EJS

- Always escape user content: `<%= variable %>` not `<%- variable %>`
- Keep templates thin — no business logic in `.ejs` files. Do data fetching in routes.
- Use semantic HTML: `<article>` for tweets, `<nav>` for navigation, `<time>` for timestamps, `<form>` for mutations.

## CSS

- Mobile-first. Default styles work on small screens; use `min-width` media queries if needed.
- No `!important` unless absolutely necessary.
- Keep specificity low — use single classes, not nested selectors.
- Group CSS by component, not by property type.

## What NOT to do

- ❌ Don't add npm packages without a clear need. Check if it can be done in 5 lines of vanilla JS first.
- ❌ Don't add a frontend framework (React, Vue, etc.). The app works fine with EJS + minimal JS.
- ❌ Don't use `eval()`, `Function()`, or dynamic `require()`.
- ❌ Don't store secrets in code — use `.env` and `process.env`.
- ❌ Don't commit `.env` to git. It's in `.gitignore`.
- ❌ Don't use `SELECT *` when you know which columns you need.
- ❌ Don't use `console.log` for anything that should be an error — use `console.error`.

## package.json scripts
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  }
}
```

Use `npm run dev` during development (Node 20 built-in watch mode, no nodemon needed).

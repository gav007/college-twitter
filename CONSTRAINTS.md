# Constraints (Hard Rules)

These rules are non-negotiable. If a change conflicts with any item below, stop and revisit the specs.

## Runtime + Language

- Node.js target: Node 20 LTS
- CommonJS only: use `require(...)` / `module.exports` (no ES modules)
- No TypeScript

## Database

- SQLite via `better-sqlite3`
- The database file path is `/home/ec2-user/data/college-twitter.db`
  - Create `/home/ec2-user/data` if it does not exist
  - Keep DB outside the repo so `git pull` does not wipe data
- Enable on startup:
  - `db.pragma('journal_mode = WAL')`
  - `db.pragma('foreign_keys = ON')`
- `better-sqlite3` is synchronous
  - Do not use `async/await` or Promises around DB calls

## Security

- ALL SQL must be parameterized with `?` placeholders
  - Never interpolate user input into SQL strings
- Passwords
  - Use `bcrypt`
  - `bcrypt.hash()` and `bcrypt.compare()` are async: always `await` them
- Sessions
  - Stored in SQLite via `connect-better-sqlite3`
  - No Redis, no file-backed sessions
- EJS escaping
  - Render ALL user content with `<%= %>`
  - Never use `<%- %>` for user content

## Frontend

- No React, no Vue, no build step
- Server-rendered EJS + plain CSS + vanilla JS only
- Only the like endpoint returns JSON; everything else returns HTML + redirects

## Routing + UX

- Use Post/Redirect/Get for form submissions
- Route errors: `next(err)`; 404/500 render `views/error.ejs`

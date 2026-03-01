# Project File Map (How Agents Should Navigate This Repo)

This document describes the repository structure and how an agent should interact with each area while building the College Twitter app.

## Top-Level Layout

- `AGENTS.md`
  - Canonical agent prompt.
  - Defines the build phases and verification checkpoints.
  - If unclear, stop and consult `specs/`.

- `specs/`
  - Binding specifications. Agents must read these before writing code.
  - `specs/PROGRESS.md` is the checklist to update as work is completed.

- `CONSTRAINTS.md`
  - Fast, single-page guardrails (derived from specs).
  - Use to prevent violations (sync DB, SQL placeholders, EJS escaping, DB path, CommonJS).

- `RUNBOOK.md`
  - Operational commands: install, run, deploy, debug.

- `TESTING.md`
  - Manual verification steps aligned to the phase checkpoints.

- `DECISIONS.md`
  - ADR-lite log. Add entries for non-obvious choices to prevent churn.

- `references/`
  - Non-binding reference material.
  - Useful for context, never overrides `AGENTS.md` or `specs/`.

## Agent Build Flow (What To Read and When)

1. Read `AGENTS.md`.
2. Read these spec docs in order:
   - `specs/README.md`
   - `specs/OVERVIEW.md`
   - `specs/ARCHITECTURE.md`
   - `specs/CODING_STANDARDS.md`
   - `specs/DATABASE.md`
   - `specs/API.md`
   - `specs/FRONTEND.md`
   - `specs/DEPLOYMENT.md`
   - `specs/PROGRESS.md`
3. Write a concrete plan (per `AGENTS.md`).
4. Implement in phases (Foundation -> Auth -> Core -> Frontend -> Deployment).
5. At each VERIFY checkpoint:
   - Run the command.
   - Show output.
   - If failing: read the error and re-check the relevant spec section.
6. Keep `specs/PROGRESS.md` up to date.

## Expected Runtime File Tree (After Implementation)

The agent should create the app files described in `specs/ARCHITECTURE.md`. Target structure:

- `package.json`
- `.env.example` and `.env` (never commit `.env`)
- `.gitignore`
- `app.js`
- `server.js`
- `ecosystem.config.js`
- `config/db.js`
- `middleware/requireAuth.js`
- `middleware/currentUser.js`
- `routes/auth.js`
- `routes/feed.js`
- `routes/tweets.js`
- `routes/users.js`
- `routes/explore.js`
- `views/layout/header.ejs`
- `views/layout/nav.ejs`
- `views/login.ejs`
- `views/register.ejs`
- `views/home.ejs`
- `views/profile.ejs`
- `views/explore.ejs`
- `views/error.ejs`
- `views/partials/tweet-card.ejs`
- `public/css/main.css`
- `public/js/app.js`

## Ownership and Interaction Rules

- `specs/*`
  - Edit only to update `specs/PROGRESS.md` checkboxes and append notes.
  - Do not rewrite specs to "make implementation easier".

- DB file location:
  - App must use `/home/ec2-user/data/college-twitter.db` (create dir if missing).
  - DB should not live inside the repo.

- SQL safety:
  - Parameterized queries only (`?`). No string interpolation.

- EJS safety:
  - User content must be rendered with `<%= %>`.

- Async/sync boundary:
  - `better-sqlite3` operations are synchronous.
  - `bcrypt` operations are async and must be awaited.

## Where Agents Commonly Derail

- Adding new architecture (queues, Redis, ORM, React) that conflicts with `specs/`.
- Making DB calls async or wrapping `better-sqlite3` in Promises.
- Rendering user content with `<%- %>`.
- Ignoring VERIFY checkpoints and moving forward with a broken phase.

If any of the above happens, stop and re-align to `AGENTS.md` + `specs/`.

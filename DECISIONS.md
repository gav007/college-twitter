# Decisions (ADR-lite)

A short log of non-obvious choices to prevent churn. Add an entry when a decision would otherwise be re-litigated.

## 2026-03-01 - Server-rendered app (no SPA/build)

- Decision: Use Express + EJS + vanilla JS.
- Why: Fast iteration, minimal moving parts, matches specs.

## 2026-03-01 - SQLite + better-sqlite3

- Decision: Use SQLite via `better-sqlite3` with WAL enabled.
- Why: Simple deploy, zero external services, synchronous DB access reduces complexity.

## 2026-03-01 - Sessions stored in SQLite

- Decision: Use `connect-better-sqlite3` session store.
- Why: Keeps sessions persistent across restarts without Redis/files, matches specs.

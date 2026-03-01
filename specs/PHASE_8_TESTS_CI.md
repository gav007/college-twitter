# Phase 8 - Automated Tests and CI (Binding Spec)

## Objective
Prevent regressions by adding deterministic browser E2E coverage and running it automatically on every push and pull request.

## Scope
- Playwright E2E tests for core user journeys.
- GitHub Actions workflow that executes E2E tests.
- Fast feedback and artifacts for failures.

## Required Test Coverage

### 1. Auth + Posting Flow
- Register user.
- Log out and log back in.
- Create tweet.
- Verify tweet is visible.

### 2. Reply Flow
- Open thread page.
- Create reply.
- Verify reply renders on thread.
- Verify reply count increments on tweet card.

### 3. Follow + Feed/Explore Regression
- Follow another user.
- Verify followed user's tweet appears in feed.
- Verify tweet appears in explore page.

## Stability Rules
- Use unique usernames per run (timestamp/random suffix).
- Do not rely on existing seeded data.
- Use resilient Playwright locators and assertions.
- Keep suite deterministic and CI-safe.

## CI Requirements
- Trigger on `push` and `pull_request` for `main`.
- Node 20.
- Install dependencies with `npm ci`.
- Install Playwright Chromium and OS deps.
- Run E2E tests.
- Upload Playwright HTML report artifact on failure.

## Files
- `playwright.config.js`
- `tests/e2e/*.spec.js`
- `.github/workflows/ci.yml`
- `package.json` scripts for E2E

## Verify
1. Local:
   - `npm run test:e2e`
2. CI:
   - GitHub Actions workflow runs on push/PR.
   - Failed runs include Playwright report artifact.

## Definition of Done
- [x] Core Playwright tests exist and pass locally.
- [x] GitHub Actions runs E2E on push/PR.
- [x] CI uploads report artifact when tests fail.
- [x] Phase 8 outputs logged in `specs/PROGRESS.md`.

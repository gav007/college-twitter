# Phase 7 Test Plan - Replies and Thread View

Date: March 1, 2026
Scope: `specs/PHASE_7_REPLIES.md`

## Core Tests

1. Reply create
- Valid reply returns redirect to thread.

2. Reply validation
- Empty reply is rejected.
- 281-character reply is rejected.

3. Auth
- Logged-out reply attempt is blocked.

4. CSRF
- Missing CSRF token returns `403`.

5. Rate limit
- Repeated reply spam hits `429`.

6. Thread view
- Parent tweet plus replies render in the selected order.

7. Regression coverage
- Existing post, follow, like, and explore flows still work.

## CSRF Expectation

Reply creation must follow synchronizer-token behavior: server-issued token required, missing token fails.

# Phase 13 - Notifications MVP (Binding Spec)

## Objective
Add in-app notifications so users see activity from followed accounts and replies to their tweets.

## Scope
- In-app notifications only (no email/push).
- Event types:
  - Followed user posts a tweet (`followed_post`).
  - Someone replies to your tweet (`reply_to_you`).
- Per-follow notification toggle for followed users.

## Data Model
1. Add per-follow preference columns:
- `follows.notify_posts INTEGER NOT NULL DEFAULT 0`
- `follows.notify_replies INTEGER NOT NULL DEFAULT 0`

2. Add `notifications` table:

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tweet_id INTEGER NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('followed_post', 'reply_to_you')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT
);
```

## Routes
1. `GET /notifications` (auth required)
- List recent notifications.

2. `POST /notifications/:id/read` (auth required)
- Mark one notification read.

3. `POST /notifications/read-all` (auth required)
- Mark all user notifications read.

4. `POST /users/:username/notify` (auth required)
- Toggle `notify_posts` on existing follow relationship.

## UI
- Add notifications link in nav with unread badge.
- Add per-follow "Notify Posts: On/Off" toggle on profile page.
- Add notifications page with:
  - actor
  - action text
  - thread link
  - read controls

## Behavior Rules
- `followed_post` notifications only created for followers with `notify_posts = 1`.
- `reply_to_you` created when another user replies to your tweet.
- No self-notifications.

## Security and Abuse Controls
- All notification mutation routes require auth + CSRF + write limiter.
- Notification updates scoped to owning user id.

## Tests (Required)
- Follow + notify on -> followed post creates notification.
- Notify off -> followed post does not create new notification.
- Reply to user tweet creates reply notification.
- Notification read and read-all flows work.

## Definition of Done
- [x] Notifications generated for followed posts (opt-in) and tweet replies.
- [x] Per-follow notify toggle works from profile.
- [x] Notifications page and unread badge work.
- [x] Read and read-all controls function correctly.
- [x] Playwright tests for notification flows pass.

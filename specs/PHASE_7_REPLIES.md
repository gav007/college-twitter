# Phase 7 - Replies and Thread View (Binding Spec)

## Objective
Add conversational depth with replies and thread view while preserving the existing lightweight architecture.

## Scope Decision
- Default model: one-level replies (tweet -> direct replies).
- Nested reply depth >1 is out of scope for Phase 7 unless explicitly approved.

## Database Changes
Add table:

```sql
CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tweet_id INTEGER NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK(length(content) <= 280 AND length(content) >= 1),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_replies_tweet_id ON replies(tweet_id);
CREATE INDEX IF NOT EXISTS idx_replies_user_id ON replies(user_id);
CREATE INDEX IF NOT EXISTS idx_replies_created_at ON replies(created_at DESC);
```

## Routes

### Create Reply
- `POST /tweets/:id/replies` (auth required)
- Input: `content` (1-280)
- Behavior:
  - Validate content
  - Ensure parent tweet exists
  - Insert reply
  - Redirect to `/tweets/:id`

### Thread View
- `GET /tweets/:id`
- Behavior:
  - Render parent tweet
  - Render replies newest-first (or oldest-first, choose one and keep consistent)
  - Show reply form for authenticated users

## UI Changes
- `views/thread.ejs` (new)
- Add "Reply" action/link on tweet cards.
- Update `views/partials/tweet-card.ejs` to show reply count.

## Query Examples
Reply count per tweet:

```sql
SELECT COUNT(*) AS reply_count FROM replies WHERE tweet_id = ?;
```

Thread replies:

```sql
SELECT
  r.id,
  r.tweet_id,
  r.user_id,
  r.content,
  r.created_at,
  u.username,
  u.display_name
FROM replies r
JOIN users u ON u.id = r.user_id
WHERE r.tweet_id = ?
ORDER BY r.created_at ASC
LIMIT 200;
```

## Security Requirements
- CSRF and rate limits from Phase 6 must apply to reply creation.
- Authorization and validation follow existing tweet rules.

## Definition of Done
- [x] Reply table migrated successfully.
- [x] Users can add replies to tweets.
- [x] Thread page renders parent + replies.
- [x] Reply count visible on tweet card.
- [x] All Phase 6 protections apply on reply endpoint.

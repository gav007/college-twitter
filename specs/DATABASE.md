# Database

## Engine
SQLite via `better-sqlite3`. Database file: `/home/ec2-user/data/college-twitter.db`

Enable WAL mode on startup for better concurrent read performance:
```js
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
```

## Schema

### users
```sql
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  bio         TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
```

### tweets
```sql
CREATE TABLE IF NOT EXISTS tweets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK(length(content) <= 280 AND length(content) >= 1),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tweets_user_id ON tweets(user_id);
CREATE INDEX IF NOT EXISTS idx_tweets_created_at ON tweets(created_at DESC);
```

### follows
```sql
CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, following_id)
);
```

### likes
```sql
CREATE TABLE IF NOT EXISTS likes (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tweet_id    INTEGER NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, tweet_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_tweet_id ON likes(tweet_id);
```

### sessions (managed by connect-better-sqlite3)
```sql
-- Auto-created by the session store library
CREATE TABLE IF NOT EXISTS sessions (
  sid   TEXT PRIMARY KEY,
  sess  TEXT NOT NULL,
  expired TEXT NOT NULL
);
```

## Common Queries

**Home feed** (tweets from self + followed users, newest first, with like count + whether current user liked):
```sql
SELECT 
  t.id, t.content, t.created_at,
  u.username, u.display_name,
  COUNT(DISTINCT l.user_id) AS like_count,
  MAX(CASE WHEN l.user_id = ? THEN 1 ELSE 0 END) AS liked_by_me
FROM tweets t
JOIN users u ON u.id = t.user_id
LEFT JOIN likes l ON l.tweet_id = t.id
WHERE t.user_id = ? 
   OR t.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)
GROUP BY t.id
ORDER BY t.created_at DESC
LIMIT 50;
-- params: [currentUserId, currentUserId, currentUserId]
```

**Profile page tweets**:
```sql
SELECT 
  t.id, t.content, t.created_at,
  u.username, u.display_name,
  COUNT(DISTINCT l.user_id) AS like_count,
  MAX(CASE WHEN l.user_id = ? THEN 1 ELSE 0 END) AS liked_by_me
FROM tweets t
JOIN users u ON u.id = t.user_id
LEFT JOIN likes l ON l.tweet_id = t.id
WHERE u.username = ?
GROUP BY t.id
ORDER BY t.created_at DESC
LIMIT 50;
```

**Check if following**:
```sql
SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?;
```

**Follower / following counts**:
```sql
SELECT 
  (SELECT COUNT(*) FROM follows WHERE following_id = u.id) AS follower_count,
  (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) AS following_count
FROM users u WHERE u.id = ?;
```

## Initialization
`config/db.js` should run all `CREATE TABLE IF NOT EXISTS` statements synchronously on startup. No migration library needed at this scale — just idempotent CREATE IF NOT EXISTS.

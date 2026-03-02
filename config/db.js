const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || '/home/ec2-user/data/college-twitter.db';
const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    bio TEXT DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    is_private INTEGER NOT NULL DEFAULT 0 CHECK(is_private IN (0, 1)),
    is_bot INTEGER NOT NULL DEFAULT 0 CHECK(is_bot IN (0, 1)),
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name);

  CREATE TABLE IF NOT EXISTS tweets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK(length(content) <= 280 AND length(content) >= 1),
    link_image_url TEXT NOT NULL DEFAULT '',
    quoted_tweet_id INTEGER REFERENCES tweets(id) ON DELETE SET NULL,
    quoted_author_username TEXT NOT NULL DEFAULT '',
    quoted_author_display_name TEXT NOT NULL DEFAULT '',
    quoted_content TEXT NOT NULL DEFAULT '',
    quoted_link_image_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_tweets_user_id ON tweets(user_id);
  CREATE INDEX IF NOT EXISTS idx_tweets_created_at ON tweets(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_tweets_content ON tweets(content);

  CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (follower_id, following_id)
  );
  CREATE TABLE IF NOT EXISTS follow_requests (
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (requester_id, target_id)
  );
  CREATE INDEX IF NOT EXISTS idx_follow_requests_target ON follow_requests(target_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS pokes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    read_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_pokes_receiver_created ON pokes(receiver_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_pokes_sender_receiver_created ON pokes(sender_id, receiver_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS likes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tweet_id INTEGER NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, tweet_id)
  );
  CREATE INDEX IF NOT EXISTS idx_likes_tweet_id ON likes(tweet_id);

  CREATE TABLE IF NOT EXISTS reactions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tweet_id INTEGER NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('like', 'love', 'haha', 'wow', 'sad')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, tweet_id)
  );
  CREATE INDEX IF NOT EXISTS idx_reactions_tweet_id ON reactions(tweet_id);
  CREATE INDEX IF NOT EXISTS idx_reactions_kind ON reactions(kind);

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

  CREATE TABLE IF NOT EXISTS tweet_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id INTEGER NOT NULL UNIQUE REFERENCES tweets(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tweet_media_tweet_id ON tweet_media(tweet_id);
  CREATE INDEX IF NOT EXISTS idx_tweet_media_expires_at ON tweet_media(expires_at);

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tweet_id INTEGER NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('followed_post', 'reply_to_you')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    read_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read_at);

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK(user1_id < user2_id),
    UNIQUE(user1_id, user2_id)
  );
  CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
  CREATE INDEX IF NOT EXISTS idx_conversations_user1 ON conversations(user1_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_user2 ON conversations(user2_id);

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK(length(body) >= 1 AND length(body) <= 1000),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    read_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_conversation_unread ON messages(conversation_id, read_at);

  CREATE TABLE IF NOT EXISTS user_streaks (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_streak INTEGER NOT NULL DEFAULT 0 CHECK(current_streak >= 0),
    best_streak INTEGER NOT NULL DEFAULT 0 CHECK(best_streak >= 0),
    last_activity_date TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_achievements (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, code)
  );
  CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);

  CREATE TABLE IF NOT EXISTS bot_ingested_items (
    source_key TEXT PRIMARY KEY,
    bot_username TEXT NOT NULL,
    source_url TEXT NOT NULL,
    published_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_bot_ingested_created_at ON bot_ingested_items(created_at DESC);

  CREATE TABLE IF NOT EXISTS link_previews (
    url TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL DEFAULT (datetime('now', '+18 hours')),
    last_error TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_link_previews_expires_at ON link_previews(expires_at);

  CREATE TABLE IF NOT EXISTS topics (
    slug TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS user_topics (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic_slug TEXT NOT NULL REFERENCES topics(slug) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, topic_slug)
  );
  CREATE INDEX IF NOT EXISTS idx_user_topics_topic ON user_topics(topic_slug, created_at DESC);

  CREATE TABLE IF NOT EXISTS tweet_topics (
    tweet_id INTEGER NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    topic_slug TEXT NOT NULL REFERENCES topics(slug) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (tweet_id, topic_slug)
  );
  CREATE INDEX IF NOT EXISTS idx_tweet_topics_topic ON tweet_topics(topic_slug, created_at DESC);

  CREATE TABLE IF NOT EXISTS user_suggestion_dismissals (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    suggested_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dismissed_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, suggested_user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_user_suggestion_dismissals_user_time
    ON user_suggestion_dismissals(user_id, dismissed_at DESC);

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired INTEGER NOT NULL
  );
`);

db.exec(`
  INSERT OR IGNORE INTO topics (slug, label, description) VALUES
    ('ai', 'AI', 'Artificial intelligence and machine learning'),
    ('cyber', 'Cyber', 'Cybersecurity and digital safety'),
    ('events', 'Events', 'Dublin and campus events'),
    ('tu-news', 'TU News', 'TU Dublin updates'),
    ('careers', 'Careers', 'Jobs, internships, and professional growth'),
    ('startups', 'Startups', 'Startups, founders, and innovation'),
    ('sport', 'Sport', 'Irish and campus sports'),
    ('music', 'Music', 'Music, gigs, and culture');
`);

function ensureColumnExists(tableName, columnName, definitionSql) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const hasColumn = columns.some((column) => column.name === columnName);
  if (!hasColumn) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
  }
}

ensureColumnExists('follows', 'notify_posts', 'INTEGER NOT NULL DEFAULT 0');
ensureColumnExists('follows', 'notify_replies', 'INTEGER NOT NULL DEFAULT 0');
ensureColumnExists('users', 'avatar_url', "TEXT NOT NULL DEFAULT ''");
ensureColumnExists('users', 'is_private', 'INTEGER NOT NULL DEFAULT 0 CHECK(is_private IN (0, 1))');
ensureColumnExists('users', 'is_bot', 'INTEGER NOT NULL DEFAULT 0 CHECK(is_bot IN (0, 1))');
ensureColumnExists('tweets', 'link_image_url', "TEXT NOT NULL DEFAULT ''");
ensureColumnExists('tweets', 'quoted_tweet_id', 'INTEGER REFERENCES tweets(id) ON DELETE SET NULL');
ensureColumnExists('tweets', 'quoted_author_username', "TEXT NOT NULL DEFAULT ''");
ensureColumnExists('tweets', 'quoted_author_display_name', "TEXT NOT NULL DEFAULT ''");
ensureColumnExists('tweets', 'quoted_content', "TEXT NOT NULL DEFAULT ''");
ensureColumnExists('tweets', 'quoted_link_image_url', "TEXT NOT NULL DEFAULT ''");
db.exec('CREATE INDEX IF NOT EXISTS idx_tweets_quoted_tweet_id ON tweets(quoted_tweet_id)');

module.exports = db;

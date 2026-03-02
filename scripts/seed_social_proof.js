/* eslint-disable no-console */
require('dotenv').config();

const bcrypt = require('bcrypt');

const db = require('../config/db');
const { assignTopicsToTweet } = require('../services/topicClassifier');

const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD || 'Passw0rd123';
const DEMO_USERS = [
  { username: 'dublin_ai', displayName: 'Dublin AI', bio: 'AI, startups, and Irish tech.' },
  { username: 'campus_events', displayName: 'Campus Events', bio: 'Weekend events and student updates.' },
  { username: 'grangecoder', displayName: 'Grange Coder', bio: 'Building in public from Dublin.' },
  { username: 'cyber_irish', displayName: 'Cyber Irish', bio: 'Security and digital safety.' },
  { username: 'looplife', displayName: 'Loop Life', bio: 'Campus life and student stories.' },
  { username: 'weekenddublin', displayName: 'Weekend Dublin', bio: 'What is happening this weekend.' }
];

const SAMPLE_POSTS = [
  'Just shipped a new feature and pushed it to production. Build fast, test smart.',
  'Anyone heading to a tech meetup in Dublin this weekend?',
  'Quick AI study tip: summarize every lecture into 5 bullets right after class.',
  'Cyber checklist for students: unique passwords + MFA + backup email.',
  'Campus coffee hit different today. Working through a deep learning assignment.',
  'Open to collab on a side project around event discovery and recommendations.'
];

const SAMPLE_COMMENTS = [
  'Love this. Super practical.',
  'I am in, DM me details.',
  'Great point. This is exactly what people need.',
  'Would definitely use this.',
  'Nice one. Keep posting updates.',
  'That is actually useful advice.'
];

const selectUserStmt = db.prepare('SELECT id, username FROM users WHERE username = ?');
const insertUserStmt = db.prepare(
  `INSERT INTO users (username, display_name, bio, avatar_url, is_bot, password_hash)
   VALUES (?, ?, ?, '', 0, ?)`
);
const insertTweetStmt = db.prepare('INSERT INTO tweets (user_id, content, link_image_url) VALUES (?, ?, ?)');
const selectUserTweetsStmt = db.prepare('SELECT id, user_id, content, created_at FROM tweets WHERE user_id = ? ORDER BY id DESC LIMIT 10');
const insertLikeStmt = db.prepare('INSERT OR IGNORE INTO likes (user_id, tweet_id) VALUES (?, ?)');
const insertReplyStmt = db.prepare('INSERT INTO replies (tweet_id, user_id, content) VALUES (?, ?, ?)');

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

async function ensureDemoUser(account) {
  const existing = selectUserStmt.get(account.username);
  if (existing) {
    return existing;
  }

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  insertUserStmt.run(account.username, account.displayName, account.bio, hash);
  return selectUserStmt.get(account.username);
}

function createPostsForUser(userId) {
  const postCount = 2;
  for (let index = 0; index < postCount; index += 1) {
    const content = pickRandom(SAMPLE_POSTS);
    const result = insertTweetStmt.run(userId, content, '');
    const tweetId = Number(result.lastInsertRowid);
    assignTopicsToTweet(tweetId, content, '');
  }
}

function createSocialInteractions(userIds) {
  for (const userId of userIds) {
    const tweets = selectUserTweetsStmt.all(userId);
    for (const tweet of tweets.slice(0, 2)) {
      const otherUsers = userIds.filter((candidateId) => candidateId !== userId);
      const likerA = pickRandom(otherUsers);
      const likerB = pickRandom(otherUsers);
      insertLikeStmt.run(likerA, tweet.id);
      insertLikeStmt.run(likerB, tweet.id);

      const commenter = pickRandom(otherUsers);
      insertReplyStmt.run(tweet.id, commenter, pickRandom(SAMPLE_COMMENTS));
    }
  }
}

async function main() {
  const createdUsers = [];
  for (const account of DEMO_USERS) {
    const user = await ensureDemoUser(account);
    createdUsers.push(user);
  }

  for (const user of createdUsers) {
    createPostsForUser(user.id);
  }
  createSocialInteractions(createdUsers.map((user) => user.id));

  console.log(`Seed complete. Demo users: ${createdUsers.length}`);
  console.log(`Demo password: ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
});

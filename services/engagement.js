const db = require('../config/db');

const ACHIEVEMENT_DEFINITIONS = [
  {
    code: 'first_post',
    title: 'First Post',
    description: 'Publish your first post',
    icon: '✍️',
    target: 1
  },
  {
    code: 'first_reply',
    title: 'First Reply',
    description: 'Join a thread with your first reply',
    icon: '💬',
    target: 1
  },
  {
    code: 'ten_likes_received',
    title: '10 Likes',
    description: 'Collect 10 likes across your posts',
    icon: '🔥',
    target: 10
  },
  {
    code: 'reply_chain_started',
    title: 'Reply Chain',
    description: 'Have one post reach 3 replies',
    icon: '🧵',
    target: 3
  }
];

const ACHIEVEMENT_BY_CODE = new Map(ACHIEVEMENT_DEFINITIONS.map((item) => [item.code, item]));

const selectStreakStmt = db.prepare(
  'SELECT user_id, current_streak, best_streak, last_activity_date FROM user_streaks WHERE user_id = ?'
);
const insertStreakStmt = db.prepare(
  "INSERT INTO user_streaks (user_id, current_streak, best_streak, last_activity_date, updated_at) VALUES (?, 1, 1, ?, datetime('now'))"
);
const updateStreakStmt = db.prepare(
  "UPDATE user_streaks SET current_streak = ?, best_streak = ?, last_activity_date = ?, updated_at = datetime('now') WHERE user_id = ?"
);

const insertAchievementStmt = db.prepare(
  "INSERT OR IGNORE INTO user_achievements (user_id, code, unlocked_at) VALUES (?, ?, datetime('now'))"
);
const selectUnlockedAchievementsStmt = db.prepare(
  'SELECT code, unlocked_at FROM user_achievements WHERE user_id = ?'
);

const selectTweetCountStmt = db.prepare('SELECT COUNT(*) AS value FROM tweets WHERE user_id = ?');
const selectReplyCountStmt = db.prepare('SELECT COUNT(*) AS value FROM replies WHERE user_id = ?');
const selectLikesReceivedStmt = db.prepare(
  `SELECT COUNT(*) AS value
   FROM likes l
   JOIN tweets t ON t.id = l.tweet_id
   WHERE t.user_id = ?`
);
const selectMaxThreadRepliesStmt = db.prepare(
  `SELECT COALESCE(MAX(reply_total), 0) AS value
   FROM (
     SELECT COUNT(r.id) AS reply_total
     FROM tweets t
     LEFT JOIN replies r ON r.tweet_id = t.id
     WHERE t.user_id = ?
     GROUP BY t.id
   ) reply_counts`
);

function toUtcDateString(date) {
  return date.toISOString().slice(0, 10);
}

function getTodayUtc() {
  return toUtcDateString(new Date());
}

function getYesterdayUtc(todayUtc) {
  const today = new Date(`${todayUtc}T00:00:00.000Z`);
  today.setUTCDate(today.getUTCDate() - 1);
  return toUtcDateString(today);
}

function unlockAchievement(userId, code) {
  if (!ACHIEVEMENT_BY_CODE.has(code)) {
    return;
  }

  insertAchievementStmt.run(userId, code);
}

function recordUserActivity(userId) {
  const todayUtc = getTodayUtc();
  const streak = selectStreakStmt.get(userId);

  if (!streak) {
    insertStreakStmt.run(userId, todayUtc);
    return { currentStreak: 1, bestStreak: 1, lastActivityDate: todayUtc };
  }

  if (streak.last_activity_date === todayUtc) {
    return {
      currentStreak: streak.current_streak,
      bestStreak: streak.best_streak,
      lastActivityDate: streak.last_activity_date
    };
  }

  const yesterdayUtc = getYesterdayUtc(todayUtc);
  const nextCurrentStreak =
    streak.last_activity_date === yesterdayUtc ? streak.current_streak + 1 : 1;
  const nextBestStreak = Math.max(streak.best_streak, nextCurrentStreak);

  updateStreakStmt.run(nextCurrentStreak, nextBestStreak, todayUtc, userId);

  return {
    currentStreak: nextCurrentStreak,
    bestStreak: nextBestStreak,
    lastActivityDate: todayUtc
  };
}

function evaluatePostAchievements(userId) {
  if (selectTweetCountStmt.get(userId).value >= 1) {
    unlockAchievement(userId, 'first_post');
  }

  if (selectLikesReceivedStmt.get(userId).value >= 10) {
    unlockAchievement(userId, 'ten_likes_received');
  }
}

function evaluateReplyAchievements(userId) {
  if (selectReplyCountStmt.get(userId).value >= 1) {
    unlockAchievement(userId, 'first_reply');
  }
}

function evaluateReplyChainAchievement(userId) {
  if (selectMaxThreadRepliesStmt.get(userId).value >= 3) {
    unlockAchievement(userId, 'reply_chain_started');
  }
}

function onTweetCreated(userId) {
  recordUserActivity(userId);
  evaluatePostAchievements(userId);
}

function onReplyCreated(userId, tweetOwnerId) {
  recordUserActivity(userId);
  evaluateReplyAchievements(userId);
  if (tweetOwnerId) {
    evaluateReplyChainAchievement(tweetOwnerId);
  }
}

function onTweetLiked(tweetOwnerId) {
  if (!tweetOwnerId) {
    return;
  }

  evaluatePostAchievements(tweetOwnerId);
}

function buildProgress(code, userId) {
  const definition = ACHIEVEMENT_BY_CODE.get(code);
  if (!definition) {
    return { current: 0, target: 1 };
  }

  if (code === 'first_post') {
    return { current: selectTweetCountStmt.get(userId).value, target: definition.target };
  }

  if (code === 'first_reply') {
    return { current: selectReplyCountStmt.get(userId).value, target: definition.target };
  }

  if (code === 'ten_likes_received') {
    return { current: selectLikesReceivedStmt.get(userId).value, target: definition.target };
  }

  if (code === 'reply_chain_started') {
    return { current: selectMaxThreadRepliesStmt.get(userId).value, target: definition.target };
  }

  return { current: 0, target: definition.target || 1 };
}

function getUserEngagementSummary(userId) {
  evaluatePostAchievements(userId);
  evaluateReplyAchievements(userId);
  evaluateReplyChainAchievement(userId);

  const streak = selectStreakStmt.get(userId);
  const unlockedRows = selectUnlockedAchievementsStmt.all(userId);
  const unlockedByCode = new Map(unlockedRows.map((row) => [row.code, row]));

  const achievements = ACHIEVEMENT_DEFINITIONS.map((definition) => ({
    code: definition.code,
    title: definition.title,
    description: definition.description,
    icon: definition.icon,
    unlockedAt: unlockedByCode.has(definition.code) ? unlockedByCode.get(definition.code).unlocked_at : null
  }));

  const nextAchievement = achievements.find((achievement) => !achievement.unlockedAt) || null;
  let nextAchievementProgress = null;
  if (nextAchievement) {
    const progress = buildProgress(nextAchievement.code, userId);
    nextAchievementProgress = {
      code: nextAchievement.code,
      title: nextAchievement.title,
      description: nextAchievement.description,
      current: progress.current,
      target: progress.target
    };
  }

  return {
    streak: {
      current: streak ? streak.current_streak : 0,
      best: streak ? streak.best_streak : 0,
      lastActivityDate: streak ? streak.last_activity_date : null
    },
    unlockedAchievements: achievements.filter((achievement) => achievement.unlockedAt),
    totalAchievements: achievements.length,
    nextAchievement: nextAchievementProgress
  };
}

module.exports = {
  onReplyCreated,
  onTweetCreated,
  onTweetLiked,
  getUserEngagementSummary
};

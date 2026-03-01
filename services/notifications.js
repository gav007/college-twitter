const db = require('../config/db');

const createFollowedPostNotificationsStmt = db.prepare(
  `INSERT INTO notifications (user_id, actor_id, tweet_id, type)
  SELECT
    f.follower_id,
    ?,
    ?,
    'followed_post'
  FROM follows f
  WHERE f.following_id = ?
    AND f.notify_posts = 1
    AND f.follower_id != ?`
);

const createReplyNotificationStmt = db.prepare(
  `INSERT INTO notifications (user_id, actor_id, tweet_id, type)
  VALUES (?, ?, ?, 'reply_to_you')`
);

function createFollowedPostNotifications(authorUserId, tweetId) {
  createFollowedPostNotificationsStmt.run(authorUserId, tweetId, authorUserId, authorUserId);
}

function createReplyNotification(targetUserId, actorUserId, tweetId) {
  if (!targetUserId || targetUserId === actorUserId) {
    return;
  }

  createReplyNotificationStmt.run(targetUserId, actorUserId, tweetId);
}

module.exports = {
  createFollowedPostNotifications,
  createReplyNotification
};

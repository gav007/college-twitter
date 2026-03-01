const express = require('express');

const db = require('../config/db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.get('/', requireAuth, (req, res, next) => {
  try {
    const currentUserId = req.session.userId;
    const tweets = db
      .prepare(
        `SELECT
          t.id,
          t.user_id,
          t.content,
          t.created_at,
          u.username,
          u.display_name,
          COUNT(DISTINCT l.user_id) AS like_count,
          COUNT(DISTINCT r.id) AS reply_count,
          MAX(CASE WHEN l.user_id = ? THEN 1 ELSE 0 END) AS liked_by_me
        FROM tweets t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN likes l ON l.tweet_id = t.id
        LEFT JOIN replies r ON r.tweet_id = t.id
        WHERE t.user_id = ?
           OR t.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)
        GROUP BY t.id
        ORDER BY t.created_at DESC
        LIMIT 50`
      )
      .all(currentUserId, currentUserId, currentUserId);

    return res.render('home', {
      tweets,
      error: req.query.error || null
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

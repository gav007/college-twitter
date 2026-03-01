const express = require('express');

const db = require('../config/db');
const requireAuth = require('../middleware/requireAuth');
const { writeLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/users/:username', (req, res, next) => {
  try {
    const username = (req.params.username || '').trim();
    const currentUserId = req.session.userId || 0;

    const profileUser = db
      .prepare('SELECT id, username, display_name, bio, created_at FROM users WHERE username = ?')
      .get(username);

    if (!profileUser) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }

    const counts = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM follows WHERE following_id = u.id) AS follower_count,
          (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) AS following_count
        FROM users u
        WHERE u.id = ?`
      )
      .get(profileUser.id);

    let isFollowing = false;
    if (req.session.userId && req.session.userId !== profileUser.id) {
      const followRow = db
        .prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?')
        .get(req.session.userId, profileUser.id);
      isFollowing = !!followRow;
    }

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
        WHERE u.username = ?
        GROUP BY t.id
        ORDER BY t.created_at DESC
        LIMIT 50`
      )
      .all(currentUserId, username);

    return res.render('profile', {
      profileUser,
      tweets,
      isFollowing,
      followerCount: counts.follower_count,
      followingCount: counts.following_count
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/users/:username/follow', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const username = (req.params.username || '').trim();

    const targetUser = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username);
    if (!targetUser) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }

    if (targetUser.id === req.session.userId) {
      return res.status(400).render('error', { status: 400, message: 'You cannot follow yourself' });
    }

    const existingFollow = db
      .prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?')
      .get(req.session.userId, targetUser.id);

    if (existingFollow) {
      db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(
        req.session.userId,
        targetUser.id
      );
    } else {
      db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(
        req.session.userId,
        targetUser.id
      );
    }

    const backUrl = req.get('referer') || `/users/${targetUser.username}`;
    return res.redirect(backUrl);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

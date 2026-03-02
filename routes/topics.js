const express = require('express');

const db = require('../config/db');
const requireAuth = require('../middleware/requireAuth');
const { writeLimiter } = require('../middleware/rateLimit');
const { getSafeBackUrl } = require('../services/security');

const router = express.Router();

const selectTopicsStmt = db.prepare(
  `SELECT
    t.slug,
    t.label,
    t.description,
    CASE WHEN ut.user_id IS NULL THEN 0 ELSE 1 END AS is_following
  FROM topics t
  LEFT JOIN user_topics ut
    ON ut.topic_slug = t.slug
   AND ut.user_id = ?
  ORDER BY t.label ASC`
);

const selectTopicStmt = db.prepare('SELECT slug FROM topics WHERE slug = ?');
const selectFollowStmt = db.prepare('SELECT 1 FROM user_topics WHERE user_id = ? AND topic_slug = ?');
const insertFollowStmt = db.prepare('INSERT OR IGNORE INTO user_topics (user_id, topic_slug) VALUES (?, ?)');
const deleteFollowStmt = db.prepare('DELETE FROM user_topics WHERE user_id = ? AND topic_slug = ?');

router.get('/topics', requireAuth, (req, res, next) => {
  try {
    const topics = selectTopicsStmt.all(req.session.userId);
    return res.render('topics', {
      topics
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/topics/:slug/toggle', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!slug || !selectTopicStmt.get(slug)) {
      return res.status(404).render('error', { status: 404, message: 'Topic not found' });
    }

    const userId = req.session.userId;
    const existing = selectFollowStmt.get(userId, slug);
    if (existing) {
      deleteFollowStmt.run(userId, slug);
    } else {
      insertFollowStmt.run(userId, slug);
    }

    const backUrl = getSafeBackUrl(req, '/topics');
    return res.redirect(backUrl);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

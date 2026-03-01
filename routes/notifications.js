const express = require('express');

const db = require('../config/db');
const requireAuth = require('../middleware/requireAuth');
const { writeLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/notifications', requireAuth, (req, res, next) => {
  try {
    const notifications = db
      .prepare(
        `SELECT
          n.id,
          n.user_id,
          n.actor_id,
          n.tweet_id,
          n.type,
          n.created_at,
          n.read_at,
          u.username AS actor_username,
          u.display_name AS actor_display_name
        FROM notifications n
        JOIN users u ON u.id = n.actor_id
        WHERE n.user_id = ?
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT 100`
      )
      .all(req.session.userId);

    return res.render('notifications', {
      notifications
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/notifications/:id/read', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const notificationId = Number(req.params.id);
    if (!Number.isInteger(notificationId)) {
      return res.status(400).render('error', { status: 400, message: 'Invalid notification id' });
    }

    db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?").run(
      notificationId,
      req.session.userId
    );

    return res.redirect('/notifications');
  } catch (err) {
    return next(err);
  }
});

router.post('/notifications/read-all', requireAuth, writeLimiter, (req, res, next) => {
  try {
    db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(
      req.session.userId
    );
    return res.redirect('/notifications');
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

const express = require('express');

const db = require('../config/db');
const requireAuth = require('../middleware/requireAuth');
const { writeLimiter } = require('../middleware/rateLimit');
const { getSafeBackUrl } = require('../services/security');

const router = express.Router();
const POKE_COOLDOWN_HOURS = 6;
const POKE_DAILY_LIMIT = 24;
const USERNAME_REGEX = /^[A-Za-z0-9_]{3,20}$/;

function canPokeTarget(senderId, targetUser) {
  if (!targetUser || targetUser.id === senderId) {
    return false;
  }

  if (!targetUser.is_private) {
    return true;
  }

  const follows = db
    .prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?')
    .get(senderId, targetUser.id);
  return !!follows;
}

router.get('/pokes', requireAuth, (req, res, next) => {
  try {
    const userId = req.session.userId;

    const incoming = db
      .prepare(
        `SELECT
          p.id,
          p.created_at,
          p.read_at,
          u.id AS sender_id,
          u.username,
          u.display_name,
          u.avatar_url,
          u.is_bot
        FROM pokes p
        JOIN users u ON u.id = p.sender_id
        WHERE p.receiver_id = ?
        ORDER BY p.created_at DESC
        LIMIT 200`
      )
      .all(userId);

    const sent = db
      .prepare(
        `SELECT
          p.id,
          p.created_at,
          u.id AS receiver_id,
          u.username,
          u.display_name,
          u.avatar_url,
          u.is_bot
        FROM pokes p
        JOIN users u ON u.id = p.receiver_id
        WHERE p.sender_id = ?
        ORDER BY p.created_at DESC
        LIMIT 80`
      )
      .all(userId);

    db.prepare("UPDATE pokes SET read_at = datetime('now') WHERE receiver_id = ? AND read_at IS NULL").run(userId);

    return res.render('pokes', {
      title: 'Pokes',
      incoming,
      sent
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/pokes/:username', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const currentUserId = req.session.userId;
    const username = (req.params.username || '').trim();
    if (!USERNAME_REGEX.test(username)) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }
    const targetUser = db
      .prepare('SELECT id, username, display_name, is_private FROM users WHERE username = ?')
      .get(username);

    if (!targetUser) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }

    if (!canPokeTarget(currentUserId, targetUser)) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You can only poke users you are allowed to follow.'
      });
    }

    const recentPoke = db
      .prepare(
        `SELECT created_at
        FROM pokes
        WHERE sender_id = ?
          AND receiver_id = ?
        ORDER BY created_at DESC
        LIMIT 1`
      )
      .get(currentUserId, targetUser.id);

    if (recentPoke && recentPoke.created_at) {
      const elapsedMs = Date.now() - Date.parse(`${recentPoke.created_at}Z`);
      if (Number.isFinite(elapsedMs) && elapsedMs < POKE_COOLDOWN_HOURS * 60 * 60 * 1000) {
        return res.status(429).render('error', {
          status: 429,
          message: `Poke cooldown active. You can poke @${targetUser.username} again in about ${POKE_COOLDOWN_HOURS} hours.`
        });
      }
    }

    const dailyCountRow = db
      .prepare(
        `SELECT COUNT(*) AS total
        FROM pokes
        WHERE sender_id = ?
          AND created_at >= datetime('now', '-1 day')`
      )
      .get(currentUserId);
    const dailyCount = dailyCountRow ? dailyCountRow.total : 0;
    if (dailyCount >= POKE_DAILY_LIMIT) {
      return res.status(429).render('error', {
        status: 429,
        message: 'Daily poke limit reached. Try again tomorrow.'
      });
    }

    db.prepare('INSERT INTO pokes (sender_id, receiver_id) VALUES (?, ?)').run(currentUserId, targetUser.id);

    const backUrl = getSafeBackUrl(req, `/users/${targetUser.username}`);
    return res.redirect(backUrl);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

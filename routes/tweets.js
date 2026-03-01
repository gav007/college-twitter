const express = require('express');
const fs = require('fs');

const db = require('../config/db');
const requireAuth = require('../middleware/requireAuth');
const { writeLimiter } = require('../middleware/rateLimit');
const { createFollowedPostNotifications, createReplyNotification } = require('../services/notifications');
const {
  buildStoredImagePath,
  deleteFileSafe,
  deleteTweetAndMedia,
  validateUploadedImage
} = require('../services/tweetMedia');

const router = express.Router();

const insertTweetStmt = db.prepare('INSERT INTO tweets (user_id, content) VALUES (?, ?)');
const insertTweetMediaStmt = db.prepare(
  "INSERT INTO tweet_media (tweet_id, file_path, mime_type, size_bytes, expires_at) VALUES (?, ?, ?, ?, datetime('now', '+1 hour'))"
);
const createTweetWithOptionalMedia = db.transaction((payload) => {
  const tweetResult = insertTweetStmt.run(payload.userId, payload.content);
  const tweetId = Number(tweetResult.lastInsertRowid);

  if (payload.media) {
    insertTweetMediaStmt.run(tweetId, payload.media.filePath, payload.media.mimeType, payload.media.sizeBytes);
  }

  return tweetId;
});

router.get('/media/:id', (req, res, next) => {
  try {
    const mediaId = Number(req.params.id);
    if (!Number.isInteger(mediaId)) {
      return res.status(400).render('error', { status: 400, message: 'Invalid media id' });
    }

    const media = db
      .prepare(
        `SELECT
          tm.id,
          tm.tweet_id,
          tm.file_path,
          tm.mime_type,
          CASE WHEN tm.expires_at <= datetime('now') THEN 1 ELSE 0 END AS is_expired
        FROM tweet_media tm
        WHERE tm.id = ?`
      )
      .get(mediaId);

    if (!media) {
      return res.status(404).render('error', { status: 404, message: 'Media not found' });
    }

    if (media.is_expired) {
      deleteTweetAndMedia(media.tweet_id);
      return res.status(404).render('error', { status: 404, message: 'Media has expired' });
    }

    if (!fs.existsSync(media.file_path)) {
      deleteTweetAndMedia(media.tweet_id);
      return res.status(404).render('error', { status: 404, message: 'Media not found' });
    }

    res.set('Cache-Control', 'no-store');
    res.type(media.mime_type);
    return res.sendFile(media.file_path);
  } catch (err) {
    return next(err);
  }
});

router.get('/tweets/:id', (req, res, next) => {
  try {
    const tweetId = Number(req.params.id);
    if (!Number.isInteger(tweetId)) {
      return res.status(400).render('error', { status: 400, message: 'Invalid tweet id' });
    }

    const currentUserId = req.session.userId || 0;
    const parentTweet = db
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
          MAX(tm.id) AS media_id,
          MAX(CASE WHEN l.user_id = ? THEN 1 ELSE 0 END) AS liked_by_me
        FROM tweets t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN likes l ON l.tweet_id = t.id
        LEFT JOIN replies r ON r.tweet_id = t.id
        LEFT JOIN tweet_media tm ON tm.tweet_id = t.id
        WHERE t.id = ?
          AND NOT EXISTS (
            SELECT 1
            FROM tweet_media em
            WHERE em.tweet_id = t.id
              AND em.expires_at <= datetime('now')
          )
        GROUP BY t.id`
      )
      .get(currentUserId, tweetId);

    if (!parentTweet) {
      return res.status(404).render('error', { status: 404, message: 'Tweet not found' });
    }

    const replies = db
      .prepare(
        `SELECT
          r.id,
          r.tweet_id,
          r.user_id,
          r.content,
          r.created_at,
          u.username,
          u.display_name
        FROM replies r
        JOIN users u ON u.id = r.user_id
        WHERE r.tweet_id = ?
        ORDER BY r.created_at ASC, r.id ASC
        LIMIT 200`
      )
      .all(tweetId);

    return res.render('thread', {
      tweet: parentTweet,
      replies,
      error: req.query.error || null
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/tweets', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const content = (req.body.content || '').trim();

    if (!content) {
      return res.redirect('/?error=Tweet%20cannot%20be%20empty');
    }

    if (content.length > 280) {
      return res.redirect('/?error=Tweet%20cannot%20exceed%20280%20characters');
    }

    let media = null;
    if (req.file) {
      const validation = validateUploadedImage(req.file);
      if (!validation.ok) {
        return res.redirect(`/?error=${encodeURIComponent(validation.message)}`);
      }

      const filePath = buildStoredImagePath(validation.extension);
      fs.writeFileSync(filePath, req.file.buffer, { flag: 'wx' });

      media = {
        filePath,
        mimeType: validation.mimeType,
        sizeBytes: req.file.size
      };
    }

    let tweetId;
    try {
      tweetId = createTweetWithOptionalMedia({
        userId: req.session.userId,
        content,
        media
      });
    } catch (err) {
      if (media && media.filePath) {
        deleteFileSafe(media.filePath);
      }
      throw err;
    }

    createFollowedPostNotifications(req.session.userId, tweetId);

    return res.redirect('/');
  } catch (err) {
    return next(err);
  }
});

router.post('/tweets/:id/replies', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const tweetId = Number(req.params.id);
    if (!Number.isInteger(tweetId)) {
      return res.status(400).render('error', { status: 400, message: 'Invalid tweet id' });
    }

    const parentTweet = db
      .prepare(
        `SELECT id, user_id
        FROM tweets t
        WHERE t.id = ?
          AND NOT EXISTS (
            SELECT 1
            FROM tweet_media em
            WHERE em.tweet_id = t.id
              AND em.expires_at <= datetime('now')
          )`
      )
      .get(tweetId);
    if (!parentTweet) {
      return res.status(404).render('error', { status: 404, message: 'Tweet not found' });
    }

    const content = (req.body.content || '').trim();
    if (!content) {
      return res.redirect(`/tweets/${tweetId}?error=Reply%20cannot%20be%20empty`);
    }

    if (content.length > 280) {
      return res.redirect(`/tweets/${tweetId}?error=Reply%20cannot%20exceed%20280%20characters`);
    }

    db.prepare('INSERT INTO replies (tweet_id, user_id, content) VALUES (?, ?, ?)').run(
      tweetId,
      req.session.userId,
      content
    );
    createReplyNotification(parentTweet.user_id, req.session.userId, tweetId);

    return res.redirect(`/tweets/${tweetId}`);
  } catch (err) {
    return next(err);
  }
});

router.post('/tweets/:id/delete', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const tweetId = Number(req.params.id);
    if (!Number.isInteger(tweetId)) {
      return res.status(400).render('error', { status: 400, message: 'Invalid tweet id' });
    }

    const tweet = db.prepare('SELECT id, user_id FROM tweets WHERE id = ?').get(tweetId);
    if (!tweet) {
      return res.status(404).render('error', { status: 404, message: 'Tweet not found' });
    }

    if (tweet.user_id !== req.session.userId) {
      return res.status(403).render('error', { status: 403, message: 'Forbidden' });
    }

    deleteTweetAndMedia(tweetId);

    const backUrl = req.get('referer') || '/';
    return res.redirect(backUrl);
  } catch (err) {
    return next(err);
  }
});

router.post('/tweets/:id/like', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const tweetId = Number(req.params.id);
    if (!Number.isInteger(tweetId)) {
      return res.status(400).json({ liked: false, like_count: 0 });
    }

    const tweet = db
      .prepare(
        `SELECT id
        FROM tweets t
        WHERE t.id = ?
          AND NOT EXISTS (
            SELECT 1
            FROM tweet_media em
            WHERE em.tweet_id = t.id
              AND em.expires_at <= datetime('now')
          )`
      )
      .get(tweetId);
    if (!tweet) {
      return res.status(404).json({ liked: false, like_count: 0 });
    }

    const existingLike = db
      .prepare('SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = ?')
      .get(req.session.userId, tweetId);

    let liked;
    if (existingLike) {
      db.prepare('DELETE FROM likes WHERE user_id = ? AND tweet_id = ?').run(req.session.userId, tweetId);
      liked = false;
    } else {
      db.prepare('INSERT INTO likes (user_id, tweet_id) VALUES (?, ?)').run(req.session.userId, tweetId);
      liked = true;
    }

    const row = db.prepare('SELECT COUNT(*) AS like_count FROM likes WHERE tweet_id = ?').get(tweetId);
    return res.json({
      liked,
      like_count: row.like_count
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

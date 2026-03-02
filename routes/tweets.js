const express = require('express');
const fs = require('fs');

const db = require('../config/db');
const requireAuth = require('../middleware/requireAuth');
const { writeLimiter } = require('../middleware/rateLimit');
const { onReplyCreated, onTweetCreated, onTweetLiked } = require('../services/engagement');
const { createFollowedPostNotifications, createReplyNotification } = require('../services/notifications');
const { getSafeBackUrl } = require('../services/security');
const { assignTopicsToTweet } = require('../services/topicClassifier');
const {
  buildStoredImagePath,
  deleteFileSafe,
  deleteTweetAndMedia,
  validateUploadedImage
} = require('../services/tweetMedia');

const router = express.Router();

const VALID_REACTION_KINDS = new Set(['like', 'love', 'haha', 'wow', 'sad']);

const insertTweetStmt = db.prepare(
  `INSERT INTO tweets (
    user_id,
    content,
    link_image_url,
    quoted_tweet_id,
    quoted_author_username,
    quoted_author_display_name,
    quoted_content,
    quoted_link_image_url
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertQuoteTweetStmt = db.prepare(
  `INSERT INTO tweets (
    user_id,
    content,
    link_image_url,
    quoted_tweet_id,
    quoted_author_username,
    quoted_author_display_name,
    quoted_content,
    quoted_link_image_url
  ) VALUES (?, ?, '', ?, ?, ?, ?, ?)`
);
const insertTweetMediaStmt = db.prepare(
  "INSERT INTO tweet_media (tweet_id, file_path, mime_type, size_bytes, expires_at) VALUES (?, ?, ?, ?, datetime('now', '+1 hour'))"
);
const createTweetWithOptionalMedia = db.transaction((payload) => {
  const tweetResult = insertTweetStmt.run(
    payload.userId,
    payload.content,
    payload.linkImageUrl || '',
    payload.quotedTweetId || null,
    payload.quotedAuthorUsername || '',
    payload.quotedAuthorDisplayName || '',
    payload.quotedContent || '',
    payload.quotedLinkImageUrl || ''
  );
  const tweetId = Number(tweetResult.lastInsertRowid);

  if (payload.media) {
    insertTweetMediaStmt.run(tweetId, payload.media.filePath, payload.media.mimeType, payload.media.sizeBytes);
  }

  return tweetId;
});

const createQuoteTweetTx = db.transaction((payload) => {
  const result = insertQuoteTweetStmt.run(
    payload.userId,
    payload.content,
    payload.quotedTweetId,
    payload.quotedAuthorUsername,
    payload.quotedAuthorDisplayName,
    payload.quotedContent,
    payload.quotedLinkImageUrl || ''
  );
  return Number(result.lastInsertRowid);
});

const selectVisibleTweetForActionStmt = db.prepare(
  `SELECT
    t.id,
    t.user_id,
    t.content,
    t.link_image_url,
    u.username,
    u.display_name
  FROM tweets t
  JOIN users u ON u.id = t.user_id
  WHERE t.id = ?
    AND (
      u.is_private = 0
      OR u.id = ?
      OR EXISTS (
        SELECT 1
        FROM follows pf
        WHERE pf.follower_id = ?
          AND pf.following_id = u.id
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM tweet_media em
      WHERE em.tweet_id = t.id
        AND em.expires_at <= datetime('now')
    )`
);

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
          t.link_image_url,
          t.quoted_tweet_id,
          t.quoted_author_username,
          t.quoted_author_display_name,
          t.quoted_content,
          t.quoted_link_image_url,
          t.created_at,
          u.is_private AS author_is_private,
          u.username,
          u.display_name,
          u.avatar_url,
          u.is_bot,
          COUNT(DISTINCT l.user_id) AS like_count,
          COUNT(DISTINCT r.id) AS reply_count,
          COUNT(DISTINCT CASE WHEN rx.kind = 'like' THEN rx.user_id END) AS reaction_like_count,
          COUNT(DISTINCT CASE WHEN rx.kind = 'love' THEN rx.user_id END) AS reaction_love_count,
          COUNT(DISTINCT CASE WHEN rx.kind = 'haha' THEN rx.user_id END) AS reaction_haha_count,
          COUNT(DISTINCT CASE WHEN rx.kind = 'wow' THEN rx.user_id END) AS reaction_wow_count,
          COUNT(DISTINCT CASE WHEN rx.kind = 'sad' THEN rx.user_id END) AS reaction_sad_count,
          MAX(CASE WHEN rx.user_id = ? THEN rx.kind ELSE '' END) AS my_reaction,
          MAX(tm.id) AS media_id,
          MAX(CASE WHEN l.user_id = ? THEN 1 ELSE 0 END) AS liked_by_me,
          CASE
            WHEN ? > 0
              AND t.user_id != ?
              AND EXISTS (
                SELECT 1
                FROM follows f2
                WHERE f2.follower_id = ?
                  AND f2.following_id = t.user_id
              )
            THEN 1
            ELSE 0
          END AS is_following_author,
          CASE
            WHEN ? > 0
              AND t.user_id != ?
              AND EXISTS (
                SELECT 1
                FROM follow_requests fr
                WHERE fr.requester_id = ?
                  AND fr.target_id = t.user_id
              )
            THEN 1
            ELSE 0
          END AS has_pending_follow_request
        FROM tweets t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN likes l ON l.tweet_id = t.id
        LEFT JOIN replies r ON r.tweet_id = t.id
        LEFT JOIN reactions rx ON rx.tweet_id = t.id
        LEFT JOIN tweet_media tm ON tm.tweet_id = t.id
        WHERE t.id = ?
          AND (
            u.is_private = 0
            OR u.id = ?
            OR EXISTS (
              SELECT 1
              FROM follows pf
              WHERE pf.follower_id = ?
                AND pf.following_id = u.id
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM tweet_media em
            WHERE em.tweet_id = t.id
              AND em.expires_at <= datetime('now')
          )
        GROUP BY t.id`
      )
      .get(
        currentUserId,
        currentUserId,
        currentUserId,
        currentUserId,
        currentUserId,
        currentUserId,
        currentUserId,
        currentUserId,
        tweetId,
        currentUserId,
        currentUserId
      );

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
          u.display_name,
          u.avatar_url
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
    onTweetCreated(req.session.userId);
    assignTopicsToTweet(tweetId, content, '');

    return res.redirect('/');
  } catch (err) {
    return next(err);
  }
});

router.get('/tweets/:id/quote', requireAuth, (req, res, next) => {
  try {
    const tweetId = Number(req.params.id);
    if (!Number.isInteger(tweetId)) {
      return res.status(400).render('error', { status: 400, message: 'Invalid tweet id' });
    }

    const currentUserId = req.session.userId;
    const sourceTweet = selectVisibleTweetForActionStmt.get(tweetId, currentUserId, currentUserId);
    if (!sourceTweet) {
      return res.status(404).render('error', { status: 404, message: 'Tweet not found' });
    }

    return res.render('quote', {
      sourceTweet,
      error: req.query.error || null
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/tweets/:id/quote', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const tweetId = Number(req.params.id);
    if (!Number.isInteger(tweetId)) {
      return res.status(400).render('error', { status: 400, message: 'Invalid tweet id' });
    }

    const currentUserId = req.session.userId;
    const sourceTweet = selectVisibleTweetForActionStmt.get(tweetId, currentUserId, currentUserId);
    if (!sourceTweet) {
      return res.status(404).render('error', { status: 404, message: 'Tweet not found' });
    }

    const content = (req.body.content || '').trim();
    if (!content) {
      return res.redirect(`/tweets/${tweetId}/quote?error=Quote%20cannot%20be%20empty`);
    }

    if (content.length > 280) {
      return res.redirect(`/tweets/${tweetId}/quote?error=Quote%20cannot%20exceed%20280%20characters`);
    }

    const quoteId = createQuoteTweetTx({
      userId: currentUserId,
      content,
      quotedTweetId: sourceTweet.id,
      quotedAuthorUsername: sourceTweet.username,
      quotedAuthorDisplayName: sourceTweet.display_name,
      quotedContent: sourceTweet.content,
      quotedLinkImageUrl: sourceTweet.link_image_url || ''
    });
    createFollowedPostNotifications(currentUserId, quoteId);
    onTweetCreated(currentUserId);
    assignTopicsToTweet(quoteId, `${content} ${sourceTweet.content}`, sourceTweet.link_image_url || '');

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

    const parentTweet = selectVisibleTweetForActionStmt.get(tweetId, req.session.userId, req.session.userId);
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
    onReplyCreated(req.session.userId, parentTweet.user_id);

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

    const backUrl = getSafeBackUrl(req, '/');
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

    const tweet = selectVisibleTweetForActionStmt.get(tweetId, req.session.userId, req.session.userId);
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
      onTweetLiked(tweet.user_id);
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

router.post('/tweets/:id/reaction', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const tweetId = Number(req.params.id);
    if (!Number.isInteger(tweetId)) {
      return res.status(400).json({ ok: false });
    }

    const kind = String(req.body.kind || '').trim();
    if (!VALID_REACTION_KINDS.has(kind)) {
      return res.status(400).json({ ok: false });
    }

    const tweet = selectVisibleTweetForActionStmt.get(tweetId, req.session.userId, req.session.userId);
    if (!tweet) {
      return res.status(404).json({ ok: false });
    }

    const existing = db
      .prepare('SELECT kind FROM reactions WHERE user_id = ? AND tweet_id = ?')
      .get(req.session.userId, tweetId);

    if (existing && existing.kind === kind) {
      db.prepare('DELETE FROM reactions WHERE user_id = ? AND tweet_id = ?').run(req.session.userId, tweetId);
    } else if (existing) {
      db.prepare('UPDATE reactions SET kind = ?, created_at = datetime(\'now\') WHERE user_id = ? AND tweet_id = ?').run(
        kind,
        req.session.userId,
        tweetId
      );
    } else {
      db.prepare('INSERT INTO reactions (user_id, tweet_id, kind) VALUES (?, ?, ?)').run(
        req.session.userId,
        tweetId,
        kind
      );
    }

    const counts = db
      .prepare(
        `SELECT
          COUNT(CASE WHEN kind = 'like' THEN 1 END) AS like_count,
          COUNT(CASE WHEN kind = 'love' THEN 1 END) AS love_count,
          COUNT(CASE WHEN kind = 'haha' THEN 1 END) AS haha_count,
          COUNT(CASE WHEN kind = 'wow' THEN 1 END) AS wow_count,
          COUNT(CASE WHEN kind = 'sad' THEN 1 END) AS sad_count
        FROM reactions
        WHERE tweet_id = ?`
      )
      .get(tweetId);

    const my = db
      .prepare('SELECT kind FROM reactions WHERE user_id = ? AND tweet_id = ?')
      .get(req.session.userId, tweetId);

    return res.json({
      ok: true,
      my_reaction: my ? my.kind : '',
      counts: {
        like: counts.like_count || 0,
        love: counts.love_count || 0,
        haha: counts.haha_count || 0,
        wow: counts.wow_count || 0,
        sad: counts.sad_count || 0
      }
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/tweets/:id/report', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const tweetId = Number(req.params.id);
    if (!Number.isInteger(tweetId)) {
      return res.status(400).render('error', { status: 400, message: 'Invalid tweet id' });
    }

    const tweet = selectVisibleTweetForActionStmt.get(tweetId, req.session.userId, req.session.userId);
    if (!tweet) {
      return res.status(404).render('error', { status: 404, message: 'Tweet not found' });
    }

    console.log(`Tweet report received: reporter=${req.session.userId} tweet_id=${tweetId}`);
    const backUrl = getSafeBackUrl(req, '/');
    return res.redirect(backUrl);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

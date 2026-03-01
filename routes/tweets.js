const express = require('express');

const db = require('../config/db');
const requireAuth = require('../middleware/requireAuth');
const { writeLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/tweets', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const content = (req.body.content || '').trim();

    if (!content) {
      return res.redirect('/?error=Tweet%20cannot%20be%20empty');
    }

    if (content.length > 280) {
      return res.redirect('/?error=Tweet%20cannot%20exceed%20280%20characters');
    }

    db.prepare('INSERT INTO tweets (user_id, content) VALUES (?, ?)').run(req.session.userId, content);
    return res.redirect('/');
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

    db.prepare('DELETE FROM tweets WHERE id = ?').run(tweetId);

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

    const tweet = db.prepare('SELECT id FROM tweets WHERE id = ?').get(tweetId);
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

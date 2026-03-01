const express = require('express');

const db = require('../config/db');

const router = express.Router();
const EXPLORE_TWEETS_LIMIT = 100;

const selectExploreTweetsStmt = db.prepare(
  `WITH latest_tweets AS (
      SELECT
        t.id,
        t.user_id,
        t.content,
        t.created_at
      FROM tweets t
      WHERE NOT EXISTS (
        SELECT 1
        FROM tweet_media em
        WHERE em.tweet_id = t.id
          AND em.expires_at <= datetime('now')
      )
      ORDER BY t.created_at DESC
      LIMIT ?
    ),
    like_counts AS (
      SELECT
        l.tweet_id,
        COUNT(*) AS like_count,
        MAX(CASE WHEN l.user_id = ? THEN 1 ELSE 0 END) AS liked_by_me
      FROM likes l
      JOIN latest_tweets lt ON lt.id = l.tweet_id
      GROUP BY l.tweet_id
    ),
    reply_counts AS (
      SELECT
        r.tweet_id,
        COUNT(*) AS reply_count
      FROM replies r
      JOIN latest_tweets lt ON lt.id = r.tweet_id
      GROUP BY r.tweet_id
    ),
    media_map AS (
      SELECT
        tm.tweet_id,
        MAX(tm.id) AS media_id
      FROM tweet_media tm
      JOIN latest_tweets lt ON lt.id = tm.tweet_id
      GROUP BY tm.tweet_id
    )
    SELECT
      lt.id,
      lt.user_id,
      lt.content,
      lt.created_at,
      u.username,
      u.display_name,
      u.is_bot,
      COALESCE(lc.like_count, 0) AS like_count,
      COALESCE(rc.reply_count, 0) AS reply_count,
      mm.media_id,
      COALESCE(lc.liked_by_me, 0) AS liked_by_me
    FROM latest_tweets lt
    JOIN users u ON u.id = lt.user_id
    LEFT JOIN like_counts lc ON lc.tweet_id = lt.id
    LEFT JOIN reply_counts rc ON rc.tweet_id = lt.id
    LEFT JOIN media_map mm ON mm.tweet_id = lt.id
    ORDER BY lt.created_at DESC`
);

function loadExploreTweets(currentUserId) {
  return selectExploreTweetsStmt.all(EXPLORE_TWEETS_LIMIT, currentUserId);
}

router.get('/explore', (req, res, next) => {
  try {
    const currentUserId = req.session.userId || 0;
    const tweets = loadExploreTweets(currentUserId);

    return res.render('explore', {
      tweets,
      query: '',
      searchResults: []
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/search', (req, res, next) => {
  try {
    const query = (req.query.q || '').trim();
    const currentUserId = req.session.userId || 0;
    const tweets = loadExploreTweets(currentUserId);

    let searchResults = [];
    if (query) {
      searchResults = db
        .prepare(
          `SELECT
            u.id,
            u.username,
            u.display_name,
            u.bio,
            u.is_bot,
            COUNT(t.id) AS tweet_count
          FROM users u
          LEFT JOIN tweets t ON t.user_id = u.id
          WHERE u.username LIKE ?
          GROUP BY u.id
          ORDER BY u.username ASC
          LIMIT 20`
        )
        .all(`%${query}%`);
    }

    return res.render('explore', {
      tweets,
      query,
      searchResults
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

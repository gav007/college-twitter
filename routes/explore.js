const express = require('express');

const db = require('../config/db');

const router = express.Router();

router.get('/explore', (req, res, next) => {
  try {
    const currentUserId = req.session.userId || 0;
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
        GROUP BY t.id
        ORDER BY t.created_at DESC
        LIMIT 100`
      )
      .all(currentUserId);

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
        GROUP BY t.id
        ORDER BY t.created_at DESC
        LIMIT 100`
      )
      .all(currentUserId);

    let searchResults = [];
    if (query) {
      searchResults = db
        .prepare(
          `SELECT
            u.id,
            u.username,
            u.display_name,
            u.bio,
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

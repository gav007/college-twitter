const express = require('express');

const db = require('../config/db');
const { attachCommentPreviews } = require('../services/commentPreviews');

const router = express.Router();
const EXPLORE_PAGE_SIZE = 20;
const SEARCH_RESULT_LIMIT = 20;
const SEARCH_QUERY_MAX_LENGTH = 120;

const selectExploreTweetsStmt = db.prepare(
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
    MAX(tm.id) AS media_id,
    MAX(CASE WHEN rx.user_id = ? THEN rx.kind ELSE '' END) AS my_reaction,
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
  WHERE (
      ? = ''
      OR t.created_at < ?
      OR (t.created_at = ? AND t.id < ?)
    )
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
  GROUP BY t.id
  ORDER BY t.created_at DESC
  LIMIT ?`
);

function loadExploreTweets(currentUserId, cursorCreatedAt, cursorId) {
  const rows = selectExploreTweetsStmt.all(
    currentUserId,
    currentUserId,
    currentUserId,
    currentUserId,
    currentUserId,
    currentUserId,
    currentUserId,
    currentUserId,
    cursorCreatedAt,
    cursorCreatedAt,
    cursorCreatedAt,
    cursorId,
    currentUserId,
    currentUserId,
    EXPLORE_PAGE_SIZE + 1
  );
  const hasMore = rows.length > EXPLORE_PAGE_SIZE;
  const tweets = hasMore ? rows.slice(0, EXPLORE_PAGE_SIZE) : rows;
  const lastTweet = hasMore ? tweets[tweets.length - 1] : null;
  const nextCursor = lastTweet
    ? {
        createdAt: lastTweet.created_at,
        id: lastTweet.id
      }
    : null;
  return { tweets, nextCursor };
}

router.get('/explore', (req, res, next) => {
  try {
    const currentUserId = req.session.userId || 0;
    const cursorCreatedAt = typeof req.query.cursorCreatedAt === 'string' ? req.query.cursorCreatedAt : '';
    const cursorIdRaw = Number(req.query.cursorId);
    const cursorId = Number.isInteger(cursorIdRaw) ? cursorIdRaw : 0;
    const { tweets, nextCursor } = loadExploreTweets(currentUserId, cursorCreatedAt, cursorId);
    attachCommentPreviews(tweets, 3);

    return res.render('explore', {
      tweets,
      query: '',
      searchResults: [],
      postSearchResults: [],
      isUserSearch: false,
      nextCursor
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/search', (req, res, next) => {
  try {
    const rawQuery = (req.query.q || '').trim();
    const query = rawQuery.length > SEARCH_QUERY_MAX_LENGTH ? rawQuery.slice(0, SEARCH_QUERY_MAX_LENGTH) : rawQuery;
    const currentUserId = req.session.userId || 0;
    const { tweets } = loadExploreTweets(currentUserId, '', 0);
    attachCommentPreviews(tweets, 3);
    const isUserSearch = query.startsWith('@');
    const userQuery = isUserSearch ? query.slice(1).trim() : query;

    let searchResults = [];
    if (userQuery) {
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
             OR u.display_name LIKE ?
          GROUP BY u.id
          ORDER BY u.username ASC
          LIMIT ?`
        )
        .all(`%${userQuery}%`, `%${userQuery}%`, SEARCH_RESULT_LIMIT);
    }

    let postSearchResults = [];
    if (query && !isUserSearch) {
      postSearchResults = db
        .prepare(
          `SELECT
            t.id,
            t.user_id,
            t.content,
            t.link_image_url,
            t.created_at,
            u.is_private AS author_is_private,
            u.username,
            u.display_name,
            u.avatar_url,
            u.is_bot,
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
          WHERE lower(t.content) LIKE lower(?)
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
          ORDER BY t.created_at DESC
          LIMIT ?`
        )
        .all(
          currentUserId,
          currentUserId,
          currentUserId,
          currentUserId,
          currentUserId,
          currentUserId,
          `%${query}%`,
          currentUserId,
          currentUserId,
          SEARCH_RESULT_LIMIT
        );
    }

    return res.render('explore', {
      tweets,
      query,
      searchResults,
      postSearchResults,
      isUserSearch,
      nextCursor: null
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

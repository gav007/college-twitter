const express = require('express');

const db = require('../config/db');
const requireAuth = require('../middleware/requireAuth');
const { attachCommentPreviews } = require('../services/commentPreviews');
const { getUserEngagementSummary } = require('../services/engagement');
const { decodeExternalText } = require('../services/externalText');

const router = express.Router();
const FEED_PAGE_SIZE = 20;
const FOR_YOU_PAGE_SIZE = 20;
const SUGGESTION_DISMISS_DAYS = 14;
const TONIGHT_WINDOW_HOURS = 72;

const baseTweetSelect = `
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
  MAX(CASE WHEN rx.user_id = @currentUserId THEN rx.kind ELSE '' END) AS my_reaction,
  MAX(CASE WHEN l.user_id = @currentUserId THEN 1 ELSE 0 END) AS liked_by_me,
  CASE
    WHEN @currentUserId > 0
      AND t.user_id != @currentUserId
      AND EXISTS (
        SELECT 1
        FROM follows f2
        WHERE f2.follower_id = @currentUserId
          AND f2.following_id = t.user_id
      )
    THEN 1
    ELSE 0
  END AS is_following_author,
  CASE
    WHEN @currentUserId > 0
      AND t.user_id != @currentUserId
      AND EXISTS (
        SELECT 1
        FROM follow_requests fr
        WHERE fr.requester_id = @currentUserId
          AND fr.target_id = t.user_id
      )
    THEN 1
    ELSE 0
  END AS has_pending_follow_request
`;

const followingFeedStmt = db.prepare(
  `SELECT
    ${baseTweetSelect}
  FROM tweets t
  JOIN users u ON u.id = t.user_id
  LEFT JOIN likes l ON l.tweet_id = t.id
  LEFT JOIN replies r ON r.tweet_id = t.id
  LEFT JOIN reactions rx ON rx.tweet_id = t.id
  LEFT JOIN tweet_media tm ON tm.tweet_id = t.id
  WHERE (
    t.user_id = @currentUserId
    OR t.user_id IN (SELECT following_id FROM follows WHERE follower_id = @currentUserId)
  )
    AND (
      u.is_private = 0
      OR u.id = @currentUserId
      OR EXISTS (
        SELECT 1
        FROM follows pf
        WHERE pf.follower_id = @currentUserId
          AND pf.following_id = u.id
      )
    )
    AND (
      @cursorCreatedAt = ''
      OR t.created_at < @cursorCreatedAt
      OR (t.created_at = @cursorCreatedAt AND t.id < @cursorId)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM tweet_media em
      WHERE em.tweet_id = t.id
        AND em.expires_at <= datetime('now')
    )
  GROUP BY t.id
  ORDER BY t.created_at DESC, t.id DESC
  LIMIT @limit`
);

const forYouFeedStmt = db.prepare(
  `SELECT
    ${baseTweetSelect},
    (
      (CASE WHEN t.user_id = @currentUserId THEN 1.8 ELSE 0 END)
      + (CASE
          WHEN EXISTS (
            SELECT 1
            FROM follows ff
            WHERE ff.follower_id = @currentUserId
              AND ff.following_id = t.user_id
          ) THEN 1.2 ELSE 0
        END)
      + (CASE
          WHEN EXISTS (
            SELECT 1
            FROM tweet_topics tt
            JOIN user_topics ut ON ut.topic_slug = tt.topic_slug
            WHERE ut.user_id = @currentUserId
              AND tt.tweet_id = t.id
          ) THEN 1.6 ELSE 0
        END)
      + (CASE
          WHEN EXISTS (
            SELECT 1
            FROM likes ml
            JOIN tweets mt ON mt.id = ml.tweet_id
            WHERE ml.user_id = @currentUserId
              AND mt.user_id = t.user_id
          ) THEN 1.1 ELSE 0
        END)
      + (CASE
          WHEN EXISTS (
            SELECT 1
            FROM replies mr
            JOIN tweets mt2 ON mt2.id = mr.tweet_id
            WHERE mr.user_id = @currentUserId
              AND mt2.user_id = t.user_id
          ) THEN 1.1 ELSE 0
        END)
      + (CASE WHEN COUNT(DISTINCT l.user_id) > 30 THEN 30 ELSE COUNT(DISTINCT l.user_id) END) * 0.06
      + (CASE WHEN COUNT(DISTINCT r.id) > 20 THEN 20 ELSE COUNT(DISTINCT r.id) END) * 0.08
      + (2.8 / (1 + ((julianday('now') - julianday(t.created_at)) * 24.0)))
      + (CASE
          WHEN (julianday('now') - julianday(t.created_at)) <= 0.5 THEN 1.1
          WHEN (julianday('now') - julianday(t.created_at)) <= 1.0 THEN 0.9
          WHEN (julianday('now') - julianday(t.created_at)) <= 2.0 THEN 0.6
          WHEN (julianday('now') - julianday(t.created_at)) <= 4.0 THEN 0.35
          ELSE 0.15
        END)
      - MIN(4.0, (julianday('now') - julianday(t.created_at)) * 1.35)
      - MIN(
          2.4,
          (
            SELECT COUNT(*)
            FROM tweets ta
            WHERE ta.user_id = t.user_id
              AND ta.created_at > t.created_at
              AND ta.created_at >= datetime('now', '-7 days')
          ) * 0.55
        )
    ) AS for_you_score
  FROM tweets t
  JOIN users u ON u.id = t.user_id
  LEFT JOIN likes l ON l.tweet_id = t.id
  LEFT JOIN replies r ON r.tweet_id = t.id
  LEFT JOIN reactions rx ON rx.tweet_id = t.id
  LEFT JOIN tweet_media tm ON tm.tweet_id = t.id
  WHERE t.created_at >= datetime('now', '-7 days')
    AND (
      u.is_private = 0
      OR u.id = @currentUserId
      OR EXISTS (
        SELECT 1
        FROM follows pf
        WHERE pf.follower_id = @currentUserId
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
  ORDER BY for_you_score DESC, t.created_at DESC, t.id DESC
  LIMIT @limit`
);

const followingNewCountStmt = db.prepare(
  `SELECT COUNT(*) AS total
  FROM tweets t
  JOIN users u ON u.id = t.user_id
  WHERE (
    t.user_id = @currentUserId
    OR t.user_id IN (SELECT following_id FROM follows WHERE follower_id = @currentUserId)
  )
    AND (
      u.is_private = 0
      OR u.id = @currentUserId
      OR EXISTS (
        SELECT 1
        FROM follows pf
        WHERE pf.follower_id = @currentUserId
          AND pf.following_id = u.id
      )
    )
    AND t.created_at > @since
    AND NOT EXISTS (
      SELECT 1
      FROM tweet_media em
      WHERE em.tweet_id = t.id
        AND em.expires_at <= datetime('now')
    )`
);

const forYouNewCountStmt = db.prepare(
  `SELECT COUNT(*) AS total
  FROM tweets t
  JOIN users u ON u.id = t.user_id
  WHERE t.created_at >= datetime('now', '-7 days')
    AND (
      u.is_private = 0
      OR u.id = @currentUserId
      OR EXISTS (
        SELECT 1
        FROM follows pf
        WHERE pf.follower_id = @currentUserId
          AND pf.following_id = u.id
      )
    )
    AND t.created_at > @since
    AND NOT EXISTS (
      SELECT 1
      FROM tweet_media em
      WHERE em.tweet_id = t.id
        AND em.expires_at <= datetime('now')
    )`
);

const suggestedUsersStmt = db.prepare(
  `WITH candidates AS (
    SELECT
      u.id,
      u.username,
      u.display_name,
      u.avatar_url,
      u.is_private,
      u.is_bot,
      (SELECT COUNT(*) FROM follows ff WHERE ff.following_id = u.id) AS follower_count,
      COALESCE((SELECT MAX(t.created_at) FROM tweets t WHERE t.user_id = u.id), '') AS recent_post_at,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM follow_requests fr
          WHERE fr.requester_id = @currentUserId
            AND fr.target_id = u.id
        )
        THEN 1
        ELSE 0
      END AS has_pending_follow_request
    FROM users u
    WHERE u.id != @currentUserId
      AND u.is_bot = 0
      AND NOT EXISTS (
        SELECT 1
        FROM follows f
        WHERE f.follower_id = @currentUserId
          AND f.following_id = u.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM user_suggestion_dismissals usd
        WHERE usd.user_id = @currentUserId
          AND usd.suggested_user_id = u.id
          AND usd.dismissed_at >= datetime('now', @dismissSince)
      )
  ),
  scored AS (
    SELECT
      c.*,
      (
        SELECT COUNT(*)
        FROM follows mine
        JOIN follows theirs ON theirs.following_id = mine.following_id
        WHERE mine.follower_id = @currentUserId
          AND theirs.follower_id = c.id
      ) AS mutual_following_count,
      (
        (SELECT COUNT(*)
          FROM likes l
          JOIN tweets t ON t.id = l.tweet_id
          WHERE l.user_id = c.id
            AND t.user_id = @currentUserId
            AND l.created_at >= datetime('now', '-21 days'))
        +
        (SELECT COUNT(*)
          FROM likes l2
          JOIN tweets t2 ON t2.id = l2.tweet_id
          WHERE l2.user_id = @currentUserId
            AND t2.user_id = c.id
            AND l2.created_at >= datetime('now', '-21 days'))
        +
        (SELECT COUNT(*)
          FROM replies r
          JOIN tweets rt ON rt.id = r.tweet_id
          WHERE r.user_id = c.id
            AND rt.user_id = @currentUserId
            AND r.created_at >= datetime('now', '-21 days'))
        +
        (SELECT COUNT(*)
          FROM replies r2
          JOIN tweets rt2 ON rt2.id = r2.tweet_id
          WHERE r2.user_id = @currentUserId
            AND rt2.user_id = c.id
            AND r2.created_at >= datetime('now', '-21 days'))
      ) AS interaction_count,
      CASE
        WHEN c.recent_post_at >= datetime('now', '-2 days') THEN 1
        ELSE 0
      END AS has_fresh_post
    FROM candidates c
  )
  SELECT
    scored.*,
    (
      (CASE WHEN scored.has_fresh_post = 1 THEN 2.2 ELSE 0 END)
      + (CASE
          WHEN scored.mutual_following_count > 12 THEN 12
          ELSE scored.mutual_following_count
        END) * 0.7
      + (CASE
          WHEN scored.interaction_count > 10 THEN 10
          ELSE scored.interaction_count
        END) * 1.1
      + (CASE
          WHEN scored.follower_count > 120 THEN 120
          ELSE scored.follower_count
        END) * 0.02
    ) AS suggestion_score
  FROM scored
  ORDER BY suggestion_score DESC, scored.recent_post_at DESC, scored.follower_count DESC, scored.id DESC
  LIMIT 6`
);

const tonightEventCandidatesStmt = db.prepare(
  `SELECT
    t.id,
    t.content,
    t.link_image_url,
    t.created_at,
    u.username,
    u.display_name
  FROM tweets t
  JOIN users u ON u.id = t.user_id
  WHERE u.username IN ('tud_events_bot', 'dublin_events_bot')
    AND t.created_at >= datetime('now', '-3 days')
  ORDER BY t.created_at DESC, t.id DESC
  LIMIT 48`
);

function parseActiveTab(raw) {
  return raw === 'for-you' ? 'for-you' : 'following';
}

function extractFirstHttpUrl(text) {
  const match = (text || '').match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0] : '';
}

function parseTweetAgeHours(createdAt) {
  if (!createdAt) {
    return 999;
  }
  const parsed = new Date(`${createdAt}Z`);
  if (Number.isNaN(parsed.getTime())) {
    return 999;
  }
  const diffMs = Date.now() - parsed.getTime();
  return diffMs / (60 * 60 * 1000);
}

function stripBotPrefix(value) {
  return (value || '')
    .replace(/^[^\w@#]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTonightNearCampus(items) {
  const campusKeywords = ['grangegorman', 'dublin 7', 'smithfield', 'stoneybatter', 'phibsborough', 'broadstone'];
  return (items || [])
    .map((row) => {
      const content = String(row.content || '');
      const lines = content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const headline = decodeExternalText(stripBotPrefix(lines[0] || ''));
      const detailLine = decodeExternalText(lines.length > 2 ? lines[1] : '');
      const linkUrl = extractFirstHttpUrl(content);
      const lower = content.toLowerCase();
      const ageHours = parseTweetAgeHours(row.created_at);
      if (!Number.isFinite(ageHours) || ageHours > TONIGHT_WINDOW_HOURS) {
        return null;
      }
      const badges = [];
      let score = Math.max(0, TONIGHT_WINDOW_HOURS - ageHours) / 8;

      if (lower.includes('tonight') || lower.includes('this evening')) {
        score += 4;
        badges.push('Tonight');
      }
      if (lower.includes('weekend') || lower.includes('saturday') || lower.includes('sunday')) {
        score += 2;
        badges.push('Weekend');
      }
      if (lower.includes('free')) {
        score += 2.4;
        badges.push('Free');
      }
      const euroMatch = content.match(/€\s*([0-9]{1,3})/i) || content.match(/([0-9]{1,3})\s*euro/i);
      if (euroMatch) {
        const amount = Number(euroMatch[1]);
        if (Number.isFinite(amount) && amount <= 10) {
          score += 1.6;
          badges.push(`€${amount}`);
        }
      }
      if (campusKeywords.some((keyword) => lower.includes(keyword))) {
        score += 2.3;
        badges.push('Near campus');
      }
      if (lower.includes('dublin')) {
        score += 0.6;
      }
      if (row.username === 'dublin_events_bot') {
        score += 0.4;
      }

      return {
        id: row.id,
        headline: headline || 'Event update',
        detail: detailLine,
        linkUrl,
        imageUrl: row.link_image_url || '',
        createdAt: row.created_at,
        score,
        badges: badges.slice(0, 3)
      };
    })
    .filter((row) => row && row.linkUrl && row.headline)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

router.get('/', requireAuth, (req, res, next) => {
  try {
    const currentUserId = req.session.userId;
    const activeTab = parseActiveTab(req.query.tab);
    const engagement = getUserEngagementSummary(currentUserId);

    let tweets = [];
    let nextCursor = null;

    if (activeTab === 'for-you') {
      tweets = forYouFeedStmt.all({
        currentUserId,
        limit: FOR_YOU_PAGE_SIZE
      });
    } else {
      const cursorCreatedAt = typeof req.query.cursorCreatedAt === 'string' ? req.query.cursorCreatedAt : '';
      const cursorIdRaw = Number(req.query.cursorId);
      const cursorId = Number.isInteger(cursorIdRaw) ? cursorIdRaw : 0;

      const fetched = followingFeedStmt.all({
        currentUserId,
        cursorCreatedAt,
        cursorId,
        limit: FEED_PAGE_SIZE + 1
      });
      const hasMore = fetched.length > FEED_PAGE_SIZE;
      tweets = hasMore ? fetched.slice(0, FEED_PAGE_SIZE) : fetched;
      const lastTweet = hasMore ? tweets[tweets.length - 1] : null;
      nextCursor = lastTweet
        ? {
            createdAt: lastTweet.created_at,
            id: lastTweet.id
          }
        : null;
    }

    attachCommentPreviews(tweets, 3);
    const suggestedUsers = suggestedUsersStmt.all({
      currentUserId,
      dismissSince: `-${SUGGESTION_DISMISS_DAYS} days`
    });
    const tonightNearCampus = buildTonightNearCampus(tonightEventCandidatesStmt.all());
    const firstTweetCreatedAt = tweets.length ? tweets[0].created_at : '';
    return res.render('home', {
      tweets,
      suggestedUsers,
      tonightNearCampus,
      engagement,
      error: req.query.error || null,
      nextCursor,
      activeTab,
      firstTweetCreatedAt
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/feed/new-count', requireAuth, (req, res, next) => {
  try {
    const currentUserId = req.session.userId;
    const activeTab = parseActiveTab(req.query.tab);
    const since = typeof req.query.since === 'string' ? req.query.since.trim() : '';

    if (!since) {
      return res.json({ count: 0 });
    }

    const stmt = activeTab === 'for-you' ? forYouNewCountStmt : followingNewCountStmt;
    const row = stmt.get({
      currentUserId,
      since
    });

    return res.json({ count: row && row.total ? row.total : 0 });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

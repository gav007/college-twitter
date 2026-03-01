const express = require('express');

const db = require('../config/db');
const requireAuth = require('../middleware/requireAuth');
const { writeLimiter } = require('../middleware/rateLimit');
const { getUserEngagementSummary } = require('../services/engagement');

const router = express.Router();
const USERNAME_REGEX = /^[A-Za-z0-9_]{3,20}$/;
const DISPLAY_NAME_MAX_LENGTH = 50;
const BIO_MAX_LENGTH = 160;
const AVATAR_URL_MAX_LENGTH = 300;

function isValidAvatarUrl(value) {
  if (!value) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_err) {
    return false;
  }
}

router.get('/users/:username', (req, res, next) => {
  try {
    const username = (req.params.username || '').trim();
    const currentUserId = req.session.userId || 0;

    const profileUser = db
      .prepare('SELECT id, username, display_name, bio, avatar_url, is_bot, created_at FROM users WHERE username = ?')
      .get(username);

    if (!profileUser) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }
    const joinedDate = new Date(`${profileUser.created_at}Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    const counts = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM tweets WHERE user_id = u.id) AS tweet_count,
          (SELECT COUNT(*) FROM follows WHERE following_id = u.id) AS follower_count,
          (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) AS following_count
        FROM users u
        WHERE u.id = ?`
      )
      .get(profileUser.id);

    let isFollowing = false;
    let notifyPostsEnabled = false;
    if (req.session.userId && req.session.userId !== profileUser.id) {
      const followRow = db
        .prepare('SELECT notify_posts FROM follows WHERE follower_id = ? AND following_id = ?')
        .get(req.session.userId, profileUser.id);
      isFollowing = !!followRow;
      notifyPostsEnabled = !!(followRow && followRow.notify_posts);
    }

    const tweets = db
      .prepare(
        `SELECT
          t.id,
          t.user_id,
          t.content,
          t.created_at,
          u.username,
          u.display_name,
          u.is_bot,
          COUNT(DISTINCT l.user_id) AS like_count,
          COUNT(DISTINCT r.id) AS reply_count,
          MAX(tm.id) AS media_id,
          MAX(CASE WHEN l.user_id = ? THEN 1 ELSE 0 END) AS liked_by_me
        FROM tweets t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN likes l ON l.tweet_id = t.id
        LEFT JOIN replies r ON r.tweet_id = t.id
        LEFT JOIN tweet_media tm ON tm.tweet_id = t.id
        WHERE u.username = ?
          AND NOT EXISTS (
            SELECT 1
            FROM tweet_media em
            WHERE em.tweet_id = t.id
              AND em.expires_at <= datetime('now')
          )
        GROUP BY t.id
        ORDER BY t.created_at DESC
        LIMIT 50`
      )
      .all(currentUserId, username);
    const profileEngagement = getUserEngagementSummary(profileUser.id);

    return res.render('profile', {
      profileUser,
      tweets,
      profileEngagement,
      isFollowing,
      notifyPostsEnabled,
      profileError: req.query.error || null,
      profileUpdated: req.query.updated === '1',
      editForm: {
        username: profileUser.username,
        display_name: profileUser.display_name,
        bio: profileUser.bio || '',
        avatar_url: profileUser.avatar_url || ''
      },
      joinedDate,
      tweetCount: counts.tweet_count,
      followerCount: counts.follower_count,
      followingCount: counts.following_count
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/users/:username/follow', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const username = (req.params.username || '').trim();

    const targetUser = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username);
    if (!targetUser) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }

    if (targetUser.id === req.session.userId) {
      return res.status(400).render('error', { status: 400, message: 'You cannot follow yourself' });
    }

    const existingFollow = db
      .prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?')
      .get(req.session.userId, targetUser.id);

    if (existingFollow) {
      db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(
        req.session.userId,
        targetUser.id
      );
    } else {
      db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(
        req.session.userId,
        targetUser.id
      );
    }

    const backUrl = req.get('referer') || `/users/${targetUser.username}`;
    return res.redirect(backUrl);
  } catch (err) {
    return next(err);
  }
});

router.post('/users/:username/notify', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const username = (req.params.username || '').trim();
    const targetUser = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username);

    if (!targetUser) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }

    if (targetUser.id === req.session.userId) {
      return res.status(400).render('error', { status: 400, message: 'Invalid notification target' });
    }

    const followRow = db
      .prepare('SELECT notify_posts FROM follows WHERE follower_id = ? AND following_id = ?')
      .get(req.session.userId, targetUser.id);

    if (!followRow) {
      return res.status(400).render('error', {
        status: 400,
        message: 'You can only toggle notifications for users you follow.'
      });
    }

    const nextValue = followRow.notify_posts ? 0 : 1;
    db.prepare('UPDATE follows SET notify_posts = ? WHERE follower_id = ? AND following_id = ?').run(
      nextValue,
      req.session.userId,
      targetUser.id
    );

    const backUrl = req.get('referer') || `/users/${targetUser.username}`;
    return res.redirect(backUrl);
  } catch (err) {
    return next(err);
  }
});

router.post('/settings/profile', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const userId = req.session.userId;
    const currentUser = db
      .prepare('SELECT id, username FROM users WHERE id = ?')
      .get(userId);

    if (!currentUser) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }

    const username = (req.body.username || '').trim();
    const displayName = (req.body.display_name || '').trim();
    const bio = (req.body.bio || '').trim();
    const avatarUrl = (req.body.avatar_url || '').trim();

    if (!USERNAME_REGEX.test(username)) {
      return res.redirect(
        `/users/${currentUser.username}?error=${encodeURIComponent(
          'Username must be 3-20 characters using letters, numbers, or underscores.'
        )}`
      );
    }

    if (!displayName) {
      return res.redirect(
        `/users/${currentUser.username}?error=${encodeURIComponent('Display name is required.')}`
      );
    }

    if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
      return res.redirect(
        `/users/${currentUser.username}?error=${encodeURIComponent(
          `Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`
        )}`
      );
    }

    if (bio.length > BIO_MAX_LENGTH) {
      return res.redirect(
        `/users/${currentUser.username}?error=${encodeURIComponent(
          `Bio must be ${BIO_MAX_LENGTH} characters or fewer.`
        )}`
      );
    }

    if (avatarUrl.length > AVATAR_URL_MAX_LENGTH) {
      return res.redirect(
        `/users/${currentUser.username}?error=${encodeURIComponent(
          `Avatar URL must be ${AVATAR_URL_MAX_LENGTH} characters or fewer.`
        )}`
      );
    }

    if (!isValidAvatarUrl(avatarUrl)) {
      return res.redirect(
        `/users/${currentUser.username}?error=${encodeURIComponent(
          'Avatar URL must be a valid HTTP or HTTPS URL.'
        )}`
      );
    }

    const existingUser = db
      .prepare('SELECT id FROM users WHERE username = ? AND id != ?')
      .get(username, userId);

    if (existingUser) {
      return res.redirect(
        `/users/${currentUser.username}?error=${encodeURIComponent('Username is already taken.')}`
      );
    }

    db.prepare('UPDATE users SET username = ?, display_name = ?, bio = ?, avatar_url = ? WHERE id = ?').run(
      username,
      displayName,
      bio,
      avatarUrl,
      userId
    );

    return res.redirect(`/users/${username}?updated=1`);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

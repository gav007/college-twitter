const express = require('express');
const fs = require('fs');
const path = require('path');

const db = require('../config/db');
const requireAuth = require('../middleware/requireAuth');
const { writeLimiter } = require('../middleware/rateLimit');
const { attachCommentPreviews } = require('../services/commentPreviews');
const { getUserEngagementSummary } = require('../services/engagement');
const {
  buildStoredAvatarPath,
  deleteLocalAvatarIfOwned,
  validateUploadedAvatar
} = require('../services/avatarMedia');
const { getSafeBackUrl } = require('../services/security');

const router = express.Router();
const USERNAME_REGEX = /^[A-Za-z0-9_]{3,20}$/;
const DISPLAY_NAME_MAX_LENGTH = 50;
const BIO_MAX_LENGTH = 160;
const AVATAR_URL_MAX_LENGTH = 300;
const dismissSuggestionStmt = db.prepare(
  `INSERT INTO user_suggestion_dismissals (user_id, suggested_user_id, dismissed_at)
   VALUES (?, ?, datetime('now'))
   ON CONFLICT(user_id, suggested_user_id) DO UPDATE SET dismissed_at = datetime('now')`
);
const approveFollowRequestTx = db.transaction((requesterId, targetId) => {
  db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)').run(requesterId, targetId);
  db.prepare('DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?').run(requesterId, targetId);
});

function isValidUsernameParam(username) {
  return USERNAME_REGEX.test(username);
}

function isValidAvatarUrl(value) {
  if (!value) {
    return true;
  }

  if (value.startsWith('/avatars/')) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_err) {
    return false;
  }
}

function loadProfileByUsername(username) {
  return db
    .prepare('SELECT id, username, display_name, bio, avatar_url, is_bot, is_private, created_at FROM users WHERE username = ?')
    .get(username);
}

function isFollowingUser(followerId, followingId) {
  if (!followerId || followerId === followingId) {
    return false;
  }

  const row = db
    .prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?')
    .get(followerId, followingId);
  return !!row;
}

function canViewPrivateProfile(viewerId, profileUser) {
  if (!profileUser || !profileUser.is_private) {
    return true;
  }

  if (viewerId && viewerId === profileUser.id) {
    return true;
  }

  return isFollowingUser(viewerId, profileUser.id);
}

function hasPendingFollowRequest(requesterId, targetId) {
  if (!requesterId || requesterId === targetId) {
    return false;
  }

  const row = db
    .prepare('SELECT 1 FROM follow_requests WHERE requester_id = ? AND target_id = ?')
    .get(requesterId, targetId);
  return !!row;
}

router.get('/follow-requests', requireAuth, (req, res, next) => {
  try {
    const currentUserId = req.session.userId;
    const requests = db
      .prepare(
        `SELECT
          u.id,
          u.username,
          u.display_name,
          u.avatar_url,
          u.is_bot,
          fr.created_at
        FROM follow_requests fr
        JOIN users u ON u.id = fr.requester_id
        WHERE fr.target_id = ?
        ORDER BY fr.created_at DESC
        LIMIT 300`
      )
      .all(currentUserId);

    return res.render('follow-requests', {
      title: 'Follow requests',
      requests
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/follow-requests/:username/approve', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const username = (req.params.username || '').trim();
    if (!isValidUsernameParam(username)) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }
    const requester = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username);
    if (!requester) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }

    const exists = db
      .prepare('SELECT 1 FROM follow_requests WHERE requester_id = ? AND target_id = ?')
      .get(requester.id, req.session.userId);
    if (!exists) {
      return res.redirect('/follow-requests');
    }

    approveFollowRequestTx(requester.id, req.session.userId);
    return res.redirect('/follow-requests');
  } catch (err) {
    return next(err);
  }
});

router.post('/follow-requests/:username/decline', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const username = (req.params.username || '').trim();
    if (!isValidUsernameParam(username)) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }
    const requester = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (!requester) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }

    db.prepare('DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?').run(
      requester.id,
      req.session.userId
    );
    return res.redirect('/follow-requests');
  } catch (err) {
    return next(err);
  }
});

router.get('/users/:username', (req, res, next) => {
  try {
    const username = (req.params.username || '').trim();
    if (!isValidUsernameParam(username)) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }
    const currentUserId = req.session.userId || 0;

    const profileUser = loadProfileByUsername(username);

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
    let hasPendingRequest = false;
    if (req.session.userId && req.session.userId !== profileUser.id) {
      const followRow = db
        .prepare('SELECT notify_posts FROM follows WHERE follower_id = ? AND following_id = ?')
        .get(req.session.userId, profileUser.id);
      isFollowing = !!followRow;
      notifyPostsEnabled = !!(followRow && followRow.notify_posts);
      hasPendingRequest = hasPendingFollowRequest(req.session.userId, profileUser.id);
    }

    const canViewPosts = canViewPrivateProfile(currentUserId, profileUser);
    const tweets = canViewPosts
      ? db
          .prepare(
            `SELECT
              t.id,
              t.user_id,
              t.content,
              t.created_at,
              t.link_image_url,
              t.quoted_tweet_id,
              t.quoted_author_username,
              t.quoted_author_display_name,
              t.quoted_content,
              t.quoted_link_image_url,
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
          .all(
            currentUserId,
            currentUserId,
            currentUserId,
            currentUserId,
            currentUserId,
            currentUserId,
            currentUserId,
            currentUserId,
            username
          )
      : [];
    attachCommentPreviews(tweets, 3);
    const profileEngagement = getUserEngagementSummary(profileUser.id);

    return res.render('profile', {
      profileUser,
      tweets,
      profileEngagement,
      isFollowing,
      hasPendingRequest,
      notifyPostsEnabled,
      profileError: req.query.error || null,
      profileUpdated: req.query.updated === '1',
      editForm: {
        username: profileUser.username,
        display_name: profileUser.display_name,
        bio: profileUser.bio || '',
        avatar_url: profileUser.avatar_url || '',
        is_private: !!profileUser.is_private
      },
      joinedDate,
      tweetCount: counts.tweet_count,
      followerCount: counts.follower_count,
      followingCount: counts.following_count,
      canViewPosts
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/users/:username/followers', (req, res, next) => {
  try {
    const username = (req.params.username || '').trim();
    if (!isValidUsernameParam(username)) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }
    const currentUserId = req.session.userId || 0;
    const profileUser = loadProfileByUsername(username);
    if (!profileUser) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }

    if (!canViewPrivateProfile(currentUserId, profileUser)) {
      return res.status(403).render('error', {
        status: 403,
        message: 'This account is private. Follow to view followers.'
      });
    }

    const users = db
      .prepare(
        `SELECT
          u.id,
          u.username,
          u.display_name,
          u.avatar_url,
          u.is_bot,
          u.is_private,
          CASE
            WHEN ? > 0
              AND u.id != ?
              AND EXISTS (
                SELECT 1
                FROM follows f2
                WHERE f2.follower_id = ?
                  AND f2.following_id = u.id
              )
            THEN 1
            ELSE 0
          END AS is_following,
          CASE
            WHEN ? > 0
              AND u.id != ?
              AND EXISTS (
                SELECT 1
                FROM follow_requests fr
                WHERE fr.requester_id = ?
                  AND fr.target_id = u.id
              )
            THEN 1
            ELSE 0
          END AS has_pending_follow_request
        FROM follows f
        JOIN users u ON u.id = f.follower_id
        WHERE f.following_id = ?
        ORDER BY f.created_at DESC
        LIMIT 300`
      )
      .all(currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, profileUser.id);

    return res.render('follow-list', {
      profileUser,
      users,
      listType: 'followers',
      title: `${profileUser.display_name} followers`
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/users/:username/following', (req, res, next) => {
  try {
    const username = (req.params.username || '').trim();
    if (!isValidUsernameParam(username)) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }
    const currentUserId = req.session.userId || 0;
    const profileUser = loadProfileByUsername(username);
    if (!profileUser) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }

    if (!canViewPrivateProfile(currentUserId, profileUser)) {
      return res.status(403).render('error', {
        status: 403,
        message: 'This account is private. Follow to view following.'
      });
    }

    const users = db
      .prepare(
        `SELECT
          u.id,
          u.username,
          u.display_name,
          u.avatar_url,
          u.is_bot,
          u.is_private,
          CASE
            WHEN ? > 0
              AND u.id != ?
              AND EXISTS (
                SELECT 1
                FROM follows f2
                WHERE f2.follower_id = ?
                  AND f2.following_id = u.id
              )
            THEN 1
            ELSE 0
          END AS is_following,
          CASE
            WHEN ? > 0
              AND u.id != ?
              AND EXISTS (
                SELECT 1
                FROM follow_requests fr
                WHERE fr.requester_id = ?
                  AND fr.target_id = u.id
              )
            THEN 1
            ELSE 0
          END AS has_pending_follow_request
        FROM follows f
        JOIN users u ON u.id = f.following_id
        WHERE f.follower_id = ?
        ORDER BY f.created_at DESC
        LIMIT 300`
      )
      .all(currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, profileUser.id);

    return res.render('follow-list', {
      profileUser,
      users,
      listType: 'following',
      title: `${profileUser.display_name} following`
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/users/:username/follow', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const username = (req.params.username || '').trim();
    if (!isValidUsernameParam(username)) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }

    const targetUser = db.prepare('SELECT id, username, is_private FROM users WHERE username = ?').get(username);
    if (!targetUser) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }

    if (targetUser.id === req.session.userId) {
      return res.status(400).render('error', { status: 400, message: 'You cannot follow yourself' });
    }

    const existingFollow = db
      .prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?')
      .get(req.session.userId, targetUser.id);
    const pendingRequest = db
      .prepare('SELECT 1 FROM follow_requests WHERE requester_id = ? AND target_id = ?')
      .get(req.session.userId, targetUser.id);

    if (existingFollow) {
      db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(
        req.session.userId,
        targetUser.id
      );
      db.prepare('DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?').run(
        req.session.userId,
        targetUser.id
      );
    } else if (targetUser.is_private) {
      if (pendingRequest) {
        db.prepare('DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?').run(
          req.session.userId,
          targetUser.id
        );
      } else {
        db.prepare('INSERT INTO follow_requests (requester_id, target_id) VALUES (?, ?)').run(
          req.session.userId,
          targetUser.id
        );
      }
    } else {
      if (pendingRequest) {
        db.prepare('DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?').run(
          req.session.userId,
          targetUser.id
        );
      }
      db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(
        req.session.userId,
        targetUser.id
      );
    }

    const backUrl = getSafeBackUrl(req, `/users/${targetUser.username}`);
    return res.redirect(backUrl);
  } catch (err) {
    return next(err);
  }
});

router.post('/users/:username/dismiss-suggestion', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const username = (req.params.username || '').trim();
    if (!isValidUsernameParam(username)) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }
    const targetUser = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username);
    if (!targetUser) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }
    if (targetUser.id === req.session.userId) {
      return res.redirect('/');
    }

    dismissSuggestionStmt.run(req.session.userId, targetUser.id);
    const backUrl = getSafeBackUrl(req, '/');
    return res.redirect(backUrl);
  } catch (err) {
    return next(err);
  }
});

router.post('/users/:username/notify', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const username = (req.params.username || '').trim();
    if (!isValidUsernameParam(username)) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }
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

    const backUrl = getSafeBackUrl(req, `/users/${targetUser.username}`);
    return res.redirect(backUrl);
  } catch (err) {
    return next(err);
  }
});

router.post('/settings/profile', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const userId = req.session.userId;
    const currentUser = db
      .prepare('SELECT id, username, avatar_url FROM users WHERE id = ?')
      .get(userId);

    if (!currentUser) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }

    const username = (req.body.username || '').trim();
    const displayName = (req.body.display_name || '').trim();
    const bio = (req.body.bio || '').trim();
    const avatarUrl = (req.body.avatar_url || '').trim();
    const isPrivate = req.body.is_private === '1' ? 1 : 0;

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

    db.prepare('UPDATE users SET username = ?, display_name = ?, bio = ?, avatar_url = ?, is_private = ? WHERE id = ?').run(
      username,
      displayName,
      bio,
      avatarUrl,
      isPrivate,
      userId
    );
    if (currentUser.avatar_url && currentUser.avatar_url !== avatarUrl) {
      deleteLocalAvatarIfOwned(currentUser.avatar_url);
    }

    return res.redirect(`/users/${username}?updated=1`);
  } catch (err) {
    return next(err);
  }
});

router.post('/settings/avatar', requireAuth, writeLimiter, (req, res, next) => {
  let uploadedFilePath = '';
  try {
    const userId = req.session.userId;
    const currentUser = db
      .prepare('SELECT id, username, avatar_url FROM users WHERE id = ?')
      .get(userId);

    if (!currentUser) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }

    const validation = validateUploadedAvatar(req.file);
    if (!validation.ok) {
      return res.redirect(`/users/${currentUser.username}?error=${encodeURIComponent(validation.message)}`);
    }

    uploadedFilePath = buildStoredAvatarPath(validation.extension);
    fs.writeFileSync(uploadedFilePath, req.file.buffer, { flag: 'wx' });
    const avatarUrl = `/avatars/${path.basename(uploadedFilePath)}`;

    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, userId);
    if (currentUser.avatar_url && currentUser.avatar_url !== avatarUrl) {
      deleteLocalAvatarIfOwned(currentUser.avatar_url);
    }

    return res.redirect(`/users/${currentUser.username}?updated=1`);
  } catch (err) {
    if (uploadedFilePath) {
      deleteLocalAvatarIfOwned(`/avatars/${path.basename(uploadedFilePath)}`);
    }
    return next(err);
  }
});

module.exports = router;

const express = require('express');

const db = require('../config/db');
const requireAuth = require('../middleware/requireAuth');
const { writeLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const MESSAGE_MAX_LENGTH = 1000;
const USERNAME_REGEX = /^[A-Za-z0-9_]{3,20}$/;

function normalizeConversationPair(leftUserId, rightUserId) {
  const left = Number(leftUserId);
  const right = Number(rightUserId);
  return left < right ? [left, right] : [right, left];
}

function findConversationByIdForUser(conversationId, userId) {
  return db
    .prepare(
      `SELECT
        c.id,
        c.user1_id,
        c.user2_id,
        c.created_at,
        c.last_message_at,
        u.id AS other_user_id,
        u.username AS other_username,
        u.display_name AS other_display_name,
        u.avatar_url AS other_avatar_url
      FROM conversations c
      JOIN users u
        ON u.id = CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END
      WHERE c.id = ?
        AND (c.user1_id = ? OR c.user2_id = ?)`
    )
    .get(userId, conversationId, userId, userId);
}

router.get('/messages', requireAuth, (req, res, next) => {
  try {
    const currentUserId = req.session.userId;
    const conversations = db
      .prepare(
        `SELECT
          c.id,
          c.created_at,
          c.last_message_at,
          u.username AS other_username,
          u.display_name AS other_display_name,
          u.avatar_url AS other_avatar_url,
          (
            SELECT m.body
            FROM messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC, m.id DESC
            LIMIT 1
          ) AS last_message_body,
          (
            SELECT COUNT(*)
            FROM messages m2
            WHERE m2.conversation_id = c.id
              AND m2.sender_id != ?
              AND m2.read_at IS NULL
          ) AS unread_count
        FROM conversations c
        JOIN users u
          ON u.id = CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END
        WHERE c.user1_id = ? OR c.user2_id = ?
        ORDER BY c.last_message_at DESC, c.id DESC`
      )
      .all(currentUserId, currentUserId, currentUserId, currentUserId);

    return res.render('messages-inbox', {
      conversations
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/messages/start/:username', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const targetUsername = (req.params.username || '').trim();
    if (!USERNAME_REGEX.test(targetUsername)) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }
    const currentUserId = req.session.userId;

    const targetUser = db
      .prepare('SELECT id, username FROM users WHERE username = ?')
      .get(targetUsername);
    if (!targetUser) {
      return res.status(404).render('error', { status: 404, message: 'User not found' });
    }
    if (targetUser.id === currentUserId) {
      return res.status(400).render('error', { status: 400, message: 'You cannot message yourself' });
    }

    const [user1Id, user2Id] = normalizeConversationPair(currentUserId, targetUser.id);
    let conversation = db
      .prepare('SELECT id FROM conversations WHERE user1_id = ? AND user2_id = ?')
      .get(user1Id, user2Id);

    if (!conversation) {
      const result = db
        .prepare(
          "INSERT INTO conversations (user1_id, user2_id, created_at, last_message_at) VALUES (?, ?, datetime('now'), datetime('now'))"
        )
        .run(user1Id, user2Id);
      conversation = { id: Number(result.lastInsertRowid) };
    }

    return res.redirect(`/messages/${conversation.id}`);
  } catch (err) {
    return next(err);
  }
});

router.get('/messages/:id', requireAuth, (req, res, next) => {
  try {
    const conversationId = Number(req.params.id);
    if (!Number.isInteger(conversationId)) {
      return res.status(400).render('error', { status: 400, message: 'Invalid conversation id' });
    }

    const currentUserId = req.session.userId;
    const conversation = findConversationByIdForUser(conversationId, currentUserId);
    if (!conversation) {
      return res.status(404).render('error', { status: 404, message: 'Conversation not found' });
    }

    const messages = db
      .prepare(
        `SELECT
          m.id,
          m.conversation_id,
          m.sender_id,
          m.body,
          m.created_at,
          m.read_at,
          u.username AS sender_username,
          u.display_name AS sender_display_name
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = ?
        ORDER BY m.created_at ASC, m.id ASC
        LIMIT 400`
      )
      .all(conversation.id);

    db.prepare("UPDATE messages SET read_at = datetime('now') WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL")
      .run(conversation.id, currentUserId);

    return res.render('messages-thread', {
      conversation,
      messages,
      messageError: req.query.error || null
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/messages/:id', requireAuth, writeLimiter, (req, res, next) => {
  try {
    const conversationId = Number(req.params.id);
    if (!Number.isInteger(conversationId)) {
      return res.status(400).render('error', { status: 400, message: 'Invalid conversation id' });
    }

    const currentUserId = req.session.userId;
    const conversation = findConversationByIdForUser(conversationId, currentUserId);
    if (!conversation) {
      return res.status(404).render('error', { status: 404, message: 'Conversation not found' });
    }

    const body = (req.body.body || '').trim();
    if (!body) {
      return res.redirect(`/messages/${conversation.id}?error=${encodeURIComponent('Message cannot be empty')}`);
    }
    if (body.length > MESSAGE_MAX_LENGTH) {
      return res.redirect(
        `/messages/${conversation.id}?error=${encodeURIComponent(`Message cannot exceed ${MESSAGE_MAX_LENGTH} characters`)}`
      );
    }

    const sendMessageTx = db.transaction(() => {
      db.prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)').run(
        conversation.id,
        currentUserId,
        body
      );
      db.prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?").run(conversation.id);
    });
    sendMessageTx();

    return res.redirect(`/messages/${conversation.id}`);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

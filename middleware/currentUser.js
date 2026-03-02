const db = require('../config/db');

function currentUser(req, res, next) {
  res.locals.currentUser = null;
  res.locals.notificationUnreadCount = 0;
  res.locals.dmUnreadCount = 0;
  res.locals.followRequestCount = 0;
  res.locals.pokeUnreadCount = 0;
  req.currentUser = null;

  if (!req.session || !req.session.userId) {
    return next();
  }

  const user = db
    .prepare('SELECT id, username, display_name, bio, avatar_url, is_bot, is_private, created_at FROM users WHERE id = ?')
    .get(req.session.userId);

  if (user) {
    res.locals.currentUser = user;
    req.currentUser = user;

    const unreadRow = db
      .prepare('SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = ? AND read_at IS NULL')
      .get(user.id);
    res.locals.notificationUnreadCount = unreadRow.unread_count;

    const dmUnreadRow = db
      .prepare(
        `SELECT COUNT(*) AS unread_count
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE m.sender_id != ?
          AND m.read_at IS NULL
          AND (c.user1_id = ? OR c.user2_id = ?)`
      )
      .get(user.id, user.id, user.id);
    res.locals.dmUnreadCount = dmUnreadRow.unread_count;

    const requestRow = db
      .prepare('SELECT COUNT(*) AS request_count FROM follow_requests WHERE target_id = ?')
      .get(user.id);
    res.locals.followRequestCount = requestRow.request_count;

    const pokeUnreadRow = db
      .prepare('SELECT COUNT(*) AS unread_count FROM pokes WHERE receiver_id = ? AND read_at IS NULL')
      .get(user.id);
    res.locals.pokeUnreadCount = pokeUnreadRow.unread_count;
  }

  return next();
}

module.exports = currentUser;

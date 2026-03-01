const db = require('../config/db');

function currentUser(req, res, next) {
  res.locals.currentUser = null;
  res.locals.notificationUnreadCount = 0;
  req.currentUser = null;

  if (!req.session || !req.session.userId) {
    return next();
  }

  const user = db
    .prepare('SELECT id, username, display_name, bio, created_at FROM users WHERE id = ?')
    .get(req.session.userId);

  if (user) {
    res.locals.currentUser = user;
    req.currentUser = user;

    const unreadRow = db
      .prepare('SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = ? AND read_at IS NULL')
      .get(user.id);
    res.locals.notificationUnreadCount = unreadRow.unread_count;
  }

  return next();
}

module.exports = currentUser;

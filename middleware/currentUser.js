const db = require('../config/db');

function currentUser(req, res, next) {
  res.locals.currentUser = null;
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
  }

  return next();
}

module.exports = currentUser;

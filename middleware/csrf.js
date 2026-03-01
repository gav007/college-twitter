const crypto = require('crypto');

function ensureCsrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }

  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function verifyCsrfToken(req, res, next) {
  if (req.method !== 'POST') {
    return next();
  }

  const formToken = req.body && req.body._csrf;
  const headerToken = req.get('x-csrf-token');
  const token = formToken || headerToken;

  if (token && req.session && token === req.session.csrfToken) {
    return next();
  }

  if ((req.get('accept') || '').includes('application/json')) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  return res.status(403).render('error', { status: 403, message: 'Invalid CSRF token' });
}

module.exports = {
  ensureCsrfToken,
  verifyCsrfToken
};

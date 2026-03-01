const express = require('express');
const bcrypt = require('bcrypt');

const db = require('../config/db');
const requireAuth = require('../middleware/requireAuth');
const { authLimiter, writeLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const SALT_ROUNDS = 10;
const USERNAME_REGEX = /^[A-Za-z0-9_]{3,20}$/;

router.get('/register', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/');
  }

  return res.render('register', {
    error: null,
    form: {
      username: '',
      display_name: ''
    }
  });
});

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    if (req.session.userId) {
      return res.redirect('/');
    }

    const username = (req.body.username || '').trim();
    const displayName = (req.body.display_name || '').trim();
    const password = req.body.password || '';
    const passwordConfirm = req.body.password_confirm || '';

    if (!USERNAME_REGEX.test(username)) {
      return res.status(400).render('register', {
        error: 'Username must be 3-20 characters using letters, numbers, or underscores.',
        form: { username, display_name: displayName }
      });
    }

    if (!displayName) {
      return res.status(400).render('register', {
        error: 'Display name is required.',
        form: { username, display_name: displayName }
      });
    }

    if (password.length < 8) {
      return res.status(400).render('register', {
        error: 'Password must be at least 8 characters.',
        form: { username, display_name: displayName }
      });
    }

    if (password !== passwordConfirm) {
      return res.status(400).render('register', {
        error: 'Passwords do not match.',
        form: { username, display_name: displayName }
      });
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return res.status(400).render('register', {
        error: 'Username is already taken.',
        form: { username, display_name: displayName }
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const insertResult = db
      .prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)')
      .run(username, displayName, passwordHash);

    req.session.userId = insertResult.lastInsertRowid;
    return res.redirect('/');
  } catch (err) {
    return next(err);
  }
});

router.get('/login', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/');
  }

  return res.render('login', {
    error: null,
    form: {
      username: ''
    }
  });
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    if (req.session.userId) {
      return res.redirect('/');
    }

    const username = (req.body.username || '').trim();
    const password = req.body.password || '';

    if (!username || !password) {
      return res.status(400).render('login', {
        error: 'Invalid credentials',
        form: { username }
      });
    }

    const user = db
      .prepare('SELECT id, username, display_name, password_hash FROM users WHERE username = ?')
      .get(username);

    if (!user) {
      return res.status(401).render('login', {
        error: 'Invalid credentials',
        form: { username }
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).render('login', {
        error: 'Invalid credentials',
        form: { username }
      });
    }

    req.session.userId = user.id;
    return res.redirect('/');
  } catch (err) {
    return next(err);
  }
});

router.post('/logout', requireAuth, writeLimiter, (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      return next(err);
    }

    res.clearCookie('ct_session');
    return res.redirect('/login');
  });
});

module.exports = router;

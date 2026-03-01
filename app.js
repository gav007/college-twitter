require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const RawSQLiteStore = require('connect-better-sqlite3')(session);

const db = require('./config/db');
const csrf = require('./middleware/csrf');
const currentUser = require('./middleware/currentUser');
const tweetUploadParser = require('./middleware/tweetUploadParser');
const authRoutes = require('./routes/auth');
const feedRoutes = require('./routes/feed');
const tweetRoutes = require('./routes/tweets');
const userRoutes = require('./routes/users');
const exploreRoutes = require('./routes/explore');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
if (isProduction) {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const dbPath = process.env.DB_PATH || '/home/ec2-user/data/college-twitter.db';
const sessionDbDir = path.dirname(dbPath);
const sessionDbFile = path.basename(dbPath);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

class SQLiteSessionStore extends session.Store {
  constructor(options) {
    super(options);
    this.rawStore = new RawSQLiteStore(options);
  }

  get(sid, callback) {
    this.rawStore.get(sid, callback);
  }

  set(sid, sess, callback) {
    this.rawStore.set(sid, sess, callback);
  }

  destroy(sid, callback) {
    this.rawStore.destroy(sid, callback);
  }

  length(callback) {
    this.rawStore.length(callback);
  }

  clear(callback) {
    try {
      const connection = this.rawStore.getConnection();
      connection.db.prepare(`DELETE FROM ${this.rawStore.table}`).run();
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  touch(sid, sess, callback) {
    try {
      const now = Date.now();
      const expiresAt = sess?.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : now + ONE_DAY_MS;
      const connection = this.rawStore.getConnection();
      connection.db
        .prepare(`UPDATE ${this.rawStore.table} SET expired = ? WHERE sid = ? AND ? <= expired`)
        .run(expiresAt, sid, now);
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }
}

app.use(
  session({
    name: 'ct_session',
    secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
    resave: false,
    saveUninitialized: false,
    store: new SQLiteSessionStore({
      dir: sessionDbDir,
      filename: sessionDbFile,
      table: 'sessions'
    }),
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    }
  })
);

app.use(express.urlencoded({ extended: false }));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'"
  );
  next();
});

function formatTime(isoString) {
  if (!isoString) return '';

  const date = new Date(`${isoString}Z`);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

app.use((req, res, next) => {
  res.locals.formatTime = formatTime;
  next();
});
app.use(currentUser);
app.use(csrf.ensureCsrfToken);
app.use('/tweets', tweetUploadParser);
app.use(csrf.verifyCsrfToken);
app.use('/', authRoutes);
app.use('/', feedRoutes);
app.use('/', tweetRoutes);
app.use('/', userRoutes);
app.use('/', exploreRoutes);

app.use((req, res) => {
  res.status(404);
  if (app.get('view engine') && req.accepts('html')) {
    return res.render('error', { status: 404, message: 'Page not found' });
  }
  return res.send('Page not found');
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500);
  if (app.get('view engine') && req.accepts('html')) {
    return res.render('error', { status: 500, message: 'Something went wrong' });
  }
  return res.send('Something went wrong');
});

module.exports = app;

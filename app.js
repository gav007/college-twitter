require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const RawSQLiteStore = require('connect-better-sqlite3')(session);

const db = require('./config/db');
const avatarUploadParser = require('./middleware/avatarUploadParser');
const csrf = require('./middleware/csrf');
const currentUser = require('./middleware/currentUser');
const tweetUploadParser = require('./middleware/tweetUploadParser');
const { linkifyTextSegments } = require('./services/contentLinks');
const { decodeExternalText } = require('./services/externalText');
const { buildLinkPreviewFromText, highlightTextSegments } = require('./services/postPresentation');
const { sanitizeHttpUrl, sanitizeImageUrl } = require('./services/security');
const authRoutes = require('./routes/auth');
const feedRoutes = require('./routes/feed');
const messageRoutes = require('./routes/messages');
const notificationRoutes = require('./routes/notifications');
const pokeRoutes = require('./routes/pokes');
const topicRoutes = require('./routes/topics');
const tweetRoutes = require('./routes/tweets');
const userRoutes = require('./routes/users');
const exploreRoutes = require('./routes/explore');
const { AVATAR_UPLOAD_DIR } = require('./services/avatarMedia');

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
app.use('/avatars', express.static(AVATAR_UPLOAD_DIR));
app.get('/favicon.ico', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'favicon-32x32.png'));
});
app.get('/site.webmanifest', (req, res) => {
  res.type('application/manifest+json');
  return res.sendFile(path.join(__dirname, 'public', 'site.webmanifest'));
});
app.get('/apple-touch-icon.png', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'apple-touch-icon.png'));
});
app.get('/icon-192.png', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'icon-192.png'));
});
app.get('/icon-512.png', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'icon-512.png'));
});
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.set('Cross-Origin-Resource-Policy', 'same-site');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.set(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; object-src 'none'; img-src 'self' data: http: https:; script-src 'self'; style-src 'self' 'unsafe-inline'"
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

function formatCount(value) {
  const numeric = Number(value) || 0;
  const absolute = Math.abs(numeric);

  if (absolute < 1000) {
    return String(numeric);
  }

  if (absolute < 1000000) {
    const compact = numeric / 1000;
    const rounded = Math.round(compact * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}k`;
  }

  const compact = numeric / 1000000;
  const rounded = Math.round(compact * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}M`;
}

app.use((req, res, next) => {
  res.locals.formatTime = formatTime;
  res.locals.formatCount = formatCount;
  res.locals.safeHttpUrl = sanitizeHttpUrl;
  res.locals.safeImageUrl = sanitizeImageUrl;
  res.locals.decodeExternalText = decodeExternalText;
  res.locals.linkifyTextSegments = linkifyTextSegments;
  res.locals.buildLinkPreviewFromText = buildLinkPreviewFromText;
  res.locals.highlightTextSegments = highlightTextSegments;
  next();
});
app.use(currentUser);
app.use(csrf.ensureCsrfToken);
app.use('/tweets', tweetUploadParser);
app.use('/settings/avatar', avatarUploadParser);
app.use(csrf.verifyCsrfToken);
app.use('/', authRoutes);
app.use('/', feedRoutes);
app.use('/', messageRoutes);
app.use('/', notificationRoutes);
app.use('/', pokeRoutes);
app.use('/', topicRoutes);
app.use('/', tweetRoutes);
app.use('/', userRoutes);
app.use('/', exploreRoutes);

app.all('/errors/upload-too-large', (req, res) => {
  return res.status(413).render('error', {
    status: 413,
    message: 'Image must be 5 MB or smaller.'
  });
});

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

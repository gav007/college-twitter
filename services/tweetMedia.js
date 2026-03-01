const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const db = require('../config/db');

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/home/ec2-user/data/uploads';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_CLEANUP_BATCH_SIZE = 200;

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIME_TO_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function ensureUploadDirExists() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function isAllowedExtension(filename) {
  return ALLOWED_EXTENSIONS.has(path.extname(filename || '').toLowerCase());
}

function isAllowedMimeType(mimeType) {
  return ALLOWED_MIME_TYPES.has((mimeType || '').toLowerCase());
}

function detectMimeFromMagic(buffer) {
  if (!buffer || buffer.length < 12) {
    return null;
  }

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (isJpeg) {
    return 'image/jpeg';
  }

  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  if (isPng) {
    return 'image/png';
  }

  const isWebp =
    buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (isWebp) {
    return 'image/webp';
  }

  return null;
}

function validateUploadedImage(file) {
  if (!file) {
    return { ok: true, mimeType: null, extension: null };
  }

  if (!isAllowedExtension(file.originalname) || !isAllowedMimeType(file.mimetype)) {
    return { ok: false, message: 'Only JPG, JPEG, PNG, and WebP images are allowed.' };
  }

  const detectedMimeType = detectMimeFromMagic(file.buffer);
  if (!detectedMimeType) {
    return { ok: false, message: 'Invalid image file signature.' };
  }

  if (detectedMimeType !== file.mimetype) {
    return { ok: false, message: 'Image MIME type does not match file content.' };
  }

  return {
    ok: true,
    mimeType: detectedMimeType,
    extension: MIME_TO_EXTENSION[detectedMimeType]
  };
}

function buildStoredImagePath(extension) {
  ensureUploadDirExists();
  const filename = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.${extension}`;
  return path.join(UPLOAD_DIR, filename);
}

function deleteFileSafe(filePath) {
  if (!filePath) {
    return;
  }

  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Failed to delete media file', err);
    }
  }
}

function deleteTweetAndMedia(tweetId) {
  const media = db.prepare('SELECT file_path FROM tweet_media WHERE tweet_id = ?').get(tweetId);
  db.prepare('DELETE FROM tweets WHERE id = ?').run(tweetId);
  if (media && media.file_path) {
    deleteFileSafe(media.file_path);
  }
}

function purgeExpiredMediaTweets(limit = MAX_CLEANUP_BATCH_SIZE) {
  const expired = db
    .prepare("SELECT tweet_id FROM tweet_media WHERE expires_at <= datetime('now') LIMIT ?")
    .all(limit);

  for (const row of expired) {
    deleteTweetAndMedia(row.tweet_id);
  }

  return expired.length;
}

function runMediaCleanup() {
  let totalDeleted = 0;
  let deletedInBatch = purgeExpiredMediaTweets();
  while (deletedInBatch > 0) {
    totalDeleted += deletedInBatch;
    deletedInBatch = purgeExpiredMediaTweets();
  }

  if (totalDeleted > 0) {
    console.log(`Ephemeral cleanup deleted ${totalDeleted} expired tweet(s)`);
  }
}

function startMediaCleanupLoop() {
  runMediaCleanup();
  const timer = setInterval(runMediaCleanup, CLEANUP_INTERVAL_MS);
  if (timer.unref) {
    timer.unref();
  }
  return timer;
}

module.exports = {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_IMAGE_BYTES,
  UPLOAD_DIR,
  buildStoredImagePath,
  deleteFileSafe,
  deleteTweetAndMedia,
  ensureUploadDirExists,
  isAllowedExtension,
  isAllowedMimeType,
  purgeExpiredMediaTweets,
  startMediaCleanupLoop,
  validateUploadedImage
};

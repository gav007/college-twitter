const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  MAX_IMAGE_BYTES,
  UPLOAD_DIR,
  deleteFileSafe,
  isAllowedExtension,
  isAllowedMimeType,
  validateUploadedImage
} = require('./tweetMedia');

const MAX_AVATAR_BYTES = Math.min(MAX_IMAGE_BYTES, 1024 * 1024);
const AVATAR_UPLOAD_DIR = process.env.AVATAR_UPLOAD_DIR || path.join(UPLOAD_DIR, 'avatars');

function ensureAvatarUploadDirExists() {
  if (!fs.existsSync(AVATAR_UPLOAD_DIR)) {
    fs.mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });
  }
}

function buildStoredAvatarPath(extension) {
  ensureAvatarUploadDirExists();
  const filename = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.${extension}`;
  return path.join(AVATAR_UPLOAD_DIR, filename);
}

function localAvatarUrlToFilePath(avatarUrl) {
  if (!avatarUrl || !avatarUrl.startsWith('/avatars/')) {
    return '';
  }

  const filename = path.basename(avatarUrl);
  return path.join(AVATAR_UPLOAD_DIR, filename);
}

function deleteLocalAvatarIfOwned(avatarUrl) {
  const filePath = localAvatarUrlToFilePath(avatarUrl);
  if (!filePath) {
    return;
  }
  deleteFileSafe(filePath);
}

function validateUploadedAvatar(file) {
  if (!file) {
    return { ok: false, message: 'Please choose an avatar image to upload.' };
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, message: 'Avatar image must be 1 MB or smaller.' };
  }

  return validateUploadedImage(file);
}

module.exports = {
  AVATAR_UPLOAD_DIR,
  MAX_AVATAR_BYTES,
  buildStoredAvatarPath,
  deleteLocalAvatarIfOwned,
  ensureAvatarUploadDirExists,
  isAllowedExtension,
  isAllowedMimeType,
  validateUploadedAvatar
};

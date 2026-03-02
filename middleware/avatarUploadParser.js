const multer = require('multer');

const {
  MAX_AVATAR_BYTES,
  isAllowedExtension,
  isAllowedMimeType
} = require('../services/avatarMedia');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_AVATAR_BYTES,
    files: 1
  },
  fileFilter: (req, file, callback) => {
    if (!isAllowedExtension(file.originalname) || !isAllowedMimeType(file.mimetype)) {
      const err = new Error('Only JPG, JPEG, PNG, and WebP images are allowed.');
      err.status = 400;
      return callback(err);
    }

    return callback(null, true);
  }
});

function avatarUploadParser(req, res, next) {
  const isAvatarUploadPath = req.method === 'POST' && req.path === '/';
  const isMultipart = (req.get('content-type') || '').startsWith('multipart/form-data');

  if (!isAvatarUploadPath || !isMultipart) {
    return next();
  }

  return upload.single('avatar_image')(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).render('error', {
        status: 413,
        message: 'Avatar image must be 1 MB or smaller.'
      });
    }

    return res.status(err.status || 400).render('error', {
      status: err.status || 400,
      message: err.message || 'Invalid avatar upload.'
    });
  });
}

module.exports = avatarUploadParser;

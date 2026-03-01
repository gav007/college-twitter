const multer = require('multer');

const { MAX_IMAGE_BYTES, isAllowedExtension, isAllowedMimeType } = require('../services/tweetMedia');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
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

function tweetUploadParser(req, res, next) {
  const isTweetCreatePath = req.method === 'POST' && req.path === '/';
  const isMultipart = (req.get('content-type') || '').startsWith('multipart/form-data');

  if (!isTweetCreatePath || !isMultipart) {
    return next();
  }

  return upload.single('image')(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).render('error', {
        status: 413,
        message: 'Image must be 5 MB or smaller.'
      });
    }

    return res.status(err.status || 400).render('error', {
      status: err.status || 400,
      message: err.message || 'Invalid upload.'
    });
  });
}

module.exports = tweetUploadParser;

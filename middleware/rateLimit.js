function createRateLimiter(options) {
  const windowMs = options.windowMs;
  const max = options.max;
  const entries = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}:${req.path}`;
    const entry = entries.get(key);

    if (!entry || entry.resetAt <= now) {
      entries.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;

    if (entry.count <= max) {
      return next();
    }

    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfterSeconds));

    if ((req.get('accept') || '').includes('application/json')) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    return res.status(429).render('error', {
      status: 429,
      message: 'Too many requests. Please try again later.'
    });
  };
}

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15
});

const writeLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30
});

module.exports = {
  authLimiter,
  writeLimiter
};

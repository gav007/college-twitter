function sanitizeHttpUrl(value) {
  const input = typeof value === 'string' ? value.trim() : '';
  if (!input) {
    return '';
  }

  try {
    const parsed = new URL(input);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch (_err) {
    return '';
  }
}

function sanitizeImageUrl(value) {
  const input = typeof value === 'string' ? value.trim() : '';
  if (!input) {
    return '';
  }

  // Allow local app-hosted images only when path-rooted.
  if (input.startsWith('/') && !input.startsWith('//')) {
    return input;
  }

  return sanitizeHttpUrl(input);
}

function getSafeBackUrl(req, fallbackPath = '/') {
  const fallback = typeof fallbackPath === 'string' && fallbackPath.startsWith('/') ? fallbackPath : '/';
  const referer = req.get('referer');
  if (!referer) {
    return fallback;
  }

  try {
    const parsed = new URL(referer);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return fallback;
    }

    const hostHeader = String(req.get('host') || '').trim().toLowerCase();
    const forwardedHost = String(req.get('x-forwarded-host') || '')
      .split(',')[0]
      .trim()
      .toLowerCase();
    const refererHost = String(parsed.host || '').trim().toLowerCase();

    if (!refererHost || (refererHost !== hostHeader && refererHost !== forwardedHost)) {
      return fallback;
    }

    const safePath = `${parsed.pathname || '/'}${parsed.search || ''}`;
    if (!safePath.startsWith('/')) {
      return fallback;
    }

    return safePath;
  } catch (_err) {
    return fallback;
  }
}

module.exports = {
  getSafeBackUrl,
  sanitizeHttpUrl,
  sanitizeImageUrl
};

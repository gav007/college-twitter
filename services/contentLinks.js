const URL_REGEX = /https?:\/\/[^\s<]+/gi;
const TRAILING_PUNCTUATION_REGEX = /[),.!?:;]+$/;
const MAX_LINK_LABEL_LENGTH = 44;

function isSafeHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_err) {
    return false;
  }
}

function splitTrailingPunctuation(value) {
  if (!value) {
    return { clean: '', trailing: '' };
  }

  const match = value.match(TRAILING_PUNCTUATION_REGEX);
  if (!match) {
    return { clean: value, trailing: '' };
  }

  const trailing = match[0];
  const clean = value.slice(0, value.length - trailing.length);
  return { clean, trailing };
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch (_err) {
    return value;
  }
}

function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value || '';
  }
  return `${value.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function formatCompactUrlLabel(urlString) {
  if (!isSafeHttpUrl(urlString)) {
    return urlString;
  }
  try {
    const parsed = new URL(urlString);
    const host = parsed.hostname.replace(/^www\./i, '');
    const pathParts = parsed.pathname
      .split('/')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => safeDecodeURIComponent(part).replace(/[-_]+/g, '-'));
    let label = host;
    if (pathParts.length) {
      label += `/${pathParts.join('/')}`;
      if (parsed.pathname.split('/').filter(Boolean).length > pathParts.length) {
        label += '/…';
      }
    }
    if (parsed.search) {
      label += '?…';
    }
    return truncate(label, MAX_LINK_LABEL_LENGTH);
  } catch (_err) {
    return urlString;
  }
}

function linkifyTextSegments(value) {
  const text = typeof value === 'string' ? value : '';
  const segments = [];
  let cursor = 0;
  URL_REGEX.lastIndex = 0;
  let match = URL_REGEX.exec(text);

  while (match) {
    const originalMatch = match[0];
    const start = match.index;
    const end = start + originalMatch.length;

    if (start > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, start) });
    }

    const { clean, trailing } = splitTrailingPunctuation(originalMatch);
    if (clean && isSafeHttpUrl(clean)) {
      segments.push({ type: 'link', href: clean, value: clean, display: formatCompactUrlLabel(clean) });
    } else {
      segments.push({ type: 'text', value: originalMatch });
    }

    if (trailing) {
      segments.push({ type: 'text', value: trailing });
    }

    cursor = end;
    match = URL_REGEX.exec(text);
  }

  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) });
  }

  if (!segments.length) {
    segments.push({ type: 'text', value: text });
  }

  return segments;
}

module.exports = {
  linkifyTextSegments
};

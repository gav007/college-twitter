const db = require('../config/db');
const { decodeExternalText } = require('./externalText');

const URL_REGEX = /https?:\/\/[^\s<]+/i;
const TRAILING_PUNCTUATION_REGEX = /[),.!?:;]+$/;
const REFRESH_TTL_HOURS = 18;
const REFRESH_ERROR_TTL_HOURS = 4;
const FETCH_TIMEOUT_MS = 6000;
const MAX_META_TEXT_LENGTH = 280;
const inFlightPreviewFetches = new Set();

const selectPreviewStmt = db.prepare(
  'SELECT url, title, description, image_url, expires_at FROM link_previews WHERE url = ?'
);
const upsertPreviewStmt = db.prepare(
  `INSERT INTO link_previews (url, title, description, image_url, fetched_at, expires_at, last_error)
   VALUES (?, ?, ?, ?, datetime('now'), ?, ?)
   ON CONFLICT(url) DO UPDATE SET
     title = excluded.title,
     description = excluded.description,
     image_url = excluded.image_url,
     fetched_at = excluded.fetched_at,
     expires_at = excluded.expires_at,
     last_error = excluded.last_error`
);

function splitTrailingPunctuation(value) {
  if (!value) {
    return { clean: '', trailing: '' };
  }
  const match = value.match(TRAILING_PUNCTUATION_REGEX);
  if (!match) {
    return { clean: value, trailing: '' };
  }
  const trailing = match[0];
  return {
    clean: value.slice(0, value.length - trailing.length),
    trailing
  };
}

function toSqliteUtc(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeUrlCandidate(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    return '';
  }
  const stripped = splitTrailingPunctuation(raw).clean;
  try {
    const parsed = new URL(stripped);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch (_err) {
    return '';
  }
}

function isBlockedHost(hostname) {
  const host = (hostname || '').toLowerCase();
  if (!host) {
    return true;
  }
  if (host === 'localhost' || host === '::1') {
    return true;
  }
  if (host.endsWith('.local')) {
    return true;
  }
  if (/^(127)\./.test(host)) {
    return true;
  }
  if (/^(10)\./.test(host)) {
    return true;
  }
  if (/^(192)\.(168)\./.test(host)) {
    return true;
  }
  if (/^(169)\.(254)\./.test(host)) {
    return true;
  }
  if (/^(172)\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) {
    return true;
  }
  return false;
}

function extractFirstUrl(value) {
  const text = typeof value === 'string' ? value : '';
  const match = text.match(URL_REGEX);
  if (!match) {
    return '';
  }
  return normalizeUrlCandidate(match[0]);
}

function humanizePathname(pathname) {
  const trimmed = (pathname || '').replace(/^\/+|\/+$/g, '');
  if (!trimmed) {
    return '';
  }
  const parts = trimmed
    .split('/')
    .slice(0, 3)
    .map((part) => decodeURIComponent(part).replace(/[-_]+/g, ' ').trim())
    .filter(Boolean);
  return parts.join(' • ');
}

function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value || '';
  }
  return `${value.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function extractMetaContent(html, attrName, attrValue) {
  const regex = new RegExp(
    `<meta[^>]+${attrName}=["']${attrValue}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    'i'
  );
  const match = html.match(regex);
  return match ? match[1].trim() : '';
}

function extractTitleTag(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) {
    return '';
  }
  return match[1].replace(/\s+/g, ' ').trim();
}

function stripHtml(value) {
  return (value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseMetadataFromHtml(html, sourceUrl) {
  const ogTitle = extractMetaContent(html, 'property', 'og:title');
  const twitterTitle = extractMetaContent(html, 'name', 'twitter:title');
  const pageTitle = extractTitleTag(html);

  const ogDescription = extractMetaContent(html, 'property', 'og:description');
  const twitterDescription = extractMetaContent(html, 'name', 'twitter:description');
  const plainDescription = extractMetaContent(html, 'name', 'description');

  const ogImage = extractMetaContent(html, 'property', 'og:image');
  const twitterImage = extractMetaContent(html, 'name', 'twitter:image');

  const title = truncate(decodeExternalText(stripHtml(ogTitle || twitterTitle || pageTitle)), MAX_META_TEXT_LENGTH);
  const description = truncate(
    decodeExternalText(stripHtml(ogDescription || twitterDescription || plainDescription)),
    MAX_META_TEXT_LENGTH
  );

  let imageUrl = normalizeUrlCandidate(ogImage || twitterImage);
  if (!imageUrl && (ogImage || twitterImage)) {
    try {
      imageUrl = new URL(ogImage || twitterImage, sourceUrl).toString();
      imageUrl = normalizeUrlCandidate(imageUrl);
    } catch (_err) {
      imageUrl = '';
    }
  }

  return {
    title,
    description,
    imageUrl
  };
}

async function refreshPreview(url) {
  if (inFlightPreviewFetches.has(url)) {
    return;
  }
  inFlightPreviewFetches.add(url);

  try {
    const parsed = new URL(url);
    if (isBlockedHost(parsed.hostname)) {
      throw new Error('Blocked host');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let html = '';

    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'LoopfeedPreviewBot/1.0 (+https://loopfeed.duckdns.org)'
        }
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        throw new Error('Unsupported content type');
      }

      html = await response.text();
    } finally {
      clearTimeout(timeout);
    }

    const metadata = parseMetadataFromHtml(html, url);
    const expiresAt = toSqliteUtc(new Date(Date.now() + REFRESH_TTL_HOURS * 60 * 60 * 1000));

    upsertPreviewStmt.run(
      url,
      metadata.title || '',
      metadata.description || '',
      metadata.imageUrl || '',
      expiresAt,
      ''
    );
  } catch (err) {
    const expiresAt = toSqliteUtc(new Date(Date.now() + REFRESH_ERROR_TTL_HOURS * 60 * 60 * 1000));
    upsertPreviewStmt.run(url, '', '', '', expiresAt, (err && err.message ? err.message : 'preview fetch failed'));
  } finally {
    inFlightPreviewFetches.delete(url);
  }
}

function queueRefreshPreview(url) {
  refreshPreview(url).catch(() => {
    // Error is persisted in DB with short retry TTL.
  });
}

function isPreviewFresh(expiresAt) {
  if (!expiresAt) {
    return false;
  }
  const ts = Date.parse(`${expiresAt}Z`);
  if (Number.isNaN(ts)) {
    return false;
  }
  return ts > Date.now();
}

function buildLinkPreviewFromText(value, fallbackImageUrl = '') {
  const href = extractFirstUrl(value);
  if (!href) {
    return null;
  }

  const parsed = new URL(href);
  const domain = parsed.hostname.replace(/^www\./, '');
  const fallbackTitle = humanizePathname(parsed.pathname) || domain;
  const fallbackDescription = parsed.search
    ? truncate(parsed.search.replace(/^\?/, '').replace(/&/g, ' · ').replace(/=/g, ': '), 120)
    : '';

  const row = selectPreviewStmt.get(href);
  if (!row || !isPreviewFresh(row.expires_at)) {
    queueRefreshPreview(href);
  }

  return {
    href,
    domain,
    title: truncate(decodeExternalText((row && row.title) || fallbackTitle), 100),
    description: decodeExternalText((row && row.description) || fallbackDescription),
    imageUrl: normalizeUrlCandidate((row && row.image_url) || fallbackImageUrl)
  };
}

function highlightTextSegments(value, query) {
  const text = typeof value === 'string' ? value : '';
  const q = typeof query === 'string' ? query.trim() : '';
  if (!q) {
    return [{ value: text, isMatch: false }];
  }

  const normalizedQuery = q.startsWith('@') ? q.slice(1) : q;
  if (!normalizedQuery) {
    return [{ value: text, isMatch: false }];
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = normalizedQuery.toLowerCase();
  const segments = [];
  let cursor = 0;
  let foundAt = lowerText.indexOf(lowerQuery, cursor);

  while (foundAt !== -1) {
    if (foundAt > cursor) {
      segments.push({ value: text.slice(cursor, foundAt), isMatch: false });
    }
    segments.push({
      value: text.slice(foundAt, foundAt + normalizedQuery.length),
      isMatch: true
    });
    cursor = foundAt + normalizedQuery.length;
    foundAt = lowerText.indexOf(lowerQuery, cursor);
  }

  if (cursor < text.length) {
    segments.push({ value: text.slice(cursor), isMatch: false });
  }

  if (!segments.length) {
    segments.push({ value: text, isMatch: false });
  }

  return segments;
}

module.exports = {
  buildLinkPreviewFromText,
  extractFirstUrl,
  highlightTextSegments
};

const crypto = require('crypto');

const db = require('../config/db');
const { decodeExternalText } = require('./externalText');
const { assignTopicsToTweet } = require('./topicClassifier');

const BOT_PASSWORD_HASH = '$2b$10$GixfXxQvA2q7ng9.A9vM1OEfK0qECgh7s7wtvQYLyJ6ZsxxrV8kM6';
const DEFAULT_POLL_INTERVAL_MS = 60 * 60 * 1000;
const MAX_POSTS_PER_BOT_PER_RUN = 2;
const DEFAULT_MAX_ITEM_AGE_DAYS = 3;
const DEFAULT_UNKNOWN_DATE_LOOKBACK_ITEMS = 3;
const MAX_FUTURE_PUBLISH_SKEW_MS = 6 * 60 * 60 * 1000;
const TU_BOT_STALE_RETENTION_DAYS = 8;
const BOT_TWEET_RETENTION_DAYS = 7;
const BOT_INGEST_RETENTION_DAYS = 30;
const SOURCE_HEALTH_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const SOURCE_HEALTH_MAX_STRIKES = 3;
const SOURCE_HEALTH_STALE_RATIO_LIMIT = 0.8;
const SOURCE_HEALTH_MISSING_DATE_RATIO_LIMIT = 0.7;
const SOURCE_HEALTH_MIN_ITEMS = 4;
const CAMPUS_NEAR_KEYWORDS = ['grangegorman', 'dublin 7', 'smithfield', 'stoneybatter', 'phibsborough', 'broadstone'];
const botLastRunAtByName = new Map();
const sourceHealthById = new Map();
const CURRENT_YEAR = new Date().getUTCFullYear();
const TUD_BOT_USERNAMES = ['tud_grangegorman_bot', 'tud_events_bot', 'tud_tech_ai_bot', 'tud_edu_bot'];
const TU_DUBLIN_DEFAULT_IMAGE =
  'https://pxl01-tudublinie.terminalfour.net/prod01/tudublin-cdn-pxl/media/website/site-assets/images/tu-dublin-logo-blue.svg';
const DUBLIN_EVENTS_DEFAULT_IMAGE =
  'https://www.dublincity.ie/sites/default/files/styles/traditional_television/public/2025-07/lego.png?itok=6_0Giq1G';
const TUD_TECH_KEYWORDS = [
  'ai',
  'artificial intelligence',
  'machine learning',
  'data',
  'analytics',
  'cloud',
  'cyber',
  'software',
  'developer',
  'computing',
  'computer science',
  'engineering',
  'robotics',
  'innovation'
];

const RSS_BOTS = [
  {
    username: 'rte_news_bot',
    displayName: 'RTÉ News Bot',
    bio: 'Automated updates from Irish news headlines.',
    prefix: '📰',
    feeds: ['https://www.rte.ie/feeds/rss/?index=/news/', 'https://www.rte.ie/feeds/rss/?index=/news/business/'],
    maxItemAgeDays: 2
  },
  {
    username: 'irish_sport_bot',
    displayName: 'Irish Sport Bot',
    bio: 'Automated updates from Irish sports headlines.',
    prefix: '🏅',
    feeds: ['https://www.rte.ie/feeds/rss/?index=/sport/'],
    maxItemAgeDays: 2
  },
  {
    username: 'ireland_updates_bot',
    displayName: 'Ireland Updates Bot',
    bio: 'Automated updates from Irish current affairs sources.',
    prefix: '🇮🇪',
    feeds: ['https://www.thejournal.ie/feed/'],
    maxItemAgeDays: 2
  },
  {
    username: 'tud_tech_ai_bot',
    displayName: 'TU Tech + AI Bot',
    bio: 'Automated tech and AI updates aligned with TU Dublin technology disciplines.',
    prefix: '🤖',
    feeds: ['https://www.siliconrepublic.com/feed', 'https://openai.com/news/rss.xml', 'https://techcrunch.com/feed/'],
    keywords: TUD_TECH_KEYWORDS,
    maxPostsPerRun: 1,
    pollIntervalMs: 3 * 60 * 60 * 1000,
    maxItemAgeDays: 4
  },
  {
    username: 'tud_edu_bot',
    displayName: 'TU Education Bot',
    bio: 'Automated education and student updates relevant to TU Dublin learners.',
    prefix: '🎓',
    feeds: ['https://www.thecity.ie/feed/', 'https://www.siliconrepublic.com/feed'],
    keywords: ['education', 'student', 'university', 'college', 'campus', 'research', 'apprenticeship', 'skills'],
    maxPostsPerRun: 1,
    pollIntervalMs: 3 * 60 * 60 * 1000,
    maxItemAgeDays: 4
  }
];

const TU_DUBLIN_NEWS_BOT = {
  username: 'tud_grangegorman_bot',
  displayName: 'TU Grangegorman Bot',
  bio: 'Automated updates from TU Dublin news relevant to Grangegorman and campus life.',
  prefix: '🏫',
  sourceUrl: 'https://www.tudublin.ie/explore/news/',
  defaultImageUrl: TU_DUBLIN_DEFAULT_IMAGE,
  maxPostsPerRun: 1,
  pollIntervalMs: 4 * 60 * 60 * 1000,
  maxItemAgeDays: 4
};

const TU_DUBLIN_EVENTS_BOT = {
  username: 'tud_events_bot',
  displayName: 'TU Events Bot',
  bio: 'Automated updates from TU Dublin events.',
  prefix: '📅',
  sourceUrl: 'https://www.tudublin.ie/explore/events/',
  defaultImageUrl: TU_DUBLIN_DEFAULT_IMAGE,
  maxPostsPerRun: 1,
  pollIntervalMs: 6 * 60 * 60 * 1000,
  maxItemAgeDays: 3,
  unknownDateLookbackItems: 2
};

const DUBLIN_EVENTS_BOT = {
  username: 'dublin_events_bot',
  displayName: 'Dublin Events Bot',
  bio: 'Automated updates for student-friendly events around Dublin.',
  prefix: '🎟',
  sourceUrl: 'https://www.dublincity.ie/events',
  defaultImageUrl: DUBLIN_EVENTS_DEFAULT_IMAGE,
  maxPostsPerRun: 2,
  pollIntervalMs: 2 * 60 * 60 * 1000,
  maxItemAgeDays: 3,
  unknownDateLookbackItems: 2
};

const WEATHER_BOT = {
  username: 'ireland_weather_bot',
  displayName: 'Ireland Weather Bot',
  bio: 'Automated weather updates for Ireland.',
  prefix: '🌦',
  locations: [
    { name: 'Dublin', lat: 53.3498, lon: -6.2603 },
    { name: 'Cork', lat: 51.8985, lon: -8.4756 },
    { name: 'Galway', lat: 53.2707, lon: -9.0568 }
  ]
};

const selectBotIngestedStmt = db.prepare('SELECT 1 FROM bot_ingested_items WHERE source_key = ?');
const selectBotIngestedByUrlStmt = db.prepare(
  'SELECT 1 FROM bot_ingested_items WHERE bot_username = ? AND source_url = ? LIMIT 1'
);
const insertBotIngestedStmt = db.prepare(
  "INSERT OR IGNORE INTO bot_ingested_items (source_key, bot_username, source_url, published_at) VALUES (?, ?, ?, ?)"
);
const insertTweetStmt = db.prepare('INSERT INTO tweets (user_id, content, link_image_url) VALUES (?, ?, ?)');

const ensureBotUserStmt = db.prepare(
  `INSERT OR IGNORE INTO users (username, display_name, bio, avatar_url, is_bot, password_hash)
   VALUES (?, ?, ?, '', 1, ?)`
);
const selectUserByUsernameStmt = db.prepare('SELECT id FROM users WHERE username = ?');

const createTweetTx = db.transaction((payload) => {
  const result = insertTweetStmt.run(payload.userId, payload.content, payload.linkImageUrl || '');
  const tweetId = Number(result.lastInsertRowid);
  assignTopicsToTweet(tweetId, payload.content, payload.sourceUrl || '');
  insertBotIngestedStmt.run(payload.sourceKey, payload.botUsername, payload.sourceUrl, payload.publishedAt || null);
});

let loopInProgress = false;

function stripHtml(value) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTagValue(xmlFragment, tagName) {
  const cdataRegex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, 'i');
  const cdataMatch = xmlFragment.match(cdataRegex);
  if (cdataMatch) {
    return decodeExternalText(stripHtml(cdataMatch[1]));
  }

  const normalRegex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const normalMatch = xmlFragment.match(normalRegex);
  if (!normalMatch) {
    return '';
  }

  return decodeExternalText(stripHtml(normalMatch[1]));
}

function extractRawTagContent(xmlFragment, tagName) {
  const cdataRegex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, 'i');
  const cdataMatch = xmlFragment.match(cdataRegex);
  if (cdataMatch) {
    return cdataMatch[1].trim();
  }

  const normalRegex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const normalMatch = xmlFragment.match(normalRegex);
  if (!normalMatch) {
    return '';
  }

  return normalMatch[1].trim();
}

function parseRssItems(xmlText) {
  const itemMatches = xmlText.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return itemMatches
    .map((itemXml) => {
      const title = extractTagValue(itemXml, 'title');
      const link = extractTagValue(itemXml, 'link');
      const guid = extractTagValue(itemXml, 'guid');
      const description = extractTagValue(itemXml, 'description');
      const descriptionRaw = extractRawTagContent(itemXml, 'description');
      const pubDateRaw = extractTagValue(itemXml, 'pubDate');
      const publishedAt = pubDateRaw ? new Date(pubDateRaw) : null;
      const imageUrl = extractImageUrlFromItem(itemXml, descriptionRaw);

      if (!title || !link) {
        return null;
      }

      return {
        title,
        link,
        guid,
        description,
        imageUrl,
        publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt.toISOString() : null
      };
    })
    .filter(Boolean);
}

function shouldRunBotNow(bot) {
  const interval = bot.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
  const key = bot.username;
  const lastRun = botLastRunAtByName.get(key) || 0;
  const now = Date.now();
  if (now - lastRun < interval) {
    return false;
  }
  botLastRunAtByName.set(key, now);
  return true;
}

function getSourceHealth(sourceId) {
  if (!sourceHealthById.has(sourceId)) {
    sourceHealthById.set(sourceId, {
      strikes: 0,
      mutedUntil: 0,
      lastIssue: '',
      updatedAt: 0
    });
  }
  return sourceHealthById.get(sourceId);
}

function isSourceMuted(sourceId) {
  const state = getSourceHealth(sourceId);
  return state.mutedUntil > Date.now();
}

function markSourceHealthy(sourceId) {
  const state = getSourceHealth(sourceId);
  state.strikes = 0;
  state.mutedUntil = 0;
  state.lastIssue = '';
  state.updatedAt = Date.now();
}

function markSourceIssue(sourceId, issueCode) {
  const state = getSourceHealth(sourceId);
  state.strikes += 1;
  state.lastIssue = issueCode;
  state.updatedAt = Date.now();

  if (state.strikes >= SOURCE_HEALTH_MAX_STRIKES) {
    state.mutedUntil = Date.now() + SOURCE_HEALTH_COOLDOWN_MS;
    console.warn(`Source ${sourceId} muted for ${Math.round(SOURCE_HEALTH_COOLDOWN_MS / 3600000)}h (${issueCode})`);
    return;
  }

  console.warn(`Source ${sourceId} issue ${issueCode} (${state.strikes}/${SOURCE_HEALTH_MAX_STRIKES})`);
}

function measureSourceQuality(items, maxItemAgeDays) {
  const total = Array.isArray(items) ? items.length : 0;
  if (total <= 0) {
    return { total: 0, staleRatio: 1, missingDateRatio: 1 };
  }

  let staleCount = 0;
  let missingDateCount = 0;
  for (const item of items) {
    if (!item || !item.publishedAt) {
      missingDateCount += 1;
    }
    if (!itemIsFresh(item, maxItemAgeDays, { allowUnknownDate: false })) {
      staleCount += 1;
    }
  }

  return {
    total,
    staleRatio: staleCount / total,
    missingDateRatio: missingDateCount / total
  };
}

function evaluateSourceQuality(sourceId, quality, options = {}) {
  const ignoreStaleRatio = Boolean(options.ignoreStaleRatio);
  const ignoreMissingDateRatio = Boolean(options.ignoreMissingDateRatio);
  if (!quality || quality.total < SOURCE_HEALTH_MIN_ITEMS) {
    return true;
  }
  if (!ignoreStaleRatio && quality.staleRatio >= SOURCE_HEALTH_STALE_RATIO_LIMIT) {
    markSourceIssue(sourceId, 'stale_ratio_high');
    return false;
  }
  if (!ignoreMissingDateRatio && quality.missingDateRatio >= SOURCE_HEALTH_MISSING_DATE_RATIO_LIMIT) {
    markSourceIssue(sourceId, 'missing_date_ratio_high');
    return false;
  }
  markSourceHealthy(sourceId);
  return true;
}

function slugToTitle(slug) {
  return (slug || '')
    .replace(/\.html?$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function parseTuDublinNewsItems(htmlText) {
  const items = [];
  const seen = new Set();
  const matches = htmlText.match(/<!--\/explore\/news\/[^>]+\.html-->/gi) || [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const relativePath = match.replace(/^<!--/, '').replace(/-->$/, '').trim();
    if (!relativePath || seen.has(relativePath)) {
      continue;
    }
    seen.add(relativePath);
    const url = new URL(relativePath, 'https://www.tudublin.ie').toString();
    const slug = relativePath.split('/').pop() || '';
    const title = slugToTitle(slug);
    if (!title) {
      continue;
    }
    items.push({
      title,
      link: url,
      guid: url,
      description: '',
      imageUrl: TU_DUBLIN_DEFAULT_IMAGE,
      publishedAt: null,
      listIndex: index
    });
  }
  return items;
}

function parseTuDublinEventsItems(htmlText) {
  const items = [];
  const seen = new Set();
  const regex = /href=["'](\/explore\/events\/all-events\/[^"']+)["']/gi;
  let match;
  let listIndex = 0;
  while ((match = regex.exec(htmlText)) !== null) {
    const rawPath = (match[1] || '').trim();
    const cleanedPath = rawPath.split('?')[0];
    if (!cleanedPath || seen.has(cleanedPath)) {
      continue;
    }
    seen.add(cleanedPath);
    const url = new URL(cleanedPath, 'https://www.tudublin.ie').toString();
    const slug = cleanedPath.split('/').pop() || '';
    const title = slugToTitle(slug);
    if (!title) {
      continue;
    }
    items.push({
      title,
      link: url,
      guid: url,
      description: '',
      imageUrl: TU_DUBLIN_DEFAULT_IMAGE,
      publishedAt: null,
      listIndex
    });
    listIndex += 1;
  }
  return items;
}

function parseDublinCityEventsItems(htmlText) {
  const items = [];
  const seen = new Set();
  const cardRegex =
    /<div[^>]+class="base-card base-card--image node node--event"[\s\S]*?(?=<div[^>]+class="base-card base-card--image node node--event"|<\/section>)/gi;
  const cards = htmlText.match(cardRegex) || [];
  let listIndex = 0;

  for (const card of cards) {
    const linkMatch = card.match(/<a href="([^"]*\/events\/[^"]+)"/i);
    const titleMatch = card.match(/<a href="[^"]+">\s*([^<]+?)\s*<\/a>/i);
    const dateMatch = card.match(/<div class="base-card__date">\s*([\s\S]*?)\s*<\/div>/i);
    const locationMatch = card.match(/<div class="base-card__location">\s*([\s\S]*?)\s*<\/div>/i);
    const imageMatch = card.match(/<img[^>]+src="([^"]+)"/i);

    if (!linkMatch || !titleMatch) {
      continue;
    }

    const absoluteLink = normalizeHttpUrl(
      new URL(decodeExternalText(linkMatch[1].trim()), 'https://www.dublincity.ie').toString()
    );
    if (!absoluteLink || seen.has(absoluteLink)) {
      continue;
    }
    seen.add(absoluteLink);

    const dateText = decodeExternalText(stripHtml(dateMatch ? dateMatch[1] : ''));
    const locationText = decodeExternalText(stripHtml(locationMatch ? locationMatch[1] : ''));
    const imageUrl = imageMatch
      ? normalizeHttpUrl(new URL(decodeExternalText(imageMatch[1].trim()), 'https://www.dublincity.ie').toString())
      : '';

    const hints = [];
    if (dateText) {
      hints.push(`When: ${dateText}`);
    }
    if (locationText) {
      hints.push(`Where: ${locationText}`);
    }

    items.push({
      title: decodeExternalText(stripHtml(titleMatch[1])),
      link: absoluteLink,
      guid: absoluteLink,
      description: hints.join(' · '),
      imageUrl,
      publishedAt: null,
      listIndex,
      dateText,
      locationText
    });
    listIndex += 1;
  }

  return items;
}

function parseMetaContent(htmlText, attrName, attrValue) {
  const regex = new RegExp(
    `<meta[^>]+${attrName}=["']${attrValue}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    'i'
  );
  const match = htmlText.match(regex);
  if (match && match[1]) {
    return decodeExternalText(match[1].trim());
  }

  const reversedRegex = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+${attrName}=["']${attrValue}["'][^>]*>`,
    'i'
  );
  const reverseMatch = htmlText.match(reversedRegex);
  return reverseMatch && reverseMatch[1] ? decodeExternalText(reverseMatch[1].trim()) : '';
}

function normalizePublishedAt(value) {
  const raw = (value || '').trim();
  if (!raw) {
    return '';
  }

  const dmyWithTime = raw.match(/(?:[A-Za-z]{3},\s*)?(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2}):(\d{2})/);
  if (dmyWithTime) {
    const day = Number(dmyWithTime[1]);
    const month = Number(dmyWithTime[2]);
    const year = Number(dmyWithTime[3]);
    const hour = Number(dmyWithTime[4]);
    const minute = Number(dmyWithTime[5]);
    const iso = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
    if (!Number.isNaN(iso.getTime())) {
      return iso.toISOString();
    }
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toISOString();
}

function newestIsoDate(...values) {
  const normalized = values.map((value) => normalizePublishedAt(value)).filter(Boolean);
  if (!normalized.length) {
    return '';
  }
  normalized.sort((a, b) => Date.parse(b) - Date.parse(a));
  return normalized[0];
}

function parseTuDublinPublishedAt(htmlText) {
  const directMeta =
    parseMetaContent(htmlText, 'property', 'article:published_time') ||
    parseMetaContent(htmlText, 'name', 'article:published_time') ||
    parseMetaContent(htmlText, 'name', 'publish_date') ||
    parseMetaContent(htmlText, 'name', 'LastModified') ||
    parseMetaContent(htmlText, 'name', 'date');
  const normalizedMeta = normalizePublishedAt(directMeta);
  if (normalizedMeta) {
    return normalizedMeta;
  }

  const timeTagMatch = htmlText.match(/<time[^>]+datetime=["']([^"']+)["']/i);
  if (timeTagMatch) {
    const normalizedTime = normalizePublishedAt(timeTagMatch[1]);
    if (normalizedTime) {
      return normalizedTime;
    }
  }

  const humanPublishedMatch = htmlText.match(/Published:\s*[^<]*?([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4}\s*-\s*[0-9]{1,2}:[0-9]{2})/i);
  if (humanPublishedMatch) {
    const normalizedHuman = normalizePublishedAt(humanPublishedMatch[1]);
    if (normalizedHuman) {
      return normalizedHuman;
    }
  }

  return '';
}

function parseTuDublinImageUrl(htmlText, fallback) {
  const imageCandidate =
    parseMetaContent(htmlText, 'property', 'og:image') ||
    parseMetaContent(htmlText, 'name', 'twitter:image') ||
    fallback ||
    '';
  return normalizeHttpUrl(imageCandidate);
}

function parseDublinCityPublishedAt(htmlText) {
  const published = parseMetaContent(htmlText, 'property', 'article:published_time');
  const modified =
    parseMetaContent(htmlText, 'property', 'article:modified_time') ||
    parseMetaContent(htmlText, 'property', 'og:updated_time');
  const timeTagMatch = htmlText.match(/<time[^>]+datetime=["']([^"']+)["']/i);
  const timeTag = timeTagMatch ? timeTagMatch[1] : '';
  return newestIsoDate(modified, published, timeTag);
}

function parseDublinCityEventDateDisplay(htmlText) {
  const match = htmlText.match(
    /field--name-field-event-date-for-display[\s\S]*?<div class="field__item">([\s\S]*?)<\/div>/i
  );
  if (!match) {
    return '';
  }
  return decodeExternalText(stripHtml(match[1]));
}

function parseDublinCityLocation(htmlText) {
  const match = htmlText.match(/<h2 class="event__location-heading">[\s\S]*?<p>([\s\S]*?)<\/p>/i);
  if (!match) {
    return '';
  }
  return decodeExternalText(stripHtml(match[1]));
}

function parseDublinCityImageUrl(htmlText, fallback) {
  const imageCandidate = parseMetaContent(htmlText, 'property', 'og:image') || fallback || '';
  return normalizeHttpUrl(imageCandidate);
}

function extractPriceHint(text) {
  const haystack = (text || '').toLowerCase();
  if (!haystack) {
    return '';
  }
  if (haystack.includes('free')) {
    return 'Free';
  }
  const euroMatch = text.match(/€\s*([0-9]{1,3})/i) || text.match(/([0-9]{1,3})\s*euro/i);
  if (!euroMatch) {
    return '';
  }
  const amount = Number(euroMatch[1]);
  if (!Number.isFinite(amount)) {
    return '';
  }
  if (amount <= 10) {
    return `Under €${amount}`;
  }
  return `€${amount}`;
}

async function hydrateTuDublinItem(item, fallbackImageUrl) {
  try {
    const html = await fetchText(item.link);
    return {
      ...item,
      publishedAt: parseTuDublinPublishedAt(html) || item.publishedAt || null,
      imageUrl: parseTuDublinImageUrl(html, fallbackImageUrl || item.imageUrl || '')
    };
  } catch (_err) {
    return {
      ...item,
      imageUrl: item.imageUrl || fallbackImageUrl || ''
    };
  }
}

async function hydrateDublinCityItem(item, fallbackImageUrl) {
  try {
    const html = await fetchText(item.link);
    const eventDate = parseDublinCityEventDateDisplay(html) || item.dateText || '';
    const location = parseDublinCityLocation(html) || item.locationText || '';
    const priceHint = extractPriceHint(html);
    const details = [];
    if (eventDate) {
      details.push(`When: ${eventDate}`);
    }
    if (location) {
      details.push(`Where: ${location}`);
    }
    if (priceHint) {
      details.push(`Price: ${priceHint}`);
    }

    return {
      ...item,
      description: details.join(' · '),
      publishedAt: parseDublinCityPublishedAt(html) || item.publishedAt || null,
      imageUrl: parseDublinCityImageUrl(html, fallbackImageUrl || item.imageUrl || '')
    };
  } catch (_err) {
    return {
      ...item,
      imageUrl: item.imageUrl || fallbackImageUrl || ''
    };
  }
}

function normalizeHttpUrl(urlCandidate) {
  const value = (urlCandidate || '').trim();
  if (!value) {
    return '';
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch (_err) {
    return '';
  }
}

function extractAttribute(xmlFragment, tagNamePattern, attributeName) {
  const tagRegex = new RegExp(`<${tagNamePattern}\\b[^>]*>`, 'i');
  const tagMatch = xmlFragment.match(tagRegex);
  if (!tagMatch) {
    return '';
  }

  const attrRegex = new RegExp(`${attributeName}\\s*=\\s*["']([^"']+)["']`, 'i');
  const attrMatch = tagMatch[0].match(attrRegex);
  return attrMatch ? attrMatch[1] : '';
}

function extractImageUrlFromItem(itemXml, descriptionHtml) {
  const enclosureUrl = extractAttribute(itemXml, 'enclosure', 'url');
  const enclosureType = extractAttribute(itemXml, 'enclosure', 'type').toLowerCase();
  if (enclosureUrl && enclosureType.startsWith('image/')) {
    return normalizeHttpUrl(enclosureUrl);
  }

  const mediaContentUrl = extractAttribute(itemXml, 'media:content', 'url');
  const mediaContentMedium = extractAttribute(itemXml, 'media:content', 'medium').toLowerCase();
  if (mediaContentUrl && (!mediaContentMedium || mediaContentMedium === 'image')) {
    const normalized = normalizeHttpUrl(mediaContentUrl);
    if (normalized) {
      return normalized;
    }
  }

  const mediaThumbnailUrl = extractAttribute(itemXml, 'media:thumbnail', 'url');
  if (mediaThumbnailUrl) {
    const normalized = normalizeHttpUrl(mediaThumbnailUrl);
    if (normalized) {
      return normalized;
    }
  }

  const imgTagMatch = (descriptionHtml || '').match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgTagMatch) {
    const normalized = normalizeHttpUrl(decodeExternalText(imgTagMatch[1]));
    if (normalized) {
      return normalized;
    }
  }

  const imgFromDescription = (descriptionHtml || '').match(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>]*)?/i);
  if (imgFromDescription) {
    return normalizeHttpUrl(imgFromDescription[0]);
  }

  return '';
}

function safeDomain(urlString) {
  try {
    return new URL(urlString).hostname.replace(/^www\./, '');
  } catch (_err) {
    return 'source';
  }
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function buildNewsTweet(bot, item) {
  const domain = safeDomain(item.link);
  const title = (item.title || '').trim();
  const link = (item.link || '').trim();
  const summary = item.description ? item.description.trim() : '';

  // Prioritize preserving the full headline and link; include summary only when space allows.
  let content = `${bot.prefix} ${title}\n${link}`;
  if (content.length <= 280) {
    if (summary) {
      const withSummaryPrefix = `${bot.prefix} ${title}\n`;
      const remaining = 280 - withSummaryPrefix.length - link.length - 1;
      if (remaining > 40) {
        const clippedSummary = truncate(summary, remaining);
        content = `${withSummaryPrefix}${clippedSummary}\n${link}`;
      }
    }
    return content;
  }

  const titleOnlyAllowance = Math.max(32, 280 - `${bot.prefix} \n${link}`.length);
  content = `${bot.prefix} ${truncate(title, titleOnlyAllowance)}\n${link}`;
  if (content.length <= 280) {
    return content;
  }

  content = `${bot.prefix} ${truncate(`${title} (${domain})`, 260)}`;
  return content;
}

function itemMatchesKeywords(item, keywords) {
  if (!keywords || !keywords.length) {
    return true;
  }
  const haystack = `${item.title || ''} ${item.description || ''}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(String(keyword).toLowerCase()));
}

function itemIsFresh(item, maxAgeDays, options = {}) {
  const allowUnknownDate = Boolean(options.allowUnknownDate);
  const maxFutureSkewMs = Number.isFinite(options.maxFutureSkewMs)
    ? options.maxFutureSkewMs
    : MAX_FUTURE_PUBLISH_SKEW_MS;
  const effectiveMaxAgeDays = maxAgeDays > 0 ? maxAgeDays : DEFAULT_MAX_ITEM_AGE_DAYS;

  if (!item.publishedAt) {
    return allowUnknownDate;
  }
  const ts = Date.parse(item.publishedAt);
  if (!Number.isFinite(ts)) {
    return allowUnknownDate;
  }
  const now = Date.now();
  if (ts - now > maxFutureSkewMs) {
    return false;
  }
  const ageMs = Date.now() - ts;
  if (ageMs < 0) {
    return true;
  }
  return ageMs <= effectiveMaxAgeDays * 24 * 60 * 60 * 1000;
}

function itemLooksStaleByYear(item) {
  const haystack = `${item && item.title ? item.title : ''} ${item && item.link ? item.link : ''}`;
  const matches = haystack.match(/\b20\d{2}\b/g);
  if (!matches || !matches.length) {
    return false;
  }
  const years = matches.map((value) => Number(value)).filter((value) => Number.isInteger(value));
  if (!years.length) {
    return false;
  }
  const newestYear = Math.max(...years);
  return newestYear < CURRENT_YEAR;
}

function sourceUrlLooksStaleByYear(sourceUrl) {
  const haystack = String(sourceUrl || '');
  const matches = haystack.match(/\b20\d{2}\b/g);
  if (!matches || !matches.length) {
    return false;
  }
  const years = matches.map((value) => Number(value)).filter((value) => Number.isInteger(value));
  if (!years.length) {
    return false;
  }
  const newestYear = Math.max(...years);
  return newestYear < CURRENT_YEAR;
}

function cleanupStaleTuBotTweets() {
  const placeholders = TUD_BOT_USERNAMES.map(() => '?').join(',');
  const staleRowsByAge = db
    .prepare(
      `SELECT source_key, bot_username, source_url, published_at, created_at
      FROM bot_ingested_items
      WHERE bot_username IN (${placeholders})
        AND (
          (published_at IS NOT NULL AND published_at < datetime('now', ?))
          OR (published_at IS NULL AND created_at < datetime('now', ?))
        )
      LIMIT 800`
    )
    .all(
      ...TUD_BOT_USERNAMES,
      `-${TU_BOT_STALE_RETENTION_DAYS} days`,
      `-${TU_BOT_STALE_RETENTION_DAYS} days`
    );
  const candidateYearRows = db
    .prepare(
      `SELECT source_key, bot_username, source_url, published_at, created_at
      FROM bot_ingested_items
      WHERE bot_username IN (${placeholders})
      LIMIT 1200`
    )
    .all(...TUD_BOT_USERNAMES);
  const staleRowsByYear = candidateYearRows.filter((row) => sourceUrlLooksStaleByYear(row.source_url));
  const staleRowMap = new Map();
  staleRowsByAge.forEach((row) => staleRowMap.set(row.source_key, row));
  staleRowsByYear.forEach((row) => staleRowMap.set(row.source_key, row));
  const staleRows = Array.from(staleRowMap.values());

  if (!staleRows.length) {
    return 0;
  }

  let removed = 0;
  const deleteBySourceStmt = db.prepare(
    `DELETE FROM tweets
    WHERE user_id = (SELECT id FROM users WHERE username = ? LIMIT 1)
      AND content LIKE ?`
  );
  const deleteIngestedStmt = db.prepare('DELETE FROM bot_ingested_items WHERE source_key = ?');

  const cleanupTx = db.transaction((rows) => {
    for (const row of rows) {
      const result = deleteBySourceStmt.run(row.bot_username, `%${row.source_url}%`);
      deleteIngestedStmt.run(row.source_key);
      removed += result.changes;
    }
  });
  cleanupTx(staleRows);
  return removed;
}

function cleanupOldBotTimelineRows() {
  const deleteOldBotTweetsStmt = db.prepare(
    `DELETE FROM tweets
    WHERE user_id IN (SELECT id FROM users WHERE is_bot = 1)
      AND created_at < datetime('now', ?)`
  );
  const deleteOldIngestedStmt = db.prepare(
    "DELETE FROM bot_ingested_items WHERE created_at < datetime('now', ?)"
  );

  const resultTweets = deleteOldBotTweetsStmt.run(`-${BOT_TWEET_RETENTION_DAYS} days`);
  const resultIngested = deleteOldIngestedStmt.run(`-${BOT_INGEST_RETENTION_DAYS} days`);
  return {
    removedTweets: resultTweets.changes || 0,
    removedIngested: resultIngested.changes || 0
  };
}

function normalizeKeyTitle(value) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 180);
}

function buildSourceKey(botUsername, item) {
  const normalizedUrl = normalizeHttpUrl(item.link) || '';
  const normalizedGuid = String(item.guid || '').trim();
  const normalizedTitle = normalizeKeyTitle(item.title || '');
  const publishedBucket = item.publishedAt ? String(item.publishedAt).slice(0, 16) : 'unknown';

  if (normalizedGuid) {
    return crypto.createHash('sha1').update(`${botUsername}|${normalizedGuid}`).digest('hex');
  }

  return crypto
    .createHash('sha1')
    .update(`${botUsername}|${normalizedUrl}|${normalizedTitle}|${publishedBucket}`)
    .digest('hex');
}

function weatherCodeToText(code) {
  const map = {
    0: 'clear',
    1: 'mainly clear',
    2: 'partly cloudy',
    3: 'cloudy',
    45: 'foggy',
    48: 'foggy',
    51: 'light drizzle',
    53: 'drizzle',
    55: 'heavy drizzle',
    61: 'light rain',
    63: 'rain',
    65: 'heavy rain',
    71: 'light snow',
    73: 'snow',
    75: 'heavy snow',
    80: 'rain showers',
    81: 'rain showers',
    82: 'heavy showers',
    95: 'thunderstorm'
  };
  return map[code] || 'mixed conditions';
}

function buildWeatherTweet(bot, stampUtc, cityRows) {
  const headline = `${bot.prefix} Ireland weather update (${stampUtc.slice(11, 16)} UTC)`;
  const details = cityRows.map((row) => {
    const temp = Math.round(row.temperature);
    const wind = Math.round(row.wind);
    const condition = weatherCodeToText(row.code);
    return `${row.name}: ${temp}C, ${condition}, wind ${wind} km/h`;
  });

  let content = `${headline}\n${details.join(' | ')}`;
  if (content.length > 280) {
    content = `${headline}\n${details.slice(0, 2).join(' | ')}`;
  }

  if (content.length > 280) {
    content = truncate(content, 280);
  }

  return content;
}

function ensureBotUser(bot) {
  ensureBotUserStmt.run(bot.username, bot.displayName, bot.bio, BOT_PASSWORD_HASH);
  const row = selectUserByUsernameStmt.get(bot.username);
  return row ? row.id : null;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'LoopfeedBots/1.0 (+https://loopfeed.duckdns.org)'
    }
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }
  return response.text();
}

async function runRssBot(bot) {
  if (!shouldRunBotNow(bot)) {
    return 0;
  }

  const userId = ensureBotUser(bot);
  if (!userId) {
    return 0;
  }

  const items = [];
  for (const feedUrl of bot.feeds) {
    if (isSourceMuted(feedUrl)) {
      continue;
    }
    try {
      const xml = await fetchText(feedUrl);
      const parsed = parseRssItems(xml);
      if (!parsed.length) {
        markSourceIssue(feedUrl, 'empty_feed');
        continue;
      }
      const quality = measureSourceQuality(parsed, bot.maxItemAgeDays || DEFAULT_MAX_ITEM_AGE_DAYS);
      if (!evaluateSourceQuality(feedUrl, quality)) {
        continue;
      }
      parsed.forEach((item) => items.push(item));
    } catch (err) {
      console.error(`Bot feed fetch failed for ${bot.username} (${feedUrl})`, err.message);
      markSourceIssue(feedUrl, 'fetch_error');
    }
  }

  items.sort((a, b) => {
    const left = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const right = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return right - left;
  });

  const maxPostsPerRun = bot.maxPostsPerRun || MAX_POSTS_PER_BOT_PER_RUN;
  const maxItemAgeDays = bot.maxItemAgeDays || DEFAULT_MAX_ITEM_AGE_DAYS;
  const allowUnknownDate = Boolean(bot.allowUnknownDate);
  const seenLinksThisRun = new Set();
  let created = 0;
  for (const item of items) {
    if (created >= maxPostsPerRun) {
      break;
    }
    if (!itemMatchesKeywords(item, bot.keywords)) {
      continue;
    }
    if (!itemIsFresh(item, maxItemAgeDays, { allowUnknownDate })) {
      continue;
    }
    if (itemLooksStaleByYear(item)) {
      continue;
    }

    const normalizedLink = normalizeHttpUrl(item.link);
    if (normalizedLink && seenLinksThisRun.has(normalizedLink)) {
      continue;
    }

    const sourceKey = buildSourceKey(bot.username, item);
    if (selectBotIngestedStmt.get(sourceKey)) {
      continue;
    }
    if (normalizedLink && selectBotIngestedByUrlStmt.get(bot.username, normalizedLink)) {
      continue;
    }

    const content = buildNewsTweet(bot, item);
    createTweetTx({
      userId,
      content,
      linkImageUrl: item.imageUrl || '',
      sourceKey,
      sourceUrl: normalizedLink || item.link,
      publishedAt: item.publishedAt,
      botUsername: bot.username
    });
    if (normalizedLink) {
      seenLinksThisRun.add(normalizedLink);
    }
    created += 1;
  }

  return created;
}

async function runTuDublinNewsBot(bot) {
  if (!shouldRunBotNow(bot)) {
    return 0;
  }

  const userId = ensureBotUser(bot);
  if (!userId) {
    return 0;
  }

  let html = '';
  const sourceId = bot.sourceUrl;
  if (isSourceMuted(sourceId)) {
    return 0;
  }
  try {
    html = await fetchText(bot.sourceUrl);
  } catch (err) {
    console.error(`Bot feed fetch failed for ${bot.username} (${bot.sourceUrl})`, err.message);
    markSourceIssue(sourceId, 'fetch_error');
    return 0;
  }

  const items = parseTuDublinNewsItems(html);
  if (!items.length) {
    markSourceIssue(sourceId, 'empty_listing');
    return 0;
  }
  markSourceHealthy(sourceId);
  const maxPostsPerRun = bot.maxPostsPerRun || MAX_POSTS_PER_BOT_PER_RUN;
  const maxItemAgeDays = bot.maxItemAgeDays || DEFAULT_MAX_ITEM_AGE_DAYS;
  const unknownDateLookbackItems = bot.unknownDateLookbackItems || DEFAULT_UNKNOWN_DATE_LOOKBACK_ITEMS;
  let created = 0;
  for (const rawItem of items) {
    if (created >= maxPostsPerRun) {
      break;
    }

    const item = await hydrateTuDublinItem(rawItem, bot.defaultImageUrl || '');
    const allowUnknownDate =
      !item.publishedAt && Number.isInteger(item.listIndex) && item.listIndex < unknownDateLookbackItems;
    if (!itemIsFresh(item, maxItemAgeDays, { allowUnknownDate })) {
      continue;
    }
    if (itemLooksStaleByYear(item)) {
      continue;
    }

    const sourceKey = buildSourceKey(bot.username, item);
    if (!sourceKey || selectBotIngestedStmt.get(sourceKey)) {
      continue;
    }
    if (selectBotIngestedByUrlStmt.get(bot.username, item.link)) {
      continue;
    }

    const content = buildNewsTweet(bot, item);
    createTweetTx({
      userId,
      content,
      linkImageUrl: item.imageUrl || bot.defaultImageUrl || '',
      sourceKey,
      sourceUrl: item.link,
      publishedAt: item.publishedAt,
      botUsername: bot.username
    });
    created += 1;
  }

  return created;
}

async function runTuDublinEventsBot(bot) {
  if (!shouldRunBotNow(bot)) {
    return 0;
  }

  const userId = ensureBotUser(bot);
  if (!userId) {
    return 0;
  }

  let html = '';
  const sourceId = bot.sourceUrl;
  if (isSourceMuted(sourceId)) {
    return 0;
  }
  try {
    html = await fetchText(bot.sourceUrl);
  } catch (err) {
    console.error(`Bot feed fetch failed for ${bot.username} (${bot.sourceUrl})`, err.message);
    markSourceIssue(sourceId, 'fetch_error');
    return 0;
  }

  const items = parseTuDublinEventsItems(html);
  if (!items.length) {
    markSourceIssue(sourceId, 'empty_listing');
    return 0;
  }
  markSourceHealthy(sourceId);
  const maxPostsPerRun = bot.maxPostsPerRun || MAX_POSTS_PER_BOT_PER_RUN;
  const maxItemAgeDays = bot.maxItemAgeDays || DEFAULT_MAX_ITEM_AGE_DAYS;
  const unknownDateLookbackItems = bot.unknownDateLookbackItems || DEFAULT_UNKNOWN_DATE_LOOKBACK_ITEMS;
  let created = 0;
  for (const rawItem of items) {
    if (created >= maxPostsPerRun) {
      break;
    }

    const item = await hydrateTuDublinItem(rawItem, bot.defaultImageUrl || '');
    const allowUnknownDate =
      !item.publishedAt && Number.isInteger(item.listIndex) && item.listIndex < unknownDateLookbackItems;
    if (!itemIsFresh(item, maxItemAgeDays, { allowUnknownDate })) {
      continue;
    }
    if (itemLooksStaleByYear(item)) {
      continue;
    }

    const sourceKey = buildSourceKey(bot.username, item);
    if (!sourceKey || selectBotIngestedStmt.get(sourceKey)) {
      continue;
    }
    if (selectBotIngestedByUrlStmt.get(bot.username, item.link)) {
      continue;
    }

    const content = buildNewsTweet(bot, item);
    createTweetTx({
      userId,
      content,
      linkImageUrl: item.imageUrl || bot.defaultImageUrl || '',
      sourceKey,
      sourceUrl: item.link,
      publishedAt: item.publishedAt,
      botUsername: bot.username
    });
    created += 1;
  }

  return created;
}

async function runDublinEventsBot(bot) {
  if (!shouldRunBotNow(bot)) {
    return 0;
  }

  const userId = ensureBotUser(bot);
  if (!userId) {
    return 0;
  }

  const sourceId = bot.sourceUrl;
  if (isSourceMuted(sourceId)) {
    return 0;
  }

  let html = '';
  try {
    html = await fetchText(bot.sourceUrl);
  } catch (err) {
    console.error(`Bot feed fetch failed for ${bot.username} (${bot.sourceUrl})`, err.message);
    markSourceIssue(sourceId, 'fetch_error');
    return 0;
  }

  const rawItems = parseDublinCityEventsItems(html);
  if (!rawItems.length) {
    markSourceIssue(sourceId, 'empty_listing');
    return 0;
  }

  const hydratedItems = [];
  for (const rawItem of rawItems.slice(0, 14)) {
    const item = await hydrateDublinCityItem(rawItem, bot.defaultImageUrl || '');
    hydratedItems.push(item);
  }
  const quality = measureSourceQuality(hydratedItems, bot.maxItemAgeDays || DEFAULT_MAX_ITEM_AGE_DAYS);
  if (!evaluateSourceQuality(sourceId, quality, { ignoreStaleRatio: true })) {
    return 0;
  }

  const maxPostsPerRun = bot.maxPostsPerRun || MAX_POSTS_PER_BOT_PER_RUN;
  const maxItemAgeDays = bot.maxItemAgeDays || DEFAULT_MAX_ITEM_AGE_DAYS;
  const unknownDateLookbackItems = bot.unknownDateLookbackItems || DEFAULT_UNKNOWN_DATE_LOOKBACK_ITEMS;
  let created = 0;

  for (const item of hydratedItems) {
    if (created >= maxPostsPerRun) {
      break;
    }

    const allowUnknownDate =
      !item.publishedAt && Number.isInteger(item.listIndex) && item.listIndex < unknownDateLookbackItems;
    if (!itemIsFresh(item, maxItemAgeDays, { allowUnknownDate })) {
      continue;
    }
    if (itemLooksStaleByYear(item)) {
      continue;
    }
    if (CAMPUS_NEAR_KEYWORDS.some((keyword) => (item.description || '').toLowerCase().includes(keyword))) {
      item.description = `Near campus · ${item.description || ''}`.trim();
    }

    const sourceKey = buildSourceKey(bot.username, item);
    if (!sourceKey || selectBotIngestedStmt.get(sourceKey)) {
      continue;
    }
    if (selectBotIngestedByUrlStmt.get(bot.username, item.link)) {
      continue;
    }

    const content = buildNewsTweet(bot, item);
    createTweetTx({
      userId,
      content,
      linkImageUrl: item.imageUrl || bot.defaultImageUrl || '',
      sourceKey,
      sourceUrl: item.link,
      publishedAt: item.publishedAt,
      botUsername: bot.username
    });
    created += 1;
  }

  return created;
}

async function runWeatherBot() {
  const bot = WEATHER_BOT;
  const userId = ensureBotUser(bot);
  if (!userId) {
    return 0;
  }

  const cityRows = [];
  for (const location of bot.locations) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Europe%2FDublin`;
      const raw = await fetchText(url);
      const payload = JSON.parse(raw);
      if (!payload.current) {
        continue;
      }

      cityRows.push({
        name: location.name,
        temperature: payload.current.temperature_2m,
        code: payload.current.weather_code,
        wind: payload.current.wind_speed_10m
      });
    } catch (err) {
      console.error(`Weather fetch failed for ${location.name}`, err.message);
    }
  }

  if (!cityRows.length) {
    return 0;
  }

  const stampUtc = new Date().toISOString().slice(0, 13);
  const sourceKey = `weather:${stampUtc}`;
  if (selectBotIngestedStmt.get(sourceKey)) {
    return 0;
  }

  const content = buildWeatherTweet(bot, `${stampUtc}:00:00Z`, cityRows);
  createTweetTx({
    userId,
    content,
    sourceKey,
    sourceUrl: 'https://api.open-meteo.com/',
    publishedAt: `${stampUtc}:00:00Z`,
    botUsername: bot.username
  });

  return 1;
}

async function runNewsBotsOnce() {
  if (loopInProgress) {
    return { created: 0 };
  }

  loopInProgress = true;
  try {
    const cleaned = cleanupStaleTuBotTweets();
    if (cleaned > 0) {
      console.log(`Removed ${cleaned} stale TU bot tweet(s)`);
    }
    const timelineCleanup = cleanupOldBotTimelineRows();
    if (timelineCleanup.removedTweets > 0 || timelineCleanup.removedIngested > 0) {
      console.log(
        `Bot cleanup removed ${timelineCleanup.removedTweets} old tweet(s), ${timelineCleanup.removedIngested} old ingest row(s)`
      );
    }

    let totalCreated = 0;
    for (const bot of RSS_BOTS) {
      totalCreated += await runRssBot(bot);
    }
    totalCreated += await runTuDublinNewsBot(TU_DUBLIN_NEWS_BOT);
    totalCreated += await runTuDublinEventsBot(TU_DUBLIN_EVENTS_BOT);
    totalCreated += await runDublinEventsBot(DUBLIN_EVENTS_BOT);
    totalCreated += await runWeatherBot();

    if (totalCreated > 0) {
      console.log(`News bots posted ${totalCreated} update(s)`);
    }
    return { created: totalCreated };
  } finally {
    loopInProgress = false;
  }
}

function startNewsBotLoop() {
  if (process.env.DISABLE_NEWS_BOTS === '1') {
    return null;
  }

  if (process.env.NODE_ENV === 'test' && process.env.ENABLE_NEWS_BOTS_IN_TEST !== '1') {
    return null;
  }

  const intervalMs = Number(process.env.NEWS_BOT_INTERVAL_MS) || DEFAULT_POLL_INTERVAL_MS;
  setTimeout(() => {
    runNewsBotsOnce().catch((err) => console.error('Initial bot run failed', err));
  }, 3000);

  const timer = setInterval(() => {
    runNewsBotsOnce().catch((err) => console.error('Scheduled bot run failed', err));
  }, intervalMs);

  if (timer.unref) {
    timer.unref();
  }
  return timer;
}

module.exports = {
  runNewsBotsOnce,
  startNewsBotLoop
};

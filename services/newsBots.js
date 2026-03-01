const crypto = require('crypto');

const db = require('../config/db');

const BOT_PASSWORD_HASH = '$2b$10$GixfXxQvA2q7ng9.A9vM1OEfK0qECgh7s7wtvQYLyJ6ZsxxrV8kM6';
const DEFAULT_POLL_INTERVAL_MS = 60 * 60 * 1000;
const MAX_POSTS_PER_BOT_PER_RUN = 2;

const RSS_BOTS = [
  {
    username: 'rte_news_bot',
    displayName: 'RTÉ News Bot',
    bio: 'Automated updates from Irish news headlines.',
    prefix: '📰',
    feeds: ['https://www.rte.ie/feeds/rss/?index=/news/', 'https://www.rte.ie/feeds/rss/?index=/news/business/']
  },
  {
    username: 'irish_sport_bot',
    displayName: 'Irish Sport Bot',
    bio: 'Automated updates from Irish sports headlines.',
    prefix: '🏅',
    feeds: ['https://www.rte.ie/feeds/rss/?index=/sport/']
  },
  {
    username: 'ireland_updates_bot',
    displayName: 'Ireland Updates Bot',
    bio: 'Automated updates from Irish current affairs sources.',
    prefix: '🇮🇪',
    feeds: ['https://www.thejournal.ie/feed/']
  }
];

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
const insertBotIngestedStmt = db.prepare(
  "INSERT OR IGNORE INTO bot_ingested_items (source_key, bot_username, source_url, published_at) VALUES (?, ?, ?, ?)"
);
const insertTweetStmt = db.prepare('INSERT INTO tweets (user_id, content) VALUES (?, ?)');

const ensureBotUserStmt = db.prepare(
  `INSERT OR IGNORE INTO users (username, display_name, bio, avatar_url, is_bot, password_hash)
   VALUES (?, ?, ?, '', 1, ?)`
);
const selectUserByUsernameStmt = db.prepare('SELECT id FROM users WHERE username = ?');

const createTweetTx = db.transaction((payload) => {
  insertTweetStmt.run(payload.userId, payload.content);
  insertBotIngestedStmt.run(payload.sourceKey, payload.botUsername, payload.sourceUrl, payload.publishedAt || null);
});

let loopInProgress = false;

function decodeEntities(input) {
  if (!input) {
    return '';
  }

  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_m, num) => String.fromCharCode(parseInt(num, 10)));
}

function stripHtml(value) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTagValue(xmlFragment, tagName) {
  const cdataRegex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, 'i');
  const cdataMatch = xmlFragment.match(cdataRegex);
  if (cdataMatch) {
    return decodeEntities(stripHtml(cdataMatch[1]));
  }

  const normalRegex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const normalMatch = xmlFragment.match(normalRegex);
  if (!normalMatch) {
    return '';
  }

  return decodeEntities(stripHtml(normalMatch[1]));
}

function parseRssItems(xmlText) {
  const itemMatches = xmlText.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return itemMatches
    .map((itemXml) => {
      const title = extractTagValue(itemXml, 'title');
      const link = extractTagValue(itemXml, 'link');
      const guid = extractTagValue(itemXml, 'guid');
      const description = extractTagValue(itemXml, 'description');
      const pubDateRaw = extractTagValue(itemXml, 'pubDate');
      const publishedAt = pubDateRaw ? new Date(pubDateRaw) : null;

      if (!title || !link) {
        return null;
      }

      return {
        title,
        link,
        guid,
        description,
        publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt.toISOString() : null
      };
    })
    .filter(Boolean);
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
  const title = truncate(item.title, 150);
  const summary = item.description ? truncate(item.description, 90) : '';
  let content = `${bot.prefix} ${title}`;
  if (summary) {
    content = `${content}\n${summary}`;
  }

  content = `${content}\n${item.link}`;
  if (content.length > 280) {
    content = `${bot.prefix} ${truncate(title, 120)}\n${truncate(item.link, 150)}`;
  }

  if (content.length > 280) {
    content = `${bot.prefix} ${truncate(`${title} (${domain})`, 260)}`;
  }

  return content;
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
  const userId = ensureBotUser(bot);
  if (!userId) {
    return 0;
  }

  const items = [];
  for (const feedUrl of bot.feeds) {
    try {
      const xml = await fetchText(feedUrl);
      const parsed = parseRssItems(xml);
      parsed.forEach((item) => items.push(item));
    } catch (err) {
      console.error(`Bot feed fetch failed for ${bot.username} (${feedUrl})`, err.message);
    }
  }

  items.sort((a, b) => {
    const left = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const right = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return right - left;
  });

  let created = 0;
  for (const item of items) {
    if (created >= MAX_POSTS_PER_BOT_PER_RUN) {
      break;
    }

    const sourceKey = item.guid || item.link || crypto.createHash('sha1').update(item.title).digest('hex');
    if (selectBotIngestedStmt.get(sourceKey)) {
      continue;
    }

    const content = buildNewsTweet(bot, item);
    createTweetTx({
      userId,
      content,
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
    let totalCreated = 0;
    for (const bot of RSS_BOTS) {
      totalCreated += await runRssBot(bot);
    }
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

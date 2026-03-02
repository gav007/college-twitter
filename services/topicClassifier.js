const db = require('../config/db');

const TOPIC_RULES = [
  { slug: 'ai', keywords: ['ai', 'artificial intelligence', 'machine learning', 'llm', 'openai', 'gpt'] },
  { slug: 'cyber', keywords: ['cyber', 'security', 'hacking', 'malware', 'ransomware', 'privacy'] },
  { slug: 'events', keywords: ['event', 'weekend', 'festival', 'conference', 'meetup', 'gig', 'show'] },
  { slug: 'tu-news', keywords: ['tu dublin', 'grangegorman', 'campus', 'university', 'apprenticeship'] },
  { slug: 'careers', keywords: ['career', 'job', 'hiring', 'internship', 'graduate', 'skills'] },
  { slug: 'startups', keywords: ['startup', 'founder', 'funding', 'venture', 'scaleup'] },
  { slug: 'sport', keywords: ['sport', 'match', 'league', 'football', 'gaa', 'rugby'] },
  { slug: 'music', keywords: ['music', 'album', 'artist', 'gig', 'concert', 'dj'] }
];

const selectKnownTopicStmt = db.prepare('SELECT slug FROM topics WHERE slug = ?');
const deleteTweetTopicsStmt = db.prepare('DELETE FROM tweet_topics WHERE tweet_id = ?');
const insertTweetTopicStmt = db.prepare('INSERT OR IGNORE INTO tweet_topics (tweet_id, topic_slug) VALUES (?, ?)');

function normalizeText(value) {
  return (value || '').toLowerCase();
}

function extractTopicSlugs(content, sourceUrl) {
  const haystack = `${normalizeText(content)} ${normalizeText(sourceUrl)}`;
  const matched = [];
  for (const rule of TOPIC_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      matched.push(rule.slug);
    }
  }
  if (!matched.length) {
    return [];
  }
  return matched.filter((slug, index) => matched.indexOf(slug) === index);
}

function assignTopicsToTweet(tweetId, content, sourceUrl = '') {
  const topicSlugs = extractTopicSlugs(content, sourceUrl);
  deleteTweetTopicsStmt.run(tweetId);
  for (const slug of topicSlugs) {
    if (!selectKnownTopicStmt.get(slug)) {
      continue;
    }
    insertTweetTopicStmt.run(tweetId, slug);
  }
  return topicSlugs;
}

module.exports = {
  assignTopicsToTweet,
  extractTopicSlugs
};

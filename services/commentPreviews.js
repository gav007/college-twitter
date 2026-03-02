const db = require('../config/db');

const selectTopCommentsForTweetStmt = db.prepare(
  `SELECT
    r.id,
    r.tweet_id,
    r.user_id,
    r.content,
    r.created_at,
    u.username,
    u.display_name,
    u.avatar_url
  FROM replies r
  JOIN users u ON u.id = r.user_id
  WHERE r.tweet_id = ?
  ORDER BY r.created_at DESC, r.id DESC
  LIMIT ?`
);

function attachCommentPreviews(tweets, limit = 3) {
  if (!Array.isArray(tweets) || !tweets.length) {
    return tweets;
  }

  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 3;
  for (const tweet of tweets) {
    tweet.comment_preview = selectTopCommentsForTweetStmt.all(tweet.id, safeLimit);
  }

  return tweets;
}

module.exports = {
  attachCommentPreviews
};

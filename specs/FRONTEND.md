# Frontend

## Templating: EJS
All pages are `.ejs` files in `/views`. Use `res.render('page-name', { data })`.

Every view gets `res.locals.currentUser` (the logged-in user object or `null`) via the `currentUser` middleware, so you don't need to pass it explicitly.

## Layout Pattern
EJS has no built-in layout system. Use include() at the top and bottom of each view:

```ejs
<%- include('layout/header', { title: 'Home' }) %>
<%- include('layout/nav') %>

<!-- page content here -->

</body>
</html>
```

`layout/header.ejs` contains `<html>`, `<head>`, CSS link, opens `<body>`.
`layout/nav.ejs` contains the top navigation bar.

## Pages

### home.ejs
- Tweet compose box at the top (only if logged in): textarea with 280-char counter, Post button
- Feed of tweet cards below
- Pass: `{ tweets: [...] }`

### explore.ejs
- Search bar at top
- Recent tweets from everyone, or search results if `?q=` present
- Pass: `{ tweets: [...], query: '' }`

### profile.ejs
- User header: display name, @username, bio, follower/following counts
- Follow/Unfollow button (not shown if viewing own profile)
- List of user's tweets
- Pass: `{ profileUser, tweets, isFollowing, followerCount, followingCount }`

### login.ejs / register.ejs
- Simple centered card form
- Show `error` message if passed: `{ error: 'Invalid credentials' }`

### error.ejs
- Pass: `{ message, status }`

## Tweet Card Partial (`partials/tweet-card.ejs`)

```ejs
<article class="tweet-card" data-tweet-id="<%= tweet.id %>">
  <div class="tweet-header">
    <a href="/users/<%= tweet.username %>" class="tweet-author">
      <strong><%= tweet.display_name %></strong>
      <span class="tweet-username">@<%= tweet.username %></span>
    </a>
    <time class="tweet-time"><%= formatTime(tweet.created_at) %></time>
  </div>
  <p class="tweet-content"><%= tweet.content %></p>
  <div class="tweet-actions">
    <% if (currentUser) { %>
      <button class="like-btn <%= tweet.liked_by_me ? 'liked' : '' %>" 
              data-tweet-id="<%= tweet.id %>">
        ♥ <span class="like-count"><%= tweet.like_count %></span>
      </button>
    <% } else { %>
      <span class="like-count-static">♥ <%= tweet.like_count %></span>
    <% } %>
    <% if (currentUser && currentUser.id === tweet.user_id) { %>
      <form method="POST" action="/tweets/<%= tweet.id %>/delete" class="delete-form">
        <button type="submit" class="delete-btn">Delete</button>
      </form>
    <% } %>
  </div>
</article>
```

## CSS (`public/css/main.css`)

Keep it simple and mobile-friendly. Design goals:
- Clean white/light gray background
- Dark text, good contrast
- Max width ~600px centered (like Twitter's single-column feed)
- Cards with subtle shadow/border
- Blue accent color for buttons and links (#1d9bf0 — classic Twitter blue)
- Responsive: looks good on phone without media queries if you use max-width + padding

Key classes to implement:
- `.tweet-card` — white card, border, padding, margin-bottom
- `.tweet-author` — no underline, dark text, hover effect
- `.tweet-username` — gray color
- `.like-btn` — subtle button, `.liked` state turns it red/filled
- `.nav` — top bar, logo left, links right
- `.compose-box` — tweet input area
- `.char-counter` — shows remaining chars, turns red under 20

## JavaScript (`public/js/app.js`)

Only two features need JS:

### 1. Character counter
```js
const textarea = document.querySelector('.tweet-textarea');
const counter = document.querySelector('.char-counter');
if (textarea && counter) {
  textarea.addEventListener('input', () => {
    const remaining = 280 - textarea.value.length;
    counter.textContent = remaining;
    counter.classList.toggle('danger', remaining < 20);
  });
}
```

### 2. Like button (fetch, no page reload)
```js
document.querySelectorAll('.like-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const tweetId = btn.dataset.tweetId;
    const res = await fetch(`/tweets/${tweetId}/like`, { method: 'POST' });
    if (!res.ok) return;
    const { liked, like_count } = await res.json();
    btn.classList.toggle('liked', liked);
    btn.querySelector('.like-count').textContent = like_count;
  });
});
```

## Time Formatting
In your route handlers, format `created_at` before passing to views. Simple approach:
```js
function formatTime(isoString) {
  const date = new Date(isoString + 'Z'); // SQLite stores without Z
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
```
Attach this to `res.locals.formatTime = formatTime` in a middleware so all views can use it.

## Security / XSS
EJS escapes HTML by default with `<%= %>`. Always use `<%= %>` for user content. Only use `<%- %>` for trusted partials (include statements). Never use `<%-` for user-generated content.

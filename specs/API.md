# Routes & API Reference

All routes are server-rendered (return HTML) except where noted with `[JSON]`. Forms use standard POST with redirects (Post/Redirect/Get pattern).

## Auth Routes (`routes/auth.js`)

| Method | Path | Auth Required | Description |
|---|---|---|---|
| GET | `/login` | No | Show login form |
| POST | `/login` | No | Authenticate user, set session, redirect to `/` |
| GET | `/register` | No | Show registration form |
| POST | `/register` | No | Create user, set session, redirect to `/` |
| POST | `/logout` | Yes | Destroy session, redirect to `/login` |

**POST /register body**: `username`, `display_name`, `password`, `password_confirm`
- Username: 3–20 chars, alphanumeric + underscores only, case-insensitive unique
- Password: min 8 chars
- On success: create user, log them in, redirect `/`
- On error: re-render form with error message

**POST /login body**: `username`, `password`
- On success: set `req.session.userId`, redirect `/`
- On fail: re-render form with generic "Invalid credentials" message (don't reveal which field was wrong)

## Feed Routes (`routes/feed.js`)

| Method | Path | Auth Required | Description |
|---|---|---|---|
| GET | `/` | Yes | Home feed (followed users + self) |

## Tweet Routes (`routes/tweets.js`)

| Method | Path | Auth Required | Description |
|---|---|---|---|
| POST | `/tweets` | Yes | Create a new tweet, redirect to `/` |
| POST | `/tweets/:id/delete` | Yes | Delete tweet (must own it), redirect back |
| POST | `/tweets/:id/like` | Yes | Toggle like on tweet `[JSON]` |

**POST /tweets body**: `content` (1–280 chars)

**POST /tweets/:id/like** returns JSON:
```json
{ "liked": true, "like_count": 42 }
```
This is called via fetch() from the frontend for a snappy like button without page reload.

**DELETE protection**: Verify `tweet.user_id === req.session.userId` before deleting. Return 403 if not owner.

## User Routes (`routes/users.js`)

| Method | Path | Auth Required | Description |
|---|---|---|---|
| GET | `/users/:username` | No | Public profile page |
| POST | `/users/:username/follow` | Yes | Toggle follow/unfollow, redirect back |

**GET /users/:username**: Show user's tweets, follower/following counts, follow button (if not viewing own profile), and whether current user follows them.

**POST /users/:username/follow**: Toggle — if already following, unfollow; otherwise follow. Cannot follow yourself (return 400).

## Explore Routes (`routes/explore.js`)

| Method | Path | Auth Required | Description |
|---|---|---|---|
| GET | `/explore` | No | Recent tweets from all users (latest 100) |
| GET | `/search` | No | Search results by username query param `?q=` |

**GET /search?q=term**: Search users by username LIKE `%term%`. Return up to 20 matching users with their tweet counts.

## Error Handling

- 404: Render `views/error.ejs` with "Page not found"
- 500: Render `views/error.ejs` with "Something went wrong"
- All route errors should be passed to `next(err)` and caught by the Express error handler in `app.js`
- Validation errors should re-render the form with the error inline (not a separate error page)

## Session
- Session cookie name: `ct_session`
- Secret: from `SESSION_SECRET` env var
- `resave: false`, `saveUninitialized: false`
- Cookie: `httpOnly: true`, `secure: false` (nginx handles SSL termination, Node sees HTTP)
- Max age: 30 days

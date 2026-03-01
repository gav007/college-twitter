# Testing (Manual Verification)

This project is intentionally light on automated tests. Use these steps at each phase.

## Phase 1 - Foundation

1. Start server:
   - `node server.js`
2. Verify it starts without errors.
3. Verify HTTP:
   - `curl -i http://localhost:3000/`

## Phase 2 - Auth

Browser flow:

1. Visit `GET /register`
2. Register (username, display_name, password, password_confirm)
3. Confirm you are logged in and redirected to `/`
4. Refresh `/` and confirm session persists
5. Logout via `POST /logout`, confirm redirect to `/login`

curl (cookie jar) flow:

1. Register:
   - `curl -i -c /tmp/ct.cookies -b /tmp/ct.cookies -X POST http://localhost:3000/register -d 'username=test_user&display_name=Test%20User&password=passw0rd123&password_confirm=passw0rd123'`
2. Fetch feed (should be HTML, not a redirect to login):
   - `curl -i -c /tmp/ct.cookies -b /tmp/ct.cookies http://localhost:3000/`

## Phase 3 - Core Features

1. Post a tweet:
   - `curl -i -c /tmp/ct.cookies -b /tmp/ct.cookies -X POST http://localhost:3000/tweets -d 'content=hello%20world'`
2. Explore shows recent tweets:
   - `curl -i http://localhost:3000/explore`
3. Profile page loads:
   - `curl -i http://localhost:3000/users/test_user`
4. Search finds user:
   - `curl -i 'http://localhost:3000/search?q=test'`

## Phase 4 - Frontend

1. In browser, click Like on a tweet.
2. Confirm it toggles without full page reload.
3. Confirm the request is `POST /tweets/:id/like` and response is JSON:
   - `{ "liked": true|false, "like_count": <n> }`

## Phase 5 - Deployment

1. Local via nginx:
   - `curl -i http://localhost/`
2. From another machine:
   - `curl -i http://<public-ip>/`
3. Health checks:
   - `pm2 status` shows `loopfeed` as online
   - `sudo systemctl status nginx` is active

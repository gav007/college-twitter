# College Twitter — Project Overview

## What This Is
A lightweight, "vibe-coded" Twitter clone built for college students. Fast, cheap, no fluff. Runs on a single AWS t2.micro instance (1 vCPU, 1 GB RAM, Amazon Linux 2023). Think early Twitter — post short messages, follow people, see a feed.

## Guiding Philosophy
- **Cheap to run** — SQLite database (no RDS), no Redis, no message queues, no microservices
- **Simple to deploy** — single Node.js process managed by PM2 behind nginx
- **Fast to build** — minimal dependencies, server-rendered HTML with a sprinkle of vanilla JS (no React build step)
- **Easy to maintain** — readable code over clever code

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 20 LTS | Fast, widely supported |
| Framework | Express.js | Minimal, no magic |
| Database | SQLite (via `better-sqlite3`) | Zero infra, fast reads, file-based |
| Templating | EJS | Simple server-side HTML, no build step |
| Auth | Sessions + bcrypt | Simple cookie-based sessions |
| CSS | Plain CSS + small utility classes | No build tools needed |
| JS | Vanilla JS (minimal) | No bundler needed |
| Process mgr | PM2 | Keeps app alive, handles restarts |
| Web server | nginx | Reverse proxy, serves static files |
| Server | AWS t2.micro, Amazon Linux 2023 | Cheapest viable EC2 |

## Constraints
- **RAM**: Stay under 300MB Node.js heap. No in-memory caches for large datasets.
- **CPU**: Single core effectively. No CPU-intensive operations on the main thread.
- **Disk**: SQLite file lives at `/home/ec2-user/data/college-twitter.db`
- **No paid services**: No SendGrid, no Cloudinary, no Pusher. Use what's free or self-hosted.

## Core Features (MVP)
1. Register / Login / Logout
2. Post a tweet (≤280 characters)
3. Delete your own tweets
4. Follow / Unfollow users
5. Home feed (tweets from people you follow + your own, reverse chronological)
6. Profile page (user's tweets, follower/following counts)
7. Explore page (recent tweets from all users)
8. Like a tweet
9. Basic search (search usernames)

## Out of Scope (for now)
- Direct messages
- Retweets / quote tweets
- Image uploads
- Notifications
- Email verification
- OAuth login

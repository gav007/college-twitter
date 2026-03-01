# Phase 12a - Ephemeral Image Uploads (Binding Spec)

## Objective
Add secure image uploads with strict limits and automatic expiration so storage stays bounded.

## Scope
- Images only for this phase.
- Ephemeral behavior with one-hour TTL.
- Expiration deletes the whole tweet and attached media.

## Upload Policy
- Allowed image types: `jpg`, `jpeg`, `png`, `webp`.
- Maximum image size: `5 MB`.
- Files stored outside repo: `/home/ec2-user/data/uploads/` (or `UPLOAD_DIR` override).
- Filenames must be random and non-user-controlled.

## Data Model
Add table:

```sql
CREATE TABLE IF NOT EXISTS tweet_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tweet_id INTEGER NOT NULL UNIQUE REFERENCES tweets(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tweet_media_tweet_id ON tweet_media(tweet_id);
CREATE INDEX IF NOT EXISTS idx_tweet_media_expires_at ON tweet_media(expires_at);
```

## Expiration Semantics
- Media TTL is exactly `1 hour` from upload.
- At expiration: delete tweet + media file + media metadata.
- Cleanup job runs every `5 minutes`.
- If an expired media URL is requested, return `404`.

## Security Requirements
- Upload endpoint keeps existing CSRF protection.
- Upload endpoint uses write rate limiting.
- Validate:
  - Extension allowlist
  - MIME allowlist
  - File signature (magic bytes) check
- Uploaded files must not be executable and must not live inside webroot.

## Routes and UI
- Tweet create route accepts optional image upload.
- Tweet card and thread parent tweet render attached image when present.
- Media served through Express route with expiration checks.

## Backup Rule
- Upload directory is excluded from DB backup workflow.

## Tests (Required)
- Valid image upload succeeds and renders.
- Invalid type upload is rejected.
- Oversized upload is rejected.
- Missing CSRF token on upload POST returns `403`.
- Upload spam eventually hits `429`.

## Definition of Done
- [x] Secure image upload pipeline implemented.
- [x] Ephemeral expiration deletes tweet+media within cleanup window.
- [x] UI displays attached images on tweet surfaces.
- [x] Required upload security and abuse controls are active.
- [x] E2E tests for upload success/failure/CSRF/rate-limit pass.

# Static Asset Caching Policy

## Current Mode (Active Development)
Use short-cache headers for non-versioned assets under `/public/`.

nginx `/public/` policy:
- `expires 5m;`
- `add_header Cache-Control "public" always;`

Rationale:
- CSS/JS filenames are not hashed/versioned.
- `immutable` with long TTL can hide active development changes.

## Production Optimization (Later)
When hashed or versioned asset URLs are introduced:
- Restore long-cache immutable policy.
- Example: `Cache-Control: public, immutable` with long max-age.

## Rule
Do not use long immutable caching for non-versioned assets.

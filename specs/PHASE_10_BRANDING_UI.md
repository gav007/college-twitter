# Phase 10 - Branding and UI Name Consistency (Binding Spec)

## Objective
Complete the product rebrand to `Loopfeed` across visible UI surfaces and runtime process naming, while keeping repository and infrastructure paths stable.

## Scope
- User-visible product name becomes `Loopfeed`.
- PM2 process name becomes `loopfeed`.
- Domain remains `loopfeed.duckdns.org`.

## Required Changes

### 1. Visible Product Name
- All user-visible product name references must be `Loopfeed`.
- Required surfaces:
  - Browser page title suffix.
  - Header/nav brand text.
  - Footer text.

### 2. PM2 Runtime Naming
- Change PM2 app process name from `college-twitter` to `loopfeed`.
- `pm2 status` must show `loopfeed` as online.

### 3. Explicit Non-Changes
- nginx config filename may remain `/etc/nginx/conf.d/college-twitter.conf`.
- `server_name` stays `loopfeed.duckdns.org`.
- Repository name may remain `college-twitter`.
- Internal filesystem paths and DB filename may remain `college-twitter` unless a later migration phase changes them.

## Files
- `views/layout/header.ejs`
- `views/layout/nav.ejs`
- `views/layout/footer.ejs` (new)
- top-level view templates that render layout footer
- `ecosystem.config.js`
- operational docs referencing PM2 process name

## Verify
1. UI:
   - Open `/login` and `/`.
   - Title suffix shows `Loopfeed`.
   - Header brand text shows `Loopfeed`.
   - Footer text is present and uses `Loopfeed`.
2. PM2:
   - `pm2 status` shows `loopfeed` online.
3. HTTP:
   - `curl -I https://loopfeed.duckdns.org/login` succeeds.

## Definition of Done
- [x] Visible product name is `Loopfeed` on title, header, and footer.
- [x] PM2 process renamed to `loopfeed` and online.
- [x] Existing app behavior remains intact after rename.

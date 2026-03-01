# Phase 11 - Dark Mode (Binding Spec)

## Objective
Add standards-friendly theming with a system-default dark mode and a persistent manual toggle.

## Scope
- CSS variable-based theming.
- System preference support via `prefers-color-scheme`.
- Manual theme toggle with `localStorage` persistence.
- Accessibility and regression verification.

## Required Changes

### 1. CSS Theme Tokens
- `public/css/main.css` must define variables for:
  - background
  - text
  - card/surface
  - border
  - accent

### 2. System Preference Default
- Use `@media (prefers-color-scheme: dark)` for dark defaults.
- Set `color-scheme: light dark` for correct native form control rendering.

### 3. Manual Toggle
- Add a visible theme toggle control.
- Toggle must store user preference in `localStorage`.
- Stored preference must override system preference on next load.

### 4. Accessibility
- Keep readable contrast in both themes for:
  - body text
  - links
  - cards/panels
  - buttons
  - form inputs

### 5. Automated Test
- Add Playwright test covering:
  - toggle action changes theme
  - preference persists after page refresh

## Files
- `public/css/main.css`
- `public/js/app.js`
- `views/layout/nav.ejs`
- `tests/e2e/theme.spec.js` (new)

## Verify
1. Manual:
   - Visit `/login`, toggle theme, refresh, confirm theme remains selected.
2. Automated:
   - `npm run test:e2e` includes theme persistence test and passes.

## Definition of Done
- [x] CSS variable-based light/dark themes implemented.
- [x] System dark preference is honored by default.
- [x] Manual toggle persists via `localStorage`.
- [x] Playwright persistence test passes.

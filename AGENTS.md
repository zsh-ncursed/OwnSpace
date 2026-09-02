# AGENTS.md — OwnSpace

## Project

OwnSpace — Firefox/Chrome MV3 new-tab replacement extension. Vanilla JS ES-modules, no bundler. Repo: https://github.com/zsh-ncursed/OwnSpace

## Mandatory Gates

### Gate 1: Manifest changes

Before committing any change to `manifest.json`:

- [ ] Every modified key — verified against MDN compatibility table (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json)
- [ ] Firefox MV3 and Chrome MV3 diverge — check both browser columns
- [ ] `background`: Firefox does NOT support `service_worker` (bug 1573659). Must use `background.scripts` for Firefox + `service_worker` for Chrome.
- [ ] `chrome_url_overrides`: supported in Firefox (despite the "chrome" prefix). `browser_url_overrides` is non-standard — do not use.
- [ ] `content_security_policy`: must be set explicitly for MV3 extension pages. Without it, Firefox may block ES modules on some pages.
- [ ] `host_permissions`: `<all_urls>` requires AMO submission justification.
- [ ] `default_locale`: requires `_locales/` dir. If absent, remove the key.

Do NOT commit manifest changes without completing this checklist.

### Gate 2: Smoke test before "ready"

Before declaring any xpi ready for installation/publishing:

- [ ] Install xpi in Firefox via `about:debugging` → "This Firefox" → "Load Temporary Add-on" → select `ownspace.xpi`
- [ ] Open new tab — widgets render, no blank page
- [ ] Open options page (extension → settings) — all sections visible, no blank page
- [ ] Open browser console (`Ctrl+Shift+J`) — no errors related to OwnSpace
- [ ] If any page is blank or broken — NOT ready. Fix before reporting.

Do NOT declare "ready", "done", or "built" without passing this smoke test.

## Build

```bash
bash build.sh      # produces ownspace.xpi
npm run lint       # eslint src/ background/ tests/ options/
npm test           # vitest, 224 tests
```

## Tech notes

- i18n: flat JS dictionaries (`src/i18n/en.js`, `ru.js`), NOT browser.i18n. `t(key, params)` at runtime.
- ICS parser (`background/ics-parser.js`): classic script, shared via `globalThis.OwnSpaceICS` between SW (importScripts) and tests (side-effect import).
- Crypto: PBKDF2 100k iterations + random salt for master password. AES-GCM with per-payload salt for encryption. Legacy salt fallback for backwards compat.
- Background: `background.scripts` (Firefox event page) + `service_worker` (Chrome). `importScripts` guarded with `typeof` check.
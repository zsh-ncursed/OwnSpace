# Privacy Policy — OwnSpace

**Last updated: 2026-08-01**

OwnSpace is a local new-tab replacement for Firefox and Chrome. It runs entirely in your browser. We do not collect, transmit, or sell any personal data.

## Data storage

All data — workspaces, widgets, notes, bookmarks, to-do items, calendar events, settings, and CalDAV credentials — is stored locally in `browser.storage.local` on your device. It never leaves your machine unless you explicitly export it.

## Encryption

- **Master password** is hashed with PBKDF2-SHA-256 (100,000 iterations + random salt) and never stored in plain text.
- **CalDAV credentials** are encrypted with AES-GCM using a key derived from your master password.
- **Encrypted exports** use AES-GCM with a per-file random salt.

## Network access

OwnSpace makes network requests only when you configure a feature that requires it:

- **CalDAV sync** — connects to the calendar server URL you provide, with your credentials. We do not proxy or log these requests.
- **Weather widget** — fetches weather data from `api.openweathermap.org` using the API key you provide.
- **Bookmark title fetch** — when you add a bookmark, the extension may fetch the page `<title>` to pre-fill the bookmark name.

No telemetry, no analytics, no tracking. The `data_collection_permissions` field in the manifest is set to `"none"`.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Save your widgets, notes, bookmarks, settings locally |
| `tabs` | Pin the OwnSpace tab; open new tabs when configured |
| `<all_urls>` (host) | Fetch CalDAV calendars, weather data, and bookmark titles from URLs you provide |

Host permissions are broad because the extension fetches user-specified URLs (CalDAV servers, weather API, bookmark pages). We do not read or inject content into arbitrary pages.

## Third-party services

OwnSpace does not use any third-party analytics, advertising, or tracking SDKs. Bundled libraries (`webextension-polyfill`, `Sortable.js`) are loaded locally — no remote scripts.

## Open source

OwnSpace is open source. You can audit the code at https://github.com/zsh-ncursed/OwnSpace.

## Contact

Issues: https://github.com/zsh-ncursed/OwnSpace/issues
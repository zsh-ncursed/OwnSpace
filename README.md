# OwnSpace Browser Extension

Local start page replacement with customizable widgets.

## Features

- **Workspaces** — Up to 10 customizable workspaces with tabs navigation
- **Widgets:**
  - 📚 Bookmarks — Save and organize links with auto-favicon
  - 📝 Notes — Simple text notes with autosave
  - ⏰ Date/Time — Real-time clock display
  - 🌤️ Weather — OpenWeather API integration
  - 📅 Calendar — Local events with optional CalDAV sync
- **Customization:**
  - Dark/Light theme toggle
  - Background: solid color, gradient, or image
  - Image compression for storage optimization
- **Export/Import:** JSON backup with optional AES-GCM encryption

## Installation

### Firefox (AMO)

1. Open `about:addons`
2. Click the gear icon → "Debug Add-ons"
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file

### Chrome

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the extension directory

## Testing

### Firefox

1. Navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `manifest.json`
4. Open a new tab to see OwnSpace

### Chrome

1. Navigate to `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked"
4. Select the extension directory
5. Open a new tab

## Project Structure

```
ownspace/
├── manifest.json          # MV3 manifest
├── newtab.html           # Entry point
├── background/
│   └── sync-worker.js    # CalDAV sync worker
├── src/
│   ├── main.js           # Entry point
│   ├── app.js            # Main application
│   ├── styles/
│   │   └── main.css      # Styles
│   └── utils/
│       ├── constants.js  # Constants
│       ├── storage.js    # Storage utilities
│       └── crypto.js     # Crypto utilities
└── lib/
    └── sortable.min.js   # SortableJS
```

## Tech Stack

- Vanilla JS (no framework for minimal footprint)
- CSS custom properties for theming
- Web Crypto API for encryption
- Web Workers for background sync
- SortableJS for drag-and-drop

## License

MIT
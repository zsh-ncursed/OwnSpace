# OwnSpace Browser Extension — Design Specification

## 1. Project Overview

**Project Name:** OwnSpace
**Type:** Browser Extension (Firefox + Chrome)
**Summary:** Local alternative to start.me — replaces new tab page with customizable workspace containing widgets. No cloud backend, all data stored locally in browser.storage.local.
**Target Users:** Privacy-conscious users who want a fast, offline-capable new tab page.

## 2. Technical Stack

| Component | Choice | Rationale |
|-----------|--------|------------|
| Manifest | Manifest V3 | Required for Firefox/Chrome modern extensions |
| API | browser.* + webextension-polyfill | Cross-browser compatibility |
| UI Framework | Hybrid: Preact + Vanilla JS | Resource efficiency + maintainability |
| DnD | SortableJS | Proven lightweight solution (~5KB) |
| State | Context API (built-in) | No extra dependencies |
| Styles | CSS-in-JS (vanilla-extract or inline) | Scoped styles, no runtime overhead |
| Background | Web Worker | Async CalDAV sync without blocking UI |
| Storage | browser.storage.local | ~10MB limit, optimize data size |
| Crypto | Web Crypto API (AES-GCM) | Encrypt CalDAV credentials, export files |

## 3. Architecture

```
ownspace/
├── manifest.json              # MV3 manifest
├── background/
│   └── sync-worker.js         # CalDAV sync Web Worker
├── newtab.html                # Entry point
├── src/
│   ├── index.jsx             # Preact entry
│   ├── App.jsx               # Root component
│   ├── contexts/
│   │   ├── WorkspaceContext.jsx
│   │   ├── ThemeContext.jsx
│   │   └── CalDAVContext.jsx
│   ├── components/
│   │   ├── WorkspaceTabs.jsx
│   │   ├── WidgetGrid.jsx
│   │   ├── Widget.jsx
│   │   └── AddWidgetMenu.jsx
│   ├── widgets/
│   │   ├── Bookmarks.jsx
│   │   ├── Notes.jsx
│   │   ├── DateTime.jsx
│   │   ├── Weather.jsx
│   │   └── Calendar.jsx
│   ├── hooks/
│   │   ├── useStorage.js
│   │   ├── useCrypto.js
│   │   └── useCalDAV.js
│   ├── utils/
│   │   ├── storage.js
│   │   ├── crypto.js
│   │   ├── api.js
│   │   └── constants.js
│   └── styles/
│       └── theme.js          # CSS-in-JS theme definitions
├── lib/
│   └── sortable.min.js
└── icons/
    └── 16.png, 32.png, 48.png, 96.png, 128.png
```

## 4. Data Schema

```typescript
interface Workspace {
  id: string;           // UUID
  name: string;
  background: {
    type: 'color' | 'gradient' | 'image';
    value: string;      // hex, gradient CSS, or base64
  };
  widgets: Widget[];
}

interface Widget {
  id: string;           // UUID
  type: 'bookmarks' | 'notes' | 'date' | 'weather' | 'calendar';
  order: number;         // position in grid
  config: object;       // widget-specific config
}

interface Bookmark {
  id: string;
  url: string;
  title: string;
  favicon?: string;     // Google Favicon URL
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;       // ISO datetime
  end: string;         // ISO datetime
  calendarId?: string; // CalDAV calendar ID
}

interface Settings {
  theme: 'dark' | 'light';
  masterPasswordHash: string;  // SHA-256 for verification
}

interface CalDAVCredentials {
  url: string;         // encrypted
  username: string;    // encrypted
  password: string;   // encrypted
}
```

## 5. UI/UX Design

### 5.1 Layout Structure

- **Tabs:** Fixed at top, horizontal scroll if >10 workspaces
- **Grid:** 3 fixed columns, dynamic height per widget
- **Widget:** Header (title, edit, delete) + content area

### 5.2 Visual Design

**Colors (Dark Theme):**
- Background: #1a1a2e
- Surface: #16213e
- Primary: #0f3460
- Accent: #e94560
- Text: #eaeaea

**Colors (Light Theme):**
- Background: #f5f5f5
- Surface: #ffffff
- Primary: #0f3460
- Accent: #e94560
- Text: #1a1a2e

### 5.3 Widget Specifications

#### Bookmarks Widget
- Flat list (no folders)
- Row: `[favicon]` `[title (editable)]` `[✏️ edit]` `[X delete]`
- Favicon: `https://www.google.com/s2/favicons?domain={hostname}&sz=32`
- Title: User editable via pencil icon
- URL: User inputs, validates format

#### Notes Widget
- Simple textarea
- Autosave on change (debounce 500ms)

#### DateTime Widget
- Large date display
- Real-time clock (update every second)
- Format: DD.MM.YYYY HH:MM:SS

#### Weather Widget
- OpenWeather API integration
- User provides API key in widget config
- Placeholder state: "Enter API key to enable"
- Shows: temperature, description, icon

#### Calendar Widget
- Month grid view
- Click date → add event modal
- Event visualization: colored bars in date cell
- Event list: below grid, shows events for selected date
- Edit event: click in list → edit modal
- CalDAV sync: configure in settings, sync in background

## 6. Security

### 6.1 Master Password & Encryption

1. User sets master password (first time or in settings)
2. Password never stored — SHA-256 hash stored for verification
3. Encryption key: derived via PBKDF2 (100k iterations, salt)
4. CalDAV credentials encrypted with AES-GCM (256-bit key)
5. Export with password: encrypt file with AES-GCM

### 6.2 Data Flow

```
User Input → PBKDF2(key) → AES-GCM Encrypt → storage.local
                                                    ↓
                              CalDAV Worker ← Decrypt (on demand)
```

## 7. Offline Behavior

- **Weather:** Show "No connection" error when offline
- **Calendar:** Continue working with local events, show "Last sync: X" status
- **All other widgets:** Fully functional offline

## 8. Export/Import

- **Format:** JSON
- **Import:** Full overwrite of existing data
- **Encryption:** Optional AES-GCM with user-provided password
- **No encryption:** Plain JSON

## 9. Acceptance Criteria

1. ✓ New tab opens instantly (<100ms perceived)
2. ✓ 10 workspaces max, create/delete works
3. ✓ 3-column grid, widgets sortable via DnD
4. ✓ All 5 widgets render and function
5. ✓ Dark/Light theme toggle works
6. ✓ Background customization (color/gradient/image)
7. ✓ CalDAV sync works (with encryption)
8. ✓ Export/Import with optional encryption
9. ✓ Storage <10MB limit (optimize images)
10. ✓ Works in Firefox and Chrome

## 10. Demo Workspace

Created on first install:
- Name: "Добро пожаловать"
- Widgets: DateTime, Bookmarks (2-3 examples), Weather (placeholder)

---

*Approved: 2026-05-15*
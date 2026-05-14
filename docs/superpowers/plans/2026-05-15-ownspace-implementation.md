# OwnSpace Browser Extension — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create fully functional browser extension replacing new tab page with customizable workspace widgets.

**Architecture:** Preact + Vanilla JS hybrid, Context API state, SortableJS for DnD, Web Worker for CalDAV sync.

**Tech Stack:** Preact, SortableJS, Web Crypto API, CSS-in-JS, webextension-polyfill.

---

## Task 1: Scaffold Project Structure

**Files:**
- Create: `manifest.json`
- Create: `newtab.html`
- Create: `src/index.jsx`
- Create: `src/App.jsx`
- Create: `src/utils/constants.js`
- Create: `lib/sortable.min.js` (download)

- [ ] **Step 1: Create manifest.json (MV3)**

```json
{
  "manifest_version": 3,
  "name": "OwnSpace",
  "version": "1.0.0",
  "description": "Local start page replacement with customizable widgets",
  "permissions": ["storage"],
  "host_permissions": ["<all_urls>"],
  "chrome_settings_overrides": {
    "newtab_page": "newtab.html"
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "ownspace@extension.local",
      "strict_min_version": "109.0"
    }
  },
  "background": {
    "service_worker": "background/sync-worker.js"
  },
  "action": {
    "default_title": "OwnSpace"
  }
}
```

- [ ] **Step 2: Create newtab.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OwnSpace</title>
  <link rel="stylesheet" href="src/styles/main.css">
</head>
<body>
  <div id="app"></div>
  <script src="src/index.jsx" type="module"></script>
</body>
</html>
```

- [ ] **Step 3: Create src/utils/constants.js**

```javascript
export const WIDGET_TYPES = {
  BOOKMARKS: 'bookmarks',
  NOTES: 'notes',
  DATE: 'date',
  WEATHER: 'weather',
  CALENDAR: 'calendar'
};

export const DEFAULT_WORKSPACE = {
  id: crypto.randomUUID(),
  name: 'Добро пожаловать',
  background: { type: 'color', value: '#1a1a2e' },
  widgets: []
};

export const THEME = {
  dark: {
    background: '#1a1a2e',
    surface: '#16213e',
    primary: '#0f3460',
    accent: '#e94560',
    text: '#eaeaea'
  },
  light: {
    background: '#f5f5f5',
    surface: '#ffffff',
    primary: '#0f3460',
    accent: '#e94560',
    text: '#1a1a2e'
  }
};
```

- [ ] **Step 4: Download SortableJS**

Download minified version to lib/sortable.min.js

- [ ] **Step 5: Commit**

```bash
git add manifest.json newtab.html src/ lib/
git commit -m "feat: scaffold project structure"
```

---

## Task 2: Implement Storage Utilities

**Files:**
- Create: `src/utils/storage.js`
- Create: `src/utils/crypto.js`

- [ ] **Step 1: Create src/utils/storage.js**

```javascript
import { DEFAULT_WORKSPACE, THEME } from './constants.js';

const STORAGE_KEYS = {
  WORKSPACES: 'workspaces',
  SETTINGS: 'settings',
  CALDAV: 'caldav'
};

export async function getWorkspaces() {
  const result = await browser.storage.local.get(STORAGE_KEYS.WORKSPACES);
  return result[STORAGE_KEYS.WORKSPACES] || [DEFAULT_WORKSPACE];
}

export async function saveWorkspaces(workspaces) {
  await browser.storage.local.set({ [STORAGE_KEYS.WORKSPACES]: workspaces });
}

export async function getSettings() {
  const result = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
  return result[STORAGE_KEYS.SETTINGS] || { theme: 'dark', masterPasswordHash: '' };
}

export async function saveSettings(settings) {
  await browser.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

export async function getCalDAVCredentials() {
  const result = await browser.storage.local.get(STORAGE_KEYS.CALDAV);
  return result[STORAGE_KEYS.CALDAV] || null;
}

export async function saveCalDAVCredentials(creds) {
  await browser.storage.local.set({ [STORAGE_KEYS.CALDAV]: creds });
}

export async function exportData(encrypted = false, password = null) {
  const workspaces = await getWorkspaces();
  const settings = await getSettings();
  const caldav = await getCalDAVCredentials();

  const data = { workspaces, settings: { theme: settings.theme }, caldav };

  if (encrypted && password) {
    const encoder = new TextEncoder();
    const dataStr = JSON.stringify(data);
    const key = await deriveKey(password);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(dataStr)
    );
    return JSON.stringify({
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encryptedData)),
      encrypted: true
    });
  }

  return JSON.stringify(data, null, 2);
}

export async function importData(jsonString, password = null) {
  let data;

  try {
    const parsed = JSON.parse(jsonString);
    if (parsed.encrypted && password) {
      const key = await deriveKey(password);
      const iv = new Uint8Array(parsed.iv);
      const encryptedData = new Uint8Array(parsed.data);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encryptedData
      );
      const decoder = new TextDecoder();
      data = JSON.parse(decoder.decode(decrypted));
    } else {
      data = parsed;
    }
  } catch (e) {
    throw new Error('Invalid import data');
  }

  if (data.workspaces) {
    await saveWorkspaces(data.workspaces);
  }
  if (data.settings) {
    await saveSettings({ ...await getSettings(), ...data.settings });
  }
  if (data.caldav) {
    await saveCalDAVCredentials(data.caldav);
  }
}

async function deriveKey(password) {
  const encoder = new TextEncoder();
  const salt = encoder.encode('ownspace-salt-v1');
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
```

- [ ] **Step 2: Create src/utils/crypto.js**

```javascript
export async function encrypt(data, password) {
  const encoder = new TextEncoder();
  const key = await deriveKey(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(data))
  );

  return {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted))
  };
}

export async function decrypt(encryptedObj, password) {
  const decoder = new TextDecoder();
  const key = await deriveKey(password);
  const iv = new Uint8Array(encryptedObj.iv);
  const data = new Uint8Array(encryptedObj.data);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return JSON.parse(decoder.decode(decrypted));
}

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function deriveKey(password) {
  const encoder = new TextEncoder();
  const salt = encoder.encode('ownspace-encryption-v1');
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/storage.js src/utils/crypto.js
git commit -m "feat: add storage and crypto utilities"
```

---

## Task 3: Implement Preact App with Context API

**Files:**
- Create: `src/index.jsx`
- Create: `src/App.jsx`
- Create: `src/contexts/WorkspaceContext.jsx`
- Create: `src/contexts/ThemeContext.jsx`
- Create: `src/styles/main.css`

- [ ] **Step 1: Create src/index.jsx**

```javascript
import { render } from 'preact';
import { App } from './App.jsx';

render(<App />, document.getElementById('app'));
```

- [ ] **Step 2: Create src/contexts/WorkspaceContext.jsx**

```javascript
import { createContext } from 'preact';
import { useContext, useState, useEffect } from 'preact/hooks';
import { getWorkspaces, saveWorkspaces } from '../utils/storage.js';

const WorkspaceContext = createContext();

export function WorkspaceProvider({ children }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  async function loadWorkspaces() {
    const ws = await getWorkspaces();
    setWorkspaces(ws);
    if (ws.length > 0 && !activeWorkspaceId) {
      setActiveWorkspaceId(ws[0].id);
    }
    setLoading(false);
  }

  async function addWorkspace() {
    if (workspaces.length >= 10) return;
    const newWs = {
      id: crypto.randomUUID(),
      name: 'Новое пространство',
      background: { type: 'color', value: '#1a1a2e' },
      widgets: []
    };
    const updated = [...workspaces, newWs];
    await saveWorkspaces(updated);
    setWorkspaces(updated);
    setActiveWorkspaceId(newWs.id);
  }

  async function updateWorkspace(id, updates) {
    const updated = workspaces.map(ws => ws.id === id ? { ...ws, ...updates } : ws);
    await saveWorkspaces(updated);
    setWorkspaces(updated);
  }

  async function deleteWorkspace(id) {
    if (workspaces.length <= 1) return;
    const updated = workspaces.filter(ws => ws.id !== id);
    await saveWorkspaces(updated);
    setWorkspaces(updated);
    if (activeWorkspaceId === id) {
      setActiveWorkspaceId(updated[0].?.id);
    }
  }

  const activeWorkspace = workspaces.find(ws => ws.id === activeWorkspaceId);

  return (
    <WorkspaceContext.Provider value={{
      workspaces,
      activeWorkspace,
      activeWorkspaceId,
      setActiveWorkspaceId,
      addWorkspace,
      updateWorkspace,
      deleteWorkspace,
      loading
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
```

- [ ] **Step 3: Create src/contexts/ThemeContext.jsx**

```javascript
import { createContext } from 'preact';
import { useContext, useState, useEffect } from 'preact/hooks';
import { getSettings, saveSettings } from '../utils/storage.js';
import { THEME } from '../utils/constants.js';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('dark');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTheme();
  }, []);

  async function loadTheme() {
    const settings = await getSettings();
    setTheme(settings.theme || 'dark');
    applyTheme(settings.theme || 'dark');
    setLoading(false);
  }

  function applyTheme(themeName) {
    const colors = THEME[themeName];
    document.documentElement.style.setProperty('--bg', colors.background);
    document.documentElement.style.setProperty('--surface', colors.surface);
    document.documentElement.style.setProperty('--primary', colors.primary);
    document.documentElement.style.setProperty('--accent', colors.accent);
    document.documentElement.style.setProperty('--text', colors.text);
  }

  async function toggleTheme() {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    applyTheme(newTheme);
    const settings = await getSettings();
    await saveSettings({ ...settings, theme: newTheme });
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, loading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

- [ ] **Step 4: Create src/styles/main.css**

```css
:root {
  --bg: #1a1a2e;
  --surface: #16213e;
  --primary: #0f3460;
  --accent: #e94560;
  --text: #eaeaea;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}

.tabs {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--primary);
  overflow-x: auto;
}

.tab {
  padding: 8px 16px;
  background: transparent;
  border: none;
  color: var(--text);
  cursor: pointer;
  border-radius: 4px;
  white-space: nowrap;
}

.tab.active {
  background: var(--primary);
}

.tab-add {
  background: var(--accent);
  font-weight: bold;
}

.workspace {
  padding: 20px;
  min-height: calc(100vh - 60px);
}

.widget-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
}

.widget {
  background: var(--surface);
  border-radius: 8px;
  padding: 16px;
  min-height: 200px;
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--primary);
}

.widget-title {
  font-weight: 600;
}

.widget-actions button {
  background: transparent;
  border: none;
  color: var(--text);
  cursor: pointer;
  padding: 4px 8px;
  opacity: 0.6;
}

.widget-actions button:hover {
  opacity: 1;
}

.add-widget-btn {
  display: block;
  margin: 40px auto;
  padding: 16px 32px;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
}
```

- [ ] **Step 5: Create src/App.jsx**

```javascript
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext.jsx';
import { ThemeProvider, useTheme } from './contexts/ThemeContext.jsx';
import { WorkspaceTabs } from './components/WorkspaceTabs.jsx';
import { WidgetGrid } from './components/WidgetGrid.jsx';

export function App() {
  return (
    <ThemeProvider>
      <WorkspaceProvider>
        <Main />
      </WorkspaceProvider>
    </ThemeProvider>
  );
}

function Main() {
  const { loading: themeLoading } = useTheme();
  const { loading: workspaceLoading } = useWorkspace();

  if (themeLoading || workspaceLoading) {
    return <div>Loading...</div>;
  }

  return (
    <>
      <WorkspaceTabs />
      <WidgetGrid />
    </>
  );
}
```

- [ ] **Step 6: Create src/components/WorkspaceTabs.jsx**

```javascript
import { useWorkspace } from '../contexts/WorkspaceContext.jsx';

export function WorkspaceTabs() {
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId, addWorkspace, updateWorkspace, deleteWorkspace } = useWorkspace();

  function handleAdd() {
    if (workspaces.length < 10) {
      addWorkspace();
    }
  }

  function handleDoubleClick(ws, e) {
    const newName = prompt('Переименовать workspace:', ws.name);
    if (newName && newName.trim()) {
      updateWorkspace(ws.id, { name: newName.trim() });
    }
  }

  function handleContextMenu(ws, e) {
    e.preventDefault();
    if (workspaces.length > 1 && confirm(`Удалить "${ws.name}"?`)) {
      deleteWorkspace(ws.id);
    }
  }

  return (
    <div class="tabs">
      {workspaces.map(ws => (
        <button
          key={ws.id}
          class={`tab ${ws.id === activeWorkspaceId ? 'active' : ''}`}
          onClick={() => setActiveWorkspaceId(ws.id)}
          onDblClick={(e) => handleDoubleClick(ws, e)}
          onContextMenu={(e) => handleContextMenu(ws, e)}
        >
          {ws.name}
        </button>
      ))}
      {workspaces.length < 10 && (
        <button class="tab tab-add" onClick={handleAdd}>+</button>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Create src/components/WidgetGrid.jsx**

```javascript
import { useState } from 'preact/hooks';
import { useWorkspace } from '../contexts/WorkspaceContext.jsx';
import { Widget } from './Widget.jsx';
import { AddWidgetMenu } from './AddWidgetMenu.jsx';
import { WIDGET_TYPES } from '../utils/constants.js';

export function WidgetGrid() {
  const { activeWorkspace, updateWorkspace } = useWorkspace();
  const [showAddMenu, setShowAddMenu] = useState(false);

  if (!activeWorkspace) return null;

  const { widgets, background } = activeWorkspace;

  const gridStyle = {
    background: background.type === 'color' ? background.value :
               background.type === 'gradient' ? background.value :
               background.type === 'image' ? `url(${background.value})` : background.value,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  };

  function addWidget(type) {
    const newWidget = {
      id: crypto.randomUUID(),
      type,
      order: widgets.length,
      config: type === WIDGET_TYPES.WEATHER ? { apiKey: '' } :
              type === WIDGET_TYPES.BOOKMARKS ? { bookmarks: [] } :
              type === WIDGET_TYPES.CALENDAR ? { events: [] } : {}
    };
    updateWorkspace(activeWorkspace.id, {
      widgets: [...widgets, newWidget]
    });
    setShowAddMenu(false);
  }

  function removeWidget(widgetId) {
    updateWorkspace(activeWorkspace.id, {
      widgets: widgets.filter(w => w.id !== widgetId)
    });
  }

  function updateWidgetConfig(widgetId, config) {
    updateWorkspace(activeWorkspace.id, {
      widgets: widgets.map(w => w.id === widgetId ? { ...w, config } : w)
    });
  }

  if (widgets.length === 0) {
    return (
      <div class="workspace" style={gridStyle}>
        <button class="add-widget-btn" onClick={() => setShowAddMenu(true)}>
          + Добавить виджет
        </button>
        {showAddMenu && <AddWidgetMenu onSelect={addWidget} onClose={() => setShowAddMenu(false)} />}
      </div>
    );
  }

  return (
    <div class="workspace" style={gridStyle}>
      <div class="widget-grid">
        {widgets.map(widget => (
          <Widget
            key={widget.id}
            widget={widget}
            onRemove={() => removeWidget(widget.id)}
            onUpdateConfig={(config) => updateWidgetConfig(widget.id, config)}
          />
        ))}
      </div>
      <button class="add-widget-btn" onClick={() => setShowAddMenu(true)}>
        + Добавить виджет
      </button>
      {showAddMenu && <AddWidgetMenu onSelect={addWidget} onClose={() => setShowAddMenu(false)} />}
    </div>
  );
}
```

- [ ] **Step 8: Create src/components/Widget.jsx**

```javascript
import { useState } from 'preact/hooks';
import { WIDGET_TYPES } from '../utils/constants.js';
import { Bookmarks } from '../widgets/Bookmarks.jsx';
import { Notes } from '../widgets/Notes.jsx';
import { DateTime } from '../widgets/DateTime.jsx';
import { Weather } from '../widgets/Weather.jsx';
import { Calendar } from '../widgets/Calendar.jsx';

export function Widget({ widget, onRemove, onUpdateConfig }) {
  const [title, setTitle] = useState(widget.config.title || getDefaultTitle(widget.type));
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  function getDefaultTitle(type) {
    switch (type) {
      case WIDGET_TYPES.BOOKMARKS: return 'Закладки';
      case WIDGET_TYPES.NOTES: return 'Заметки';
      case WIDGET_TYPES.DATE: return 'Дата и время';
      case WIDGET_TYPES.WEATHER: return 'Погода';
      case WIDGET_TYPES.CALENDAR: return 'Календарь';
      default: return 'Widget';
    }
  }

  function saveTitle() {
    onUpdateConfig({ ...widget.config, title });
    setIsEditingTitle(false);
  }

  const renderWidget = () => {
    switch (widget.type) {
      case WIDGET_TYPES.BOOKMARKS:
        return <Bookmarks config={widget.config} onUpdate={onUpdateConfig} />;
      case WIDGET_TYPES.NOTES:
        return <Notes config={widget.config} onUpdate={onUpdateConfig} />;
      case WIDGET_TYPES.DATE:
        return <DateTime />;
      case WIDGET_TYPES.WEATHER:
        return <Weather config={widget.config} onUpdate={onUpdateConfig} />;
      case WIDGET_TYPES.CALENDAR:
        return <Calendar config={widget.config} onUpdate={onUpdateConfig} />;
      default:
        return <div>Unknown widget</div>;
    }
  };

  return (
    <div class="widget">
      <div class="widget-header">
        {isEditingTitle ? (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
            autoFocus
            class="widget-title-input"
          />
        ) : (
          <span class="widget-title">{title}</span>
        )}
        <div class="widget-actions">
          <button onClick={() => setIsEditingTitle(true)} title="Переименовать">✏️</button>
          <button onClick={onRemove} title="Удалить">X</button>
        </div>
      </div>
      {renderWidget()}
    </div>
  );
}
```

- [ ] **Step 9: Create src/components/AddWidgetMenu.jsx**

```javascript
import { WIDGET_TYPES } from '../utils/constants.js';

const WIDGET_OPTIONS = [
  { type: WIDGET_TYPES.BOOKMARKS, label: 'Закладки' },
  { type: WIDGET_TYPES.NOTES, label: 'Заметки' },
  { type: WIDGET_TYPES.DATE, label: 'Дата и время' },
  { type: WIDGET_TYPES.WEATHER, label: 'Погода' },
  { type: WIDGET_TYPES.CALENDAR, label: 'Календарь' }
];

export function AddWidgetMenu({ onSelect, onClose }) {
  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Добавить виджет</h3>
        <div class="widget-options">
          {WIDGET_OPTIONS.map(opt => (
            <button key={opt.type} onClick={() => onSelect(opt.type)}>
              {opt.label}
            </button>
          ))}
        </div>
        <button class="modal-close" onClick={onClose}>Отмена</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Commit**

```bash
git add src/
git commit -m "feat: implement Preact app with Context API"
```

---

## Task 4: Implement All Widgets

**Files:**
- Create: `src/widgets/Bookmarks.jsx`
- Create: `src/widgets/Notes.jsx`
- Create: `src/widgets/DateTime.jsx`
- Create: `src/widgets/Weather.jsx`
- Create: `src/widgets/Calendar.jsx`

- [ ] **Step 1: Create src/widgets/Bookmarks.jsx**

```javascript
import { useState } from 'preact/hooks';

export function Bookmarks({ config, onUpdate }) {
  const [bookmarks, setBookmarks] = useState(config.bookmarks || []);
  const [newUrl, setNewUrl] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  function getFavicon(url) {
    try {
      const hostname = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
    } catch {
      return '';
    }
  }

  function addBookmark() {
    if (!newUrl.trim()) return;

    let url = newUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    try {
      new URL(url);
    } catch {
      alert('Неверный URL');
      return;
    }

    const newBookmark = {
      id: crypto.randomUUID(),
      url,
      title: 'Новая закладка',
      favicon: getFavicon(url)
    };

    const updated = [...bookmarks, newBookmark];
    setBookmarks(updated);
    onUpdate({ ...config, bookmarks: updated });
    setNewUrl('');
  }

  function removeBookmark(id) {
    const updated = bookmarks.filter(b => b.id !== id);
    setBookmarks(updated);
    onUpdate({ ...config, bookmarks: updated });
  }

  function startEdit(bm) {
    setEditingId(bm.id);
    setEditTitle(bm.title);
  }

  function saveEdit(id) {
    const updated = bookmarks.map(b => b.id === id ? { ...b, title: editTitle } : b);
    setBookmarks(updated);
    onUpdate({ ...config, bookmarks: updated });
    setEditingId(null);
  }

  return (
    <div class="bookmarks-widget">
      <div class="add-bookmark">
        <input
          type="text"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="Введите URL..."
          onKeyDown={(e) => e.key === 'Enter' && addBookmark()}
        />
        <button onClick={addBookmark}>+</button>
      </div>
      <div class="bookmarks-list">
        {bookmarks.map(bm => (
          <div key={bm.id} class="bookmark-item">
            {bm.favicon && <img src={bm.favicon} class="favicon" alt="" />}
            {editingId === bm.id ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={() => saveEdit(bm.id)}
                onKeyDown={(e) => e.key === 'Enter' && saveEdit(bm.id)}
                autoFocus
                class="title-input"
              />
            ) : (
              <a href={bm.url} target="_blank" class="bookmark-title">{bm.title}</a>
            )}
            <button class="edit-btn" onClick={() => startEdit(bm)}>✏️</button>
            <button class="delete-btn" onClick={() => removeBookmark(bm.id)}>X</button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create src/widgets/Notes.jsx**

```javascript
import { useState, useEffect } from 'preact/hooks';

export function Notes({ config, onUpdate }) {
  const [content, setContent] = useState(config.content || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (content !== config.content) {
        setSaving(true);
        onUpdate({ ...config, content });
        setTimeout(() => setSaving(false), 500);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [content]);

  return (
    <div class="notes-widget">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Введите заметку..."
      />
      {saving && <span class="save-indicator">Сохранено</span>}
    </div>
  );
}
```

- [ ] **Step 3: Create src/widgets/DateTime.jsx**

```javascript
import { useState, useEffect } from 'preact/hooks';

export function DateTime() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const day = time.getDate().toString().padStart(2, '0');
  const month = (time.getMonth() + 1).toString().padStart(2, '0');
  const year = time.getFullYear();
  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');

  return (
    <div class="datetime-widget">
      <div class="date">{day}.{month}.{year}</div>
      <div class="time">{hours}:{minutes}:{seconds}</div>
    </div>
  );
}
```

- [ ] **Step 4: Create src/widgets/Weather.jsx**

```javascript
import { useState, useEffect } from 'preact/hooks';

export function Weather({ config, onUpdate }) {
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showApiInput, setShowApiInput] = useState(!config.apiKey);

  async function fetchWeather() {
    if (!config.apiKey) {
      setShowApiInput(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Default to Moscow, could be made configurable
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=Moscow&appid=${config.apiKey}&units=metric&lang=ru`
      );

      if (!response.ok) {
        throw new Error('Invalid API key');
      }

      const data = await response.json();
      setWeather(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function saveApiKey(key) {
    onUpdate({ ...config, apiKey: key.trim() });
    setShowApiInput(false);
  }

  useEffect(() => {
    if (config.apiKey) {
      fetchWeather();
    }
  }, []);

  if (showApiInput) {
    return (
      <div class="weather-widget">
        <p>Введите API ключ OpenWeather:</p>
        <input
          type="text"
          placeholder="API ключ"
          onKeyDown={(e) => e.key === 'Enter' && saveApiKey(e.target.value)}
        />
        <a href="https://openweathermaq.org/api" target="_blank">Получить ключ</a>
      </div>
    );
  }

  if (loading) {
    return <div class="weather-widget">Загрузка...</div>;
  }

  if (error) {
    return (
      <div class="weather-widget">
        <p>Ошибка: {error}</p>
        <button onClick={() => setShowApiInput(true)}>Изменить ключ</button>
      </div>
    );
  }

  if (!weather) {
    return (
      <div class="weather-widget">
        <button onClick={fetchWeather}>Показать погоду</button>
      </div>
    );
  }

  return (
    <div class="weather-widget">
      <div class="temp">{Math.round(weather.main.temp)}°C</div>
      <div class="desc">{weather.weather[0].description}</div>
      <div class="location">{weather.name}</div>
    </div>
  );
}
```

- [ ] **Step 5: Create src/widgets/Calendar.jsx**

```javascript
import { useState, useEffect } from 'preact/hooks';

export function Calendar({ config, onUpdate }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [events, setEvents] = useState(config.events || []);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventForm, setEventForm] = useState({ title: '', start: '', end: '' });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthName = currentDate.toLocaleString('ru', { month: 'long' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  function getEventsForDay(day) {
    if (!day) return [];
    const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    return events.filter(e => e.start.startsWith(dateStr));
  }

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }

  function handleDayClick(day) {
    if (!day) return;
    const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    setSelectedDate(dateStr);
  }

  function addEvent() {
    const newEvent = {
      id: crypto.randomUUID(),
      title: eventForm.title,
      start: eventForm.start,
      end: eventForm.end
    };
    const updated = [...events, newEvent];
    setEvents(updated);
    onUpdate({ ...config, events: updated });
    setShowEventForm(false);
    setEventForm({ title: '', start: '', end: '' });
  }

  function updateEvent() {
    const updated = events.map(e =>
      e.id === editingEvent.id
        ? { ...e, title: eventForm.title, start: eventForm.start, end: eventForm.end }
        : e
    );
    setEvents(updated);
    onUpdate({ ...config, events: updated });
    setEditingEvent(null);
    setShowEventForm(false);
    setEventForm({ title: '', start: '', end: '' });
  }

  function deleteEvent(id) {
    const updated = events.filter(e => e.id !== id);
    setEvents(updated);
    onUpdate({ ...config, events: updated });
  }

  function openEventForm(dateStr) {
    setSelectedDate(dateStr);
    setEventForm({
      title: '',
      start: `${dateStr}T09:00`,
      end: `${dateStr}T10:00`
    });
    setShowEventForm(true);
  }

  function openEditForm(event) {
    setEditingEvent(event);
    setEventForm({ title: event.title, start: event.start, end: event.end });
    setShowEventForm(true);
  }

  const selectedEvents = selectedDate
    ? events.filter(e => e.start.startsWith(selectedDate))
    : [];

  return (
    <div class="calendar-widget">
      <div class="calendar-nav">
        <button onClick={prevMonth}>&lt;</button>
        <span>{monthName} {year}</span>
        <button onClick={nextMonth}>&gt;</button>
      </div>
      <div class="calendar-grid">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
          <div key={d} class="calendar-header">{d}</div>
        ))}
        {days.map((day, i) => (
          <div
            key={i}
            class={`calendar-day ${day ? '' : 'empty'} ${selectedDate === `${year}-${(month + 1).toString().padStart(2, '0')}-${day?.toString().padStart(2, '0')}` ? 'selected' : ''}`}
            onClick={() => day && handleDayClick(day)}
          >
            {day}
            {day && getEventsForDay(day).length > 0 && (
              <div class="event-bars">
                {getEventsForDay(day).slice(0, 3).map((e, i) => (
                  <div key={i} class="event-bar" style={{ background: '#e94560' }} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <button class="add-event-btn" onClick={() => openEventForm(selectedDate || `${year}-${(month + 1).toString().padStart(2, '0')}-01`)}>
        + Добавить событие
      </button>
      {selectedDate && (
        <div class="events-list">
          <h4>События на {selectedDate}</h4>
          {selectedEvents.length === 0 ? <p>Нет событий</p> : (
            <ul>
              {selectedEvents.map(e => (
                <li key={e.id}>
                  <span>{e.title} ({e.start.split('T')[1]?.slice(0, 5)} - {e.end.split('T')[1]?.slice(0, 5)})</span>
                  <button onClick={() => openEditForm(e)}>✏️</button>
                  <button onClick={() => deleteEvent(e.id)}>X</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {showEventForm && (
        <div class="modal-overlay" onClick={() => setShowEventForm(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingEvent ? 'Редактировать' : 'Добавить'} событие</h3>
            <input
              type="text"
              placeholder="Название"
              value={eventForm.title}
              onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
            />
            <label>Начало:</label>
            <input
              type="datetime-local"
              value={eventForm.start}
              onChange={(e) => setEventForm({ ...eventForm, start: e.target.value })}
            />
            <label>Конец:</label>
            <input
              type="datetime-local"
              value={eventForm.end}
              onChange={(e) => setEventForm({ ...eventForm, end: e.target.value })}
            />
            <button onClick={editingEvent ? updateEvent : addEvent}>
              {editingEvent ? 'Сохранить' : 'Добавить'}
            </button>
            <button onClick={() => setShowEventForm(false)}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/widgets/
git commit -m "feat: implement all 5 widgets"
```

---

## Task 5: Implement Background Customization

**Files:**
- Modify: `src/components/WidgetGrid.jsx` (add background settings)

- [ ] **Step 1: Add background picker to workspace**

Add background settings in workspace context or as separate component

- [ ] **Step 2: Implement color picker**

Use `<input type="color">` for solid colors

- [ ] **Step 3: Implement gradient input**

Accept CSS gradient string

- [ ] **Step 4: Implement image upload with compression**

Use Canvas API to compress images > 500KB before storing

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat: add background customization"
```

---

## Task 6: Implement Export/Import

**Files:**
- Create: `src/components/ExportImport.jsx`

- [ ] **Step 1: Create export function**

Use storage.js exportData function

- [ ] **Step 2: Create import function**

Use storage.js importData function

- [ ] **Step 3: Add UI for export/import**

Buttons in settings area

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: add export/import functionality"
```

---

## Task 7: Implement CalDAV Sync (Web Worker)

**Files:**
- Create: `background/sync-worker.js`

- [ ] **Step 1: Create Web Worker**

Handle CalDAV sync requests

- [ ] **Step 2: Implement CalDAV client**

Basic CalDAV operations (PROPFIND, REPORT)

- [ ] **Step 3: Integrate with Calendar widget**

Sync local events with remote CalDAV server

- [ ] **Step 4: Commit**

```bash
git add background/
git commit -m "feat: add CalDAV sync worker"
```

---

## Task 8: Build and Test

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README with build instructions**

- [ ] **Step 2: Test in Firefox**

- [ ] **Step 3: Test in Chrome**

- [ ] **Step 4: Final commit**

```bash
git add README.md
git commit -m "docs: add README"
```

---

## Plan Complete

**Saved to:** `docs/superpowers/plans/2026-05-15-ownspace-implementation.md`

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch fresh subagent per task, review between tasks
2. **Inline Execution** — execute tasks in this session with checkpoints

Which approach?
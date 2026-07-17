// OwnSpace - Main Application (Vanilla JS)
// Inline utilities to avoid module issues

const STORAGE_KEYS = {
  WORKSPACES: 'workspaces',
  SETTINGS: 'settings',
  CALDAV: 'caldav',
  ACTIVE_WORKSPACE: 'activeWorkspaceId'
};

const WIDGET_TYPES = {
  BOOKMARKS: 'bookmarks',
  NOTES: 'notes',
  DATE: 'date',
  WEATHER: 'weather',
  CALENDAR: 'calendar',
  TODO: 'todo'
};

// Storage helpers with fallback for testing
const storage = {
  local: {
    getItem: async (key) => {
      if (typeof browser !== 'undefined' && browser.storage) {
        const result = await browser.storage.local.get(key);
        return result[key];
      } else {
        // Fallback to localStorage for testing with error handling
        const value = localStorage.getItem(key);
        if (!value) {
          return null;
        }
        try {
          return JSON.parse(value);
        } catch (e) {
          console.warn(`Failed to parse localStorage item ${key}:`, e);
          return null;
        }
      }
    },
    setItem: async (key, value) => {
      if (typeof browser !== 'undefined' && browser.storage) {
        await browser.storage.local.set({ [key]: value });
      } else {
        // Fallback to localStorage for testing
        localStorage.setItem(key, JSON.stringify(value));
      }
    },
    removeItem: async (key) => {
      if (typeof browser !== 'undefined' && browser.storage) {
        await browser.storage.local.remove(key);
      } else {
        // Fallback to localStorage for testing
        localStorage.removeItem(key);
      }
    }
  }
};

async function getWorkspaces() {
  const result = await storage.local.getItem(STORAGE_KEYS.WORKSPACES);
  if (Array.isArray(result)) return result;
  return [];
}

async function saveWorkspaces(workspaces) {
  await storage.local.setItem(STORAGE_KEYS.WORKSPACES, workspaces);
}

async function getSettings() {
  const result = await storage.local.getItem(STORAGE_KEYS.SETTINGS);
  return result || { theme: 'dark', masterPasswordHash: '' };
}

async function saveSettings(settings) {
  await storage.local.setItem(STORAGE_KEYS.SETTINGS, settings);
}

async function saveCalDAVCredentials(creds) {
  await storage.local.setItem(STORAGE_KEYS.CALDAV, creds);
}

async function getCalDAVCredentials() {
  const result = await storage.local.getItem(STORAGE_KEYS.CALDAV);
  return result || null;
}

async function saveActiveWorkspaceId(id) {
  await storage.local.setItem(STORAGE_KEYS.ACTIVE_WORKSPACE, id);
}

async function getActiveWorkspaceId() {
  const result = await storage.local.getItem(STORAGE_KEYS.ACTIVE_WORKSPACE);
  return result || null;
}

// Browser messaging for extension background page
const browserMessaging = {
  sendMessage: async (message) => {
    if (typeof browser !== 'undefined' && browser?.runtime?.sendMessage) {
      try {
        return await browser.runtime.sendMessage(message);
      } catch (e) {
        console.error('[MSG] sendMessage failed:', e.message);
      }
    } else {
      console.warn('[MSG] browser.runtime not available');
    }

    // Mock fallback for testing outside extension context
    if (message.type === 'test') {
      return { success: true, result: { events: [] } };
    }
    if (message.type === 'fetchTitle') {
      return { success: false, result: { title: null }, error: 'Not in extension context' };
    }
    if (message.type === 'sync') {
      return { success: true, result: { events: [] } };
    }
    return { success: true };
  }
};

// Export / Import
async function exportData(encrypted = false, password = null) {
  const workspaces = await getWorkspaces();
  const settings = await getSettings();
  const caldav = await getCalDAVCredentials();
  const data = { workspaces, settings: { theme: settings.theme }, caldav };

  if (encrypted && password) {
    const enc = await encryptJson(JSON.stringify(data), password);
    return JSON.stringify({ iv: enc.iv, data: enc.data, encrypted: true });
  }
  return JSON.stringify(data, null, 2);
}

async function importData(jsonString, password = null) {
  let data;
  try {
    const parsed = JSON.parse(jsonString);
    if (parsed.encrypted && password) {
      const dec = await decryptJson({ iv: parsed.iv, data: parsed.data }, password);
      data = JSON.parse(dec);
    } else {
      data = parsed;
    }
  } catch (e) {
    throw new Error('Invalid import data');
  }
  if (data.workspaces) await saveWorkspaces(data.workspaces);
  if (data.settings) await saveSettings({ ...await getSettings(), ...data.settings });
  if (data.caldav) await saveCalDAVCredentials(data.caldav);
}

// State
let state = {
  workspaces: [],
  activeWorkspaceId: null,
  theme: 'dark',
  loading: true
};

// Track expanded bookmark widgets (widgetId -> boolean)
const bookmarkExpanded = {};

// Track Sortable instances to avoid duplicates
const sortableInstances = {};

// Track widget column Sortable instances
const widgetSortableInstances = {};

function setColumnSortablesDisabled(disabled) {
  Object.values(widgetSortableInstances).forEach(instance => {
    instance.option('disabled', disabled);
  });
}

function setBookmarkSortablesDisabled(disabled) {
  Object.values(sortableInstances).forEach(instance => {
    instance.option('disabled', disabled);
  });
}

function persistBookmarkOrder(widgetId, list) {
  const workspace = getActiveWorkspace();
  const widget = workspace?.widgets.find(w => w.id === widgetId);
  if (!workspace || !widget || !list) return;

  const newOrder = [];
  list.querySelectorAll('.bookmark-item').forEach(item => {
    const bm = widget.config.bookmarks.find(b => b.id === item.dataset.bookmarkId);
    if (bm) newOrder.push(bm);
  });

  const workspaceIdx = state.workspaces.findIndex(ws => ws.id === workspace.id);
  if (workspaceIdx === -1) return;
  const updatedWidgets = [...state.workspaces[workspaceIdx].widgets];
  const wi = updatedWidgets.findIndex(w => w.id === widgetId);
  if (wi === -1) return;
  updatedWidgets[wi] = {
    ...updatedWidgets[wi],
    config: { ...updatedWidgets[wi].config, bookmarks: newOrder }
  };
  state.workspaces[workspaceIdx] = { ...state.workspaces[workspaceIdx], widgets: updatedWidgets };
  saveWorkspaces(state.workspaces);
}

function persistWidgetLayoutFromGrid(grid) {
  const workspace = getActiveWorkspace();
  if (!workspace || !grid) return;

  const domState = [];
  grid.querySelectorAll('.widget-column').forEach(columnEl => {
    const columnIndex = parseInt(columnEl.dataset.column, 10);
    columnEl.querySelectorAll('.widget').forEach((widgetEl, order) => {
      domState.push({
        id: widgetEl.dataset.widgetId,
        column: columnIndex,
        order
      });
    });
  });

  const updatedWidgets = workspace.widgets.map(w => {
    const domWidget = domState.find(dw => dw.id === w.id);
    return domWidget ? { ...w, column: domWidget.column, order: domWidget.order } : w;
  });

  const workspaceIdx = state.workspaces.findIndex(ws => ws.id === workspace.id);
  if (workspaceIdx === -1) return;
  state.workspaces[workspaceIdx] = { ...state.workspaces[workspaceIdx], widgets: updatedWidgets };
  saveWorkspaces(state.workspaces);
}

// Helper function to get the column with fewest widgets
function getTargetColumn(workspace) {
  const colCounts = [0, 0, 0, 0];
  workspace.widgets.forEach(w => {
    const col = w.column ?? 0;
    colCounts[col] = (colCounts[col] || 0) + 1;
  });
  return colCounts.indexOf(Math.min(...colCounts));
}

// Make state available globally for import scripts
window.state = state;

// ============================================
// BOOKMARK IMPORTER - INLINED (no dynamic scripts)
// ============================================

// Parse start.me HTML export
function parseStartMeHtml(html) {
  let bookmarks = [];
  let widgetGroups = [];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const widgetContainers = doc.querySelectorAll('.bookmark-widget');
    
    widgetContainers.forEach(widget => {
      const widgetTitleEl = widget.querySelector('.widget-header__text');
      const widgetTitle = widgetTitleEl ? widgetTitleEl.textContent.trim() : 'Импорт';
      
      const widgetBookmarksList = [];
      const bookmarkLinks = widget.querySelectorAll('a.bookmark-item__link');
      
      bookmarkLinks.forEach(link => {
        const url = link.getAttribute('href');
        if (url && !url.startsWith('#') && !url.startsWith('javascript:')) {
          const titleSpan = link.querySelector('.bookmark-item__title');
          let title = titleSpan ? titleSpan.textContent.trim() : '';
          if (!title) {
            const titleAttr = link.getAttribute('title') || '';
            title = titleAttr.split('\n')[0].trim();
          }
          
          // Extract hostname for favicon
          let hostname;
          try {
            hostname = new URL(url).hostname;
          } catch {
            hostname = '';
          }
          
          // Try to get favicon from Google Favicons API
          let favicon = null;
          if (hostname) {
            // Ensure HTTPS for Google Favicons API
            const safeUrl = url.replace(/^http:\/\//i, 'https://');
            favicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
          }
          
          widgetBookmarksList.push({
            id: crypto.randomUUID(),
            url: url,
            title: title || url,
            description: null,
            favicon: favicon
          });
          bookmarks.push(widgetBookmarksList[widgetBookmarksList.length - 1]);
        }
      });
      
      if (widgetBookmarksList.length > 0) {
        widgetGroups.push({ name: widgetTitle, bookmarks: widgetBookmarksList });
      }
    });
  } catch (e) {
    console.log('[Importer] DOMParser failed, using regex fallback');
  }
  
  // Fallback: if no widgets found, parse all links
  if (bookmarks.length === 0) {
    const linkRegex = /<a class="bookmark-item__link"[^>]*href="([^"]+)"[^>]*title="([^"]+)"[^>]*>/g;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      const titleAttr = match[2] || '';
      if (url && !url.startsWith('#') && !url.startsWith('javascript:')) {
        const title = titleAttr.split('\n')[0].trim();
        let hostname;
        try {
          hostname = new URL(url).hostname;
        } catch {
          hostname = '';
        }
        const favicon = hostname ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=32` : null;
        bookmarks.push({
          id: crypto.randomUUID(),
          url: url,
          title: title || url,
          description: null,
          favicon: favicon
        });
      }
    }
    if (bookmarks.length > 0) {
      widgetGroups.push({ name: 'Импорт закладок', bookmarks: bookmarks });
    }
  }
  
  return { bookmarks, widgetGroups };
}

// Show bookmark import modal
function showBookmarkImportModal() {
  console.log('[Importer] Showing bookmark import modal');
  
  const existing = document.getElementById('import-modal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.id = 'import-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal import-modal-content">
      <h3>Импорт закладок</h3>
      <p style="margin: 8px 0 16px; color: var(--text); opacity: 0.7;">
        Загрузите HTML файл, экспортированный из start.me
      </p>
      <input type="file" id="import-file-input" accept=".html,.htm" style="display: none;">
      <button id="select-file-btn" class="btn btn-primary" style="width: 100%; margin: 0;">
        📂 Выбрать HTML файл
      </button>
      <div id="import-preview" style="display: none; margin-top: 16px;">
        <h4>Найдено:</h4>
        <div id="import-stats"></div>
        <div id="import-widget-list" style="margin: 12px 0;"></div>
        <div id="import-error" style="color: var(--accent); margin: 8px 0; display: none;"></div>
        <div style="display: flex; gap: 8px; margin-top: 16px;">
          <button id="import-confirm-btn" class="btn btn-primary" style="flex: 1; margin: 0;">Импортировать</button>
          <button id="import-cancel-btn" class="modal-close" style="margin: 0;">Отмена</button>
        </div>
      </div>
      <button class="modal-close" style="width: 100%; margin-top: 12px;">Закрыть</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const fileInput = document.getElementById('import-file-input');
  const selectBtn = document.getElementById('select-file-btn');
  const confirmBtn = document.getElementById('import-confirm-btn');
  const cancelBtn = document.getElementById('import-cancel-btn');
  
  let currentImportData = null;
  
  selectBtn.addEventListener('click', () => fileInput.click());
  
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = parseStartMeHtml(evt.target.result);
      
      if (result.bookmarks.length === 0) {
        document.getElementById('import-error').textContent = 'Не удалось найти закладки в файле.';
        document.getElementById('import-error').style.display = 'block';
        return;
      }
      
      currentImportData = result;
      
      const preview = document.getElementById('import-preview');
      const stats = document.getElementById('import-stats');
      const widgetList = document.getElementById('import-widget-list');
      
      stats.innerHTML = `<strong>${result.bookmarks.length}</strong> закладок, <strong>${result.widgetGroups.length}</strong> виджет(ов)`;
      
      if (result.widgetGroups.length > 1) {
        widgetList.innerHTML = `<ul style="list-style: none; padding: 0; max-height: 150px; overflow-y: auto;">
          ${result.widgetGroups.map(wg => `<li style="padding: 4px 0; border-bottom: 1px solid var(--primary);">📁 ${wg.name} — ${wg.bookmarks.length} закладок</li>`).join('')}
        </ul>`;
      } else {
        widgetList.innerHTML = '';
      }
      
      preview.style.display = 'block';
    };
    reader.readAsText(file);
  });
  
  confirmBtn.addEventListener('click', () => {
    if (!currentImportData) return;
    
    const workspace = state.workspaces.find(ws => ws.id === state.activeWorkspaceId);
    if (!workspace) {
      document.getElementById('import-error').textContent = 'Не удалось найти активное пространство.';
      document.getElementById('import-error').style.display = 'block';
      return;
    }
    
    console.log('[Importer] Importing', currentImportData.bookmarks.length, 'bookmarks to', workspace.name);
    
    // Create widgets for each group with sequential column distribution
    const widgetsToAdd = [];
    // Count existing widgets per column (ensure we only count valid columns 0-3)
    const colCounts = [0, 0, 0, 0];
    workspace.widgets.forEach(w => {
      let col = parseInt(w.column ?? 0, 10);
      // Ensure col is a valid column index
      if (isNaN(col) || col < 0 || col >= 4) {
        col = 0;
      }
      colCounts[col] = (colCounts[col] || 0) + 1;
    });
    
    currentImportData.widgetGroups.forEach(wg => {
      // Find column with minimum current count
      const targetCol = colCounts.indexOf(Math.min(...colCounts));
      const newWidget = {
        id: crypto.randomUUID(),
        type: 'bookmarks',
        column: targetCol,
        order: colCounts[targetCol], // current count becomes order
        config: { title: wg.name || 'Импорт', bookmarks: wg.bookmarks }
      };
      widgetsToAdd.push(newWidget);
      console.log('[Importer] Created widget:', wg.name, 'for column', targetCol, 'order', colCounts[targetCol]);
      // Increment count for this column as if we added the widget
      colCounts[targetCol]++;
    });
    
    // Save and re-render
    (async () => {
      updateWorkspace(workspace.id, {
        widgets: [...workspace.widgets, ...widgetsToAdd]
      });
      modal.remove();
      showNotification(`Импортировано ${currentImportData.bookmarks.length} закладок`);
    })();
  });
  
  cancelBtn.addEventListener('click', () => modal.remove());
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

// ============================================
// END BOOKMARK IMPORTER
// ============================================

// Show notification
function showNotification(message) {
  const existing = document.querySelector('.import-notification');
  if (existing) existing.remove();
  
  const notification = document.createElement('div');
  notification.className = 'import-notification';
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: var(--accent);
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 2000;
    animation: fadeIn 0.3s ease;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Reusable custom modal — Firefox may permanently block native confirm()/prompt().
// Resolves to boolean (confirm) or string|null (prompt).
function showConfirm({ title, message, confirmText = 'OK', cancelText = 'Отмена', danger = false } = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-overlay';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-title" id="modal-title">${escapeHtml(title || 'Подтверждение')}</div>
        ${message ? `<div class="modal-message">${escapeHtml(message)}</div>` : ''}
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary modal-cancel">${escapeHtml(cancelText)}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} modal-ok">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const okBtn = backdrop.querySelector('.modal-ok');
    okBtn.focus();
    const close = (val) => { backdrop.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter' && document.activeElement !== backdrop.querySelector('.modal-cancel')) close(true);
    };
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(false); });
    backdrop.querySelector('.modal-cancel').addEventListener('click', () => close(false));
    okBtn.addEventListener('click', () => close(true));
    document.addEventListener('keydown', onKey);
  });
}

function showPrompt({ title, message, defaultValue = '', placeholder = '', confirmText = 'OK', cancelText = 'Отмена', inputType = 'text', required = false } = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-overlay';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-title" id="modal-title">${escapeHtml(title || 'Введите значение')}</div>
        ${message ? `<div class="modal-message">${escapeHtml(message)}</div>` : ''}
        <input type="${inputType}" class="modal-input" value="${escapeHtml(defaultValue)}" placeholder="${escapeHtml(placeholder)}" />
        <div class="modal-error" hidden></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary modal-cancel">${escapeHtml(cancelText)}</button>
          <button type="button" class="btn btn-primary modal-ok">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const input = backdrop.querySelector('.modal-input');
    const errorEl = backdrop.querySelector('.modal-error');
    input.focus();
    input.select();
    const close = (val) => { backdrop.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
    const submit = () => {
      const v = input.value;
      if (required && !v) {
        errorEl.textContent = 'Поле не может быть пустым';
        errorEl.hidden = false;
        input.focus();
        return;
      }
      close(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
      else if (e.key === 'Enter') submit();
    };
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
    backdrop.querySelector('.modal-cancel').addEventListener('click', () => close(null));
    backdrop.querySelector('.modal-ok').addEventListener('click', submit);
    document.addEventListener('keydown', onKey);
  });
}

// Sync state to window for import scripts
function syncStateToWindow() {
  window.state.workspaces = state.workspaces;
  window.state.activeWorkspaceId = state.activeWorkspaceId;
  window.state.theme = state.theme;
}

// Call this after loading workspaces to make them available to import scripts
window.syncImportState = syncStateToWindow;

// Sync imported state back to local app state
function syncStateFromWindow() {
  state.workspaces = window.state.workspaces || state.workspaces;
  state.activeWorkspaceId = window.state.activeWorkspaceId || state.activeWorkspaceId;
  state.theme = window.state.theme || state.theme;
}

// Expose save and render functions for import scripts
window.saveAndRender = async () => {
  // Sync window.state back to local state before saving
  syncStateFromWindow();
  await saveWorkspaces(state.workspaces);
  renderApp();
};

// Theme
function applyTheme(themeName) {
  document.documentElement.dataset.theme = themeName;
  document.documentElement.style.colorScheme = themeName === 'light' ? 'light' : 'dark';
}

async function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(state.theme);
  const settings = await getSettings();
  await saveSettings({ ...settings, theme: state.theme });
  renderWorkspaceTabs();
}

// Workspace Management
async function loadWorkspaces() {
  let ws = await getWorkspaces();

  // First-run: create a single default workspace and persist it
  if (!Array.isArray(ws) || ws.length === 0) {
    ws = [{
      id: crypto.randomUUID(),
      name: 'Добро пожаловать',
      background: { type: 'color', value: '#1a1a2e' },
      widgets: []
    }];
    await saveWorkspaces(ws);
  }

  // Deduplicate by id (defensive against historical storage corruption)
  const seen = new Set();
  const unique = [];
  for (const workspace of ws) {
    if (!workspace || !workspace.id || seen.has(workspace.id)) continue;
    seen.add(workspace.id);
    unique.push(workspace);
  }
  if (unique.length !== ws.length) {
    ws = unique;
    await saveWorkspaces(ws);
  }

  // Normalize: ensure all fields exist; do NOT rename nameless workspaces to "Добро пожаловать"
  let changed = false;
  let namelessCount = 0;
  ws.forEach(workspace => {
    if (!workspace.widgets) { workspace.widgets = []; changed = true; }
    if (!workspace.background) {
      workspace.background = { type: 'color', value: '#1a1a2e' };
      changed = true;
    }
    if (!workspace.name) {
      namelessCount++;
      workspace.name = `Без названия ${namelessCount > 1 ? namelessCount : ''}`.trim();
      changed = true;
    }
    workspace.widgets.forEach((w, idx) => {
      if (w.column === undefined || w.column === null) { w.column = 0; changed = true; }
      if (w.order === undefined || w.order === null) { w.order = idx; changed = true; }
      if (w.pinned === undefined) { w.pinned = false; changed = true; }
    });
  });

  // Migrate calendar events: {day, month, year, time} → {date: 'YYYY-MM-DD', time?: 'HH:MM'}
  for (const workspace of ws) {
    for (const widget of workspace.widgets || []) {
      if (widget.type !== WIDGET_TYPES.CALENDAR) continue;
      const events = widget.config?.events || [];
      const migrated = events.map(e => migrateEvent(e)).filter(Boolean);
      const sameLen = migrated.length === events.length;
      const sameShape = events.every((e, i) =>
        e === migrated[i] || (e.date === migrated[i].date && (e.time || null) === (migrated[i].time || null))
      );
      if (!sameLen || !sameShape) {
        widget.config = { ...(widget.config || {}), events: migrated };
        changed = true;
      }
    }
  }

  // Migrate weather widgets: ensure city field exists (older saves predate this)
  for (const workspace of ws) {
    for (const widget of workspace.widgets || []) {
      if (widget.type !== WIDGET_TYPES.WEATHER) continue;
      if (!widget.config) widget.config = {};
      if (!widget.config.city) { widget.config.city = 'Moscow'; changed = true; }
      // Normalize env-style paste mistake ("NAME=value" -> "value")
      if (typeof widget.config.apiKey === 'string') {
        const m = widget.config.apiKey.match(/^[A-Za-z_][A-Za-z0-9_-]*=(.+)$/);
        if (m) { widget.config.apiKey = m[1].trim(); changed = true; }
      }
    }
  }

  if (changed) await saveWorkspaces(ws);

  state.workspaces = ws;
  const savedActiveId = await getActiveWorkspaceId();
  if (savedActiveId && ws.some(ws => ws.id === savedActiveId)) {
    state.activeWorkspaceId = savedActiveId;
  } else if (ws.length > 0 && !state.activeWorkspaceId) {
    state.activeWorkspaceId = ws[0].id;
  }
}

async function addWorkspace() {
  if (state.workspaces.length >= 10) return;
  const newWs = {
    id: crypto.randomUUID(),
    name: 'Новое пространство',
    background: { type: 'color', value: '#1a1a2e' },
    widgets: []
  };
  const updated = [...state.workspaces, newWs];
  await saveWorkspaces(updated);
  state.workspaces = updated;
  state.activeWorkspaceId = newWs.id;
  await saveActiveWorkspaceId(newWs.id);
  renderWorkspaceTabs();
  renderWidgetGrid();
}

async function updateWorkspace(id, updates) {
  const updated = state.workspaces.map(ws => ws.id === id ? { ...ws, ...updates } : ws);
  await saveWorkspaces(updated);
  state.workspaces = updated;
  if ('name' in updates) renderWorkspaceTabs();
  renderWidgetGrid();
}

async function deleteWorkspace(id) {
  if (state.workspaces.length <= 1) return;
  const updated = state.workspaces.filter(ws => ws.id !== id);
  await saveWorkspaces(updated);
  state.workspaces = updated;
  if (state.activeWorkspaceId === id) {
    state.activeWorkspaceId = updated[0]?.id;
    if (state.activeWorkspaceId) {
      await saveActiveWorkspaceId(state.activeWorkspaceId);
    }
  }
  renderWorkspaceTabs();
  renderWidgetGrid();
}

function getActiveWorkspace() {
  return state.workspaces.find(ws => ws.id === state.activeWorkspaceId);
}

// Widget Management
function addWidget(type) {
  const workspace = getActiveWorkspace();
  if (!workspace) return;

  // Assign to column with fewest widgets
  const colCounts = [0, 0, 0, 0];
  workspace.widgets.forEach(w => {
    const col = w.column ?? 0;
    colCounts[col] = (colCounts[col] || 0) + 1;
  });
  const targetCol = colCounts.indexOf(Math.min(...colCounts));

  const colWidgets = workspace.widgets.filter(w => (w.column ?? 0) === targetCol);

  const newWidget = {
    id: crypto.randomUUID(),
    type,
    column: targetCol,
    order: colWidgets.length,
    pinned: false,
    config: getDefaultWidgetConfig(type)
  };

  updateWorkspace(workspace.id, {
    widgets: [...workspace.widgets, newWidget]
  });
}

function getDefaultWidgetConfig(type) {
  switch (type) {
    case WIDGET_TYPES.WEATHER: return { apiKey: '', city: 'Moscow', title: 'Погода' };
    case WIDGET_TYPES.BOOKMARKS: return { bookmarks: [], title: 'Закладки' };
    case WIDGET_TYPES.CALENDAR: return { events: [], title: 'Календарь' };
    case WIDGET_TYPES.NOTES: return { content: '', title: 'Заметки' };
    case WIDGET_TYPES.DATE: return { title: 'Дата и время' };
    case WIDGET_TYPES.TODO: return { tasks: [], title: 'Список задач' };
    default: return {};
  }
}

function removeWidget(widgetId) {
  const workspace = getActiveWorkspace();
  if (!workspace) return;

  delete bookmarkExpanded[widgetId];
  if (sortableInstances[widgetId]) {
    sortableInstances[widgetId].destroy();
    delete sortableInstances[widgetId];
  }
  const updated = workspace.widgets.filter(w => w.id !== widgetId);
  updateWorkspace(workspace.id, {
    widgets: updated
  });
}

function updateWidgetConfig(widgetId, config, skipRender) {
  const workspace = getActiveWorkspace();
  if (!workspace) return;
  const updatedWorkspaces = state.workspaces.map(ws => {
    if (ws.id !== workspace.id) return ws;
    return {
      ...ws,
      widgets: ws.widgets.map(w => w.id === widgetId ? { ...w, config: { ...w.config, ...config } } : w)
    };
  });
  state.workspaces = updatedWorkspaces;
  saveWorkspaces(updatedWorkspaces);
  if (!skipRender) renderWidgetGrid();
}

// Rendering
function renderApp() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-container">
      <div id="workspace-tabs"></div>
      <div id="widget-grid"></div>
    </div>
  `;

  renderWorkspaceTabs();
  renderWidgetGrid();
}

function renderWorkspaceTabs() {
  const container = document.getElementById('workspace-tabs');
  if (!container) {
    console.error('workspace-tabs container not found');
    return;
  }

  // Defensive: never let tabs render with zero workspaces; fall back to in-memory placeholder
  // without persisting a new UUID (loadWorkspaces owns first-run creation).
  if (state.workspaces.length === 0) {
    console.warn('[Tabs] state.workspaces is empty — this should not happen; loadWorkspaces creates the initial workspace');
    return;
  }

  container.innerHTML = `
    <div class="workspace-tabs-bar">
      <div class="workspace-tabs-list" id="workspace-tabs-list">
        ${state.workspaces.map(ws => `
          <div
            class="workspace-tab ${ws.id === state.activeWorkspaceId ? 'is-active' : ''}"
            data-workspace-id="${ws.id}"
            title="Двойной клик для переименования"
          >
            <span class="workspace-tab-grip" aria-hidden="true">${ICONS.action('grip-vertical')}</span>
            <span class="workspace-tab-name" data-role="display">${escapeHtml(ws.name)}</span>
            <input
              type="text"
              class="workspace-tab-name-input"
              data-role="input"
              value="${escapeHtml(ws.name)}"
              maxlength="40"
              style="display: none;"
            />
            <div class="workspace-tab-actions">
              <button type="button" class="workspace-tab-delete icon-btn" title="Удалить" aria-label="Удалить">${ICONS.action('x')}</button>
            </div>
          </div>
        `).join('')}
        ${state.workspaces.length < 10 ? `<button type="button" class="workspace-tab workspace-tab-add icon-btn" id="add-workspace" title="Новая вкладка" aria-label="Новая вкладка">${ICONS.btn('plus')}</button>` : ''}
      </div>
      <div class="workspace-tabs-toolbar">
        <button type="button" class="icon-btn" id="add-widget" title="Добавить виджет" aria-label="Добавить виджет">${ICONS.btn('plus')}</button>
        <button type="button" class="icon-btn" id="bg-settings" title="Настройка фона">${ICONS.btn('palette')}</button>
        <button type="button" class="icon-btn" id="theme-toggle" title="Переключить тему">${ICONS.btn(state.theme === 'dark' ? 'sun' : 'moon')}</button>
        <button type="button" class="icon-btn" id="export-import" title="Экспорт/Импорт">${ICONS.btn('arrow-down-up')}</button>
      </div>
    </div>
  `;

  // Click on tab body → switch workspace
  container.querySelectorAll('.workspace-tab[data-workspace-id]').forEach(tab => {
    tab.addEventListener('click', (e) => {
      if (e.target.closest('.workspace-tab-actions') || e.target.closest('.workspace-tab-name-input')) return;
      state.activeWorkspaceId = tab.dataset.workspaceId;
      saveActiveWorkspaceId(state.activeWorkspaceId);
      updateActiveWorkspaceTab();
      renderWidgetGrid();
    });

    // Double-click on name → enter rename mode
    const nameEl = tab.querySelector('[data-role="display"]');
    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      enterTabRenameMode(tab);
    });

    // X button → delete (with custom confirm modal — Firefox blocks native confirm())
    tab.querySelector('.workspace-tab-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      const ws = state.workspaces.find(w => w.id === tab.dataset.workspaceId);
      if (!ws) return;
      if (state.workspaces.length <= 1) {
        showNotification('Нельзя удалить единственную вкладку');
        return;
      }
      const ok = await showConfirm({
        title: 'Удалить вкладку?',
        message: `Вкладка "${ws.name}" и все её виджеты будут удалены. Это действие нельзя отменить.`,
        confirmText: 'Удалить',
        danger: true
      });
      if (ok) deleteWorkspace(ws.id);
    });
  });

  // Setup inline rename behavior
  container.querySelectorAll('.workspace-tab-name-input').forEach(input => {
    const commit = () => {
      const tab = input.closest('.workspace-tab');
      const id = tab.dataset.workspaceId;
      const newName = input.value.trim();
      const ws = state.workspaces.find(w => w.id === id);
      if (newName && ws && newName !== ws.name) {
        updateWorkspace(id, { name: newName });
      } else {
        renderWorkspaceTabs();
      }
    };
    const cancel = () => renderWorkspaceTabs();

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); input.value = state.workspaces.find(w => w.id === input.closest('.workspace-tab').dataset.workspaceId)?.name || ''; input.blur(); }
    });
  });

  // Add button
  const addBtn = container.querySelector('#add-workspace');
  if (addBtn) {
    addBtn.addEventListener('click', addWorkspace);
  }

  // Toolbar buttons
  container.querySelector('#bg-settings').addEventListener('click', showBackgroundSettings);
  container.querySelector('#theme-toggle').addEventListener('click', () => { toggleTheme(); renderWorkspaceTabs(); });
  container.querySelector('#export-import').addEventListener('click', () => {
    showExportImportMenu();
    setTimeout(() => {
      document.querySelector('#caldav-settings')?.addEventListener('click', showCalDAVSyncSettings);
    }, 100);
  });

  // Drag-and-drop reorder
  setupWorkspaceTabsSortable(container.querySelector('#workspace-tabs-list'));
}

function updateActiveWorkspaceTab() {
  document.querySelectorAll('.workspace-tab[data-workspace-id]').forEach(t => {
    t.classList.toggle('is-active', t.dataset.workspaceId === state.activeWorkspaceId);
  });
}

function enterTabRenameMode(tab) {
  const display = tab.querySelector('[data-role="display"]');
  const input = tab.querySelector('[data-role="input"]');
  if (!display || !input) return;
  display.style.display = 'none';
  input.style.display = 'block';
  input.focus();
  input.select();
}

function setupWorkspaceTabsSortable(listEl) {
  if (!listEl || typeof Sortable === 'undefined') return;
  if (listEl._sortable) {
    listEl._sortable.destroy();
  }
  listEl._sortable = Sortable.create(listEl, {
    draggable: '.workspace-tab[data-workspace-id]',
    handle: '.workspace-tab-grip',
    animation: 200,
    ghostClass: 'workspace-tab-ghost',
    chosenClass: 'workspace-tab-chosen',
    dragClass: 'workspace-tab-drag',
    filter: '.workspace-tab-add, .workspace-tab-name-input, .workspace-tab-rename, .workspace-tab-delete, .workspace-tab-actions',
    preventOnFilter: true,
    onEnd: (evt) => {
      const ids = Array.from(listEl.querySelectorAll('.workspace-tab[data-workspace-id]'))
        .map(el => el.dataset.workspaceId);
      const reordered = ids.map(id => state.workspaces.find(ws => ws.id === id)).filter(Boolean);
      // Keep any tabs that weren't in the list (shouldn't happen) appended at the end
      const missing = state.workspaces.filter(ws => !ids.includes(ws.id));
      state.workspaces = [...reordered, ...missing];
      saveWorkspaces(state.workspaces);
      // Do not re-render: it would interrupt drag UX and lose active state mid-drop
    }
  });
}

function renderWidgetGrid() {
  const container = document.getElementById('widget-grid');
  if (!container) return;

  const workspace = getActiveWorkspace();
  if (!workspace) {
    container.innerHTML = '<div class="workspace"><p>Загрузка...</p></div>';
    return;
  }

  const widgets = workspace.widgets || [];
  const background = workspace.background || { type: 'color', value: '#1a1a2e' };

  const gridStyle = {
    background: background.type === 'color' ? background.value :
               background.type === 'gradient' ? background.value :
               background.type === 'image' ? `url(${background.value})` : background.value,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  };

  container.className = 'widget-grid widget-grid-layout';
  container.style.cssText = `display: grid !important; grid-template-columns: repeat(4, 1fr) !important; gap: 16px !important; padding: 20px; flex: 1; min-height: 0; overflow: auto; background: ${gridStyle.background}; background-size: ${gridStyle.backgroundSize}; background-position: ${gridStyle.backgroundPosition};`;

  if (widgets.length === 0) {
    const emptyCols = [0, 1, 2, 3].map(i => `<div class="widget-column" data-column="${i}"></div>`).join('');

    container.innerHTML = `
      ${emptyCols}
      <div class="empty-state-hint" id="add-widget-empty-hint">
        ${ICONS.btn('plus')}
        <span>Используйте <kbd>+</kbd> в верхней панели, чтобы добавить виджет</span>
      </div>
      <div id="add-widget-menu" class="modal-overlay" style="display: none;">
        <div class="modal">
          <h3>Добавить виджет</h3>
          <div class="widget-options">
            <button data-type="bookmarks">Закладки</button>
            <button data-type="notes">Заметки</button>
            <button data-type="date">Дата и время</button>
            <button data-type="weather">Погода</button>
            <button data-type="calendar">Календарь</button>
            <button data-type="todo">Список задач</button>
          </div>
          <button class="modal-close" id="close-menu">Отмена</button>
        </div>
      </div>
    `;
    setupWidgetColumnSortable();
    setupAddWidgetListeners(container);
    return;
  }

  // Group widgets by column
  const columns = [[], [], [], []];
  widgets.forEach(w => {
    const col = w.column ?? 0;
    if (col >= 0 && col < 4) {
      columns[col].push(w);
    } else {
      columns[0].push(w);
    }
  });
  columns.forEach(col => col.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

  const columnsHTML = columns.map((colWidgets, idx) => `
    <div class="widget-column" data-column="${idx}">
      ${colWidgets.map(w => renderWidget(w)).join('')}
    </div>
  `).join('');

  container.innerHTML = `
    ${columnsHTML}
    <div id="add-widget-menu" class="modal-overlay" style="display: none;">
      <div class="modal">
        <h3>Добавить виджет</h3>
        <div class="widget-options">
          <button data-type="bookmarks">Закладки</button>
          <button data-type="notes">Заметки</button>
          <button data-type="date">Дата и время</button>
          <button data-type="weather">Погода</button>
          <button data-type="calendar">Календарь</button>
          <button data-type="todo">Список задач</button>
        </div>
        <button class="modal-close" id="close-menu">Отмена</button>
      </div>
    </div>
  `;

  setupWidgetColumnSortable();
  setupWidgetListeners(container);
  setupAddWidgetListeners(container);
}

function widgetBgStyle(widget) {
  const cfg = widget.config || {};
  const color = cfg.bgColor;
  const opacity = cfg.opacity != null ? cfg.opacity : 100;
  if (!color && opacity >= 100) return '';
  if (!color) {
    const bgVar = 'var(--surface)';
    const o = Math.round(opacity / 100 * 255).toString(16).padStart(2, '0');
    return `style="background:${bgVar}${opacity < 100 ? o : ''}"`;
  }
  const r = parseInt(color.slice(1,3), 16);
  const g = parseInt(color.slice(3,5), 16);
  const b = parseInt(color.slice(5,7), 16);
  const a = opacity / 100;
  return `style="background:rgba(${r},${g},${b},${a})"`;
}

function renderWidget(widget) {
  const title = widget.config.title || getDefaultTitle(widget.type);
  const widgetId = widget.id;
  const pinned = widget.pinned || false;

  return `
    <div class="widget ${pinned ? 'widget-pinned' : ''}" data-widget-id="${widgetId}" ${widgetBgStyle(widget)}>
      <div class="widget-header ${pinned ? '' : 'widget-drag-handle'}" title="${pinned ? 'Виджет закреплён' : 'Перетащить виджет'}">
        <span class="widget-drag-grip" aria-hidden="true">${ICONS.action('grip-vertical')}</span>
        <span class="widget-title" data-default-title="${escapeHtml(title)}">${escapeHtml(title)}</span>
        <input type="text" class="widget-title-input" value="${escapeHtml(title)}" hidden />
        <div class="widget-actions">
          <button class="pin-widget-btn icon-btn" title="${pinned ? 'Открепить' : 'Закрепить'}" data-pinned="${pinned}">${ICONS.action(pinned ? 'pin' : 'pin-off')}</button>
          <button class="edit-title-btn icon-btn" title="Редактировать">${ICONS.action('pencil')}</button>
          <button class="remove-widget-btn icon-btn" title="Удалить" data-widget-id="${widgetId}">${ICONS.action('x')}</button>
        </div>
      </div>
      <div class="widget-content">${renderWidgetContent(widget)}</div>
    </div>
  `;
}

// Show all / collapse bookmarks handler
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.show-all-btn');
  if (!btn) return;
  
  const widgetId = btn.dataset.bookmarkWidgetId;
  bookmarkExpanded[widgetId] = !bookmarkExpanded[widgetId];
  renderWidgetGrid();
});

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

function renderWidgetContent(widget) {
  switch (widget.type) {
    case WIDGET_TYPES.BOOKMARKS:
      return renderBookmarksWidget(widget);
    case WIDGET_TYPES.NOTES:
      return renderNotesWidget(widget);
    case WIDGET_TYPES.DATE:
      return renderDateTimeWidget(widget);
    case WIDGET_TYPES.WEATHER:
      return renderWeatherWidget(widget);
    case WIDGET_TYPES.CALENDAR:
      return renderCalendarWidget(widget);
    case WIDGET_TYPES.TODO:
      return renderTodoWidget(widget);
    default:
      return '<div>Unknown widget</div>';
  }
}

// Widget Renderers
function renderBookmarksWidget(widget) {
  const bookmarks = widget.config.bookmarks || [];
  const isExpanded = bookmarkExpanded[widget.id] || false;
  const hasMore = bookmarks.length > 10;

  return `
    <div class="bookmarks-widget" data-widget-id="${widget.id}">
      <div class="add-bookmark">
        <input type="text" placeholder="Введите URL..." class="new-url-input" />
        <button class="add-bookmark-btn icon-btn" title="Добавить закладку" aria-label="Добавить закладку">${ICONS.btn('plus')}</button>
      </div>
      <div class="bookmarks-list ${isExpanded || !hasMore ? '' : 'collapsed'}">
        ${bookmarks.map(bm => `
          <div class="bookmark-item" data-bookmark-id="${bm.id}">
            <span class="bookmark-drag-handle">
              ${bm.favicon ? `<img src="${bm.favicon}" class="favicon" alt="" draggable="false" />` : `<span class="favicon-placeholder">${ICONS.action('globe')}</span>`}
            </span>
            <div class="bookmark-edit" style="display: none;">
              <input type="text" class="title-input" value="${escapeHtml(bm.title)}" placeholder="Название" />
              <input type="text" class="url-input" value="${escapeHtml(bm.url)}" placeholder="URL" />
            </div>
            <a href="${escapeHtml(bm.url)}" target="_blank" class="bookmark-title">${escapeHtml(bm.title)}</a>
            <button class="edit-btn icon-btn" title="Редактировать" aria-label="Редактировать">${ICONS.action('pencil')}</button>
            <button class="delete-btn icon-btn" title="Удалить" aria-label="Удалить">${ICONS.action('trash-2')}</button>
          </div>
        `).join('')}
      </div>
      ${hasMore ? `<button class="show-all-btn" data-bookmark-widget-id="${widget.id}">${isExpanded ? 'Свернуть' : `Показать все (${bookmarks.length})`}</button>` : ''}
    </div>
  `;
}

function renderNotesWidget(widget) {
  const content = widget.config.content || '';
  return `
    <div class="notes-widget" data-widget-id="${widget.id}">
      <textarea placeholder="Введите заметку...">${escapeHtml(content)}</textarea>
    </div>
  `;
}

function renderDateTimeWidget(widget) {
  return '<div class="datetime-widget"><div class="date" id="datetime-date"></div><div class="time" id="datetime-time"></div></div>';
}

function renderTodoWidget(widget) {
  const tasks = widget.config.tasks || [];
  const pending = tasks.filter(t => !t.done).length;

  return `
    <div class="todo-widget" data-widget-id="${widget.id}">
      <div class="todo-stats">Осталось: ${pending}</div>
      <div class="todo-list">
        ${tasks.map(t => `
          <div class="todo-item ${t.done ? 'todo-done' : ''}" data-task-id="${t.id}">
            <input type="checkbox" class="todo-checkbox" ${t.done ? 'checked' : ''} />
            <input type="text" class="todo-text" value="${escapeHtml(t.text)}" ${t.done ? 'readonly' : ''} />
            <button class="todo-delete icon-btn" title="Удалить">${ICONS.action('trash-2')}</button>
          </div>
        `).join('')}
      </div>
      <div class="todo-add-row">
        <input type="text" class="todo-new-input" placeholder="Новая задача..." />
        <button class="todo-add-btn icon-btn" title="Добавить задачу" aria-label="Добавить задачу">${ICONS.btn('plus')}</button>
      </div>
    </div>
  `;
}

function renderWeatherWidget(widget) {
  if (!widget.config.apiKey) {
    return `
      <div class="weather-widget" data-widget-id="${widget.id}">
        <p>Введите API ключ и город OpenWeather:</p>
        <input type="text" placeholder="API ключ" class="api-key-input" />
        <input type="text" placeholder="Город или координаты (55.99, 39.63)" class="city-input" value="${widget.config.city || 'Moscow'}" />
        <div class="weather-widget-actions">
          <button class="api-key-save-btn icon-btn" title="Сохранить">${ICONS.btn('check')}</button>
          <span class="api-key-save-status"></span>
          <a href="https://openweathermap.org/api" target="_blank" class="api-key-link">Получить ключ</a>
        </div>
      </div>
    `;
  }
  return `
    <div class="weather-widget" data-widget-id="${widget.id}">
      <div class="weather-content">
        <div class="weather-main">
          <div class="weather-icon" data-icon="cloud" aria-hidden="true">${ICONS.btn('cloud')}</div>
          <div class="temp">--°C</div>
        </div>
        <div class="desc">Загрузка...</div>
        <div class="wind">— м/с</div>
        <div class="location-row">
          <span class="location">${widget.config.city || 'Moscow'}</span>
          <button class="edit-city-btn icon-btn" title="Изменить город" aria-label="Изменить город">${ICONS.btn('pencil')}</button>
          <button class="change-key-btn icon-btn" title="Изменить ключ" aria-label="Изменить ключ">${ICONS.btn('key')}</button>
        </div>
      </div>
      <div class="weather-forecast">
        <div class="forecast-day" data-day="1"><span class="forecast-day-name"></span><span class="forecast-icon"></span><span class="forecast-temp"></span></div>
        <div class="forecast-day" data-day="2"><span class="forecast-day-name"></span><span class="forecast-icon"></span><span class="forecast-temp"></span></div>
        <div class="forecast-day" data-day="3"><span class="forecast-day-name"></span><span class="forecast-icon"></span><span class="forecast-temp"></span></div>
      </div>
      <input type="text" class="city-edit-input" value="${widget.config.city || 'Moscow'}" style="display:none" />
    </div>
  `;
}

function pad2(n) { return String(n).padStart(2, '0'); }

function eventDateKey(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function migrateEvent(e) {
  if (!e) return null;
  let result;
  if (typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
    result = { id: e.id, title: e.title, date: e.date, time: e.time || null };
  } else if (typeof e.year === 'number' && typeof e.month === 'number' && typeof e.day === 'number') {
    result = {
      id: e.id,
      title: e.title,
      date: eventDateKey(e.year, e.month, e.day),
      time: e.time || null
    };
  } else {
    return null;
  }
  if (e.recurring) result.recurring = e.recurring;
  if (e.isRecurringInstance) result.isRecurringInstance = true;
  if (e.recurringParentId) result.recurringParentId = e.recurringParentId;
  if (e.source) result.source = e.source;
  if (e.endDate) result.endDate = e.endDate;
  if (e.endTime) result.endTime = e.endTime;
  if (e.color) result.color = e.color;
  return result;
}

function eventColor(id, index, customColor) {
  if (customColor) return customColor;
  const hue = ((index ?? 0) * 137.508) % 360;
  return `hsl(${hue} 70% 58%)`;
}

function renderCalendarWidget(widget) {
  const now = new Date();
  const viewYear = widget.config.viewYear ?? now.getFullYear();
  const viewMonth = widget.config.viewMonth ?? now.getMonth();
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString('ru', { month: 'long' });
  const firstDayRaw = new Date(viewYear, viewMonth, 1).getDay();
  const firstDay = firstDayRaw === 0 ? 6 : firstDayRaw - 1;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const isViewingCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const todayDay = isViewingCurrentMonth ? now.getDate() : null;
  const monthPrefix = `${viewYear}-${pad2(viewMonth + 1)}`;

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const events = (widget.config.events || []).map(migrateEvent).filter(Boolean);
  const selectedDay = widget.config.selectedDay ?? null;
  const selectedDateKey = selectedDay ? eventDateKey(viewYear, viewMonth, selectedDay) : null;
  const selectedDate = selectedDateKey
    ? events.filter(e => e.date === selectedDateKey)
        .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))
    : [];

  // Group events by day for bars, and assign each a stable color index
  // (golden-angle hue distribution) so every event has a visually distinct color.
  const eventsByDay = new Map();
  const colorIndexByEventId = new Map();
  const monthEventsSorted = events
    .filter(e => e.date.startsWith(monthPrefix))
    .slice()
    .sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return (a.time || '99:99').localeCompare(b.time || '99:99');
    });
  monthEventsSorted.forEach((e, idx) => {
    colorIndexByEventId.set(e.id, idx);
    const day = parseInt(e.date.slice(8), 10);
    if (!eventsByDay.has(day)) eventsByDay.set(day, []);
    eventsByDay.get(day).push(e);
  });
  // Recurring instances inherit parent's color index
  for (const e of monthEventsSorted) {
    if (e.isRecurringInstance && e.recurringParentId) {
      if (colorIndexByEventId.has(e.recurringParentId)) {
        colorIndexByEventId.set(e.id, colorIndexByEventId.get(e.recurringParentId));
      } else {
        const hash = e.recurringParentId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        colorIndexByEventId.set(e.id, hash % 1000);
      }
    }
  }

  const MAX_BARS = 3;

  return `
    <div class="calendar-widget" data-widget-id="${widget.id}">
      <div class="calendar-nav">
        <button class="prev-month icon-btn" title="Предыдущий месяц">${ICONS.action('chevron-left')}</button>
        <span class="calendar-title">${monthName} ${viewYear}</span>
        <button class="next-month icon-btn" title="Следующий месяц">${ICONS.action('chevron-right')}</button>
      </div>
      <div class="calendar-grid">
        ${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => `<div class="calendar-header">${d}</div>`).join('')}
          ${days.map((day) => {
            const classes = ['calendar-day'];
            if (!day) classes.push('empty');
            if (day === todayDay) classes.push('today');
            if (day === selectedDay) classes.push('selected');
            const dayEvents = day ? (eventsByDay.get(day) || []) : [];
            if (dayEvents.length > 0) classes.push('has-events');

            const allDayEvents = dayEvents.filter(e => !e.time);
            const timedEvents = dayEvents.filter(e => e.time);
            let cellStyle = '';
            if (allDayEvents.length > 0) {
              classes.push('has-allday');
              const first = allDayEvents[0];
              const colorIdx = colorIndexByEventId.get(first.id) ?? 0;
              const hue = ((colorIdx ?? 0) * 137.508) % 360;
              cellStyle = `style="background:hsla(${hue},70%,58%,0.2)"`;
              if (first.color) {
                const r = parseInt(first.color.slice(1,3), 16);
                const g = parseInt(first.color.slice(3,5), 16);
                const b = parseInt(first.color.slice(5,7), 16);
                cellStyle = `style="background:rgba(${r},${g},${b},0.2)"`;
              }
              if (allDayEvents.length === 1) {
                classes.push('allday-single');
              }
            }

            const visible = timedEvents.slice(0, MAX_BARS);
            const overflow = timedEvents.length - visible.length;
            const bars = visible.map(e => {
              const colorIdx = colorIndexByEventId.get(e.id) ?? 0;
              const isRecurring = !!(e.isRecurringInstance || (e.recurring && e.recurring.type && e.recurring.type !== 'none'));
              return `<div class="event-bar ${isRecurring ? 'event-bar-recurring' : ''}"
                            data-event-id="${e.id}"
                            style="background:${eventColor(e.id, colorIdx, e.color)}"
                            title="${escapeHtml(e.title)} · ${e.time}${isRecurring ? ' (повторяющееся)' : ''}"></div>`;
            }).join('');
            const overflowHtml = overflow > 0
              ? `<span class="event-overflow">+${overflow}</span>`
              : '';

            return `
              <div class="${classes.join(' ')}" data-day="${day || ''}" ${cellStyle}>
                <span class="calendar-day-num">${day || ''}</span>
                ${timedEvents.length > 0 ? `<div class="event-bars">${bars}${overflowHtml}</div>` : ''}
              </div>
            `;
          }).join('')}
      </div>
      <div class="caldav-sync-row">
        <button class="caldav-sync-btn icon-btn" title="Синхронизировать CalDAV" aria-label="Синхронизировать">${ICONS.action('rotate-cw')}</button>
        <span class="caldav-sync-status">${widget.config.caldavCalendarName ? (widget.config.caldavLastSync ? timeAgo(widget.config.caldavLastSync) : 'CalDAV: нажмите для синхронизации') : ''}</span>
      </div>
      ${selectedDay ? `
        <div class="selected-day-panel">
          <div class="selected-day-header">
            <span>${selectedDay} ${monthName}</span>
            <button class="add-event-btn icon-btn" title="Добавить событие">${ICONS.btn('plus')}</button>
          </div>
          ${selectedDate.length > 0 ? `
            <ul class="selected-day-events">
              ${selectedDate.map(e => `
                <li data-event-id="${e.id}" class="event-item ${e.source === 'caldav' ? 'event-item-caldav' : ''}" title="${e.source === 'caldav' ? 'CalDAV (только чтение)' : 'Кликните для редактирования'}">
                  ${e.time ? `<span class="event-time">${e.time}</span>` : '<span class="event-time event-time-allday">весь день</span>'}
                  ${e.source === 'caldav' ? '<span class="caldav-badge">CalDAV</span>' : ''}
                  ${(e.recurring && e.recurring.type && e.recurring.type !== 'none') || e.isRecurringInstance ? '<span class="event-recurring-badge" title="Повторяющееся событие">↻</span>' : ''}
                  <span class="event-title">${escapeHtml(e.title)}</span>
                  <span class="event-color-dot" style="background:${eventColor(e.id, colorIndexByEventId.get(e.id) ?? 0, e.color)}"></span>
                  ${e.source !== 'caldav' ? `<button class="event-delete-btn icon-btn" title="Удалить">${ICONS.action('trash-2')}</button>` : ''}
                </li>
              `).join('')}
            </ul>
          ` : '<p class="empty-day-text">Нет событий</p>'}
        </div>
      ` : `
        <p class="calendar-hint">${ICONS.action('calendar')} Выберите дату для просмотра событий</p>
      `}
    </div>
  `;
}

// Document-level event delegation for widget buttons (added once at init)
document.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('.remove-widget-btn');
  if (removeBtn) {
    const widgetEl = removeBtn.closest('.widget');
    if (!widgetEl) return;

    const widgetId = widgetEl.dataset.widgetId;
    const workspace = getActiveWorkspace();
    const widget = workspace?.widgets.find(w => w.id === widgetId);
    const widgetTitle = widget?.config?.title || 'этот виджет';

    (async () => {
      const ok = await showConfirm({
        title: 'Удалить виджет?',
        message: `Виджет "${widgetTitle}" будет удалён. Это действие нельзя отменить.`,
        confirmText: 'Удалить',
        danger: true
      });
      if (ok) removeWidget(widgetId);
    })();
    return;
  }

  const pinBtn = e.target.closest('.pin-widget-btn');
  if (pinBtn) {
    e.stopPropagation();
    const widgetEl = pinBtn.closest('.widget');
    if (!widgetEl) return;
    const widgetId = widgetEl.dataset.widgetId;
    toggleWidgetPin(widgetId);
    return;
  }

  const editBtn = e.target.closest('.edit-title-btn');
  if (editBtn) {
    e.stopPropagation();
    const widgetEl = editBtn.closest('.widget');
    if (!widgetEl) return;
    const widgetId = widgetEl.dataset.widgetId;
    const workspace = getActiveWorkspace();
    const widget = workspace?.widgets.find(w => w.id === widgetId);
    if (widget) showWidgetSettingsModal(widget);
    return;
  }
});

function toggleWidgetPin(widgetId) {
  const workspace = getActiveWorkspace();
  if (!workspace) return;
  const widget = workspace.widgets.find(w => w.id === widgetId);
  if (!widget) return;

  const newPinned = !widget.pinned;
  const updatedWidgets = workspace.widgets.map(w =>
    w.id === widgetId ? { ...w, pinned: newPinned } : w
  );
  const wsIdx = state.workspaces.findIndex(ws => ws.id === workspace.id);
  if (wsIdx === -1) return;
  state.workspaces[wsIdx] = { ...state.workspaces[wsIdx], widgets: updatedWidgets };
  saveWorkspaces(state.workspaces);
  renderWidgetGrid();
}

// Event Setup
function setupWidgetListeners(container) {

  // Bookmarks
  container.querySelectorAll('.bookmarks-widget').forEach(el => {
    const widgetId = el.dataset.widgetId;

    // Sortable drag-and-drop for bookmark reordering
    const list = el.querySelector('.bookmarks-list');
    if (list && typeof Sortable !== 'undefined') {
      if (sortableInstances[widgetId]) {
        sortableInstances[widgetId].destroy();
        delete sortableInstances[widgetId];
      }

      sortableInstances[widgetId] = Sortable.create(list, {
        draggable: '.bookmark-item',
        animation: 150,
        ghostClass: 'bookmark-ghost',
        chosenClass: 'bookmark-chosen',
        dragClass: 'bookmark-drag',
        fallbackOnBody: true,
        delay: 80,
        delayOnTouchOnly: true,
        filter: '.bookmark-title, .edit-btn, .delete-btn, .title-input',
        preventOnFilter: true,
        onStart: () => {
          list.classList.add('dragging');
          setColumnSortablesDisabled(true);
        },
        onEnd: () => {
          list.classList.remove('dragging');
          setColumnSortablesDisabled(false);
          persistBookmarkOrder(widgetId, list);
        }
      });
    }

    // Add bookmark
    el.querySelector('.add-bookmark-btn').addEventListener('click', async () => {
      const input = el.querySelector('.new-url-input');
      const url = input.value.trim();
      if (!url) return;

      let fullUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        fullUrl = 'https://' + url;
      }

      try {
        new URL(fullUrl);
      } catch {
        showNotification('Неверный URL');
        return;
      }

      const hostname = new URL(fullUrl).hostname;
      const favicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;

      const workspace = getActiveWorkspace();
      const widget = workspace.widgets.find(w => w.id === widgetId);
      const bookmarks = widget.config.bookmarks || [];

      // Try to fetch page title via background page (to avoid CORS)
      let title = fullUrl; // Default to URL if title unavailable
      let titleSource = 'hostname';
      
      try {
        const response = await browserMessaging.sendMessage({ type: 'fetchTitle', payload: { url: fullUrl } });
        if (response.success && response.result?.title) {
          title = response.result.title;
          titleSource = 'fetched';
        }
      } catch (e) {
        // Will use hostname
      }
      
      if (titleSource !== 'fetched') {
        // Fallback: try direct fetch
        try {
          const resp = await fetch(fullUrl, { mode: 'cors' });
          if (resp.ok) {
            const html = await resp.text();
            const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (match) {
              title = match[1].trim();
              titleSource = 'fetched';
            }
          }
        } catch (e) {
          // Will use hostname
        }
      }

      const newBookmark = {
        id: crypto.randomUUID(),
        url: fullUrl,
        title,
        favicon
      };

      updateWidgetConfig(widgetId, { bookmarks: [...bookmarks, newBookmark] });
    });

    // Edit/Delete bookmarks
    el.querySelectorAll('.bookmark-item').forEach(item => {
      const bmId = item.dataset.bookmarkId;

      const saveBookmark = () => {
        const newTitle = item.querySelector('.title-input').value.trim() || item.querySelector('.title-input').value;
        const newUrl = item.querySelector('.url-input').value.trim() || item.querySelector('.url-input').value;
        const workspace = getActiveWorkspace();
        const widget = workspace.widgets.find(w => w.id === widgetId);
        const bookmarks = widget.config.bookmarks.map(b => b.id === bmId ? { ...b, title: newTitle, url: newUrl } : b);
        updateWidgetConfig(widgetId, { bookmarks });
      };

      const cancelEdit = () => {
        const titleInput = item.querySelector('.title-input');
        const urlInput = item.querySelector('.url-input');
        const link = item.querySelector('.bookmark-title');
        const workspace = getActiveWorkspace();
        const widget = workspace.widgets.find(w => w.id === widgetId);
        const bm = widget.config.bookmarks.find(b => b.id === bmId);
        titleInput.value = bm.title;
        urlInput.value = bm.url;
        item.querySelector('.bookmark-edit').style.display = 'none';
        link.style.display = '';
      };

      item.querySelector('.edit-btn').addEventListener('click', () => {
        const editForm = item.querySelector('.bookmark-edit');
        const link = item.querySelector('.bookmark-title');

        if (editForm.style.display === 'none') {
          editForm.style.display = 'flex';
          link.style.display = 'none';
          editForm.querySelector('.title-input').focus();
          editForm.querySelector('.title-input').select();
        } else {
          saveBookmark();
        }
      });

      item.querySelector('.bookmark-edit').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveBookmark();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelEdit();
        }
      });

      item.querySelector('.delete-btn').addEventListener('click', () => {
        const workspace = getActiveWorkspace();
        const widget = workspace.widgets.find(w => w.id === widgetId);
        const bookmarks = widget.config.bookmarks.filter(b => b.id !== bmId);
        updateWidgetConfig(widgetId, { bookmarks });
      });
    });
  });

  // Notes
  container.querySelectorAll('.notes-widget textarea').forEach(textarea => {
    const widgetEl = textarea.closest('.notes-widget');
    const widgetId = widgetEl.dataset.widgetId;
    let saveTimeout;

    textarea.addEventListener('input', () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        updateWidgetConfig(widgetId, { content: textarea.value }, true);
      }, 500);
    });
  });

  // DateTime - update every 30 seconds
  container.querySelectorAll('.datetime-widget').forEach(el => {
    updateDateTime(el);
    setInterval(() => updateDateTime(el), 30000);
  });

  // Todo
  container.querySelectorAll('.todo-widget').forEach(el => {
    const widgetId = el.dataset.widgetId;

    function getTodoWidget() {
      const ws = getActiveWorkspace();
      return ws?.widgets.find(w => w.id === widgetId);
    }

    // Add task
    el.querySelector('.todo-add-btn').addEventListener('click', () => {
      const input = el.querySelector('.todo-new-input');
      const text = input.value.trim();
      if (!text) return;
      const w = getTodoWidget();
      if (!w) return;
      const tasks = [...(w.config.tasks || []), {
        id: crypto.randomUUID(),
        text,
        done: false
      }];
      updateWidgetConfig(widgetId, { tasks });
      input.value = '';
      renderWidgetGrid();
    });
    el.querySelector('.todo-new-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        el.querySelector('.todo-add-btn').click();
      }
    });

    // Toggle done / edit / delete
    el.querySelectorAll('.todo-item').forEach(item => {
      const taskId = item.dataset.taskId;

      item.querySelector('.todo-checkbox').addEventListener('change', () => {
        const w = getTodoWidget();
        if (!w) return;
        const tasks = (w.config.tasks || []).map(t =>
          t.id === taskId ? { ...t, done: !t.done } : t
        );
        updateWidgetConfig(widgetId, { tasks });
        renderWidgetGrid();
      });

      item.querySelector('.todo-text').addEventListener('change', () => {
        const text = item.querySelector('.todo-text').value.trim();
        if (!text) return;
        const w = getTodoWidget();
        if (!w) return;
        const tasks = (w.config.tasks || []).map(t =>
          t.id === taskId ? { ...t, text } : t
        );
        updateWidgetConfig(widgetId, { tasks });
      });

      item.querySelector('.todo-delete').addEventListener('click', () => {
        const w = getTodoWidget();
        if (!w) return;
        const tasks = (w.config.tasks || []).filter(t => t.id !== taskId);
        updateWidgetConfig(widgetId, { tasks });
        renderWidgetGrid();
      });
    });
  });

  // Weather
  container.querySelectorAll('.weather-widget').forEach(el => {
    const widgetId = el.dataset.widgetId;
    const workspace = getActiveWorkspace();
    const widget = workspace.widgets.find(w => w.id === widgetId);

    if (widget && widget.config.apiKey) {
      fetchWeather(el, widget.config.apiKey, widget.config.city || 'Moscow');
    }

    el.querySelector('.change-key-btn')?.addEventListener('click', () => {
      updateWidgetConfig(widgetId, { apiKey: '' });
    });

    // Inline city edit (display state)
    const editCityBtn = el.querySelector('.edit-city-btn');
    const cityEditInput = el.querySelector('.city-edit-input');
    if (editCityBtn && cityEditInput) {
      const saveCity = () => {
        const newCity = cityEditInput.value.trim() || 'Moscow';
        if (newCity === (widget?.config.city || 'Moscow')) {
          cityEditInput.style.display = 'none';
          return;
        }
        updateWidgetConfig(widgetId, { city: newCity });
        cityEditInput.style.display = 'none';
      };
      editCityBtn.addEventListener('click', () => {
        cityEditInput.value = widget?.config.city || 'Moscow';
        cityEditInput.style.display = '';
        cityEditInput.focus();
        cityEditInput.select();
      });
      cityEditInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveCity(); }
        else if (e.key === 'Escape') { cityEditInput.style.display = 'none'; }
      });
      cityEditInput.addEventListener('blur', saveCity);
    }

    const input = el.querySelector('.api-key-input');
    const cityInput = el.querySelector('.city-input');
    const saveBtn = el.querySelector('.api-key-save-btn');
    const status = el.querySelector('.api-key-save-status');
    if (input && widgetId) {
      const parseKey = (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return '';
        // Unwrap env-style "NAME=VALUE" paste mistake
        const m = trimmed.match(/^[A-Za-z_][A-Za-z0-9_-]*=(.+)$/);
        return m ? m[1].trim() : trimmed;
      };
      const saveKey = () => {
        const key = parseKey(input.value);
        if (!key) {
          if (status) {
            status.textContent = 'Введите ключ';
            status.dataset.state = 'error';
          }
          return;
        }
        const city = cityInput ? (cityInput.value.trim() || 'Moscow') : (widget?.config.city || 'Moscow');
        updateWidgetConfig(widgetId, { apiKey: key, city });
        if (input.value.trim() !== key) input.value = key; // normalize visible value
        if (status) {
          status.textContent = '✓ Сохранено';
          status.dataset.state = 'ok';
          clearTimeout(saveKey._t);
          saveKey._t = setTimeout(() => {
            status.textContent = '';
            delete status.dataset.state;
          }, 1800);
        }
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveKey();
        }
      });
      input.addEventListener('blur', saveKey);
      saveBtn?.addEventListener('click', saveKey);
    }
  });

  // Calendar
  container.querySelectorAll('.calendar-widget').forEach(el => {
    const widgetId = el.dataset.widgetId;
    const workspace = getActiveWorkspace();
    const widget = workspace.widgets.find(w => w.id === widgetId);
    const now = new Date();
    const viewYear = widget.config.viewYear ?? now.getFullYear();
    const viewMonth = widget.config.viewMonth ?? now.getMonth();

    el.querySelector('.prev-month')?.addEventListener('click', () => {
      let m = viewMonth - 1;
      let y = viewYear;
      if (m < 0) { m = 11; y--; }
      updateWidgetConfig(widgetId, { viewYear: y, viewMonth: m, selectedDay: null });
      renderWidgetGrid();
    });

    el.querySelector('.next-month')?.addEventListener('click', () => {
      let m = viewMonth + 1;
      let y = viewYear;
      if (m > 11) { m = 0; y++; }
      updateWidgetConfig(widgetId, { viewYear: y, viewMonth: m, selectedDay: null });
      renderWidgetGrid();
    });

    el.querySelectorAll('.calendar-day:not(.empty)').forEach(dayEl => {
      dayEl.addEventListener('click', (e) => {
        // Click on event-bar inside the cell → open that event for edit
        const bar = e.target.closest('.event-bar');
        if (bar) {
          e.stopPropagation();
          const eventId = bar.dataset.eventId;
          const event = (widget.config.events || []).find(ev => ev.id === eventId);
          if (event) showEventModal(widget, event);
          return;
        }
        const day = parseInt(dayEl.dataset.day, 10);
        updateWidgetConfig(widgetId, { selectedDay: day });
        renderWidgetGrid();
      });
    });

    el.querySelector('.add-event-btn')?.addEventListener('click', () => {
      showEventModal(widget, null);
    });

    el.querySelectorAll('.event-item').forEach(item => {
      const eventId = item.dataset.eventId;
      const event = (widget.config.events || []).find(ev => ev.id === eventId);
      item.addEventListener('click', (e) => {
        if (e.target.closest('.event-delete-btn')) return;
        showEventModal(widget, event);
      });

      item.querySelector('.event-delete-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (event?.source === 'caldav') return;
        const isRecurring = !!(event?.recurring?.type && event.recurring.type !== 'none') || !!(event?.isRecurringInstance);
        if (isRecurring) {
          const choice = await showRecurringDeleteChoice();
          if (!choice) return;
          if (choice === 'all') {
            const parentId = event.recurringParentId || event.id;
            const updated = (widget.config.events || []).filter(ev =>
              !(ev.recurringParentId === parentId || ev.id === parentId)
            );
            updateWidgetConfig(widgetId, { events: updated });
          } else {
            const updated = (widget.config.events || []).filter(ev => ev.id !== eventId);
            updateWidgetConfig(widgetId, { events: updated });
          }
        } else {
          const updated = (widget.config.events || []).filter(ev => ev.id !== eventId);
          updateWidgetConfig(widgetId, { events: updated });
        }
        renderWidgetGrid();
      });
    });

    // CalDAV sync button
    el.querySelector('.caldav-sync-btn')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const btn = e.currentTarget;
      btn.classList.add('caldav-syncing');
      const ok = await syncCalDAVEvents(widgetId);
      btn.classList.remove('caldav-syncing');
      if (!ok && !widget.config.caldavCalendarHref) {
        // No calendar selected → offer picker
        showCalDAVCalendarPicker(widgetId);
      }
    });

    // Auto-sync if calendar is configured and sync is stale (>5 min)
    if (widget.config.caldavCalendarHref) {
      const lastSync = widget.config.caldavLastSync;
      const stale = !lastSync || (Date.now() - new Date(lastSync).getTime() > 300000);
      if (stale) {
        syncCalDAVEvents(widgetId).then(ok => {
          if (!ok) {
            const statusEl = el.querySelector('.caldav-sync-status');
            if (statusEl) statusEl.textContent = 'CalDAV: ошибка синхронизации';
          }
        });
      }
    }

    // If creds exist but no calendar selected → offer picker
    if (!widget.config.caldavCalendarHref) {
      getCalDAVCredentials().then(stored => {
        if (stored) {
          const statusEl = el.querySelector('.caldav-sync-status');
          if (statusEl) {
            statusEl.textContent = 'CalDAV: выберите календарь';
            statusEl.style.cursor = 'pointer';
            statusEl.addEventListener('click', () => showCalDAVCalendarPicker(widgetId));
          }
        }
      });
    }
  });
}

function isCustomRecurring(r) {
  return r && r.type !== 'none' && (r.interval > 1 || !!r.endDate);
}

function showWidgetSettingsModal(widget) {
  const config = widget.config || {};
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3 class="modal-title">Настройки виджета</h3>
      <form class="widget-settings-form">
        <label class="event-field">
          <span>Название</span>
          <input type="text" name="title" class="widget-settings-title" value="${escapeHtml(config.title || '')}" />
        </label>
        <label class="event-field">
          <span>Цвет фона</span>
          <div class="event-color-swatches" style="margin-top:4px;">
            ${['', '#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#a855f7','#ec4899'].map(c => {
              const selected = c ? config.bgColor === c : !config.bgColor;
              return `<button type="button" class="event-color-swatch ${selected ? 'is-selected' : ''}" data-color="${c}" style="${c ? 'background:'+c : 'background:var(--surface-2);font-size:12px;line-height:26px;text-align:center;color:var(--text-muted)'}" aria-label="${c || 'Нет'}">${c ? '' : '×'}</button>`;
            }).join('')}
          </div>
          <input type="color" name="bgColor" class="widget-settings-color" value="${config.bgColor || '#3b82f6'}" style="margin-top:6px;width:100%;height:36px;padding:2px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);cursor:pointer;" />
        </label>
        <label class="event-field">
          <span>Непрозрачность: <span class="widget-opacity-value">${config.opacity != null ? config.opacity : 100}</span>%</span>
          <input type="range" name="opacity" class="widget-settings-opacity" min="0" max="100" value="${config.opacity != null ? config.opacity : 100}" style="width:100%;" />
        </label>
        <div class="event-actions" style="margin-top:var(--space-4);">
          <button type="button" class="modal-close btn btn-secondary" id="widget-settings-cancel">Отмена</button>
          <button type="submit" class="btn btn-primary">Сохранить</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  // Color swatch click handler
  const swatches = overlay.querySelectorAll('.event-color-swatch');
  const colorInput = overlay.querySelector('.widget-settings-color');
  swatches.forEach(sw => {
    sw.addEventListener('click', () => {
      swatches.forEach(s => s.classList.remove('is-selected'));
      sw.classList.add('is-selected');
    });
  });

  // Slider value display
  const slider = overlay.querySelector('.widget-settings-opacity');
  const sliderVal = overlay.querySelector('.widget-opacity-value');
  slider.addEventListener('input', () => {
    sliderVal.textContent = slider.value;
  });

  // Save
  const close = () => overlay.remove();
  overlay.querySelector('#widget-settings-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('.widget-settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const selectedSwatch = overlay.querySelector('.event-color-swatch.is-selected');
    const bgColor = selectedSwatch?.dataset.color || form.bgColor.value || null;
    updateWidgetConfig(widget.id, {
      title: form.title.value.trim() || config.title,
      bgColor: bgColor || null,
      opacity: parseInt(slider.value)
    });
    close();
  });
}

function showRecurringDeleteChoice() {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-overlay';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-title">Удаление повторяющегося события</div>
        <div class="modal-message">Это событие повторяется. Что вы хотите сделать?</div>
        <div class="modal-actions" style="flex-direction:column;gap:8px;">
          <button type="button" class="btn btn-danger" id="choice-all">Удалить текущее и все последующие</button>
          <button type="button" class="btn btn-secondary" id="choice-one">Удалить только это событие</button>
          <button type="button" class="btn btn-secondary" id="choice-cancel" style="margin-top:4px;">Отмена</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const close = (val) => { backdrop.remove(); resolve(val); };
    backdrop.querySelector('#choice-all').addEventListener('click', () => close('all'));
    backdrop.querySelector('#choice-one').addEventListener('click', () => close('one'));
    backdrop.querySelector('#choice-cancel').addEventListener('click', () => close(null));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
  });
}

function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function generateRecurringEvents(baseEvent, recurringConfig) {
  const instances = [];
  const startDate = new Date(baseEvent.date + 'T' + (baseEvent.time || '00:00'));

  const endDate = recurringConfig.endDate ? new Date(recurringConfig.endDate + 'T23:59:59') : null;
  let current = new Date(startDate);

  const maxCount = 365;
  let count = 0;

  // Advance past the first occurrence (base event covers it)
  advanceDate(current, recurringConfig.type, recurringConfig.interval);

  while ((!endDate || current <= endDate) && count < maxCount) {
    const instanceDate = new Date(current);
    const instance = {
      id: crypto.randomUUID(),
      title: baseEvent.title,
      date: localDateStr(instanceDate),
      time: baseEvent.time,
      endDate: baseEvent.endDate,
      endTime: baseEvent.endTime,
      source: baseEvent.source,
      color: baseEvent.color,
      recurring: { ...recurringConfig },
      isRecurringInstance: true,
      recurringParentId: baseEvent.id
    };

    instances.push(instance);
    count++;

    advanceDate(current, recurringConfig.type, recurringConfig.interval);
  }

  return instances;
}

function advanceDate(date, type, interval) {
  switch (type) {
    case 'daily':
      date.setDate(date.getDate() + interval);
      break;
    case 'weekly':
      date.setDate(date.getDate() + (interval * 7));
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + interval);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + interval);
      break;
  }
}

function showEventModal(widget, existingEvent) {
  const isEdit = !!existingEvent;
  const isCalDAV = existingEvent?.source === 'caldav';
  existingEvent = existingEvent ? migrateEvent(existingEvent) : null;
  const now = new Date();
  let initialDate;
  if (existingEvent?.date) {
    initialDate = existingEvent.date;
  } else if (widget.config.selectedDay != null) {
    initialDate = eventDateKey(
      widget.config.viewYear ?? now.getFullYear(),
      widget.config.viewMonth ?? now.getMonth(),
      widget.config.selectedDay
    );
  } else {
    initialDate = eventDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const initialTime = existingEvent?.time ?? '';
  const initialTitle = existingEvent?.title ?? '';
  const isAllDay = isEdit && !existingEvent.time;
  const isRecurring = !!existingEvent?.recurring;
  const isRecurringInstance = !!(existingEvent?.isRecurringInstance);

  if (isCalDAV) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3 class="modal-title">${escapeHtml(initialTitle)}</h3>
        <p style="margin:8px 0;color:var(--text-muted);font-size:var(--text-sm);">
          ${initialDate}${isAllDay ? ' · весь день' : ' · ' + initialTime}
        </p>
        <div style="display:flex;align-items:center;gap:6px;margin:12px 0;padding:8px;background:var(--primary-soft);border-radius:var(--radius-sm);font-size:var(--text-xs);color:var(--primary);">
          <span>🔄</span>
          <span>Синхронизировано из CalDAV. Для изменений отредактируйте в вашем календаре.</span>
        </div>
        <button class="modal-close" style="width:100%;">Закрыть</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3 class="modal-title">${isEdit ? 'Редактировать событие' : 'Новое событие'}</h3>
      <form class="event-form">
        <label class="event-field">
          <span>Название</span>
          <input type="text" name="title" class="event-title-input" value="${escapeHtml(initialTitle)}" required autofocus />
        </label>
        <div class="event-row">
          <label class="event-field event-field-date">
            <span>Дата начала</span>
            <input type="date" name="date" class="event-date-input" value="${initialDate}" required />
          </label>
          <label class="event-field event-field-time" ${isAllDay ? 'hidden' : ''}>
            <span>Время начала</span>
            <input type="time" name="time" class="event-time-input" value="${initialTime}" />
          </label>
        </div>
        <div class="event-row" id="end-date-row" ${isAllDay ? 'hidden' : ''}>
          <label class="event-field event-field-date">
            <span>Дата окончания</span>
            <input type="date" name="endDate" class="event-end-date-input" value="${initialDate}" />
          </label>
          <label class="event-field event-field-time">
            <span>Время окончания</span>
            <input type="time" name="endTime" class="event-end-time-input" value="${initialTime}" />
          </label>
        </div>
        <label class="event-field event-field-checkbox">
          <input type="checkbox" name="allday" class="event-allday-input" ${isAllDay ? 'checked' : ''} />
          <span>Весь день</span>
        </label>
        <div class="event-color-picker" ${isAllDay ? '' : 'hidden'}>
          <span class="event-color-picker-label">Цвет</span>
          <div class="event-color-swatches">
            ${['#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#a855f7','#ec4899'].map(c => `
              <button type="button" class="event-color-swatch ${existingEvent?.color === c ? 'is-selected' : ''}" data-color="${c}" style="background:${c}" aria-label="${c}"></button>
            `).join('')}
            <button type="button" class="event-color-swatch event-color-swatch-none ${!existingEvent?.color ? 'is-selected' : ''}" data-color="" aria-label="Авто">🎨</button>
          </div>
          <input type="hidden" name="color" value="${existingEvent?.color || ''}" />
        </div>
        <div class="event-recurrence">
          <label class="event-field">
            <span>Повторение</span>
            <select name="recurringType" class="event-recurring-type">
              <option value="none" ${!isRecurring ? 'selected' : ''}>Не повторять</option>
              <option value="daily" ${existingEvent?.recurring?.type === 'daily' && !isCustomRecurring(existingEvent?.recurring) ? 'selected' : ''}>Каждый день</option>
              <option value="weekly" ${existingEvent?.recurring?.type === 'weekly' && !isCustomRecurring(existingEvent?.recurring) ? 'selected' : ''}>Каждую неделю</option>
              <option value="monthly" ${existingEvent?.recurring?.type === 'monthly' && !isCustomRecurring(existingEvent?.recurring) ? 'selected' : ''}>Каждый месяц</option>
              <option value="yearly" ${existingEvent?.recurring?.type === 'yearly' && !isCustomRecurring(existingEvent?.recurring) ? 'selected' : ''}>Каждый год</option>
              <option value="custom" ${isCustomRecurring(existingEvent?.recurring) ? 'selected' : ''}>Своё</option>
            </select>
          </label>
          <div class="event-recurring-custom" style="display:${isCustomRecurring(existingEvent?.recurring) ? 'flex' : 'none'}">
            <div class="event-field event-recurring-custom-row">
              <span>Каждые</span>
              <input type="number" name="recurringInterval" class="event-recurring-interval" min="1" value="${existingEvent?.recurring?.interval || 1}" />
              <select name="recurringUnit" class="event-recurring-unit">
                <option value="daily" ${existingEvent?.recurring?.type === 'daily' ? 'selected' : ''}>дней</option>
                <option value="weekly" ${existingEvent?.recurring?.type === 'weekly' ? 'selected' : ''}>недель</option>
                <option value="monthly" ${existingEvent?.recurring?.type === 'monthly' ? 'selected' : ''}>месяцев</option>
                <option value="yearly" ${existingEvent?.recurring?.type === 'yearly' ? 'selected' : ''}>лет</option>
              </select>
            </div>
            <label class="event-field">
              <span>Окончание</span>
              <input type="date" name="recurringEndDate" class="event-recurring-end-date" value="${existingEvent?.recurring?.endDate || ''}" />
            </label>
          </div>
        </div>
        <div class="event-actions">
          <button type="button" class="modal-close" id="cancel-event">Отмена</button>
          ${isEdit && !isCalDAV ? '<button type="button" class="btn-danger" id="delete-event">Удалить</button>' : ''}
          ${(isRecurring || isRecurringInstance) && !isCalDAV ? `<button type="button" class="btn-danger" id="delete-recurring-event">${isRecurringInstance ? 'Удалить все повторения' : 'Удалить повторяющиеся'}</button>` : ''}
          <button type="submit" class="btn-primary">${isEdit ? 'Сохранить' : 'Создать'}</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#cancel-event').addEventListener('click', close);
  
  if (isEdit && !isCalDAV) {
    const handleDelete = async (removeAll) => {
      const events = (widget.config.events || []).map(migrateEvent).filter(Boolean);
      let updated;
      if (removeAll) {
        const parentId = existingEvent.recurringParentId || existingEvent.id;
        updated = events.filter(ev =>
          !(ev.recurringParentId === parentId || ev.id === parentId)
        );
      } else {
        updated = events.filter(ev => ev.id !== existingEvent.id);
      }
      updateWidgetConfig(widget.id, { events: updated });
      close();
      renderWidgetGrid();
      showNotification('Событие удалено');
    };

    const deleteBtn = document.getElementById('delete-event');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        const ok = await showConfirm({
          title: 'Удалить событие?',
          message: `Событие "${initialTitle}" будет удалено. Это действие нельзя отменить.`,
          confirmText: 'Удалить',
          danger: true
        });
        if (ok) {
          if (isRecurring || isRecurringInstance) {
            const choice = await showRecurringDeleteChoice();
            if (!choice) return;
            await handleDelete(choice === 'all');
          } else {
            await handleDelete(false);
          }
        }
      });
    }

    const deleteRecurringBtn = document.getElementById('delete-recurring-event');
    if (deleteRecurringBtn) {
      deleteRecurringBtn.addEventListener('click', async () => {
        const choice = await showRecurringDeleteChoice();
        if (!choice) return;
        await handleDelete(choice === 'all');
      });
    }
  }

  // Toggle time input visibility based on "Весь день"
  const alldayCb = overlay.querySelector('.event-allday-input');
  const timeField = overlay.querySelector('.event-field-time');
  const endDateRow = document.getElementById('end-date-row');
  const colorPicker = overlay.querySelector('.event-color-picker');
  alldayCb.addEventListener('change', () => {
    timeField.hidden = alldayCb.checked;
    if (endDateRow) endDateRow.hidden = alldayCb.checked;
    if (colorPicker) colorPicker.hidden = !alldayCb.checked;
  });

  // Color swatch picker
  const swatches = overlay.querySelectorAll('.event-color-swatch');
  const colorInput = overlay.querySelector('input[name="color"]');
  swatches.forEach(sw => {
    sw.addEventListener('click', () => {
      swatches.forEach(s => s.classList.remove('is-selected'));
      sw.classList.add('is-selected');
      if (colorInput) colorInput.value = sw.dataset.color;
    });
  });

  // Toggle custom recurring fields
  const recurringTypeEl = overlay.querySelector('.event-recurring-type');
  const customBlock = overlay.querySelector('.event-recurring-custom');
  if (recurringTypeEl && customBlock) {
    const toggleCustom = () => {
      customBlock.style.display = recurringTypeEl.value === 'custom' ? 'flex' : 'none';
    };
    recurringTypeEl.addEventListener('change', toggleCustom);
  }

  overlay.querySelector('.event-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const title = form.title.value.trim();
    if (!title) {
      showNotification('Введите название события');
      return;
    }

    const startDateVal = form.date.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateVal)) {
      showNotification('Выберите дату начала');
      return;
    }
    const allDay = form.allday.checked;
    const startTimeVal = allDay ? '' : form.time.value;

    if (!allDay && startTimeVal) {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(startTimeVal)) {
        showNotification('Введите корректное время (формат HH:MM)');
        return;
      }
    }

    let endDateVal = startDateVal;
    let endTimeVal = startTimeVal;
    if (!allDay) {
      endDateVal = form.endDate.value || startDateVal;
      endTimeVal = form.endTime.value || startTimeVal;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endDateVal)) {
        showNotification('Введите корректную дату окончания');
        return;
      }
      if (endTimeVal) {
        if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(endTimeVal)) {
          showNotification('Введите корректное время окончания (формат HH:MM)');
          return;
        }
      }
    }

    const recurringType = form.recurringType?.value || 'none';
    let recurring;
    if (recurringType === 'custom') {
      recurring = {
        type: form.recurringUnit?.value || 'daily',
        interval: form.recurringInterval ? parseInt(form.recurringInterval.value) || 1 : 1,
        endDate: form.recurringEndDate?.value || null
      };
    } else if (recurringType !== 'none') {
      recurring = { type: recurringType, interval: 1 };
    } else {
      recurring = null;
    }
    const eventData = {
      id: existingEvent?.id || crypto.randomUUID(),
      title,
      date: startDateVal,
      time: startTimeVal || null,
      endDate: allDay ? null : endDateVal,
      endTime: allDay ? null : endTimeVal || null,
      source: existingEvent?.source || 'local',
      color: form.color?.value || null,
      recurring
    };

    const allEvents = (widget.config.events || []).map(migrateEvent).filter(Boolean);
    let updatedEvents = existingEvent
      ? allEvents.map(ev => ev.id === existingEvent.id ? eventData : ev)
      : [...allEvents, eventData];

    if (!existingEvent && eventData.recurring) {
      const recurringInstances = generateRecurringEvents(eventData, eventData.recurring);
      updatedEvents = [...updatedEvents, ...recurringInstances];
    }

    const [y, m, d] = startDateVal.split('-').map(Number);
    updateWidgetConfig(widget.id, {
      events: updatedEvents,
      selectedDay: d,
      viewYear: y,
      viewMonth: m - 1
    });
    close();
    renderWidgetGrid();
    showNotification(isEdit ? 'Событие обновлено' : 'Событие добавлено');
  });
}

function updateDateTime(el) {
  const now = new Date();
  const day = now.getDate().toString().padStart(2, '0');
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const year = now.getFullYear();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');

  const dateEl = el.querySelector('.date');
  const timeEl = el.querySelector('.time');
  if (dateEl) dateEl.textContent = `${day}.${month}.${year}`;
  if (timeEl) timeEl.textContent = `${hours}:${minutes}`;
}

async function fetchWeather(el, apiKey, city = 'Moscow') {
  const descEl = el.querySelector('.desc');
  const windEl = el.querySelector('.wind');
  const iconEl = el.querySelector('.weather-icon');
  try {
    const coords = city.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    const url = coords
      ? `https://api.openweathermap.org/data/2.5/weather?lat=${coords[1]}&lon=${coords[2]}&appid=${apiKey}&units=metric&lang=ru`
      : `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=ru`;

    const response = await fetch(url);

    if (response.status === 401) throw new Error('Неверный API ключ');
    if (response.status === 400 || response.status === 404) {
      throw new Error(coords ? `Координаты вне диапазона` : `Город «${city}» не найден`);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    el.querySelector('.temp').textContent = `${Math.round(data.main.temp)}°C`;
    descEl.textContent = data.weather[0].description;
    el.querySelector('.location').textContent = data.name;
    if (windEl) windEl.textContent = `${data.wind.speed.toFixed(1)} м/с`;
    if (iconEl) {
      const code = (data.weather[0].icon || '').slice(0, 2);
      const name = WEATHER_ICON_MAP[code] || 'cloud';
      iconEl.innerHTML = ICONS.btn(name);
      iconEl.dataset.icon = name;
    }

    // Fetch 5-day forecast
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${data.coord.lat}&lon=${data.coord.lon}&appid=${apiKey}&units=metric&lang=ru`;
    const forecastRes = await fetch(forecastUrl);
    if (!forecastRes.ok) throw new Error(`Forecast HTTP ${forecastRes.status}`);
    const forecastData = await forecastRes.json();
    renderForecast(el, forecastData);
  } catch (e) {
    descEl.textContent = `Ошибка: ${e.message}`;
  }
}

const DAY_NAMES_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function renderForecast(el, forecastData) {
  const forecastDays = el.querySelectorAll('.forecast-day');
  if (!forecastDays.length) return;

  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  })();

  const dayGroups = {};
  for (const entry of forecastData.list || []) {
    const d = new Date(entry.dt * 1000);
    const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!dayGroups[dayKey]) dayGroups[dayKey] = [];
    dayGroups[dayKey].push(entry);
  }

  const dayKeys = Object.keys(dayGroups).sort();
  let dayIdx = 0;

  for (const dayKey of dayKeys) {
    if (dayKey === todayKey) continue;
    if (dayIdx >= 3) break;

    const entries = dayGroups[dayKey];
    const entryDate = new Date(entries[0].dt * 1000);
    const dayEl = forecastDays[dayIdx];
    dayEl.querySelector('.forecast-day-name').textContent = DAY_NAMES_RU[entryDate.getDay()];

    // Pick entry closest to 12:00
    let best = entries[0];
    let bestDist = Infinity;
    for (const e of entries) {
      const h = new Date(e.dt * 1000).getHours();
      const dist = Math.abs(h - 12);
      if (dist < bestDist) { bestDist = dist; best = e; }
    }

    const code = (best.weather[0].icon || '').slice(0, 2);
    const iconName = WEATHER_ICON_MAP[code] || 'cloud';
    dayEl.querySelector('.forecast-icon').innerHTML = ICONS.btn(iconName);
    dayEl.querySelector('.forecast-temp').textContent = `${Math.round(best.main.temp)}°`;
    dayIdx++;
  }
}

const WEATHER_ICON_MAP = {
  '01': 'sun',        // clear sky
  '02': 'cloud_sun',  // few clouds
  '03': 'cloud',      // scattered clouds
  '04': 'cloud',      // broken clouds
  '09': 'cloud_rain', // shower rain
  '10': 'cloud_rain', // rain
  '11': 'cloud_lightning', // thunderstorm
  '13': 'cloud_snow', // snow
  '50': 'mist',       // mist
};

function setupAddWidgetListeners(container) {
  const emptyHint = container.querySelector('#add-widget-empty-hint');
  const menu = container.querySelector('#add-widget-menu');
  const closeBtn = container.querySelector('#close-menu');
  const addBtn = document.getElementById('add-widget');

  const showMenu = () => menu.style.display = 'flex';
  const hideMenu = () => menu.style.display = 'none';

  emptyHint?.addEventListener('click', showMenu);
  addBtn?.addEventListener('click', showMenu);
  closeBtn?.addEventListener('click', hideMenu);

  menu?.addEventListener('click', (e) => {
    if (e.target === menu) hideMenu();
  });

  menu?.querySelectorAll('.widget-options button').forEach(btn => {
    btn.addEventListener('click', () => {
      addWidget(btn.dataset.type);
      hideMenu();
    });
  });
}

// Widget column drag-and-drop
function setupWidgetColumnSortable() {
  if (typeof Sortable === 'undefined') return;

  const grid = document.getElementById('widget-grid');
  if (!grid) return;

  Object.keys(widgetSortableInstances).forEach(key => {
    widgetSortableInstances[key].destroy();
    delete widgetSortableInstances[key];
  });

  grid.querySelectorAll('.widget-column').forEach(col => {
    const colIdx = parseInt(col.dataset.column, 10);
    if (Number.isNaN(colIdx)) return;

    widgetSortableInstances[colIdx] = Sortable.create(col, {
      group: 'widget-columns',
      draggable: '.widget:not(.widget-pinned)',
      handle: '.widget-drag-handle',
      filter: '.edit-title-btn, .remove-widget-btn, .pin-widget-btn',
      preventOnFilter: true,
      animation: 150,
      ghostClass: 'widget-ghost',
      chosenClass: 'widget-chosen',
      dragClass: 'widget-drag',
      fallbackOnBody: true,
      emptyInsertThreshold: 16,
      onStart: () => setBookmarkSortablesDisabled(true),
      onEnd: () => {
        setBookmarkSortablesDisabled(false);
        persistWidgetLayoutFromGrid(grid);
      }
    });
  });
}

// Utility
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;')
             .replace(/"/g, '&quot;')
             .replace(/'/g, '&#039;');
}

// Background Settings
function showBackgroundSettings() {
  const workspace = getActiveWorkspace();
  if (!workspace) return;

  const bg = workspace.background || { type: 'color', value: '#1a1a2e' };

  const menu = document.createElement('div');
  menu.className = 'modal-overlay';
  menu.innerHTML = `
    <div class="modal">
      <h3>Настройка фона</h3>
      <div class="bg-options">
        <label>
          <input type="radio" name="bg-type" value="color" ${bg.type === 'color' ? 'checked' : ''} />
          Сплошной цвет
        </label>
        <input type="color" id="bg-color" value="${bg.type === 'color' ? bg.value : '#1a1a2e'}" />

        <label>
          <input type="radio" name="bg-type" value="gradient" ${bg.type === 'gradient' ? 'checked' : ''} />
          Градиент
        </label>
        <input type="text" id="bg-gradient" placeholder="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" value="${bg.type === 'gradient' ? bg.value : ''}" />

        <label>
          <input type="radio" name="bg-type" value="image" ${bg.type === 'image' ? 'checked' : ''} />
          Изображение
        </label>
        <input type="file" id="bg-image" accept="image/*" />
        ${bg.type === 'image' ? `<img src="${bg.value}" style="max-width: 100px; max-height: 100px;" />` : ''}
      </div>
      <button id="save-bg">Сохранить</button>
      <button class="modal-close" id="close-bg">Отмена</button>
    </div>
  `;

  document.body.appendChild(menu);

  menu.querySelector('#save-bg').addEventListener('click', async () => {
    const type = menu.querySelector('input[name="bg-type"]:checked').value;
    let value = '';

    if (type === 'color') {
      value = menu.querySelector('#bg-color').value;
    } else if (type === 'gradient') {
      value = menu.querySelector('#bg-gradient').value;
    } else if (type === 'image') {
      const fileInput = menu.querySelector('#bg-image');
      if (fileInput.files.length > 0) {
        value = await compressImage(fileInput.files[0]);
      } else {
        value = bg.value;
      }
    }

    await updateWorkspace(workspace.id, { background: { type, value } });
    menu.remove();
    renderWidgetGrid();
  });

  menu.querySelector('#close-bg').addEventListener('click', () => menu.remove());
  menu.addEventListener('click', (e) => { if (e.target === menu) menu.remove(); });
}

async function compressImage(file) {
  return new Promise((resolve) => {
    if (file.size <= 500 * 1024) {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      const maxDim = 1920;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = (height / width) * maxDim;
          width = maxDim;
        } else {
          width = (width / height) * maxDim;
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.8);
    };
    img.src = URL.createObjectURL(file);
  });
}

// Export/Import
function showExportImportMenu() {
  const menu = document.createElement('div');
  menu.className = 'modal-overlay';
  menu.innerHTML = `
    <div class="modal">
      <h3>Экспорт / Импорт</h3>
      <div class="export-options">
        <button id="export-plain">Экспорт (JSON)</button>
        <button id="export-encrypted">Экспорт с паролем</button>
        <button id="import-btn">Импорт</button>
        <input type="file" id="import-file" accept=".json" style="display: none;" />
      </div>
      <hr style="margin: 16px 0; border-color: var(--primary);" />
      <h4>Импорт из start.me</h4>
      <div class="export-options">
        <button id="import-bookmarks">📂 Импорт закладок (HTML)</button>
      </div>
      <hr style="margin: 16px 0; border-color: var(--primary);" />
      <h4>CalDAV Синхронизация</h4>
      <div class="caldav-options">
        <button id="caldav-settings">Настроить CalDAV</button>
      </div>
      <button class="modal-close" id="close-export">Закрыть</button>
    </div>
  `;

  document.body.appendChild(menu);

  menu.querySelector('#export-plain').addEventListener('click', async () => {
    const data = await exportData(false, null);
    downloadFile(data, 'ownspace-backup.json', 'application/json');
    menu.remove();
  });

  menu.querySelector('#export-encrypted').addEventListener('click', async () => {
    const password = await showPrompt({
      title: 'Шифрование резервной копии',
      message: 'Введите пароль. Запомните его — без него восстановить данные невозможно.',
      placeholder: 'Пароль',
      inputType: 'password',
      required: true,
      confirmText: 'Зашифровать'
    });
    if (!password) return;
    const data = await exportData(true, password);
    downloadFile(data, 'ownspace-backup-encrypted.json', 'application/json');
    menu.remove();
  });

  menu.querySelector('#import-btn').addEventListener('click', () => {
    menu.querySelector('#import-file').click();
  });

  menu.querySelector('#import-bookmarks').addEventListener('click', () => {
    console.log('[Import] Button clicked, showing bookmark import modal');
    menu.remove();
    showBookmarkImportModal();
  });

  menu.querySelector('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const looksEncrypted = event.target.result.trimStart().startsWith('{') &&
                               /"encrypted":\s*true/.test(event.target.result);
        let password = null;
        if (looksEncrypted) {
          password = await showPrompt({
            title: 'Файл зашифрован',
            message: 'Введите пароль для расшифровки:',
            inputType: 'password',
            confirmText: 'Расшифровать',
            required: true
          });
          if (password === null) return;
        }
        await importData(event.target.result, password);
        location.reload();
      } catch (err) {
        showNotification('Ошибка импорта: ' + err.message);
      }
    };
    reader.readAsText(file);
    menu.remove();
  });

  menu.querySelector('#close-export').addEventListener('click', () => menu.remove());
  menu.addEventListener('click', (e) => { if (e.target === menu) menu.remove(); });
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================
// CRYPTO (inlined — AES-GCM + PBKDF2)
// ============================================

async function deriveEncKey(password) {
  const enc = new TextEncoder();
  const salt = enc.encode('ownspace-encryption-v1');
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
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

async function encryptJson(data, password) {
  const enc = new TextEncoder();
  const key = await deriveEncKey(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(data))
  );
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) };
}

async function decryptJson(encryptedObj, password) {
  const dec = new TextDecoder();
  const key = await deriveEncKey(password);
  const iv = new Uint8Array(encryptedObj.iv);
  const data = new Uint8Array(encryptedObj.data);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return JSON.parse(dec.decode(decrypted));
}

async function sha256Hex(text) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================
// MASTER PASSWORD MANAGEMENT
// ============================================

let cachedMasterPassword = null;
let masterPasswordTimer = null;
const MASTER_PASSWORD_TTL_MS = 15 * 60 * 1000; // 15 минут неактивности

function cacheMasterPassword(pw) {
  cachedMasterPassword = pw;
  if (masterPasswordTimer) clearTimeout(masterPasswordTimer);
  masterPasswordTimer = setTimeout(() => {
    cachedMasterPassword = null;
    masterPasswordTimer = null;
    console.log('[MasterPassword] Cache expired');
  }, MASTER_PASSWORD_TTL_MS);
}

function clearMasterPasswordCache() {
  cachedMasterPassword = null;
  if (masterPasswordTimer) {
    clearTimeout(masterPasswordTimer);
    masterPasswordTimer = null;
  }
}

async function getMasterPasswordHash() {
  const s = await getSettings();
  return s.masterPasswordHash || '';
}

async function setMasterPasswordHash(hash) {
  const s = await getSettings();
  await saveSettings({ ...s, masterPasswordHash: hash });
}

// Modal: первичная установка мастер-пароля. Resolves to string | null.
function showSetupMasterPasswordModal() {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <h3>Создание мастер-пароля</h3>
        <p style="margin: 8px 0 16px; opacity: 0.8; font-size: 14px;">
          Мастер-пароль защищает учётные данные CalDAV. Если вы его забудете —
          восстановить пароль будет невозможно.
        </p>
        <div class="caldav-form">
          <label>Новый пароль:</label>
          <input type="password" id="mp-new" autocomplete="new-password" />

          <label>Повторите пароль:</label>
          <input type="password" id="mp-confirm" autocomplete="new-password" />

          <div id="mp-error" style="color: var(--accent); min-height: 1em; font-size: 13px;"></div>
        </div>
        <button id="mp-save">Создать</button>
        <button class="modal-close" id="mp-cancel">Отмена</button>
      </div>
    `;
    document.body.appendChild(modal);

    const errorEl = modal.querySelector('#mp-error');
    const newInput = modal.querySelector('#mp-new');
    const confirmInput = modal.querySelector('#mp-confirm');

    const cleanup = (result) => {
      modal.remove();
      resolve(result);
    };

    modal.querySelector('#mp-save').addEventListener('click', () => {
      const pw = newInput.value;
      const confirm = confirmInput.value;
      if (!pw || pw.length < 4) {
        errorEl.textContent = 'Минимум 4 символа';
        return;
      }
      if (pw !== confirm) {
        errorEl.textContent = 'Пароли не совпадают';
        return;
      }
      cleanup(pw);
    });

    modal.querySelector('#mp-cancel').addEventListener('click', () => cleanup(null));
    modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(null); });
    setTimeout(() => newInput.focus(), 50);
  });
}

// Modal: запрос существующего мастер-пароля с проверкой по хэшу. Resolves to string | null.
function showPromptMasterPasswordModal(initialMessage = '') {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <h3>Введите мастер-пароль</h3>
        <p style="margin: 8px 0 16px; opacity: 0.8; font-size: 14px;">
          Требуется для доступа к зашифрованным учётным данным CalDAV.
        </p>
        <div class="caldav-form">
          <input type="password" id="mp-prompt" autocomplete="current-password" />
          <div id="mp-error" style="color: var(--accent); min-height: 1em; font-size: 13px;">${escapeHtml(initialMessage)}</div>
        </div>
        <button id="mp-ok">Подтвердить</button>
        <button class="modal-close" id="mp-cancel">Отмена</button>
      </div>
    `;
    document.body.appendChild(modal);

    const input = modal.querySelector('#mp-prompt');

    const cleanup = (result) => {
      modal.remove();
      resolve(result);
    };

    const submit = () => {
      const pw = input.value;
      if (!pw) return;
      cleanup(pw);
    };

    modal.querySelector('#mp-ok').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    modal.querySelector('#mp-cancel').addEventListener('click', () => cleanup(null));
    modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(null); });
    setTimeout(() => input.focus(), 50);
  });
}

// High-level: возвращает мастер-пароль (из кэша или после ввода). null если отменено.
async function ensureMasterPassword() {
  if (cachedMasterPassword) {
    cacheMasterPassword(cachedMasterPassword); // refresh TTL
    return cachedMasterPassword;
  }

  const hash = await getMasterPasswordHash();
  if (!hash) {
    // Первичная установка
    const pw = await showSetupMasterPasswordModal();
    if (!pw) return null;
    const newHash = await sha256Hex(pw);
    await setMasterPasswordHash(newHash);
    cacheMasterPassword(pw);
    return pw;
  }

  // Запрос с проверкой
  let attempt = 0;
  let message = '';
  while (attempt < 3) {
    const pw = await showPromptMasterPasswordModal(message);
    if (pw === null) return null;
    const candidateHash = await sha256Hex(pw);
    if (candidateHash === hash) {
      cacheMasterPassword(pw);
      return pw;
    }
    attempt++;
    message = `Неверный пароль (попытка ${attempt}/3)`;
  }
  return null;
}

// Modal: смена мастер-пароля (с перешифровкой CalDAV creds).
function showChangeMasterPasswordModal() {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <h3>Сменить мастер-пароль</h3>
        <div class="caldav-form">
          <label>Текущий пароль:</label>
          <input type="password" id="mp-old" autocomplete="current-password" />

          <label>Новый пароль:</label>
          <input type="password" id="mp-new" autocomplete="new-password" />

          <label>Повторите новый пароль:</label>
          <input type="password" id="mp-confirm" autocomplete="new-password" />

          <div id="mp-error" style="color: var(--accent); min-height: 1em; font-size: 13px;"></div>
        </div>
        <button id="mp-change">Сменить</button>
        <button class="modal-close" id="mp-cancel">Отмена</button>
      </div>
    `;
    document.body.appendChild(modal);

    const errorEl = modal.querySelector('#mp-error');
    const oldInput = modal.querySelector('#mp-old');
    const newInput = modal.querySelector('#mp-new');
    const confirmInput = modal.querySelector('#mp-confirm');

    const cleanup = (result) => {
      modal.remove();
      resolve(result);
    };

    modal.querySelector('#mp-change').addEventListener('click', async () => {
      const oldPw = oldInput.value;
      const newPw = newInput.value;
      const confirm = confirmInput.value;

      if (!oldPw || !newPw) {
        errorEl.textContent = 'Заполните все поля';
        return;
      }
      if (newPw.length < 4) {
        errorEl.textContent = 'Новый пароль: минимум 4 символа';
        return;
      }
      if (newPw !== confirm) {
        errorEl.textContent = 'Новые пароли не совпадают';
        return;
      }

      const storedHash = await getMasterPasswordHash();
      const oldHash = await sha256Hex(oldPw);
      if (oldHash !== storedHash) {
        errorEl.textContent = 'Неверный текущий пароль';
        return;
      }

      // Перешифровать существующие CalDAV creds
      const stored = await getCalDAVCredentials();
      if (stored && stored.encryptedCreds) {
        try {
          const decrypted = await decryptJson(stored.encryptedCreds, oldPw);
          const reEncrypted = await encryptJson(decrypted, newPw);
          await saveCalDAVCredentials({ url: stored.url, encryptedCreds: reEncrypted });
        } catch (e) {
          errorEl.textContent = 'Не удалось перешифровать данные: ' + e.message;
          return;
        }
      }

      // Сохранить новый хэш
      const newHash = await sha256Hex(newPw);
      await setMasterPasswordHash(newHash);
      cacheMasterPassword(newPw);
      cleanup(true);
    });

    modal.querySelector('#mp-cancel').addEventListener('click', () => cleanup(false));
    modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(false); });
    setTimeout(() => oldInput.focus(), 50);
  });
}

// Загрузить CalDAV creds. Возвращает { url, username, password } | null.
// Делает миграцию старого btoa-формата в зашифрованный.
async function loadCalDAVCredentialsDecrypted() {
  const stored = await getCalDAVCredentials();
  if (!stored) return null;

  // Новый формат
  if (stored.encryptedCreds) {
    const pw = await ensureMasterPassword();
    if (!pw) return null;
    try {
      const decrypted = await decryptJson(stored.encryptedCreds, pw);
      return { url: stored.url, username: decrypted.username, password: decrypted.password };
    } catch (e) {
      console.error('[CalDAV] Decryption failed:', e);
      showNotification('Не удалось расшифровать CalDAV. Возможно, данные повреждены.');
      return null;
    }
  }

  // Старый формат btoa — миграция
  if (typeof stored.password === 'string') {
    let plainPassword;
    try {
      plainPassword = atob(stored.password);
    } catch {
      plainPassword = stored.password; // если не base64 — берём как есть
    }
    const username = stored.username || '';

    const pw = await ensureMasterPassword();
    if (pw) {
      try {
        const encryptedCreds = await encryptJson({ username, password: plainPassword }, pw);
        await saveCalDAVCredentials({ url: stored.url, encryptedCreds });
        console.log('[CalDAV] Migrated legacy credentials to encrypted format');
      } catch (e) {
        console.error('[CalDAV] Migration failed:', e);
      }
    }

    return { url: stored.url, username, password: plainPassword };
  }

  return null;
}

// ============================================
function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

async function syncCalDAVEvents(widgetId) {
  const workspace = getActiveWorkspace();
  const widget = workspace.widgets.find(w => w.id === widgetId);
  if (!widget || !widget.config.caldavCalendarHref) return false;

  const creds = await loadCalDAVCredentialsDecrypted();
  if (!creds) return false;

  try {
    const response = await browserMessaging.sendMessage({
      type: 'sync',
      payload: {
        url: creds.url,
        username: creds.username,
        password: creds.password,
        calendarUrl: widget.config.caldavCalendarHref
      }
    });

    if (!response || !response.success) {
      showNotification('CalDAV: ' + (response?.error || 'Ошибка синхронизации'));
      return false;
    }

    const remoteEvents = (response.result && response.result.events) || [];
    const localEvents = (widget.config.events || []).filter(e => e.source !== 'caldav');

    // Merge: CalDAV events replace by uid, add new ones
    const merged = [...localEvents];
    const seenUids = new Set();
    for (const e of remoteEvents) {
      if (e.uid && !seenUids.has(e.uid)) {
        seenUids.add(e.uid);
        merged.push({
          id: e.uid,
          title: e.title,
          date: e.date,
          time: e.time || (e.isAllDay ? undefined : undefined),
          source: 'caldav',
          uid: e.uid
        });
      }
    }

    updateWidgetConfig(widgetId, {
      events: merged,
      caldavLastSync: new Date().toISOString()
    });
    renderWidgetGrid();
    return true;
  } catch (e) {
    showNotification('CalDAV: ' + e.message);
    return false;
  }
}

async function showCalDAVCalendarPicker(widgetId) {
  const creds = await loadCalDAVCredentialsDecrypted();
  if (!creds) {
    showNotification('Сначала настройте CalDAV (Экспорт/Импорт → Настроить CalDAV)');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal caldav-picker-modal">
      <h3>Выберите календарь</h3>
      <p style="margin: 0 0 12px; opacity: 0.7; font-size: 13px;">Поиск календарей...</p>
    </div>
  `;
  document.body.appendChild(overlay);

  try {
    const response = await browserMessaging.sendMessage({
      type: 'test',
      payload: { url: creds.url, username: creds.username, password: creds.password }
    });

    let calendars = [];
    if (response && response.success) {
      calendars = response.result.calendars || [];
    }

    if (!calendars || calendars.length === 0) {
      // Fallback: PROPFIND discovery failed (common for Google Calendar, iCloud, etc.)
      // Let user enter calendar URL manually
      overlay.querySelector('.modal').innerHTML = `
        <h3>Введите URL календаря</h3>
        <p style="margin:0 0 8px;opacity:0.7;font-size:13px;">
          Сервер не поддерживает автоопределение календарей.
          Введите URL календаря вручную:
        </p>
        <input type="text" id="manual-calendar-url"
               placeholder="https://apidata.googleusercontent.com/caldav/v2/primary/events/"
               value="${escapeHtml(creds.url)}"
               style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);
                      color:var(--text);border-radius:var(--radius-sm);font:inherit;font-size:13px;" />
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button id="save-manual-calendar" style="flex:1;">Подключить</button>
          <button class="modal-close" style="flex:1;background:transparent;border:1px solid var(--border);">Отмена</button>
        </div>
      `;
      overlay.querySelector('#save-manual-calendar').addEventListener('click', async () => {
        const href = overlay.querySelector('#manual-calendar-url').value.trim();
        if (!href) return;
        const name = href.split('/').filter(Boolean).pop() || 'Календарь';
        updateWidgetConfig(widgetId, { caldavCalendarHref: href, caldavCalendarName: name });
        overlay.remove();
        showNotification(`CalDAV: подключен «${name}»`);
        await syncCalDAVEvents(widgetId);
      });
      overlay.querySelector('.modal-close')?.addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
      return;
    }

    overlay.querySelector('.modal').innerHTML = `
      <h3>Выберите календарь</h3>
      <div class="caldav-calendar-list">
        ${calendars.map((c, i) => `
          <button class="caldav-calendar-item" data-href="${escapeHtml(c.href)}" data-name="${escapeHtml(c.name)}">
            <span class="caldav-calendar-dot" style="background:hsl(${i * 137.508}, 60%, 60%)"></span>
            <span>${escapeHtml(c.name)}</span>
          </button>
        `).join('')}
      </div>
      <button class="modal-close" style="margin-top:12px;width:100%;background:transparent;border:1px solid var(--border);">Отмена</button>
    `;

    overlay.querySelectorAll('.caldav-calendar-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const href = btn.dataset.href;
        const name = btn.dataset.name;
        updateWidgetConfig(widgetId, { caldavCalendarHref: href, caldavCalendarName: name });
        overlay.remove();
        showNotification(`CalDAV: подключен «${name}»`);
        await syncCalDAVEvents(widgetId);
      });
    });
    overlay.querySelector('.modal-close')?.addEventListener('click', () => overlay.remove());
  } catch (e) {
    overlay.querySelector('.modal').innerHTML = `
      <h3>Ошибка</h3>
      <p>${e.message}</p>
      <button class="modal-close" style="margin-top:12px;width:100%;">Закрыть</button>
    `;
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
  }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// CalDAV Settings
// ============================================
async function showCalDAVSyncSettings() {
  // Загрузить (и при необходимости мигрировать) существующие creds
  const existing = await loadCalDAVCredentialsDecrypted();
  const hasMasterPassword = !!(await getMasterPasswordHash());

  const menu = document.createElement('div');
  menu.className = 'modal-overlay';
  menu.innerHTML = `
    <div class="modal">
      <h3>Настройка CalDAV</h3>
      <p style="margin: 0 0 12px; opacity: 0.7; font-size: 13px;">
        🔒 Учётные данные шифруются мастер-паролем (AES-GCM).
      </p>
      <div class="caldav-form">
        <label>URL сервера:</label>
        <input type="text" id="caldav-url" placeholder="https://caldav.example.com" value="${escapeHtml(existing?.url || '')}" />

        <label>Имя пользователя:</label>
        <input type="text" id="caldav-username" value="${escapeHtml(existing?.username || '')}" />

        <label>Пароль:</label>
        <input type="password" id="caldav-password" autocomplete="new-password" value="${escapeHtml(existing?.password || '')}" />

        <button id="caldav-test">Проверить подключение</button>
        <div id="caldav-status" style="min-height: 1em; font-size: 13px;"></div>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 12px;">
        <button id="save-caldav" style="flex: 1;">Сохранить</button>
        <button class="modal-close" id="close-caldav" style="flex: 1;">Отмена</button>
      </div>
      ${hasMasterPassword ? `
        <hr style="margin: 16px 0; border-color: var(--primary);" />
        <button id="change-master" style="width: 100%; background: transparent; border: 1px solid var(--primary);">
          🔑 Сменить мастер-пароль
        </button>
      ` : ''}
    </div>
  `;

  document.body.appendChild(menu);

  menu.querySelector('#caldav-test').addEventListener('click', async () => {
    const url = menu.querySelector('#caldav-url').value;
    const username = menu.querySelector('#caldav-username').value;
    const password = menu.querySelector('#caldav-password').value;
    const statusEl = menu.querySelector('#caldav-status');

    if (!url || !username || !password) {
      statusEl.textContent = 'Заполните все поля';
      statusEl.style.color = '';
      return;
    }

    statusEl.textContent = 'Проверка...';
    statusEl.style.color = '';

    try {
      const response = await browserMessaging.sendMessage({
        type: 'test',
        payload: { url, username, password }
      });

      if (response && response.success) {
        statusEl.textContent = 'Подключение успешно!';
        statusEl.style.color = '#4caf50';
      } else {
        statusEl.textContent = 'Ошибка: ' + (response?.error || 'Unknown');
        statusEl.style.color = 'var(--accent)';
      }
    } catch (err) {
      statusEl.textContent = 'Ошибка: ' + err.message;
      statusEl.style.color = 'var(--accent)';
    }
  });

  menu.querySelector('#save-caldav').addEventListener('click', async () => {
    const url = menu.querySelector('#caldav-url').value.trim();
    const username = menu.querySelector('#caldav-username').value;
    const password = menu.querySelector('#caldav-password').value;
    const statusEl = menu.querySelector('#caldav-status');

    if (!url || !username || !password) {
      statusEl.textContent = 'Заполните все поля';
      statusEl.style.color = 'var(--accent)';
      return;
    }

    // Получить мастер-пароль (запросит установку или ввод)
    const pw = await ensureMasterPassword();
    if (!pw) {
      statusEl.textContent = 'Сохранение отменено: требуется мастер-пароль';
      statusEl.style.color = 'var(--accent)';
      return;
    }

    try {
      const encryptedCreds = await encryptJson({ username, password }, pw);
      await saveCalDAVCredentials({ url, encryptedCreds });
      menu.remove();
      showNotification('CalDAV сохранён (зашифровано)');
    } catch (e) {
      statusEl.textContent = 'Ошибка шифрования: ' + e.message;
      statusEl.style.color = 'var(--accent)';
    }
  });

  const changeBtn = menu.querySelector('#change-master');
  if (changeBtn) {
    changeBtn.addEventListener('click', async () => {
      const ok = await showChangeMasterPasswordModal();
      if (ok) showNotification('Мастер-пароль изменён');
    });
  }

  menu.querySelector('#close-caldav').addEventListener('click', () => menu.remove());
  menu.addEventListener('click', (e) => { if (e.target === menu) menu.remove(); });
}

// Init
// Prevent double initialization
let appInitialized = false;

async function initApp() {
  if (appInitialized) return;
  appInitialized = true;
  
  console.log('OwnSpace initApp starting...');
  
  const app = document.getElementById('app');
  if (!app) {
    console.error('#app not found');
    return;
  }
  
  // Load settings
  const settings = await getSettings();
  state.theme = settings.theme || 'dark';
  applyTheme(state.theme);

  // Load workspaces
  await loadWorkspaces();
  console.log('Workspaces:', state.workspaces.length);
  
  syncStateToWindow();
  state.loading = false;

  // Render
  renderApp();
}

// Init when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
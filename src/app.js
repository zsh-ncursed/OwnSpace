// OwnSpace - Main Application (Vanilla JS)
// Inline utilities to avoid module issues

const STORAGE_KEYS = {
  WORKSPACES: 'workspaces',
  SETTINGS: 'settings',
  CALDAV: 'caldav'
};

const WIDGET_TYPES = {
  BOOKMARKS: 'bookmarks',
  NOTES: 'notes',
  DATE: 'date',
  WEATHER: 'weather',
  CALENDAR: 'calendar'
};

const THEME = {
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
  const defaultWorkspace = {
    id: crypto.randomUUID(),
    name: 'Добро пожаловать',
    background: { type: 'color', value: '#1a1a2e' },
    widgets: []
  };
  return result || [defaultWorkspace];
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

// Browser messaging for extension background page
const browserMessaging = {
  sendMessage: async (message) => {
    console.log('[MSG] Attempting to send message:', message.type);
    
    if (typeof browser !== 'undefined' && browser?.runtime?.sendMessage) {
      try {
        console.log('[MSG] Using browser.runtime.sendMessage');
        const result = await browser.runtime.sendMessage(message);
        console.log('[MSG] Received response:', JSON.stringify(result));
        return result;
      } catch (e) {
        console.log('[MSG] browser.runtime.sendMessage failed:', e.message);
      }
    } else {
      console.log('[MSG] browser.runtime not available');
    }
    
    // Mock fallback for testing
    if (message.type === 'test') {
      return { success: true, result: { events: [] } };
    }
    if (message.type === 'fetchTitle') {
      return { success: false, result: { title: null }, error: 'Not in extension context' };
    }
    return { success: true };
  }
};

// State
let state = {
  workspaces: [],
  activeWorkspaceId: null,
  theme: 'dark',
  loading: true
};

// Make state available globally for import scripts
window.state = state;

// Expose save and render functions for import scripts
window.saveAndRender = async () => {
  await saveWorkspaces(state.workspaces);
  render();
};

// Theme
function applyTheme(themeName) {
  const colors = THEME[themeName];
  document.documentElement.style.setProperty('--bg', colors.background);
  document.documentElement.style.setProperty('--surface', colors.surface);
  document.documentElement.style.setProperty('--primary', colors.primary);
  document.documentElement.style.setProperty('--accent', colors.accent);
  document.documentElement.style.setProperty('--text', colors.text);
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
  const ws = await getWorkspaces();
  state.workspaces = ws;
  if (ws.length > 0 && !state.activeWorkspaceId) {
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
  renderWorkspaceTabs();
  renderWidgetGrid();
}

async function updateWorkspace(id, updates) {
  const updated = state.workspaces.map(ws => ws.id === id ? { ...ws, ...updates } : ws);
  await saveWorkspaces(updated);
  state.workspaces = updated;
  renderWidgetGrid();
}

async function deleteWorkspace(id) {
  if (state.workspaces.length <= 1) return;
  const updated = state.workspaces.filter(ws => ws.id !== id);
  await saveWorkspaces(updated);
  state.workspaces = updated;
  if (state.activeWorkspaceId === id) {
    state.activeWorkspaceId = updated[0]?.id;
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

  const newWidget = {
    id: crypto.randomUUID(),
    type,
    order: workspace.widgets.length,
    config: getDefaultWidgetConfig(type)
  };

  updateWorkspace(workspace.id, {
    widgets: [...workspace.widgets, newWidget]
  });
}

function getDefaultWidgetConfig(type) {
  switch (type) {
    case WIDGET_TYPES.WEATHER: return { apiKey: '', title: 'Погода' };
    case WIDGET_TYPES.BOOKMARKS: return { bookmarks: [], title: 'Закладки' };
    case WIDGET_TYPES.CALENDAR: return { events: [], title: 'Календарь' };
    case WIDGET_TYPES.NOTES: return { content: '', title: 'Заметки' };
    case WIDGET_TYPES.DATE: return { title: 'Дата и время' };
    default: return {};
  }
}

function removeWidget(widgetId) {
  const workspace = getActiveWorkspace();
  if (!workspace) return;

  updateWorkspace(workspace.id, {
    widgets: workspace.widgets.filter(w => w.id !== widgetId)
  });
}

function updateWidgetConfig(widgetId, config) {
  const workspace = getActiveWorkspace();
  if (!workspace) return;

  updateWorkspace(workspace.id, {
    widgets: workspace.widgets.map(w => w.id === widgetId ? { ...w, config: { ...w.config, ...config } } : w)
  });
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
  if (!container) return;

  container.innerHTML = `
    <div class="tabs-container">
      <div class="tabs">
        ${state.workspaces.map(ws => `
          <button
            class="tab ${ws.id === state.activeWorkspaceId ? 'active' : ''}"
            data-workspace-id="${ws.id}"
          >${escapeHtml(ws.name)}</button>
        `).join('')}
        ${state.workspaces.length < 10 ? '<button class="tab tab-add" id="add-workspace">+</button>' : ''}
      </div>
      <div class="tab-actions">
        <button id="bg-settings" title="Настройка фона">🎨</button>
        <button id="theme-toggle" title="Переключить тему">${state.theme === 'dark' ? '☀️' : '🌙'}</button>
        <button id="export-import" title="Экспорт/Импорт">📤</button>
      </div>
    </div>
  `;

  // Event listeners
  container.querySelectorAll('.tab[data-workspace-id]').forEach(tab => {
    tab.addEventListener('click', () => {
      state.activeWorkspaceId = tab.dataset.workspaceId;
      renderWorkspaceTabs();
      renderWidgetGrid();
    });

    tab.addEventListener('dblclick', (e) => {
      const ws = state.workspaces.find(w => w.id === tab.dataset.workspaceId);
      if (ws) {
        const newName = prompt('Переименовать workspace:', ws.name);
        if (newName && newName.trim()) {
          updateWorkspace(ws.id, { name: newName.trim() });
        }
      }
    });

    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const ws = state.workspaces.find(w => w.id === tab.dataset.workspaceId);
      if (ws && state.workspaces.length > 1) {
        if (confirm(`Удалить "${ws.name}"?`)) {
          deleteWorkspace(ws.id);
        }
      }
    });
  });

  const addBtn = container.querySelector('#add-workspace');
  if (addBtn) {
    addBtn.addEventListener('click', addWorkspace);
  }

  container.querySelector('#bg-settings').addEventListener('click', showBackgroundSettings);
  container.querySelector('#theme-toggle').addEventListener('click', () => { toggleTheme(); renderWorkspaceTabs(); });
  container.querySelector('#export-import').addEventListener('click', () => {
    showExportImportMenu();
    // Add CalDAV button listener after menu is created
    setTimeout(() => {
      document.querySelector('#caldav-settings')?.addEventListener('click', showCalDAVSyncSettings);
    }, 100);
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

  const { widgets, background } = workspace;

  const gridStyle = {
    background: background.type === 'color' ? background.value :
               background.type === 'gradient' ? background.value :
               background.type === 'image' ? `url(${background.value})` : background.value,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  };

  container.style.cssText = `padding: 20px; min-height: calc(100vh - 60px); background: ${gridStyle.background}; background-size: ${gridStyle.backgroundSize}; background-position: ${gridStyle.backgroundPosition};`;

  if (widgets.length === 0) {
    container.innerHTML = `
      <button class="add-widget-btn" id="add-widget-empty">+ Добавить виджет</button>
      <div id="add-widget-menu" class="modal-overlay" style="display: none;">
        <div class="modal">
          <h3>Добавить виджет</h3>
          <div class="widget-options">
            <button data-type="bookmarks">Закладки</button>
            <button data-type="notes">Заметки</button>
            <button data-type="date">Дата и время</button>
            <button data-type="weather">Погода</button>
            <button data-type="calendar">Календарь</button>
          </div>
          <button class="modal-close" id="close-menu">Отмена</button>
        </div>
      </div>
    `;
    setupAddWidgetListeners(container);
    return;
  }

  container.innerHTML = `
    <div class="widget-grid">
      ${widgets.map(w => renderWidget(w)).join('')}
    </div>
    <button class="add-widget-btn" id="add-widget">+ Добавить виджет</button>
    <div id="add-widget-menu" class="modal-overlay" style="display: none;">
      <div class="modal">
        <h3>Добавить виджет</h3>
        <div class="widget-options">
          <button data-type="bookmarks">Закладки</button>
          <button data-type="notes">Заметки</button>
          <button data-type="date">Дата и время</button>
          <button data-type="weather">Погода</button>
          <button data-type="calendar">Календарь</button>
        </div>
        <button class="modal-close" id="close-menu">Отмена</button>
      </div>
    </div>
  `;

  setupWidgetListeners(container);
  setupAddWidgetListeners(container);
}

function renderWidget(widget) {
  const title = widget.config.title || getDefaultTitle(widget.type);

  return `
    <div class="widget" data-widget-id="${widget.id}">
      <div class="widget-header">
        <span class="widget-title">${escapeHtml(title)}</span>
        <div class="widget-actions">
          <button class="edit-title-btn" title="Переименовать">✏️</button>
          <button class="remove-widget-btn" title="Удалить">X</button>
        </div>
      </div>
      <div class="widget-content">${renderWidgetContent(widget)}</div>
    </div>
  `;
}

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
    default:
      return '<div>Unknown widget</div>';
  }
}

// Widget Renderers
function renderBookmarksWidget(widget) {
  const bookmarks = widget.config.bookmarks || [];
  return `
    <div class="bookmarks-widget" data-widget-id="${widget.id}">
      <div class="add-bookmark">
        <input type="text" placeholder="Введите URL..." class="new-url-input" />
        <button class="add-bookmark-btn">+</button>
      </div>
      <div class="bookmarks-list">
        ${bookmarks.map(bm => `
          <div class="bookmark-item" data-bookmark-id="${bm.id}">
            ${bm.favicon ? `<img src="${bm.favicon}" class="favicon" alt="" />` : ''}
            <input type="text" class="title-input" value="${escapeHtml(bm.title)}" style="display: none;" />
            <a href="${escapeHtml(bm.url)}" target="_blank" class="bookmark-title">${escapeHtml(bm.title)}</a>
            <button class="edit-btn">✏️</button>
            <button class="delete-btn">X</button>
          </div>
        `).join('')}
      </div>
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

function renderWeatherWidget(widget) {
  if (!widget.config.apiKey) {
    return `
      <div class="weather-widget">
        <p>Введите API ключ OpenWeather:</p>
        <input type="text" placeholder="API ключ" class="api-key-input" />
        <a href="https://openweathermap.org/api" target="_blank">Получить ключ</a>
      </div>
    `;
  }
  return `
    <div class="weather-widget" data-widget-id="${widget.id}">
      <div class="weather-content">
        <div class="temp">--°C</div>
        <div class="desc">Загрузка...</div>
        <div class="location">Moscow</div>
      </div>
      <button class="change-key-btn">Изменить ключ</button>
    </div>
  `;
}

function renderCalendarWidget(widget) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthName = now.toLocaleString('ru', { month: 'long' });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const events = widget.config.events || [];

  return `
    <div class="calendar-widget" data-widget-id="${widget.id}">
      <div class="calendar-nav">
        <button class="prev-month">&lt;</button>
        <span>${monthName} ${year}</span>
        <button class="next-month">&gt;</button>
      </div>
      <div class="calendar-grid">
        ${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => `<div class="calendar-header">${d}</div>`).join('')}
        ${days.map((day, i) => `
          <div class="calendar-day ${day ? '' : 'empty'}" data-day="${day}">
            ${day || ''}
          </div>
        `).join('')}
      </div>
      <button class="add-event-btn">+ Добавить событие</button>
      <div class="events-list" style="display: none;">
        <h4>События</h4>
        <ul></ul>
      </div>
    </div>
  `;
}

// Event Setup
function setupWidgetListeners(container) {
  // Remove widget
  container.querySelectorAll('.remove-widget-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const widgetEl = e.target.closest('.widget');
      const widgetId = widgetEl.dataset.widgetId;
      removeWidget(widgetId);
    });
  });

  // Edit title
  container.querySelectorAll('.edit-title-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const widgetEl = e.target.closest('.widget');
      const widgetId = widgetEl.dataset.widgetId;
      const workspace = getActiveWorkspace();
      const widget = workspace.widgets.find(w => w.id === widgetId);
      if (widget) {
        const newTitle = prompt('Переименовать виджет:', widget.config.title || getDefaultTitle(widget.type));
        if (newTitle) {
          updateWidgetConfig(widgetId, { title: newTitle });
        }
      }
    });
  });

  // Bookmarks
  container.querySelectorAll('.bookmarks-widget').forEach(el => {
    const widgetId = el.dataset.widgetId;

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
        alert('Неверный URL');
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

      item.querySelector('.edit-btn').addEventListener('click', () => {
        const titleInput = item.querySelector('.title-input');
        const link = item.querySelector('.bookmark-title');

        if (titleInput.style.display === 'none') {
          titleInput.style.display = 'block';
          link.style.display = 'none';
          titleInput.focus();
        } else {
          const newTitle = titleInput.value;
          const workspace = getActiveWorkspace();
          const widget = workspace.widgets.find(w => w.id === widgetId);
          const bookmarks = widget.config.bookmarks.map(b => b.id === bmId ? { ...b, title: newTitle } : b);
          updateWidgetConfig(widgetId, { bookmarks });
        }
      });

      item.querySelector('.title-input').addEventListener('blur', () => {
        const newTitle = item.querySelector('.title-input').value;
        const workspace = getActiveWorkspace();
        const widget = workspace.widgets.find(w => w.id === widgetId);
        const bookmarks = widget.config.bookmarks.map(b => b.id === bmId ? { ...b, title: newTitle } : b);
        updateWidgetConfig(widgetId, { bookmarks });
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
        updateWidgetConfig(widgetId, { content: textarea.value });
      }, 500);
    });
  });

  // DateTime - update every second
  container.querySelectorAll('.datetime-widget').forEach(el => {
    updateDateTime(el);
    setInterval(() => updateDateTime(el), 1000);
  });

  // Weather
  container.querySelectorAll('.weather-widget').forEach(el => {
    const widgetId = el.dataset.widgetId;
    const workspace = getActiveWorkspace();
    const widget = workspace.widgets.find(w => w.id === widgetId);

    if (widget && widget.config.apiKey) {
      fetchWeather(el, widget.config.apiKey);
    }

    el.querySelector('.change-key-btn')?.addEventListener('click', () => {
      updateWidgetConfig(widgetId, { apiKey: '' });
    });
  });

  // Calendar
  container.querySelectorAll('.calendar-widget').forEach(el => {
    const widgetId = el.dataset.widgetId;
    // Calendar event handling would go here
  });
}

function updateDateTime(el) {
  const now = new Date();
  const day = now.getDate().toString().padStart(2, '0');
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const year = now.getFullYear();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');

  const dateEl = el.querySelector('.date');
  const timeEl = el.querySelector('.time');
  if (dateEl) dateEl.textContent = `${day}.${month}.${year}`;
  if (timeEl) timeEl.textContent = `${hours}:${minutes}:${seconds}`;
}

async function fetchWeather(el, apiKey) {
  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=Moscow&appid=${apiKey}&units=metric&lang=ru`
    );

    if (!response.ok) throw new Error('Invalid API key');

    const data = await response.json();
    el.querySelector('.temp').textContent = `${Math.round(data.main.temp)}°C`;
    el.querySelector('.desc').textContent = data.weather[0].description;
    el.querySelector('.location').textContent = data.name;
  } catch (e) {
    el.querySelector('.desc').textContent = `Ошибка: ${e.message}`;
  }
}

function setupAddWidgetListeners(container) {
  const emptyBtn = container.querySelector('#add-widget-empty');
  const addBtn = container.querySelector('#add-widget');
  const menu = container.querySelector('#add-widget-menu');
  const closeBtn = container.querySelector('#close-menu');

  const showMenu = () => menu.style.display = 'flex';
  const hideMenu = () => menu.style.display = 'none';

  emptyBtn?.addEventListener('click', showMenu);
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
    const { exportData } = await import('./utils/storage.js');
    const data = await exportData(false, null);
    downloadFile(data, 'ownspace-backup.json', 'application/json');
    menu.remove();
  });

  menu.querySelector('#export-encrypted').addEventListener('click', async () => {
    const password = prompt('Введите пароль для шифрования:');
    if (!password) return;
    const { exportData } = await import('./utils/storage.js');
    const data = await exportData(true, password);
    downloadFile(data, 'ownspace-backup-encrypted.json', 'application/json');
    menu.remove();
  });

  menu.querySelector('#import-btn').addEventListener('click', () => {
    menu.querySelector('#import-file').click();
  });

  menu.querySelector('#import-bookmarks').addEventListener('click', () => {
    console.log('[Import] Button clicked');
    menu.remove();
    // Load import scripts and show modal
    const loadScripts = () => {
      console.log('[Import] Loading parser from ./src/utils/import/startme-parser.js');
      const script1 = document.createElement('script');
      script1.src = './src/utils/import/startme-parser.js';
      script1.onload = () => {
        console.log('[Import] Parser loaded');
        console.log('[Import] Loading importer from ./src/utils/import/importer.js');
        const script2 = document.createElement('script');
        script2.src = './src/utils/import/importer.js';
        script2.onload = () => {
          console.log('[Import] Importer script onload fired');
          // Directly try to access the functions via eval
          try {
            const fn = eval('showImportModal');
            console.log('[Import] eval(showImportModal):', typeof fn);
            if (typeof fn === 'function') {
              fn();
              return;
            }
          } catch (e) {
            console.log('[Import] eval failed:', e.message);
          }
          // Try BookmarkImporter
          try {
            const bi = eval('window.BookmarkImporter');
            console.log('[Import] eval(window.BookmarkImporter):', typeof bi, bi);
            if (bi && bi.showImportModal) {
              bi.showImportModal();
              return;
            }
          } catch (e) {
            console.log('[Import] eval BookmarkImporter failed:', e.message);
          }
          // Use Function constructor
          try {
            const script = document.createElement('script');
            script.textContent = `
              console.log('[Import] Inline check - window.BookmarkImporter:', typeof window.BookmarkImporter);
              if (window.BookmarkImporter && window.BookmarkImporter.showImportModal) {
                console.log('[Import] Calling via inline script');
                window.BookmarkImporter.showImportModal();
              } else {
                console.log('[Import] No BookmarkImporter in inline');
              }
            `;
            document.head.appendChild(script);
            script.remove();
          } catch (e) {
            console.error('[Import] Inline script failed:', e);
          }
        };
        script2.onerror = (e) => console.error('[Import] Importer error:', e);
        document.head.appendChild(script2);
      };
      script1.onerror = (e) => {
        console.error('[Import] Parser error:', e);
        alert('[DEBUG] Parser load error: ' + e.target.src);
      };
      document.head.appendChild(script1);
    };
    
    if (typeof window.BookmarkImporter !== 'undefined' && window.BookmarkImporter) {
      console.log('[Import] Already loaded, calling showImportModal');
      window.BookmarkImporter.showImportModal();
    } else {
      console.log('[Import] Scripts not loaded, loading now');
      loadScripts();
    }
  });

  menu.querySelector('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const password = confirm('Файл зашифрован?') ? prompt('Введите пароль:') : null;
        const { importData } = await import('./utils/storage.js');
        await importData(event.target.result, password);
        location.reload();
      } catch (err) {
        alert('Ошибка импорта: ' + err.message);
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

// CalDAV Settings
function showCalDAVSyncSettings() {
  const menu = document.createElement('div');
  menu.className = 'modal-overlay';
  menu.innerHTML = `
    <div class="modal">
      <h3>Настройка CalDAV</h3>
      <div class="caldav-form">
        <label>URL сервера:</label>
        <input type="text" id="caldav-url" placeholder="https://caldav.example.com" />

        <label>Имя пользователя:</label>
        <input type="text" id="caldav-username" />

        <label>Пароль:</label>
        <input type="password" id="caldav-password" />

        <button id="caldav-test">Проверить подключение</button>
        <div id="caldav-status"></div>
      </div>
      <button id="save-caldav">Сохранить</button>
      <button class="modal-close" id="close-caldav">Отмена</button>
    </div>
  `;

  document.body.appendChild(menu);

  menu.querySelector('#caldav-test').addEventListener('click', async () => {
    const url = menu.querySelector('#caldav-url').value;
    const username = menu.querySelector('#caldav-username').value;
    const password = menu.querySelector('#caldav-password').value;

    if (!url || !username || !password) {
      menu.querySelector('#caldav-status').textContent = 'Заполните все поля';
      return;
    }

    menu.querySelector('#caldav-status').textContent = 'Проверка...';

    try {
      const response = await browserMessaging.sendMessage({
        type: 'test',
        payload: { url, username, password }
      });

      if (response && response.success) {
        menu.querySelector('#caldav-status').textContent = 'Подключение успешно!';
        menu.querySelector('#caldav-status').style.color = 'green';
      } else {
        menu.querySelector('#caldav-status').textContent = 'Ошибка: ' + (response?.error || 'Unknown');
        menu.querySelector('#caldav-status').style.color = 'red';
      }
    } catch (err) {
      menu.querySelector('#caldav-status').textContent = 'Ошибка: ' + err.message;
      menu.querySelector('#caldav-status').style.color = 'red';
    }
  });

  menu.querySelector('#save-caldav').addEventListener('click', async () => {
    const url = menu.querySelector('#caldav-url').value;
    const username = menu.querySelector('#caldav-username').value;
    const password = menu.querySelector('#caldav-password').value;

    if (!url || !username || !password) {
      alert('Заполните все поля');
      return;
    }

    // Save encrypted credentials would go here
    // For now, just save to storage (not recommended for production)
    const { saveCalDAVCredentials } = await import('./utils/storage.js');
    await saveCalDAVCredentials({ url, username, password: btoa(password) });

    menu.remove();
  });

  menu.querySelector('#close-caldav').addEventListener('click', () => menu.remove());
  menu.addEventListener('click', (e) => { if (e.target === menu) menu.remove(); });
}

// Init
async function initApp() {
  // Load settings
  const settings = await getSettings();
  state.theme = settings.theme || 'dark';
  applyTheme(state.theme);

  // Load workspaces
  await loadWorkspaces();
  state.loading = false;

  // Render
  renderApp();
}

// Auto-init when loaded as content script
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
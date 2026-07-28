// OwnSpace — Options page

const STORAGE_KEY = 'extensionSettings';
const APP_SETTINGS_KEY = 'settings';

// Keep in sync with registry.js registered plugins
const BUILTIN_WIDGETS = [
  { type: 'bookmarks', title: 'Закладки' },
  { type: 'notes', title: 'Заметки' },
  { type: 'date', title: 'Дата и время' },
  { type: 'weather', title: 'Погода' },
  { type: 'calendar', title: 'Календарь' },
  { type: 'todo', title: 'Список задач' },
];

const DEFAULTS = {
  openInNewTabs: true,
  pinOwnSpaceTab: false,
};

async function loadSettings() {
  const result = await browser.storage.local.get(STORAGE_KEY);
  return { ...DEFAULTS, ...(result[STORAGE_KEY] || {}) };
}

async function saveSettings(settings) {
  await browser.storage.local.set({ [STORAGE_KEY]: settings });
}

async function loadAppSettings() {
  const result = await browser.storage.local.get(APP_SETTINGS_KEY);
  return result[APP_SETTINGS_KEY] || { theme: 'dark' };
}

async function saveAppSettings(appSettings) {
  await browser.storage.local.set({ [APP_SETTINGS_KEY]: appSettings });
}

let saveTimer = null;

function showSaved() {
  const el = document.getElementById('saveStatus');
  el.textContent = '✓ Сохранено';
  el.classList.add('visible');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => el.classList.remove('visible'), 1500);
}

async function initWidgetToggles(appSettings) {
  const container = document.getElementById('widgetToggles');
  const enabled = appSettings.enabledWidgets || BUILTIN_WIDGETS.map((w) => w.type);

  BUILTIN_WIDGETS.forEach((w) => {
    const label = document.createElement('label');
    label.className = 'option';
    label.innerHTML = `
      <input type="checkbox" data-widget-type="${w.type}" ${enabled.includes(w.type) ? 'checked' : ''}>
      <span class="check-box" aria-hidden="true"></span>
      <div class="option-body">
        <div class="option-title">${w.title}</div>
      </div>
    `;
    const checkbox = label.querySelector('input');
    checkbox.addEventListener('change', async () => {
      let list = appSettings.enabledWidgets || BUILTIN_WIDGETS.map((x) => x.type);
      if (checkbox.checked) {
        if (!list.includes(w.type)) list.push(w.type);
      } else {
        list = list.filter((t) => t !== w.type);
      }
      appSettings.enabledWidgets = list;
      await saveAppSettings(appSettings);
      showSaved();
    });
    container.appendChild(label);
  });
}

async function init() {
  const settings = await loadSettings();
  const appSettings = await loadAppSettings();

  const cb1 = document.getElementById('openInNewTabs');
  const cb2 = document.getElementById('pinOwnSpaceTab');

  cb1.checked = settings.openInNewTabs;
  cb2.checked = settings.pinOwnSpaceTab;

  cb1.addEventListener('change', async () => {
    settings.openInNewTabs = cb1.checked;
    await saveSettings(settings);
    showSaved();
  });

  cb2.addEventListener('change', async () => {
    settings.pinOwnSpaceTab = cb2.checked;
    await saveSettings(settings);
    showSaved();
    if (cb2.checked) {
      try {
        await browser.runtime.sendMessage({ type: 'PIN_TAB_NOW' });
      } catch (e) {
        console.warn('OwnSpace: could not send PIN_TAB_NOW', e);
      }
    }
  });

  initWidgetToggles(appSettings);
}

init();

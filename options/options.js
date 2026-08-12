import { initLocale, t, getLang } from '../src/i18n/index.js';

const STORAGE_KEY = 'extensionSettings';
const APP_SETTINGS_KEY = 'settings';

const BUILTIN_WIDGET_TYPES = [
  'bookmarks',
  'notes',
  'date',
  'weather',
  'calendar',
  'todo',
  'calculator',
  'currency',
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
  el.textContent = t('options.saved');
  el.classList.add('visible');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => el.classList.remove('visible'), 1500);
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
}

async function initWidgetToggles(appSettings) {
  const container = document.getElementById('widgetToggles');
  const enabled = appSettings.enabledWidgets || BUILTIN_WIDGET_TYPES;

  for (const type of BUILTIN_WIDGET_TYPES) {
    const label = document.createElement('label');
    label.className = 'option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.widgetType = type;
    if (enabled.includes(type)) checkbox.checked = true;
    const box = document.createElement('span');
    box.className = 'check-box';
    box.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    body.className = 'option-body';
    const title = document.createElement('div');
    title.className = 'option-title';
    const i18nType = type === 'date' ? 'datetime' : type;
    title.textContent = t('widget.' + i18nType + '.title');
    body.appendChild(title);
    label.appendChild(checkbox);
    label.appendChild(box);
    label.appendChild(body);
    checkbox.addEventListener('change', async () => {
      let list = appSettings.enabledWidgets || [...BUILTIN_WIDGET_TYPES];
      if (checkbox.checked) {
        if (!list.includes(type)) list.push(type);
      } else {
        list = list.filter((t) => t !== type);
      }
      appSettings.enabledWidgets = list;
      await saveAppSettings(appSettings);
      showSaved();
    });
    container.appendChild(label);
  }
}

async function init() {
  await initLocale();
  applyI18n();

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

  const langSelect = document.getElementById('languageSelect');
  langSelect.value = getLang();
  langSelect.addEventListener('change', async () => {
    appSettings.language = langSelect.value;
    await saveAppSettings(appSettings);
    showSaved();
  });

  initWidgetToggles(appSettings);
}

init().catch((e) => {
  console.error('OwnSpace options init failed:', e);
  document.body.insertAdjacentHTML('beforeend',
    `<pre style="color:#c00;padding:1em">Init error: ${e.message}\n${e.stack}</pre>`);
});
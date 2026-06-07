// OwnSpace — Options page
// Loads/saves extension-level settings (separate from app.settings).

const STORAGE_KEY = 'extensionSettings';

const DEFAULTS = {
  openInNewTabs: true,
  pinOwnSpaceTab: false
};

async function loadSettings() {
  const result = await browser.storage.local.get(STORAGE_KEY);
  return { ...DEFAULTS, ...(result[STORAGE_KEY] || {}) };
}

async function saveSettings(settings) {
  await browser.storage.local.set({ [STORAGE_KEY]: settings });
}

let saveTimer = null;

function showSaved() {
  const el = document.getElementById('saveStatus');
  el.textContent = '✓ Сохранено';
  el.classList.add('visible');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => el.classList.remove('visible'), 1500);
}

async function init() {
  const settings = await loadSettings();

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
  });
}

init();

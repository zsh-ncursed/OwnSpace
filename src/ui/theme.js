import { state } from '../state.js';
import { getSettings, saveSettings } from '../storage.js';

export function applyTheme(themeName) {
  document.documentElement.dataset.theme = themeName;
  document.documentElement.style.colorScheme =
    themeName === 'light' ? 'light' : 'dark';
}

export async function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(state.theme);
  const settings = await getSettings();
  await saveSettings({ ...settings, theme: state.theme });
}

export async function loadTheme() {
  const settings = await getSettings();
  state.theme = settings.theme || 'dark';
  applyTheme(state.theme);
}

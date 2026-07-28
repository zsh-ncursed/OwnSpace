import { state, syncStateToWindow } from './state.js';
import { loadTheme } from './ui/theme.js';
import { loadWorkspaces } from './workspaces.js';
import { renderApp } from './render/tabs.js';
import { getSettings } from './storage.js';

import './render/listeners.js';
import './widgets/event-modal.js';

window.state = state;
window._bookmarkExpanded = {};
window._pluginSettings = {};

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

  await loadTheme();
  await loadWorkspaces();
  window._pluginSettings = await getSettings();
  console.log('Workspaces:', state.workspaces.length);

  syncStateToWindow();
  state.loading = false;

  renderApp();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

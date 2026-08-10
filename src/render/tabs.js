import { state } from '../state.js';
import { saveWorkspaces, saveActiveWorkspaceId } from '../storage.js';
import { escapeHtml } from '../ui/escape.js';
import { toggleTheme } from '../ui/theme.js';
import { renderWidgetGrid } from './grid.js';
import { addWorkspace, updateWorkspace } from '../workspaces.js';
import { showExportImportMenu } from '../ui/export-import-menu.js';
import { showBackgroundSettings } from '../ui/background-settings.js';
import {
  ENGINES,
  getEngineKeys,
  buildSearchUrl,
  setSearchEngine,
  fetchSuggestions,
  DEFAULT_ENGINE,
} from '../search/search.js';
import { t } from '../i18n/index.js';

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

window._renderApp = renderApp;

function renderWorkspaceTabs() {
  const container = document.getElementById('workspace-tabs');
  if (!container) {
    console.error('workspace-tabs container not found');
    return;
  }

  if (state.workspaces.length === 0) {
    console.warn(
      '[Tabs] state.workspaces is empty — this should not happen',
    );
    return;
  }

  const searchEngine = state._searchEngine || DEFAULT_ENGINE;
  const engineIcon = ENGINES[searchEngine]?.icon || ENGINES[DEFAULT_ENGINE].icon;
  const engineTitle = t(ENGINES[searchEngine]?.nameKey || ENGINES[DEFAULT_ENGINE].nameKey);
  const enginePickerItems = getEngineKeys()
    .map(
      (key) =>
        `<li><button type="button" class="search-engine-item" data-engine="${key}" title="${t(ENGINES[key].nameKey)}" aria-label="${t(ENGINES[key].nameKey)}">${ENGINES[key].icon}<span class="search-engine-name">${t(ENGINES[key].nameKey)}</span></button></li>`,
    )
    .join('');

  container.innerHTML = `
    <div class="workspace-tabs-bar">
      <div class="workspace-tabs-list" id="workspace-tabs-list">
        ${state.workspaces
          .map(
            (ws) => `
          <div
            class="workspace-tab ${ws.id === state.activeWorkspaceId ? 'is-active' : ''}"
            data-workspace-id="${ws.id}"
            title="${t('tab.double_click_rename')}"
          >
            <span class="workspace-tab-grip" aria-hidden="true">${ICONS.action('grip-vertical')}</span>
            <span class="workspace-tab-name" data-role="display">${escapeHtml(ws.name)}</span>
            <input type="text" class="workspace-tab-name-input" data-role="input" value="${escapeHtml(ws.name)}" maxlength="40" style="display: none;" />
            <div class="workspace-tab-actions">
              <button type="button" class="workspace-tab-delete icon-btn" title="${t('common.delete')}" aria-label="${t('common.delete')}">${ICONS.action('x')}</button>
            </div>
          </div>
        `,
          )
          .join('')}
        ${state.workspaces.length < 10 ? `<button type="button" class="workspace-tab workspace-tab-add icon-btn" id="add-workspace" title="${t('tab.new_tab')}" aria-label="${t('tab.new_tab')}">${ICONS.btn('plus')}</button>` : ''}
      </div>
      <div class="workspace-search" id="workspace-search">
        <button type="button" id="search-toggle" class="search-toggle icon-btn" title="${t('search.placeholder')}" aria-label="${t('search.placeholder')}" aria-expanded="false">${ICONS.btn('search')}</button>
        <div class="search-panel" id="search-panel">
          <div class="search-input-wrap">
            <button type="button" id="search-engine-btn" class="search-engine-btn" title="${engineTitle}" aria-label="${t('search.engine_label')}">${engineIcon}<span class="search-engine-caret" aria-hidden="true">${ICONS.action('chevron-down')}</span></button>
            <input type="text" id="search-input" class="search-input" placeholder="${t('search.placeholder')}" autocomplete="off" spellcheck="false" />
            <ul class="search-suggestions" id="search-suggestions" hidden></ul>
            <ul class="search-engine-picker" id="search-engine-picker" hidden>
              ${enginePickerItems}
            </ul>
          </div>
        </div>
      </div>
      <div class="workspace-tabs-toolbar">
        <button type="button" class="icon-btn" id="add-widget" title="${t('tab.add_widget')}" aria-label="${t('tab.add_widget')}">${ICONS.btn('plus')}</button>
        <button type="button" class="icon-btn" id="bg-settings" title="${t('tab.bg_settings')}">${ICONS.btn('palette')}</button>
        <button type="button" class="icon-btn" id="theme-toggle" title="${t('tab.theme_toggle')}">${ICONS.btn(state.theme === 'dark' ? 'sun' : 'moon')}</button>
        <button type="button" class="icon-btn" id="export-import" title="${t('tab.export_import')}">${ICONS.btn('arrow-down-up')}</button>
      </div>
    </div>
  `;

  container
    .querySelectorAll('.workspace-tab[data-workspace-id]')
    .forEach((tab) => {
      tab.addEventListener('click', (e) => {
        if (
          e.target.closest('.workspace-tab-actions') ||
          e.target.closest('.workspace-tab-name-input')
        )
          return;
        state.activeWorkspaceId = tab.dataset.workspaceId;
        saveActiveWorkspaceId(state.activeWorkspaceId);
        updateActiveWorkspaceTab();
        renderWidgetGrid();
      });

      const nameEl = tab.querySelector('[data-role="display"]');
      nameEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        enterTabRenameMode(tab);
      });
    });

  setupWorkspaceTabsSortable();
  setupToolbarButtons();
  setupSearchBar();
}

function updateActiveWorkspaceTab() {
  const container = document.getElementById('workspace-tabs');
  if (!container) return;
  container.querySelectorAll('.workspace-tab').forEach((tab) => {
    const name = tab.querySelector('[data-role="display"]');
    const input = tab.querySelector('[data-role="input"]');
    const isActive = tab.dataset.workspaceId === state.activeWorkspaceId;
    tab.classList.toggle('is-active', isActive);
    if (name) name.style.display = input.style.display === '' ? 'none' : '';
    if (input) input.style.display = 'none';
  });
}

function enterTabRenameMode(tab) {
  const name = tab.querySelector('[data-role="display"]');
  const input = tab.querySelector('[data-role="input"]');
  const wsId = tab.dataset.workspaceId;
  const workspace = state.workspaces.find((ws) => ws.id === wsId);
  if (!workspace) return;

  name.style.display = 'none';
  input.style.display = '';
  input.value = workspace.name;
  input.focus();
  input.select();

  const commit = async () => {
    const newName = input.value.trim() || workspace.name;
    name.textContent = newName;
    name.style.display = '';
    input.style.display = 'none';
    if (newName !== workspace.name) {
      await updateWorkspace(wsId, { name: newName });
    }
  };

  const cancel = () => {
    name.style.display = '';
    input.style.display = 'none';
  };

  const onKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      input.removeEventListener('blur', commit);
      input.removeEventListener('keydown', onKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
      input.removeEventListener('blur', commit);
      input.removeEventListener('keydown', onKey);
    }
  };

  input.addEventListener('keydown', onKey);
  input.addEventListener('blur', commit, { once: true });
}

function setupToolbarButtons() {
  document.getElementById('add-workspace')?.addEventListener('click', addWorkspace);
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    toggleTheme().then(() => renderWorkspaceTabs());
  });
  document.getElementById('export-import')?.addEventListener(
    'click',
    showExportImportMenu,
  );
  document.getElementById('bg-settings')?.addEventListener(
    'click',
    showBackgroundSettings,
  );
}

function setupSearchBar() {
  const toggle = document.getElementById('search-toggle');
  const panel = document.getElementById('search-panel');
  const input = document.getElementById('search-input');
  const engineBtn = document.getElementById('search-engine-btn');
  const picker = document.getElementById('search-engine-picker');
  const list = document.getElementById('search-suggestions');
  if (!toggle || !panel || !input || !engineBtn || !picker || !list) return;

  let activeIndex = -1;
  let currentItems = [];
  let debounceTimer = null;
  let abortController = null;
  let blurTimer = null;
  let pickerOpen = false;
  let pickerBlurTimer = null;
  let panelOpen = false;
  let autoHideTimer = null;
  const AUTO_HIDE_MS = 10000;

  function currentEngine() {
    return state._searchEngine || DEFAULT_ENGINE;
  }

  function setEngineIcon(key) {
    const engine = ENGINES[key] || ENGINES[DEFAULT_ENGINE];
    const iconHtml = engine.icon || '';
    const title = t(engine.nameKey);
    engineBtn.innerHTML = `${iconHtml}<span class="search-engine-caret" aria-hidden="true">${ICONS.action('chevron-down')}</span>`;
    engineBtn.title = title;
    engineBtn.setAttribute('aria-label', title);
  }

  function resetAutoHide() {
    clearTimeout(autoHideTimer);
    if (panelOpen) autoHideTimer = setTimeout(closePanel, AUTO_HIDE_MS);
  }

  function closePanel() {
    panelOpen = false;
    panel.classList.remove('is-open');
    toggle.classList.remove('is-active');
    toggle.setAttribute('aria-expanded', 'false');
    hidePicker();
    hideSuggestions();
    input.value = '';
    clearTimeout(autoHideTimer);
  }

  function openPanel() {
    if (panelOpen) return;
    panelOpen = true;
    panel.classList.add('is-open');
    toggle.classList.add('is-active');
    toggle.setAttribute('aria-expanded', 'true');
    input.focus();
    resetAutoHide();
  }

  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    if (panelOpen) closePanel();
    else openPanel();
  });

  function hidePicker() {
    picker.hidden = true;
    pickerOpen = false;
    engineBtn.classList.remove('is-open');
  }

  function showPicker() {
    picker.hidden = false;
    pickerOpen = true;
    engineBtn.classList.add('is-open');
    picker.querySelectorAll('.search-engine-item').forEach((el) => el.classList.remove('is-selected'));
    const active = picker.querySelector(`.search-engine-item[data-engine="${currentEngine()}"]`);
    if (active) active.classList.add('is-selected');
  }

  function hideSuggestions() {
    list.hidden = true;
    list.innerHTML = '';
    activeIndex = -1;
  }

  function renderItems(items) {
    currentItems = items;
    activeIndex = -1;
    if (!items.length) {
      hideSuggestions();
      return;
    }
    list.innerHTML = items
      .map(
        (s, i) =>
          `<li class="search-suggestion-item" data-index="${i}" role="option">${escapeHtml(s)}</li>`,
      )
      .join('');
    list.hidden = false;
  }

  function setActive(idx) {
    const els = list.querySelectorAll('.search-suggestion-item');
    els.forEach((el) => el.classList.remove('is-active'));
    if (idx >= 0 && idx < els.length) {
      els[idx].classList.add('is-active');
      activeIndex = idx;
      els[idx].scrollIntoView({ block: 'nearest' });
    } else {
      activeIndex = -1;
    }
  }

  function doSearch(query) {
    const q = (query ?? input.value).trim();
    hideSuggestions();
    if (!q) return;
    input.value = '';
    resetAutoHide();
    const url = buildSearchUrl(currentEngine(), q);
    window.open(url, '_blank', 'noopener');
  }

  engineBtn.addEventListener('click', (e) => {
    e.preventDefault();
    resetAutoHide();
    if (pickerOpen) hidePicker();
    else { hideSuggestions(); showPicker(); }
  });

  picker.querySelectorAll('.search-engine-item').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const key = btn.dataset.engine;
      if (!ENGINES[key]) return;
      state._searchEngine = key;
      setEngineIcon(key);
      await setSearchEngine(key);
      hideSuggestions();
      hidePicker();
      input.focus();
      resetAutoHide();
    });
  });

  engineBtn.addEventListener('blur', () => {
    clearTimeout(pickerBlurTimer);
    pickerBlurTimer = setTimeout(hidePicker, 150);
  });
  picker.addEventListener('mousedown', (e) => {
    clearTimeout(pickerBlurTimer);
    e.preventDefault();
  });
  picker.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hidePicker(); engineBtn.focus(); resetAutoHide(); }
  });

  document.addEventListener('click', (e) => {
    if (!panelOpen) return;
    if (e.target.closest('#workspace-search')) return;
    closePanel();
  });

  input.addEventListener('input', () => {
    clearTimeout(blurTimer);
    resetAutoHide();
    if (debounceTimer) clearTimeout(debounceTimer);
    if (abortController) abortController.abort();
    const q = input.value.trim();
    if (!q) {
      hideSuggestions();
      return;
    }
    const engine = currentEngine();
    if (!ENGINES[engine]?.suggest) {
      hideSuggestions();
      return;
    }
    debounceTimer = setTimeout(async () => {
      abortController = new AbortController();
      try {
        const items = await fetchSuggestions(engine, q, abortController.signal);
        renderItems(items);
      } catch (e) {
        if (e.name !== 'AbortError') hideSuggestions();
      }
    }, 200);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && currentItems[activeIndex]) {
        doSearch(currentItems[activeIndex]);
      } else {
        doSearch();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (list.hidden) return;
      setActive(Math.min(activeIndex + 1, currentItems.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) return;
      setActive(Math.max(activeIndex - 1, 0));
      return;
    }
    if (e.key === 'Escape') {
      hideSuggestions();
      closePanel();
      return;
    }
    if (e.key === 'Tab' && !list.hidden) {
      hideSuggestions();
    }
  });

  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('.search-suggestion-item');
    if (!li) return;
    e.preventDefault();
    const idx = Number(li.dataset.index);
    if (currentItems[idx]) doSearch(currentItems[idx]);
  });

  input.addEventListener('blur', () => {
    blurTimer = setTimeout(hideSuggestions, 150);
  });

  input.addEventListener('focus', () => {
    clearTimeout(blurTimer);
    resetAutoHide();
  });
}

function setupWorkspaceTabsSortable() {
  if (typeof Sortable === 'undefined') return;
  const list = document.getElementById('workspace-tabs-list');
  if (!list) return;

  Sortable.create(list, {
    draggable: '.workspace-tab[data-workspace-id]',
    filter: '.workspace-tab-add, .workspace-tab-actions, .workspace-tab-name-input',
    preventOnFilter: true,
    animation: 150,
    onEnd: (evt) => {
      const fromIdx = evt.oldIndex;
      const toIdx = evt.newIndex;
      if (fromIdx === toIdx) return;
      const ws = [...state.workspaces];
      const [moved] = ws.splice(fromIdx, 1);
      ws.splice(toIdx, 0, moved);
      state.workspaces = ws;
      saveWorkspaces(ws);
      renderWorkspaceTabs();
    },
  });
}

export { renderApp, renderWorkspaceTabs };

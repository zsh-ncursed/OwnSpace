import { state } from '../state.js';
import { saveWorkspaces, saveActiveWorkspaceId } from '../storage.js';
import { escapeHtml } from '../ui/escape.js';
import { toggleTheme } from '../ui/theme.js';
import { renderWidgetGrid } from './grid.js';
import { addWorkspace, updateWorkspace } from '../workspaces.js';
import { showExportImportMenu } from '../ui/export-import-menu.js';
import { showBackgroundSettings } from '../ui/background-settings.js';

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

  container.innerHTML = `
    <div class="workspace-tabs-bar">
      <div class="workspace-tabs-list" id="workspace-tabs-list">
        ${state.workspaces
          .map(
            (ws) => `
          <div
            class="workspace-tab ${ws.id === state.activeWorkspaceId ? 'is-active' : ''}"
            data-workspace-id="${ws.id}"
            title="Двойной клик для переименования"
          >
            <span class="workspace-tab-grip" aria-hidden="true">${ICONS.action('grip-vertical')}</span>
            <span class="workspace-tab-name" data-role="display">${escapeHtml(ws.name)}</span>
            <input type="text" class="workspace-tab-name-input" data-role="input" value="${escapeHtml(ws.name)}" maxlength="40" style="display: none;" />
            <div class="workspace-tab-actions">
              <button type="button" class="workspace-tab-delete icon-btn" title="Удалить" aria-label="Удалить">${ICONS.action('x')}</button>
            </div>
          </div>
        `,
          )
          .join('')}
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

export { renderApp, renderWorkspaceTabs, updateActiveWorkspaceTab, enterTabRenameMode, setupToolbarButtons, setupWorkspaceTabsSortable };

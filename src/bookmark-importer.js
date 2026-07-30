import { state } from './state.js';
import { getTargetColumn } from './sortable.js';
import { saveWorkspaces } from './storage.js';
import { showNotification } from './ui/modals.js';

export function parseStartMeHtml(html) {
  let bookmarks = [];
  let widgetGroups = [];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const widgetContainers = doc.querySelectorAll('.bookmark-widget');

    widgetContainers.forEach((widget) => {
      const widgetTitleEl = widget.querySelector('.widget-header__text');
      const widgetTitle = widgetTitleEl
        ? widgetTitleEl.textContent.trim()
        : 'Импорт';

      const widgetBookmarksList = [];
      const bookmarkLinks = widget.querySelectorAll('a.bookmark-item__link');

      bookmarkLinks.forEach((link) => {
        const url = link.getAttribute('href');
        if (!url || url.startsWith('#') || url.startsWith('javascript:'))
          return;

        const titleSpan = link.querySelector('.bookmark-item__title');
        let title = titleSpan ? titleSpan.textContent.trim() : '';
        if (!title) {
          const titleAttr = link.getAttribute('title') || '';
          title = titleAttr.split('\n')[0].trim();
        }

        let hostname;
        try {
          hostname = new URL(url).hostname;
        } catch {
          hostname = '';
        }

        let favicon = null;
        if (hostname) {
          favicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
        }

        widgetBookmarksList.push({
          id: crypto.randomUUID(),
          url: url,
          title: title || url,
          description: null,
          favicon: favicon,
        });
        bookmarks.push(widgetBookmarksList[widgetBookmarksList.length - 1]);
      });

      if (widgetBookmarksList.length > 0) {
        widgetGroups.push({
          name: widgetTitle,
          bookmarks: widgetBookmarksList,
        });
      }
    });
  } catch {
    console.log('[Importer] DOMParser failed, using regex fallback');
  }

  if (bookmarks.length === 0) {
    const linkRegex =
      /<a class="bookmark-item__link"[^>]*href="([^"]+)"[^>]*title="([^"]+)"[^>]*>/g;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const bmUrl = match[1];
      const titleAttr = match[2] || '';
      if (
        !bmUrl ||
        bmUrl.startsWith('#') ||
        bmUrl.startsWith('javascript:')
      )
        continue;
      const title = titleAttr.split('\n')[0].trim();
      let hostname;
      try {
        hostname = new URL(bmUrl).hostname;
      } catch {
        hostname = '';
      }
      const favicon = hostname
        ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
        : null;
      bookmarks.push({
        id: crypto.randomUUID(),
        url: bmUrl,
        title: title || bmUrl,
        description: null,
        favicon: favicon,
      });
    }
    if (bookmarks.length > 0) {
      widgetGroups.push({ name: 'Импорт закладок', bookmarks: bookmarks });
    }
  }

  return { bookmarks, widgetGroups };
}

export function showBookmarkImportModal() {
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
        document.getElementById('import-error').textContent =
          'Не удалось найти закладки в файле.';
        document.getElementById('import-error').style.display = 'block';
        return;
      }

      currentImportData = result;

      const stats = document.getElementById('import-stats');
      const widgetList = document.getElementById('import-widget-list');

      stats.innerHTML = `<strong>${result.bookmarks.length}</strong> закладок, <strong>${result.widgetGroups.length}</strong> виджет(ов)`;

      if (result.widgetGroups.length > 1) {
        widgetList.innerHTML = `<ul style="list-style: none; padding: 0; max-height: 150px; overflow-y: auto;">
          ${result.widgetGroups.map((wg) => `<li style="padding: 4px 0; border-bottom: 1px solid var(--primary);">📁 ${wg.name} — ${wg.bookmarks.length} закладок</li>`).join('')}
        </ul>`;
      } else {
        widgetList.innerHTML = '';
      }

      document.getElementById('import-preview').style.display = 'block';
    };
    reader.onerror = () => {
      document.getElementById('import-error').textContent =
        'Ошибка чтения файла.';
      document.getElementById('import-error').style.display = 'block';
    };
    reader.readAsText(file);
  });

  confirmBtn.addEventListener('click', () => {
    if (!currentImportData) return;

    const workspace = state.workspaces.find(
      (ws) => ws.id === state.activeWorkspaceId,
    );
    if (!workspace) {
      document.getElementById('import-error').textContent =
        'Не удалось найти активное пространство.';
      document.getElementById('import-error').style.display = 'block';
      return;
    }

    console.log(
      '[Importer] Importing',
      currentImportData.bookmarks.length,
      'bookmarks to',
      workspace.name,
    );

    const widgetsToAdd = [];
    const targetCol = getTargetColumn(workspace);
    const existingInCol = workspace.widgets.filter((w) => (w.column ?? 0) === targetCol).length;

    currentImportData.widgetGroups.forEach((wg, idx) => {
      const newWidget = {
        id: crypto.randomUUID(),
        type: 'bookmarks',
        column: targetCol,
        order: existingInCol + idx,
        config: { title: wg.name || 'Импорт', bookmarks: wg.bookmarks },
      };
      widgetsToAdd.push(newWidget);
    });

    (async () => {
      const updated = {
        ...workspace,
        widgets: [...workspace.widgets, ...widgetsToAdd],
      };
      const updatedWorkspaces = state.workspaces.map((ws) =>
        ws.id === updated.id ? updated : ws,
      );
      state.workspaces = updatedWorkspaces;
      await saveWorkspaces(updatedWorkspaces);
      modal.remove();
      showNotification(
        `Импортировано ${currentImportData.bookmarks.length} закладок`,
      );
      if (typeof window._renderApp === 'function') window._renderApp();
    })();
  });

  cancelBtn.addEventListener('click', () => modal.remove());
  modal
    .querySelector('.modal-close')
    .addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

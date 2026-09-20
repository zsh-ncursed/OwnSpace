import { escapeHtml, safeUrl } from '../ui/escape.js';
import { t } from '../i18n/index.js';
import { getActiveWorkspace } from '../state.js';
import { updateWidgetConfig } from './management.js';
import { renderSingleWidget } from '../render/listeners.js';
import {
  sortableInstances,
  persistBookmarkOrder,
  setColumnSortablesDisabled,
} from '../sortable.js';
import { browserMessaging } from '../export-import.js';
import { showNotification } from '../ui/modals.js';

export const WIDGET_TYPE = 'bookmarks';

export function renderBookmarksWidget(widget) {
  const bookmarks = widget.config.bookmarks || [];
  const isExpanded = window._bookmarkExpanded
    ? window._bookmarkExpanded[widget.id]
    : false;
  const hasMore = bookmarks.length > 10;

  return `
    <div class="bookmarks-widget" data-widget-id="${widget.id}">
      <div class="add-bookmark">
        <input type="text" placeholder="${t('widget.bookmarks.add_placeholder')}" class="new-url-input" />
        <button class="add-bookmark-btn icon-btn" title="${t('widget.bookmarks.add_btn')}" aria-label="${t('widget.bookmarks.add_btn')}">${ICONS.btn('plus')}</button>
      </div>
      <div class="bookmarks-list ${isExpanded || !hasMore ? '' : 'collapsed'}">
        ${bookmarks
          .map(
            (bm) => `
          <div class="bookmark-item" data-bookmark-id="${bm.id}">
            <span class="bookmark-drag-handle">
              ${bm.favicon && safeUrl(bm.favicon) ? `<img src="${safeUrl(bm.favicon)}" class="favicon" alt="" draggable="false" />` : `<span class="favicon-placeholder">${ICONS.action('globe')}</span>`}
            </span>
            <div class="bookmark-edit" style="display: none;">
              <input type="text" class="title-input" value="${escapeHtml(bm.title)}" placeholder="${t('widget.bookmarks.name_placeholder')}" />
              <input type="text" class="url-input" value="${escapeHtml(bm.url)}" placeholder="${t('widget.bookmarks.url_placeholder')}" />
              <div class="bookmark-edit-actions">
                <button class="save-bookmark-btn icon-btn" title="${t('widget.bookmarks.save')}" aria-label="${t('widget.bookmarks.save')}">${ICONS.action('check')}</button>
                <button class="cancel-bookmark-btn icon-btn" title="${t('widget.bookmarks.cancel')}" aria-label="${t('widget.bookmarks.cancel')}">${ICONS.action('x')}</button>
              </div>
            </div>
            <a href="${safeUrl(bm.url) || '#'}" target="_blank" class="bookmark-title">${escapeHtml(bm.title)}</a>
            <button class="edit-btn icon-btn" title="${t('widget.bookmarks.edit')}" aria-label="${t('widget.bookmarks.edit')}">${ICONS.action('pencil')}</button>
            <button class="delete-btn icon-btn" title="${t('widget.bookmarks.delete')}" aria-label="${t('widget.bookmarks.delete')}">${ICONS.action('trash-2')}</button>
          </div>
        `,
          )
          .join('')}
      </div>
      ${hasMore ? `<button class="show-all-btn" data-bookmark-widget-id="${widget.id}">${isExpanded ? t('widget.bookmarks.collapse') : t('widget.bookmarks.show_all', { count: bookmarks.length })}</button>` : ''}
    </div>
  `;
}

// Bind all interactive behaviour for one bookmarks widget instance.
// Called by setupWidgetListeners via the widget registry dispatch.
export function mountBookmarksWidget(el, widget) {
  const widgetId = el.dataset.widgetId;

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
      },
    });
  }

  const addBtn = el.querySelector('.add-bookmark-btn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
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
        showNotification(t('widget.bookmarks.invalid_url'));
        return;
      }

      const hostname = new URL(fullUrl).hostname;
      const favicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;

      const workspace = getActiveWorkspace();
      const w = workspace.widgets.find((x) => x.id === widgetId);
      const bookmarks = w.config.bookmarks || [];

      let title = fullUrl;

      try {
        const response = await browserMessaging.sendMessage({
          type: 'fetchTitle',
          payload: { url: fullUrl },
        });
        if (response.success && response.result?.title) {
          title = response.result.title;
        }
      } catch {
        /* browserMessaging not available — fall back to hostname as title */
      }

      const newBookmark = {
        id: crypto.randomUUID(),
        url: fullUrl,
        title,
        favicon,
      };

      updateWidgetConfig(widgetId, {
        bookmarks: [...bookmarks, newBookmark],
      });
    });
  }

  el.querySelectorAll('.bookmark-item').forEach((item) => {
    const bmId = item.dataset.bookmarkId;

    const saveBookmark = () => {
      const newTitle =
        item.querySelector('.title-input').value.trim() ||
        item.querySelector('.title-input').value;
      const newUrl =
        item.querySelector('.url-input').value.trim() ||
        item.querySelector('.url-input').value;
      const workspace = getActiveWorkspace();
      const w = workspace.widgets.find((x) => x.id === widgetId);
      const updated = w.config.bookmarks.map((b) =>
        b.id === bmId ? { ...b, title: newTitle, url: newUrl } : b,
      );
      updateWidgetConfig(widgetId, { bookmarks: updated });
    };

    const cancelEdit = () => {
      const titleInput = item.querySelector('.title-input');
      const urlInput = item.querySelector('.url-input');
      const link = item.querySelector('.bookmark-title');
      const workspace = getActiveWorkspace();
      const w = workspace.widgets.find((x) => x.id === widgetId);
      const bm = w.config.bookmarks.find((b) => b.id === bmId);
      titleInput.value = bm.title;
      urlInput.value = bm.url;
      item.querySelector('.bookmark-edit').style.display = 'none';
      link.style.display = '';
    };

    const editBtn = item.querySelector('.edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        const editForm = item.querySelector('.bookmark-edit');
        const link = item.querySelector('.bookmark-title');

        if (editForm.style.display === 'none') {
          editForm.style.display = 'flex';
          link.style.display = 'none';
          item.classList.add('editing');
          editForm.querySelector('.title-input').focus();
          editForm.querySelector('.title-input').select();
        } else {
          saveBookmark();
          item.classList.remove('editing');
        }
      });
    }

    const saveBtn = item.querySelector('.save-bookmark-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        saveBookmark();
        item.classList.remove('editing');
      });
    }

    const cancelBtn = item.querySelector('.cancel-bookmark-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        cancelEdit();
      });
    }

    const bookmarkEdit = item.querySelector('.bookmark-edit');
    if (bookmarkEdit) {
      bookmarkEdit.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveBookmark();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelEdit();
        }
      });
    }

    const deleteBtn = item.querySelector('.delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        const workspace = getActiveWorkspace();
        const w = workspace.widgets.find((x) => x.id === widgetId);
        const bookmarks = w.config.bookmarks.filter((b) => b.id !== bmId);
        updateWidgetConfig(widgetId, { bookmarks });
      });
    }
  });
}

export default {
  type: WIDGET_TYPE,
  title: 'widget.bookmarks.title',
  icon: 'bookmark',
  defaultConfig: { bookmarks: [], title: '' },
  render: renderBookmarksWidget,
  mount: mountBookmarksWidget,
};

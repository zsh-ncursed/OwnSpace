import { escapeHtml, safeUrl } from '../ui/escape.js';
import { t } from '../i18n/index.js';

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

export default {
  type: WIDGET_TYPE,
  title: 'widget.bookmarks.title',
  icon: 'bookmark',
  defaultConfig: { bookmarks: [], title: '' },
  render: renderBookmarksWidget,
};

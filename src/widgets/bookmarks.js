import { escapeHtml } from '../ui/escape.js';

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
        <input type="text" placeholder="Введите URL..." class="new-url-input" />
        <button class="add-bookmark-btn icon-btn" title="Добавить закладку" aria-label="Добавить закладку">${ICONS.btn('plus')}</button>
      </div>
      <div class="bookmarks-list ${isExpanded || !hasMore ? '' : 'collapsed'}">
        ${bookmarks
          .map(
            (bm) => `
          <div class="bookmark-item" data-bookmark-id="${bm.id}">
            <span class="bookmark-drag-handle">
              ${bm.favicon ? `<img src="${bm.favicon}" class="favicon" alt="" draggable="false" />` : `<span class="favicon-placeholder">${ICONS.action('globe')}</span>`}
            </span>
            <div class="bookmark-edit" style="display: none;">
              <input type="text" class="title-input" value="${escapeHtml(bm.title)}" placeholder="Название" />
              <input type="text" class="url-input" value="${escapeHtml(bm.url)}" placeholder="URL" />
            </div>
            <a href="${escapeHtml(bm.url)}" target="_blank" class="bookmark-title">${escapeHtml(bm.title)}</a>
            <button class="edit-btn icon-btn" title="Редактировать" aria-label="Редактировать">${ICONS.action('pencil')}</button>
            <button class="delete-btn icon-btn" title="Удалить" aria-label="Удалить">${ICONS.action('trash-2')}</button>
          </div>
        `,
          )
          .join('')}
      </div>
      ${hasMore ? `<button class="show-all-btn" data-bookmark-widget-id="${widget.id}">${isExpanded ? 'Свернуть' : `Показать все (${bookmarks.length})`}</button>` : ''}
    </div>
  `;
}

export default {
  type: WIDGET_TYPE,
  title: 'Закладки',
  icon: 'bookmark',
  defaultConfig: { bookmarks: [], title: 'Закладки' },
  render: renderBookmarksWidget,
};

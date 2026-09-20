export const WIDGET_TYPE = 'date';

export function renderDateTimeWidget(_widget) {
  return '<div class="datetime-widget"><div class="date" id="datetime-date"></div><div class="time" id="datetime-time"></div></div>';
}

export function updateDateTimeWidget(el) {
  const now = new Date();
  const day = now.getDate().toString().padStart(2, '0');
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const year = now.getFullYear();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');

  const dateEl = el.querySelector('.date');
  const timeEl = el.querySelector('.time');
  if (dateEl) dateEl.textContent = `${day}.${month}.${year}`;
  if (timeEl) timeEl.textContent = `${hours}:${minutes}`;
}

export function mountDateTimeWidget(el) {
  updateDateTimeWidget(el);
}

export default {
  type: WIDGET_TYPE,
  title: 'widget.datetime.title',
  icon: 'clock',
  defaultConfig: { title: '' },
  render: renderDateTimeWidget,
  mount: mountDateTimeWidget,
};

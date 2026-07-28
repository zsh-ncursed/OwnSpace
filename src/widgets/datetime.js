export const WIDGET_TYPE = 'date';

export function renderDateTimeWidget(_widget) {
  return '<div class="datetime-widget"><div class="date" id="datetime-date"></div><div class="time" id="datetime-time"></div></div>';
}

export default {
  type: WIDGET_TYPE,
  title: 'Дата и время',
  icon: 'clock',
  defaultConfig: { title: 'Дата и время' },
  render: renderDateTimeWidget,
};

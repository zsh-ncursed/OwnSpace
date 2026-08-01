export const WIDGET_TYPE = 'date';

export function renderDateTimeWidget(_widget) {
  return '<div class="datetime-widget"><div class="date" id="datetime-date"></div><div class="time" id="datetime-time"></div></div>';
}

export default {
  type: WIDGET_TYPE,
  title: 'widget.datetime.title',
  icon: 'clock',
  defaultConfig: { title: '' },
  render: renderDateTimeWidget,
};

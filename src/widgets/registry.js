import bookmarksPlugin from './bookmarks.js';
import notesPlugin from './notes.js';
import datetimePlugin from './datetime.js';
import weatherPlugin from './weather.js';
import calendarPlugin from './calendar.js';
import todoPlugin from './todo.js';
import calculatorPlugin from './calculator.js';

const plugins = new Map();

function register(plugin) {
  if (!plugin || !plugin.type) return;
  plugins.set(plugin.type, plugin);
}

register(bookmarksPlugin);
register(notesPlugin);
register(datetimePlugin);
register(weatherPlugin);
register(calendarPlugin);
register(todoPlugin);
register(calculatorPlugin);

export const widgetRegistry = {
  register,

  get(type) {
    return plugins.get(type);
  },

  getAll() {
    return [...plugins.values()];
  },

  getEnabled() {
    const settings = window._pluginSettings || {};
    const enabled = settings.enabledWidgets;
    if (!enabled || !Array.isArray(enabled)) {
      return this.getAll();
    }
    return this.getAll().filter((p) => enabled.includes(p.type));
  },

  getTypes() {
    return [...plugins.keys()];
  },
};

import bookmarksPlugin from './bookmarks.js';
import notesPlugin from './notes.js';
import datetimePlugin from './datetime.js';
import weatherPlugin from './weather.js';
import calendarPlugin from './calendar.js';
import todoPlugin from './todo.js';
import calculatorPlugin from './calculator.js';
import currencyPlugin from './currency.js';

const plugins = new Map();

// Registration is DEFERRED via thunks. Import cycles (plugin -> management /
// listeners -> registry) mean a plugin module can be a still-unevaluated
// ancestor of this module, so reading `calendarPlugin` etc. directly here
// throws "Cannot access before initialization" depending on entry point.
// Thunks are read lazily on first registry access — by then the whole module
// graph has finished evaluating and every binding is initialized.
const pendingPlugins = [
  () => bookmarksPlugin,
  () => notesPlugin,
  () => datetimePlugin,
  () => weatherPlugin,
  () => calendarPlugin,
  () => todoPlugin,
  () => calculatorPlugin,
  () => currencyPlugin,
];

let flushed = false;
function flushPending() {
  if (flushed) return;
  flushed = true;
  for (const get of pendingPlugins) {
    const plugin = get();
    if (plugin && plugin.type) plugins.set(plugin.type, plugin);
  }
}

function register(plugin) {
  if (!plugin || !plugin.type) return;
  plugins.set(plugin.type, plugin);
}

export const widgetRegistry = {
  register,

  get(type) {
    flushPending();
    return plugins.get(type);
  },

  getAll() {
    flushPending();
    return [...plugins.values()];
  },

  getEnabled() {
    flushPending();
    const settings = window._pluginSettings || {};
    const enabled = settings.enabledWidgets;
    if (!enabled || !Array.isArray(enabled)) {
      return this.getAll();
    }
    return this.getAll().filter((p) => enabled.includes(p.type));
  },

  getTypes() {
    flushPending();
    return [...plugins.keys()];
  },
};

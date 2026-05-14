export const WIDGET_TYPES = {
  BOOKMARKS: 'bookmarks',
  NOTES: 'notes',
  DATE: 'date',
  WEATHER: 'weather',
  CALENDAR: 'calendar'
};

export const DEFAULT_WORKSPACE = {
  id: crypto.randomUUID(),
  name: 'Добро пожаловать',
  background: { type: 'color', value: '#1a1a2e' },
  widgets: []
};

export const THEME = {
  dark: {
    background: '#1a1a2e',
    surface: '#16213e',
    primary: '#0f3460',
    accent: '#e94560',
    text: '#eaeaea'
  },
  light: {
    background: '#f5f5f5',
    surface: '#ffffff',
    primary: '#0f3460',
    accent: '#e94560',
    text: '#1a1a2e'
  }
};
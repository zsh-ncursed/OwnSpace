import { storage } from '../storage.js';
import { STORAGE_KEYS } from '../utils/constants.js';

export const ENGINES = {
  google: {
    nameKey: 'search.engine.google',
    url: 'https://www.google.com/search?q={q}',
    suggest: 'https://suggestqueries.google.com/complete/search?client=firefox&q={q}',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>',
  },
  duckduckgo: {
    nameKey: 'search.engine.duckduckgo',
    url: 'https://duckduckgo.com/?q={q}',
    suggest: 'https://duckduckgo.com/ac/?q={q}',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#DE5833"/><path fill="#fff" d="M8.5 14.5c.3 1.4 1.2 2.3 2.6 2.4 1.2.1 2.3-.3 3-1.2l1.7.6c-.9 1.6-2.7 2.6-4.8 2.4-2.6-.2-4.4-2-4.6-4.5-.2-2.8 1.8-5 4.6-5.2 2.3-.2 4.2 1 5 3 .3.8.4 1.6.3 2.5H8.5z"/><path fill="#fff" d="M14.8 11.8c-.2-.8-.9-1.4-1.7-1.4-.9 0-1.7.6-1.9 1.4h3.6z"/><circle cx="9.2" cy="9.2" r="1.1" fill="#fff"/></svg>',
  },
  bing: {
    nameKey: 'search.engine.bing',
    url: 'https://www.bing.com/search?q={q}',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#008373" d="M5 3v15.3l4.7 1.7 3.6-3.1-1.5-2.6L19 19V7.5L13.6 5 9.7 8.2V4.6L5 3z"/><path fill="#fff" d="M9.7 8.2 13.6 5l5.4 2.5-3.7 2.6L9.7 8.2z"/><path fill="#fff" d="M13.6 12.9 12 10.4l-2.3 2 1.6 2.5 2.3-2z"/></svg>',
  },
  brave: {
    nameKey: 'search.engine.brave',
    url: 'https://search.brave.com/search?q={q}',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#FB542B" d="M12 2 4 4 2 9.5l2.5 1.7L4 13l2.5 3.5L9 22h6l2.5-5.5L20 13l-.5-1.8L22 9.5 20 4 12 2z"/><path fill="#fff" d="M12 5 7.5 6.3 9 9l-1.5 1.5L12 19l4.5-8.5L15 9l1.5-2.7L12 5z"/></svg>',
  },
  ecosia: {
    nameKey: 'search.engine.ecosia',
    url: 'https://www.ecosia.org/search?q={q}',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#00A86F"/><path fill="#fff" d="M12 5c-2 2-4 3.5-4 7 0 2.5 1.8 4.5 4 5 2.2-.5 4-2.5 4-5 0-3.5-2-5-4-7z"/><path fill="#fff" d="M12 8.5c-.8 1-1.5 1.8-1.5 3.3 0 1.2.7 2.2 1.5 2.5.8-.3 1.5-1.3 1.5-2.5 0-1.5-.7-2.3-1.5-3.3z"/></svg>',
  },
  startpage: {
    nameKey: 'search.engine.startpage',
    url: 'https://www.startpage.com/sp/search?query={q}',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#6F00FF"/><path fill="#fff" d="M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 2.5a3.5 3.5 0 0 1 3.4 2.6l-1.7.5a1.8 1.8 0 1 0 0 1.8l1.7.5A3.5 3.5 0 0 1 12 15.5a3.5 3.5 0 0 1 0-7z"/></svg>',
  },
};

export const DEFAULT_ENGINE = 'google';

export function buildSearchUrl(engineKey, query) {
  const engine = ENGINES[engineKey] || ENGINES[DEFAULT_ENGINE];
  return engine.url.replace('{q}', encodeURIComponent(query));
}

export function getEngineKeys() {
  return Object.keys(ENGINES);
}

export async function getSearchEngine() {
  const settings = await storage.local.getItem(STORAGE_KEYS.SEARCH_SETTINGS);
  const engine = settings?.engine;
  return engine && ENGINES[engine] ? engine : DEFAULT_ENGINE;
}

export async function setSearchEngine(engineKey) {
  if (!ENGINES[engineKey]) return;
  const settings = (await storage.local.getItem(STORAGE_KEYS.SEARCH_SETTINGS)) || {};
  settings.engine = engineKey;
  await storage.local.setItem(STORAGE_KEYS.SEARCH_SETTINGS, settings);
}

export function hasSuggestions(engineKey) {
  const engine = ENGINES[engineKey];
  return !!(engine && engine.suggest);
}

export function normalizeSuggestions(data, engineKey) {
  if (!data) return [];
  if (engineKey === 'google') {
    if (!Array.isArray(data) || data.length < 2) return [];
    const list = data[1];
    if (!Array.isArray(list)) return [];
    return list.filter((s) => typeof s === 'string' && s.trim()).slice(0, 8);
  }
  if (engineKey === 'duckduckgo') {
    if (!Array.isArray(data)) return [];
    return data
      .map((item) => (item && typeof item === 'object' ? item.phrase : item))
      .filter((s) => typeof s === 'string' && s.trim())
      .slice(0, 8);
  }
  return [];
}

export async function fetchSuggestions(engineKey, query, signal) {
  const engine = ENGINES[engineKey];
  if (!engine || !engine.suggest || !query.trim()) return [];
  const url = engine.suggest.replace('{q}', encodeURIComponent(query));
  const response = await fetch(url, { signal, credentials: 'omit' });
  if (!response.ok) return [];
  const data = await response.json();
  return normalizeSuggestions(data, engineKey);
}
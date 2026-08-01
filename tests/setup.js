// Vitest setup — polyfill localStorage + mock browser API for jsdom env
import { beforeEach } from 'vitest';

// jsdom doesn't always hoist localStorage to globalThis; define an in-memory polyfill.
const _store = new Map();
const localStorageMock = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => { _store.set(k, String(v)); },
  removeItem: (k) => { _store.delete(k); },
  clear: () => { _store.clear(); },
  key: (i) => [..._store.keys()][i] ?? null,
  get length() { return _store.size; },
};
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });
}
if (typeof window !== 'undefined' && typeof window.localStorage === 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: localStorageMock, configurable: true });
}

// Mutable browser.storage.local mock — storage.js prefers browser.* over localStorage.
let _browserStore = {};

globalThis.browser = {
  storage: {
    local: {
      get: async (keys) => {
        if (typeof keys === 'string') return { [keys]: _browserStore[keys] };
        const out = {};
        for (const k of Object.keys(_browserStore)) out[k] = _browserStore[k];
        return out;
      },
      set: async (items) => { Object.assign(_browserStore, items); },
      remove: async (keys) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        arr.forEach((k) => delete _browserStore[k]);
      },
    },
  },
  runtime: { sendMessage: async () => ({ success: true }) },
};

beforeEach(() => {
  _store.clear();
  _browserStore = {};
});
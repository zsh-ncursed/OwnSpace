// Vitest setup file for OwnSpace tests

// Mock browser API
global.browser = {
  storage: {
    local: {
      get: async (keys) => {
        const store = global.__mockStorage || {};
        if (typeof keys === 'string') {
          return { [keys]: store[keys] };
        }
        const result = {};
        for (const key of Object.keys(store)) {
          result[key] = store[key];
        }
        return result;
      },
      set: async (items) => {
        global.__mockStorage = global.__mockStorage || {};
        Object.assign(global.__mockStorage, items);
      },
      remove: async (keys) => {
        if (global.__mockStorage) {
          if (Array.isArray(keys)) {
            keys.forEach(key => delete global.__mockStorage[key]);
          } else {
            delete global.__mockStorage[keys];
          }
        }
      }
    }
  },
  runtime: {
    sendMessage: async (message) => {
      console.log('[Mock] browser.runtime.sendMessage:', message);
      return { success: true };
    }
  }
};

// Reset mock storage before each test
beforeEach(() => {
  global.__mockStorage = {};
});

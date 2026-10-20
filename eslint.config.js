import js from '@eslint/js';

export default [
  {
    // Third-party vendored code and build tooling are not ours to lint.
    // lib/ holds minified polyfills (browser-polyfill, sortable) — they are
    // byte-for-byte upstream files, and "fixing" them would break the next
    // vendor update. tools/ holds Node scripts that run outside the
    // extension and use Node globals this config does not declare.
    ignores: ['lib/**', 'tools/**', 'build/**', 'web-ext-artifacts/**', 'node_modules/**', 'serve.cjs'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        browser: 'readonly',
        localStorage: 'readonly',
        crypto: 'readonly',
        CSS: 'readonly',
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        getComputedStyle: 'readonly',
        DOMParser: 'readonly',
        Image: 'readonly',
        HTMLCanvasElement: 'readonly',
        Sortable: 'readonly',
        ICONS: 'readonly',
        File: 'readonly',
        location: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        structuredClone: 'readonly',
        requestAnimationFrame: 'readonly',
        Headers: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        MutationObserver: 'readonly',
        ResizeObserver: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        EventTarget: 'readonly',
        confirm: 'readonly',
        importScripts: 'readonly',
        OwnSpaceICS: 'readonly',
        AbortController: 'readonly',
        RTCPeerConnection: 'readonly',
        RTCSessionDescription: 'readonly',
        CompressionStream: 'readonly',
        DecompressionStream: 'readonly',
        ReadableStream: 'readonly',
        Response: 'readonly',
        navigator: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
    },
  },
  // Vitest test files — enable vitest globals (vitest.config.js sets globals: true)
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
      },
    },
  },
];

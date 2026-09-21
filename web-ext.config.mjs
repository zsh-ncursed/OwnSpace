// web-ext configuration. Loaded via ESM import — a .json config trips Node's
// "needs an import attribute of type: json" error on modern Node, so this is a
// plain JS module exporting the same object.
export default {
  artifactsDir: 'web-ext-artifacts',
  filename: {
    chrome: 'ownspace-chrome.zip',
    firefox: 'ownspace-{version}.xpi',
  },
  ignoreFiles: [
    'node_modules',
    '.git',
    '.github',
    'tests',
    'tools',
    'web-ext-artifacts',
    '*.test.js',
    'docs/',
    'backlog.md',
    'ownspace.xpi',
    'update.json',
    'web-ext.config.mjs',
    '.eslintrc*',
    'eslint.config.js',
    'vitest.config.js',
    'package*.json',
    'README*.md',
    'AGENTS.md',
  ],
};

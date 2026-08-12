## OwnSpace Browser Extension

Local start page replacement with customizable widgets — аналог start.me без облачного бэкенда.

## Features

- **Workspaces** — до 10 рабочих пространств с навигацией по вкладкам
- **Plugin-based widgets** — подключаемая архитектура, каждый виджет — независимый плагин
- **Виджеты из коробки:**
  - Закладки — локальные ссылки с авто-фавиконом и drag-and-drop
  - Заметки — автосохранение текста
  - Дата и время — живые часы
  - Погода — OpenWeather API
  - Календарь — локальные события + опциональная CalDAV-синхронизация
  - Список задач — todo с чекбоксами
  - Калькулятор — арифметика с %-семантикой, история результатов, клавиатурный ввод
  - Курс валют — до 5 пар валют, базовая валюта выбирается из списка (ExchangeRate-API)
- **Включение/отключение виджетов** — через страницу настроек расширения
- **Темы:** Dark / Light
- **Фон workspace:** цвет, градиент, изображение (со сжатием через Canvas)
- **Экспорт/Импорт:** JSON-бэкап с опциональным AES-GCM шифрованием
- **4-колоночная сетка** с drag-and-drop (SortableJS)

## Project Structure

```
ownspace/
├── manifest.json              # Manifest V3
├── newtab.html                # Entry point
├── build.sh                   # Build .xpi script
├── eslint.config.js           # ESLint flat config
├── package.json               # Dependencies & scripts
├── background/
│   ├── sync-worker.js         # MV3 background service worker (CalDAV sync, tab pin/redirect)
│   └── ics-parser.js          # iCalendar (ICS) parsing helpers (shared with tests)
├── src/
│   ├── app.js                 # Init: imports + initApp (~40 строк)
│   ├── state.js               # Reactive state + getActiveWorkspace
│   ├── storage.js             # browser.storage.local wrapper
│   ├── crypto.js              # AES-GCM encrypt/decrypt
│   ├── export-import.js       # JSON export/import logic
│   ├── bookmark-importer.js   # start.me HTML import
│   ├── sortable.js            # Drag-and-drop singletons + persistence
│   ├── workspaces.js          # Workspace CRUD + migration
│   ├── render/
│   │   ├── tabs.js            # Workspace tab rendering
│   │   ├── grid.js            # Widget grid rendering (dynamic menu from registry)
│   │   └── listeners.js       # Event delegation for all widgets
│   ├── widgets/
│   │   ├── registry.js        # Plugin registry: register(), get(), getEnabled()
│   │   ├── management.js      # Widget CRUD + defaults from registry
│   │   ├── event-modal.js     # Widget settings & event modals
│   │   ├── bookmarks.js       # Plugin: Закладки
│   │   ├── notes.js           # Plugin: Заметки
│   │   ├── datetime.js        # Plugin: Дата и время
│   │   ├── weather.js         # Plugin: Погода
  │   │   ├── calendar.js        # Plugin: Календарь (события + доход/расход)
  │   │   ├── todo.js            # Plugin: Список задач
  │   │   ├── calculator.js      # Plugin: Калькулятор
  │   │   └── currency.js        # Plugin: Курс валют
│   ├── ui/
│   │   ├── theme.js           # Dark/Light theme toggle
│   │   ├── modals.js          # Notification/confirm/prompt modals
│   │   ├── escape.js          # HTML escape utility
│   │   ├── background-settings.js  # Background customization modal
│   │   └── export-import-menu.js   # Export/Import modal
│   ├── utils/
│   │   ├── constants.js       # Storage keys + widget type constants
│   │   ├── date.js            # Date formatting utilities
│   │   └── download.js        # File download helper
│   ├── caldav/
│   │   ├── sync.js            # CalDAV sync logic
│   │   └── master-password.js # Master password management
│   ├── components/
│   │   └── icons.js           # Lucide-style SVG icons (IIFE → window.ICONS)
│   └── styles/
│       └── main.css           # All styles
├── options/
│   ├── options.html           # Settings page (widget toggles, behavior)
│   ├── options.js             # Settings logic
│   └── options.css            # Settings styles
├── tests/
│   ├── date.test.js           # 10 tests
│   ├── escape.test.js         # 6 tests
│   ├── crypto.test.js         # 5 tests
│   ├── storage.test.js        # 11 tests
│   ├── state.test.js          # 4 tests
│   ├── calendar.test.js       # 17 tests
│   └── bookmark-importer.test.js  # 4 tests (57 total)
└── lib/
    ├── sortable.min.js        # SortableJS
    ├── browser-polyfill.min.js # Webextension polyfill
    └── fonts/
        └── Inter-Variable.woff2
```

## Plugin System

Виджеты реализованы как подключаемые плагины. Файл `src/widgets/registry.js` — центральный реестр.

### Добавление своего виджета

1. Создать файл `src/widgets/my-widget.js`:

```js
export const WIDGET_TYPE = 'my-widget';

export function renderMyWidget(widget) {
  return `<div class="my-widget" data-widget-id="${widget.id}">
    <!-- HTML виджета -->
  </div>`;
}

export default {
  type: WIDGET_TYPE,
  title: 'Мой виджет',
  icon: 'star',              // ключ из ICONS.btn()
  defaultConfig: { /* ... */ },
  render: renderMyWidget,
};
```

2. Зарегистрировать в `src/widgets/registry.js`:
```js
import myWidgetPlugin from './my-widget.js';
register(myWidgetPlugin);
```

3. При необходимости добавить обработчики событий в `src/render/listeners.js`:
```js
container.querySelectorAll('.my-widget').forEach((el) => {
  // setupListeners
});
```

### Включение/отключение

Страница настроек (`options/options.html`) позволяет включать и отключать виджеты. Настройки хранятся в `settings.enabledWidgets` (ключ `browser.storage.local`).

## Calendar: Учёт доходов и расходов

Виджет календаря поддерживает финансовый учёт по событиям.

### Поля события

При создании или редактировании события доступны два поля:
- **Тип** — «+ Доход» или «− Расход»
- **Сумма** — положительное число

### Повторяющиеся события

При создании повторяющегося события с заполненными полями дохода/расхода — сумма копируется во все инстанции серии. Каждая дата повторения несёт свою копию финансовой записи.

### Финансовый результат месяца

Внизу виджета календаря отображается блок «Финансовый результат» с подсчётом по текущему месяцу:

- **Доходы** — сумма всех событий с типом «Доход»
- **Расходы** — сумма всех событий с типом «Расход»
- **Итог** = Доходы − Расходы (зелёный если ≥ 0, красный если < 0)

Правила подсчёта:
- Учитываются только **наступившие и прошедшие** события. Событие сегодня в 18:00 при текущем времени 12:00 — не считается, пока не наступит 18:00
- All-day события считаются если их дата ≤ сегодня
- Будущие события (завтра и далее) исключены
- Удалённые события автоматически исключены (отсутствуют в данных)
- События из CalDAV не учитываются (синхронизируются только для просмотра)
- Блок отображается только если есть хотя бы одно событие с заполненной суммой

## Build Instructions (for AMO Reviewers)

### Requirements

- OS: Linux / macOS / Windows (any POSIX-compatible with `zip`)
- No Node.js or npm required to build the extension itself
- Node.js 20+ and npm required only for linting and tests (optional)

### Build Steps

The extension ships as-is — no bundler, no transpilation, no minification of own source code. `build.sh` is a plain `zip` of the source tree into `ownspace.xpi`.

```bash
git clone https://github.com/zsh-ncursed/OwnSpace.git
cd OwnSpace
bash build.sh
# Output: ownspace.xpi
```

### Lint and Tests (optional)

```bash
npm install          # dev dependencies only (eslint, vitest)
npm run lint         # ESLint
npm test             # Vitest + jsdom, 172 tests
```

### Verifying Build Matches Uploaded XPI

```bash
# Build locally, then compare:
bash build.sh
diff <(unzip -l ownspace.xpi | sort) <(unzip -l uploaded.xpi | sort)
# File lists should match
```

### Third-Party Libraries (vendored, not modified)

- `lib/browser-polyfill.min.js` — Mozilla browser-polyfill (Apache-2.0), https://github.com/mozilla/webextension-polyfill
- `lib/sortable.min.js` — SortableJS (MIT), https://github.com/SortableJS/Sortable
- `lib/fonts/Inter-Variable.woff2` — Inter font (OFL-1.1), https://github.com/rsms/inter

All own source files are unminified, readable, and shipped as written.

## Installation

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. «Load Temporary Add-on»
3. Select `manifest.json`
4. Open a new tab

### Chrome

1. Open `chrome://extensions`
2. Enable «Developer mode»
3. «Load unpacked»
4. Select the project directory
5. Open a new tab

## Tech Stack

- **Vanilla JS** — ES modules (`type="module"`), без сборщика
- **CSS custom properties** — темизация
- **Web Crypto API** — AES-GCM шифрование
- **SortableJS** — drag-and-drop
- **Vitest + jsdom** — тестирование
- **ESLint (flat config)** + **Prettier** — линтинг

## Browser Support

- Firefox 128+ (gecko + gecko_android)
- Chrome (Manifest V3)

## Security

- **`host_permissions: ["<all_urls>"]`** — требуется для `fetchTitle` (загрузка `<title>` любой закладки) и CalDAV-синхронизации с произвольным сервером. Сужение до конкретных доменов невозможно: URL закладок и CalDAV-серверов определяются пользователем. Альтернатива `optional_host_permissions` + динамический запрос прав ломает UX (подтверждение для каждого сайта).
- **CalDAV-учётные данные** — шифруются AES-GCM через мастер-пароль (PBKDF2 100k iterations, SHA-256). Хеш мастер-пароля для проверки — PBKDF2-SHA-256 со случайной солью (не сырой SHA-256); легаси-хеши автоматически мигрируют при первом успешном вводе пароля. Мастер-пароль кэшируется в памяти модульной переменной 15 минут (TTL), после чего автоматически сбрасывается. Кэш не персистится на диск.
- **Экспорт с паролем** — файлы шифруются AES-GCM (PBKDF2 100k iterations, SHA-256) со **случайной солью на каждый файл** (соль хранится вместе с шифротекстом). Файлы, созданные до введения случайной соли, по-прежнему импортируются (фолбэк на фиксированную легаси-соль).
- **URL-валидация** — `safeUrl()` пропускает только http/https URL в `src`/`href` атрибутах. `javascript:`, `data:` и строки с кавычками отклоняются. Защищает от XSS-инъекции через импорт закладок и favicon.

## License

GPL-3.0 — see [LICENSE](LICENSE).

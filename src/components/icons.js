// OwnSpace icon set — Lucide-style 24x24 stroke icons
// Registers window.ICONS. Each value is a function returning an inline SVG string.

(function () {
  const stroke = 'currentColor';
  const sw = 2;
  const common = `viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;

  function svg(path, viewBox = common) {
    return `<svg ${viewBox}>${path}</svg>`;
  }

  const ICONS = {
    palette: svg(`
      <circle cx="13.5" cy="6.5" r=".5" fill="${stroke}"/>
      <circle cx="17.5" cy="10.5" r=".5" fill="${stroke}"/>
      <circle cx="8.5" cy="7.5" r=".5" fill="${stroke}"/>
      <circle cx="6.5" cy="12.5" r=".5" fill="${stroke}"/>
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
    `),

    sun: svg(`
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
    `),

    moon: svg(`
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    `),

    'arrow-down-up': svg(`
      <path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16"/>
    `),

    'grip-vertical': svg(`
      <circle cx="9" cy="12" r="1" fill="${stroke}"/>
      <circle cx="9" cy="5" r="1" fill="${stroke}"/>
      <circle cx="9" cy="19" r="1" fill="${stroke}"/>
      <circle cx="15" cy="12" r="1" fill="${stroke}"/>
      <circle cx="15" cy="5" r="1" fill="${stroke}"/>
      <circle cx="15" cy="19" r="1" fill="${stroke}"/>
    `),

    pencil: svg(`
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
    `),

    x: svg(`
      <path d="M18 6 6 18M6 6l12 12"/>
    `),

    'trash-2': svg(`
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      <line x1="10" y1="11" x2="10" y2="17"/>
      <line x1="14" y1="11" x2="14" y2="17"/>
    `),

    globe: svg(`
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    `),

    lock: svg(`
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    `),

    'chevron-left': svg(`
      <path d="m15 18-6-6 6-6"/>
    `),

    'chevron-right': svg(`
      <path d="m9 18 6-6-6-6"/>
    `),

    'chevron-down': svg(`
      <path d="m6 9 6 6 6-6"/>
    `),

    plus: svg(`
      <path d="M12 5v14M5 12h14"/>
    `),

    check: svg(`
      <path d="M20 6 9 17l-5-5"/>
    `),

    upload: svg(`
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    `),

    download: svg(`
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    `),

    'rotate-cw': svg(`
      <path d="M23 4v6h-6M1 20v-6h6"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    `),

    'file-text': svg(`
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    `),

    cloud: svg(`
      <path d="M17.5 19a4.5 4.5 0 1 0-1.41-8.775 5.5 5.5 0 0 0-10.787 2A4.5 4.5 0 0 0 6.5 19h11z"/>
    `),

    sun_cloud: svg(`
      <path d="M12 2v2M5.6 5.6l1.4 1.4M2 12h2M17.5 19a4.5 4.5 0 1 0-1.41-8.775M17 7l1.4-1.4"/>
      <path d="M16 14a4 4 0 1 0-7.6-1.6"/>
    `),

    cloud_rain: svg(`
      <path d="M17.5 19a4.5 4.5 0 1 0-1.41-8.775 5.5 5.5 0 0 0-10.787 2A4.5 4.5 0 0 0 6.5 19h11z"/>
      <line x1="8" y1="20" x2="7" y2="23"/>
      <line x1="12" y1="20" x2="11" y2="23"/>
      <line x1="16" y1="20" x2="15" y2="23"/>
    `),

    cloud_snow: svg(`
      <path d="M17.5 19a4.5 4.5 0 1 0-1.41-8.775 5.5 5.5 0 0 0-10.787 2A4.5 4.5 0 0 0 6.5 19h11z"/>
      <line x1="8" y1="20" x2="8" y2="20.01"/>
      <line x1="12" y1="20" x2="12" y2="20.01"/>
      <line x1="16" y1="20" x2="16" y2="20.01"/>
      <line x1="10" y1="22" x2="10" y2="22.01"/>
      <line x1="14" y1="22" x2="14" y2="22.01"/>
    `),

    cloud_lightning: svg(`
      <path d="M17.5 19a4.5 4.5 0 1 0-1.41-8.775 5.5 5.5 0 0 0-10.787 2A4.5 4.5 0 0 0 6.5 19h11z"/>
      <path d="M13 12l-3 5h4l-2 4"/>
    `),

    cloud_sun: svg(`
      <circle cx="9" cy="9" r="3"/>
      <path d="M9 3v1M9 14v1M3 9h1M14 9h1M4.6 4.6l.7.7M12.7 12.7l.7.7M4.6 13.4l.7-.7M12.7 5.3l.7-.7"/>
      <path d="M17 17a4 4 0 1 0-7.6-1.6"/>
    `),

    wind: svg(`
      <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/>
      <path d="M9.6 4.6A2 2 0 1 1 11 8H2"/>
      <path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>
    `),

    mist: svg(`
      <line x1="3" y1="8" x2="21" y2="8"/>
      <line x1="3" y1="12" x2="15" y2="12"/>
      <line x1="3" y1="16" x2="18" y2="16"/>
      <line x1="3" y1="20" x2="13" y2="20"/>
    `),

    calendar: svg(`
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    `),

    bookmark: svg(`
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
    `),

    note: svg(`
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    `),

    'arrow-left': svg(`
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    `),

    'arrow-right': svg(`
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    `),

    eye: svg(`
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    `),

    'eye-off': svg(`
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    `),

    key: svg(`
      <circle cx="8" cy="15" r="4.5"/>
      <path d="M11.5 11.5 20 3"/>
      <path d="M16 7 18 9"/>
      <path d="M14 9 16 11"/>
    `)
  };

  // Helper: returns a 18x18 button icon (for topbar icon-btn)
  ICONS.btn = (name) => `<span class="icon">${ICONS[name]}</span>`;
  // Helper: returns a 14x14 action icon (for in-widget actions)
  ICONS.action = (name) => `<span class="icon-sm">${ICONS[name]}</span>`;

  window.ICONS = ICONS;
})();

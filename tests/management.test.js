import { describe, it, expect, afterEach } from 'vitest';
import { getDefaultWidgetConfig, widgetBgStyle } from '../src/widgets/management.js';
import { widgetRegistry } from '../src/widgets/registry.js';

describe('getDefaultWidgetConfig', () => {
  it('returns fresh nested arrays on every call', () => {
    for (const type of widgetRegistry.getTypes()) {
      const a = getDefaultWidgetConfig(type);
      const b = getDefaultWidgetConfig(type);
      expect(a).not.toBe(b);
      for (const key of Object.keys(a)) {
        const val = a[key];
        if (val !== null && typeof val === 'object') {
          expect(a[key]).not.toBe(b[key]);
        }
      }
    }
  });

  it('mutating one config does not leak into the registry default', () => {
    const plugin = widgetRegistry.get('calendar');
    const config = getDefaultWidgetConfig('calendar');
    config.events.push({ id: 'leak', title: 'Leak', date: '2026-07-01' });
    expect(plugin.defaultConfig.events).toHaveLength(0);
  });

  it('mutating one config does not affect another widget config', () => {
    const a = getDefaultWidgetConfig('calendar');
    const b = getDefaultWidgetConfig('calendar');
    a.events.push({ id: '1', title: 'T', date: '2026-07-01' });
    expect(b.events).toHaveLength(0);
  });

  it('returns {} for unknown type', () => {
    expect(getDefaultWidgetConfig('does-not-exist')).toEqual({});
  });
});

describe('widgetBgStyle', () => {
  // The background settings dialog caches settings here; widgetBgStyle reads
  // the global widget appearance from it.
  const originalSettings = window._pluginSettings;

  afterEach(() => {
    window._pluginSettings = originalSettings;
  });

  it('returns no style when the widget has no custom background', () => {
    window._pluginSettings = {};
    expect(widgetBgStyle({ config: {} })).toBe('');
  });

  it('applies the per-widget background color and opacity', () => {
    window._pluginSettings = {};
    expect(widgetBgStyle({ config: { bgColor: '#ff0000', opacity: 80 } })).toBe(
      'style="background:rgba(255,0,0,0.8)"',
    );
  });

  it('overrides the per-widget color with the global one', () => {
    window._pluginSettings = { widgetBgColor: '#00ff00', widgetTransparency: 0 };
    expect(
      widgetBgStyle({ config: { bgColor: '#ff0000', opacity: 80 } }),
    ).toBe('style="background:rgba(0,255,0,1)"');
  });

  it('treats the global slider as a transparency level (100 = fully transparent)', () => {
    window._pluginSettings = { widgetBgColor: '#00ff00', widgetTransparency: 100 };
    expect(widgetBgStyle({ config: {} })).toBe(
      'style="background:rgba(0,255,0,0)"',
    );
  });

  it('ignores the global transparency when no global color is set', () => {
    window._pluginSettings = { widgetTransparency: 50 };
    expect(widgetBgStyle({ config: { bgColor: '#ff0000', opacity: 80 } })).toBe(
      'style="background:rgba(255,0,0,0.8)"',
    );
  });
});

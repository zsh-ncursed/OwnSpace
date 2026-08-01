import { describe, it, expect } from 'vitest';
import { getDefaultWidgetConfig } from '../src/widgets/management.js';
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

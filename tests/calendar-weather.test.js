import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  weatherIconName,
  weatherForDay,
  refreshWeather,
  getCachedWeather,
  findWeatherConfig,
  clearWeatherCache,
} from '../src/widgets/calendar-weather.js';

beforeEach(() => {
  vi.unstubAllGlobals();
  clearWeatherCache();
});

describe('weatherIconName', () => {
  it('maps known icon codes', () => {
    expect(weatherIconName('01d')).toBe('sun');
    expect(weatherIconName('02n')).toBe('cloud_sun');
    expect(weatherIconName('03d')).toBe('cloud');
    expect(weatherIconName('04d')).toBe('cloud');
    expect(weatherIconName('09d')).toBe('cloud_rain');
    expect(weatherIconName('10d')).toBe('cloud_rain');
    expect(weatherIconName('11d')).toBe('cloud_lightning');
    expect(weatherIconName('13d')).toBe('cloud_snow');
    expect(weatherIconName('50d')).toBe('mist');
  });

  it('falls back to cloud for unknown', () => {
    expect(weatherIconName('xx')).toBe('cloud');
    expect(weatherIconName('')).toBe('cloud');
    expect(weatherIconName(null)).toBe('cloud');
  });
});

describe('refreshWeather + getCachedWeather', () => {
  it('caches fresh data and returns null after TTL', async () => {
    const now = Date.now();
    vi.stubGlobal('Date', class extends Date {
      constructor(...args) {
        if (args.length === 0) super(now);
        else super(...args);
      }
      static now() { return now; }
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        main: { temp: 10, temp_min: 8, temp_max: 12 },
        weather: [{ icon: '01d' }],
        coord: { lat: 55, lon: 37 },
      }),
    }).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ list: [] }),
    }));

    await refreshWeather('key123', 'Moscow');
    expect(getCachedWeather()).toBeTruthy();

    // Advance past cache TTL (31 minutes)
    vi.stubGlobal('Date', class extends Date {
      constructor(...args) {
        if (args.length === 0) super(now + 31 * 60 * 1000);
        else super(...args);
      }
      static now() { return now + 31 * 60 * 1000; }
    });
    expect(getCachedWeather()).toBeNull();
  });
});

describe('weatherForDay', () => {
  it('returns current temp for today', async () => {
    const now = new Date();
    vi.stubGlobal('Date', class extends Date {
      constructor(...args) {
        if (args.length === 0) super(now.getTime());
        else super(...args);
      }
      static now() { return now.getTime(); }
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        main: { temp: 15, temp_min: 12, temp_max: 18 },
        weather: [{ icon: '02d' }],
        coord: { lat: 55, lon: 37 },
      }),
    }).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ list: [] }),
    }));

    await refreshWeather('key', 'Moscow');
    const result = weatherForDay(new Date());
    expect(result).not.toBeNull();
    expect(result.temp).toBe(15);
    expect(result.icon).toBe('cloud_sun');
    expect(result.min).toBe(12);
    expect(result.max).toBe(18);
  });

  it('returns max/min for a future day', async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    vi.stubGlobal('Date', class extends Date {
      constructor(...args) {
        if (args.length === 0) super(today.getTime());
        else super(...args);
      }
      static now() { return today.getTime(); }
    });

    // Mock forecast entries for tomorrow
    const t = (h) => {
      const d = new Date(tomorrow);
      d.setHours(h, 0, 0, 0);
      return Math.floor(d.getTime() / 1000);
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        main: { temp: 10, temp_min: 8, temp_max: 12 },
        weather: [{ icon: '01d' }],
        coord: { lat: 55, lon: 37 },
      }),
    }).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        list: [
          { dt: t(3), main: { temp: 6, temp_min: 5, temp_max: 7 }, weather: [{ icon: '03d' }] },
          { dt: t(12), main: { temp: 14, temp_min: 10, temp_max: 16 }, weather: [{ icon: '01d' }] },
          { dt: t(21), main: { temp: 8, temp_min: 7, temp_max: 9 }, weather: [{ icon: '02n' }] },
        ],
      }),
    }));

    await refreshWeather('key', 'Moscow');
    const result = weatherForDay(tomorrow);
    expect(result).not.toBeNull();
    expect(result.temp).toBeNull();
    expect(result.min).toBe(5);
    expect(result.max).toBe(16);
    expect(result.icon).toBe('sun');
  });

  it('returns null when no cache', () => {
    expect(weatherForDay(new Date())).toBeNull();
  });
});

describe('findWeatherConfig', () => {
  it('finds weather widget with API key', () => {
    const ws = {
      widgets: [
        { type: 'todo', config: {} },
        { type: 'weather', config: { apiKey: 'abc', city: 'London' } },
      ],
    };
    expect(findWeatherConfig(ws)).toEqual({ apiKey: 'abc', city: 'London' });
  });

  it('returns null when no API key', () => {
    const ws = {
      widgets: [
        { type: 'weather', config: { apiKey: '', city: 'London' } },
      ],
    };
    expect(findWeatherConfig(ws)).toBeNull();
  });

  it('returns null when no weather widget', () => {
    expect(findWeatherConfig({ widgets: [{ type: 'todo' }] })).toBeNull();
  });

  it('returns null for null workspace', () => {
    expect(findWeatherConfig(null)).toBeNull();
  });
});

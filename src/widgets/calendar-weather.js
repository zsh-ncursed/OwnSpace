/**
 * Calendar weather integration.
 *
 * Fetches the 5-day OpenWeatherMap forecast once and caches it for
 * CACHE_TTL ms.  Each caller can then look up per-day data:
 *   – today:  current temperature from /data/2.5/weather
 *   – +1…+4:  max / min from /data/2.5/forecast (3-hour buckets)
 */

import { getLang } from '../i18n/index.js';

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ── tiny in-memory cache ──────────────────────────────────────────────
let _cache = null; // { city, apiKey, fetchedAt, current, forecast }

/**
 * Return cached weather or null if stale / missing.
 */
export function getCachedWeather() {
  if (!_cache) return null;
  if (Date.now() - _cache.fetchedAt > CACHE_TTL) return null;
  return _cache;
}

/** Clear the in-memory cache (for testing). */
export function clearWeatherCache() {
  _cache = null;
}

/**
 * Force-refresh the cache. Returns the fresh cache object.
 * @param {string} apiKey
 * @param {string} city
 */
export async function refreshWeather(apiKey, city) {
  const lang = getLang();
  const coords = city.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);

  // Current weather ────────────────────────────────────────────────────
  const currentUrl = coords
    ? `https://api.openweathermap.org/data/2.5/weather?lat=${coords[1]}&lon=${coords[2]}&appid=${apiKey}&units=metric&lang=${lang}`
    : `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=${lang}`;

  const curRes = await fetch(currentUrl);
  if (!curRes.ok) throw new Error(`Weather HTTP ${curRes.status}`);
  const current = await curRes.json();

  // 5-day forecast ─────────────────────────────────────────────────────
  const fUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${current.coord.lat}&lon=${current.coord.lon}&appid=${apiKey}&units=metric&lang=${lang}`;
  const fRes = await fetch(fUrl);
  if (!fRes.ok) throw new Error(`Forecast HTTP ${fRes.status}`);
  const forecast = await fRes.json();

  _cache = {
    city,
    apiKey,
    fetchedAt: Date.now(),
    current,
    forecast,
  };
  return _cache;
}

// ── helpers ───────────────────────────────────────────────────────────

const ICON_MAP = {
  '01': 'sun',
  '02': 'cloud_sun',
  '03': 'cloud',
  '04': 'cloud',
  '09': 'cloud_rain',
  '10': 'cloud_rain',
  '11': 'cloud_lightning',
  '13': 'cloud_snow',
  '50': 'mist',
};

export function weatherIconName(iconCode) {
  const code = (iconCode || '').slice(0, 2);
  return ICON_MAP[code] || 'cloud';
}

/**
 * Day key: "YYYY-MM-DD"
 */
function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * For a given calendar day (Date), return:
 *   { temp, min, max, icon }  or  null
 *
 * For "today" uses current weather; for +1…+4 uses forecast buckets.
 */
export function weatherForDay(date) {
  const cache = getCachedWeather();
  if (!cache) return null;

  const now = new Date();
  const today = dayKey(now);
  const target = dayKey(date);

  if (target === today) {
    // Current weather
    const c = cache.current;
    return {
      temp: Math.round(c.main.temp),
      icon: weatherIconName(c.weather[0]?.icon),
      min: Math.round(c.main.temp_min),
      max: Math.round(c.main.temp_max),
    };
  }

  // Forecast day: group 3-hour entries by date, pick max/min and
  // representative icon (closest to noon).
  const list = cache.forecast?.list || [];
  const buckets = [];
  for (const entry of list) {
    const d = new Date(entry.dt * 1000);
    if (dayKey(d) !== target) continue;
    buckets.push(entry);
  }
  if (!buckets.length) return null;

  let min = Infinity;
  let max = -Infinity;
  let bestIcon = buckets[0].weather[0]?.icon;
  let bestDist = Infinity;

  for (const b of buckets) {
    if (b.main.temp_min < min) min = b.main.temp_min;
    if (b.main.temp_max > max) max = b.main.temp_max;
    const h = new Date(b.dt * 1000).getHours();
    const dist = Math.abs(h - 12);
    if (dist < bestDist) {
      bestDist = dist;
      bestIcon = b.weather[0]?.icon;
    }
  }

  return {
    temp: null,       // no single "current" for future days
    min: Math.round(min),
    max: Math.round(max),
    icon: weatherIconName(bestIcon),
  };
}

/**
 * Find the weather widget in a workspace (returns { apiKey, city } or null).
 */
export function findWeatherConfig(workspace) {
  const w = workspace?.widgets?.find((v) => v.type === 'weather' && v.config?.apiKey);
  if (!w) return null;
  return { apiKey: w.config.apiKey, city: w.config.city || 'Moscow' };
}

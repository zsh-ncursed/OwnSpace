import { t, getLang, getDayNames } from '../i18n/index.js';

export const WIDGET_TYPE = 'weather';

const WEATHER_ICON_MAP = {
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

export function renderWeatherWidget(widget) {
  if (!widget.config.apiKey) {
    return `
      <div class="weather-widget" data-widget-id="${widget.id}">
        <p>${t('widget.weather.enter_key')}</p>
        <input type="text" placeholder="${t('widget.weather.api_key_placeholder')}" class="api-key-input" />
        <input type="text" placeholder="${t('widget.weather.city_placeholder')}" class="city-input" value="${widget.config.city || 'Moscow'}" />
        <div class="weather-widget-actions">
          <button class="api-key-save-btn icon-btn" title="${t('widget.weather.save_key')}">${ICONS.btn('check')}</button>
          <span class="api-key-save-status"></span>
          <a href="https://openweathermap.org/api" target="_blank" class="api-key-link">${t('widget.weather.get_key')}</a>
        </div>
      </div>
    `;
  }
  return `
    <div class="weather-widget" data-widget-id="${widget.id}">
      <div class="weather-content">
        <div class="weather-main">
          <div class="weather-icon" data-icon="cloud" aria-hidden="true">${ICONS.btn('cloud')}</div>
          <div class="temp">--°C</div>
        </div>
        <div class="desc">${t('widget.weather.loading')}</div>
        <div class="wind">${t('widget.weather.wind')}</div>
        <div class="location-row">
          <span class="location">${widget.config.city || 'Moscow'}</span>
          <button class="edit-city-btn icon-btn" title="${t('widget.weather.edit_city')}" aria-label="${t('widget.weather.edit_city')}">${ICONS.btn('pencil')}</button>
          <button class="change-key-btn icon-btn" title="${t('widget.weather.change_key')}" aria-label="${t('widget.weather.change_key')}">${ICONS.btn('key')}</button>
        </div>
      </div>
      <div class="weather-forecast">
        <div class="forecast-day" data-day="1"><span class="forecast-day-name"></span><span class="forecast-icon"></span><span class="forecast-temp"></span></div>
        <div class="forecast-day" data-day="2"><span class="forecast-day-name"></span><span class="forecast-icon"></span><span class="forecast-temp"></span></div>
        <div class="forecast-day" data-day="3"><span class="forecast-day-name"></span><span class="forecast-icon"></span><span class="forecast-temp"></span></div>
      </div>
      <input type="text" class="city-edit-input" value="${widget.config.city || 'Moscow'}" style="display:none" />
    </div>
  `;
}

export async function fetchWeather(el, apiKey, city = 'Moscow') {
  const descEl = el.querySelector('.desc');
  const windEl = el.querySelector('.wind');
  const iconEl = el.querySelector('.weather-icon');
  try {
    const lang = getLang();
    const coords = city.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    const url = coords
      ? `https://api.openweathermap.org/data/2.5/weather?lat=${coords[1]}&lon=${coords[2]}&appid=${apiKey}&units=metric&lang=${lang}`
      : `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=${lang}`;

    const response = await fetch(url);

    if (response.status === 401) throw new Error(t('widget.weather.invalid_key'));
    if (response.status === 400 || response.status === 404) {
      throw new Error(
        coords ? t('widget.weather.coords_out_of_range') : t('widget.weather.city_not_found', { city }),
      );
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const tempEl = el.querySelector('.temp');
    const locEl = el.querySelector('.location');
    if (tempEl) tempEl.textContent = `${Math.round(data.main.temp)}°C`;
    if (descEl) descEl.textContent = data.weather[0].description;
    if (locEl) locEl.textContent = data.name;
    if (windEl) windEl.textContent = t('weather.wind_unit', { n: data.wind.speed.toFixed(1) });
    if (iconEl) {
      const code = (data.weather[0].icon || '').slice(0, 2);
      const name = WEATHER_ICON_MAP[code] || 'cloud';
      iconEl.replaceChildren(...[]);
      iconEl.insertAdjacentHTML('beforeend', ICONS.btn(name));
      iconEl.dataset.icon = name;
    }

    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${data.coord.lat}&lon=${data.coord.lon}&appid=${apiKey}&units=metric&lang=${lang}`;
    const forecastRes = await fetch(forecastUrl);
    if (!forecastRes.ok)
      throw new Error(`Forecast HTTP ${forecastRes.status}`);
    const forecastData = await forecastRes.json();
    renderForecast(el, forecastData);
  } catch (e) {
    if (descEl) descEl.textContent = t('widget.weather.error_prefix', { message: e.message });
  }
}

function renderForecast(el, forecastData) {
  const forecastDays = el.querySelectorAll('.forecast-day');
  if (!forecastDays.length) return;

  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  })();

  const dayGroups = {};
  for (const entry of forecastData.list || []) {
    const d = new Date(entry.dt * 1000);
    const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!dayGroups[dayKey]) dayGroups[dayKey] = [];
    dayGroups[dayKey].push(entry);
  }

  const dayKeys = Object.keys(dayGroups).sort();
  let dayIdx = 0;

  for (const dayKey of dayKeys) {
    if (dayKey === todayKey) continue;
    if (dayIdx >= 3) break;

    const entries = dayGroups[dayKey];
    const entryDate = new Date(entries[0].dt * 1000);
    const dayEl = forecastDays[dayIdx];
    dayEl.querySelector('.forecast-day-name').textContent =
      getDayNames()[entryDate.getDay()];

    let best = entries[0];
    let bestDist = Infinity;
    for (const e of entries) {
      const h = new Date(e.dt * 1000).getHours();
      const dist = Math.abs(h - 12);
      if (dist < bestDist) {
        bestDist = dist;
        best = e;
      }
    }

    const code = (best.weather[0].icon || '').slice(0, 2);
    const iconName = WEATHER_ICON_MAP[code] || 'cloud';
    dayEl.querySelector('.forecast-icon').replaceChildren(...[]);
    dayEl.querySelector('.forecast-icon').insertAdjacentHTML('beforeend', ICONS.btn(iconName));
    dayEl.querySelector('.forecast-temp').textContent = `${Math.round(best.main.temp)}°`;
    dayIdx++;
  }
}

export default {
  type: WIDGET_TYPE,
  title: 'widget.weather.title',
  icon: 'cloud-sun',
  defaultConfig: { apiKey: '', city: 'Moscow', title: '' },
  render: renderWeatherWidget,
};

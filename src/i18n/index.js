import { storage } from '../storage.js';
import { STORAGE_KEYS } from '../utils/constants.js';
import en from './en.js';
import ru from './ru.js';

const DICTS = { en, ru };
const FALLBACK = 'en';

let _lang = 'en';
let _dict = en;

export async function initLocale() {
  const settings = await storage.local.getItem(STORAGE_KEYS.SETTINGS);
  _lang = settings?.language || 'en';
  if (!DICTS[_lang]) _lang = 'en';
  _dict = DICTS[_lang];
}

export function setLang(lang) {
  _lang = DICTS[lang] ? lang : 'en';
  _dict = DICTS[_lang];
}

export function t(key, params) {
  let s = _dict[key] ?? DICTS[FALLBACK][key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
}

export function getLang() {
  return _lang;
}

export function getDayNames() {
  return t('widget.weather.day_names').split(',');
}
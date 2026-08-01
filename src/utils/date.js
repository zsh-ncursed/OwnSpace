import { t } from '../i18n/index.js';

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function eventDateKey(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

export function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('time.just_now');
  if (mins < 60) return t('time.min_ago', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('time.hours_ago', { n: hours });
  const days = Math.floor(hours / 24);
  return t('time.days_ago', { n: days });
}

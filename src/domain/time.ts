/** Date/time helpers. Matches store a local date + time + IANA timezone (unambiguous). */
export interface Timezone { id: string; label: string; short: string }

export const TIMEZONES: Timezone[] = [
  { id: 'Europe/Moscow', label: 'Москва (UTC+3)', short: 'МСК' },
  { id: 'Europe/Kaliningrad', label: 'Калининград (UTC+2)', short: 'KGD' },
  { id: 'Europe/Samara', label: 'Самара (UTC+4)', short: 'SAMT' },
  { id: 'Asia/Yekaterinburg', label: 'Екатеринбург (UTC+5)', short: 'YEKT' },
  { id: 'Asia/Novosibirsk', label: 'Новосибирск (UTC+7)', short: 'NOVT' },
  { id: 'Asia/Vladivostok', label: 'Владивосток (UTC+10)', short: 'VLAT' },
  { id: 'Europe/Minsk', label: 'Минск (UTC+3)', short: 'MSK' },
  { id: 'Europe/Kyiv', label: 'Киев (EET)', short: 'EET' },
  { id: 'Asia/Almaty', label: 'Алматы (UTC+5)', short: 'ALMT' },
  { id: 'Europe/Berlin', label: 'Центральная Европа (CET)', short: 'CET' },
  { id: 'Europe/London', label: 'Лондон (GMT/BST)', short: 'GMT' },
  { id: 'UTC', label: 'UTC', short: 'UTC' },
  { id: 'America/New_York', label: 'Нью-Йорк (ET)', short: 'ET' },
  { id: 'America/Lima', label: 'Лима (PET)', short: 'PET' },
  { id: 'Asia/Singapore', label: 'Сингапур (SGT)', short: 'SGT' },
  { id: 'Asia/Shanghai', label: 'Китай (CST)', short: 'CST' },
];

export const DEFAULT_TIMEZONE = 'Europe/Moscow';

export const tzShort = (id: string | null | undefined): string => TIMEZONES.find((t) => t.id === id)?.short ?? id ?? '';
export const tzLabel = (id: string | null | undefined): string => TIMEZONES.find((t) => t.id === id)?.label ?? id ?? '';

const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS_RU = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
const WEEKDAYS_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function parseDate(date: string | null | undefined): { y: number; mo: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  if (!m) return null;
  return { y: +m[1]!, mo: +m[2]!, d: +m[3]! };
}

/** Human date for UI: "13 октября 2026". */
export function formatDateRu(date: string | null | undefined): string {
  const p = parseDate(date);
  if (!p) return '';
  return `${p.d} ${MONTHS_RU[p.mo - 1]} ${p.y}`;
}

export const DATE_STYLES: Array<{ value: string; label: string }> = [
  { value: 'dots', label: '13.10' },
  { value: 'full', label: '13.10.2026' },
  { value: 'en', label: '13 OCT' },
  { value: 'ru', label: '13 ОКТЯБРЯ' },
];

/** Poster date in a chosen style (see DATE_STYLES). */
export function formatPosterDate(date: string | null | undefined, style = 'dots'): string {
  const p = parseDate(date);
  if (!p) return '';
  const dd = String(p.d).padStart(2, '0');
  const mm = String(p.mo).padStart(2, '0');
  switch (style) {
    case 'full':
      return `${dd}.${mm}.${p.y}`;
    case 'en':
      return `${p.d} ${MONTHS_EN[p.mo - 1]}`;
    case 'ru':
      return `${p.d} ${MONTHS_RU[p.mo - 1]!.toUpperCase()}`;
    default:
      return `${dd}.${mm}`;
  }
}

export function weekday(date: string | null | undefined, lang = 'ru'): string {
  const p = parseDate(date);
  if (!p) return '';
  const idx = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
  return (lang === 'en' ? WEEKDAYS_EN : WEEKDAYS_RU)[idx]!;
}

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Sort key for matches; undated matches go last. */
export const matchSortKey = (m: { startDate?: string | null; startTime?: string | null }): string => `${m.startDate || '9999-99-99'}T${m.startTime || '99:99'}`;

export function formatDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} ч назад`;
  const days = Math.round(hr / 24);
  if (days < 7) return `${days} дн назад`;
  return formatDateTimeShort(iso);
}

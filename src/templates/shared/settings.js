/**
 * Shared appearance settings: defaults, themes and setting descriptors.
 *
 * A template declares which common groups it supports via `commonSettings({...})`
 * and adds its own descriptors. The editor renders controls generically from
 * descriptors — adding a template never requires editor changes.
 *
 * Descriptor: { key: 'path.in.style', type, label, group, default?, min?, max?, step?,
 *               options?, when?: (style) => boolean, hint?, kind? (media kind for images) }
 * Types: color | range | select | segmented | toggle | text | image | font | background
 */
import { FONT_OPTIONS } from './fonts.js';
import { BACKGROUND_OPTIONS } from './backgrounds.js';
import { DATE_STYLES } from '../../domain/time.js';

export const GROUPS = {
  theme: 'Тема',
  background: 'Фон',
  player: 'Игрок / персонаж',
  typography: 'Типографика',
  colors: 'Цвета',
  layout: 'Композиция',
  elements: 'Элементы',
  socials: 'Подписи и соцсети',
};

export const THEMES = {
  ember: { id: 'ember', label: 'Ember', accent: '#ff4b3e', text: '#ffffff', background: { preset: 'ember' }, overlay: { color: '#000000', opacity: 25 }, gradient: { color: '#0b0303', opacity: 75 } },
  midnight: { id: 'midnight', label: 'Midnight', accent: '#4f7cff', text: '#ffffff', background: { preset: 'midnight' }, overlay: { color: '#000000', opacity: 20 }, gradient: { color: '#03040a', opacity: 75 } },
  radiant: { id: 'radiant', label: 'Radiant', accent: '#3ddc84', text: '#f3fff8', background: { preset: 'radiant' }, overlay: { color: '#000000', opacity: 20 }, gradient: { color: '#020805', opacity: 75 } },
  dire: { id: 'dire', label: 'Dire', accent: '#ff3d3d', text: '#fff5f5', background: { preset: 'dire' }, overlay: { color: '#000000', opacity: 20 }, gradient: { color: '#080202', opacity: 75 } },
  aegis: { id: 'aegis', label: 'Aegis', accent: '#e9b949', text: '#fffaf0', background: { preset: 'aegis' }, overlay: { color: '#000000', opacity: 20 }, gradient: { color: '#070503', opacity: 70 } },
  mono: { id: 'mono', label: 'Mono', accent: '#ffffff', text: '#ffffff', background: { preset: 'graphite' }, overlay: { color: '#000000', opacity: 30 }, gradient: { color: '#000000', opacity: 70 } },
  storm: { id: 'storm', label: 'Storm', accent: '#9b7bff', text: '#ffffff', background: { preset: 'storm' }, overlay: { color: '#000000', opacity: 20 }, gradient: { color: '#040309', opacity: 75 } },
};

export const THEME_OPTIONS = Object.values(THEMES).map((t) => ({ value: t.id, label: t.label, swatch: t.accent }));

/** Defaults shared by every template. Templates override/extend in `defaults`. */
export const BASE_STYLE = {
  theme: 'ember',
  accent: THEMES.ember.accent,
  text: THEMES.ember.text,
  font: { family: 'roboto-flex', weight: 900, slant: -10, width: 100 },
  bodyFont: { family: 'roboto-flex', weight: 500, slant: -10, width: 100 },
  uppercase: true,
  background: { preset: 'ember', solid: '#0b0b0d', assetId: null, scale: 100, x: 50, y: 50, blur: 0, grayscale: 0, brightness: 100 },
  overlay: { enabled: true, color: '#000000', opacity: 25 },
  gradient: { enabled: true, color: '#0b0303', opacity: 75, angle: 0, size: 60 },
  player: { enabled: true, assetId: null, scale: 100, x: 50, y: 0, flip: false, shadow: true },
  dateStyle: 'dots',
  show: { tournament: true, stage: true, format: true, date: true, time: true, timezone: true, logos: true, socials: true, handle: true, names: true },
  socials: { line1: 't.me/yourchannel', line2: 'twitch.tv/yourchannel', handle: '@DOTAFRAME' },
};

/** Apply a theme preset onto a style (keeps user images and layout settings). */
export function applyTheme(style, themeId) {
  const t = THEMES[themeId];
  if (!t) return style;
  return {
    ...style,
    theme: t.id,
    accent: t.accent,
    text: t.text,
    background: { ...style.background, preset: t.background.preset },
    overlay: { ...style.overlay, ...t.overlay },
    gradient: { ...style.gradient, ...t.gradient },
  };
}

const range = (key, label, group, min, max, step = 1, extra = {}) => ({ key, type: 'range', label, group, min, max, step, ...extra });

/**
 * Common descriptors. Options let a template opt out of groups it doesn't render.
 */
export function commonSettings(opts = {}) {
  const o = { player: true, socials: true, gradient: true, dateStyle: true, elements: [], ...opts };
  const out = [
    { key: 'theme', type: 'theme', label: 'Готовая тема', group: 'theme', options: THEME_OPTIONS },
    { key: 'accent', type: 'color', label: 'Акцентный цвет', group: 'colors' },
    { key: 'text', type: 'color', label: 'Цвет текста', group: 'colors' },

    { key: 'background.preset', type: 'background', label: 'Фон-пресет', group: 'background', options: BACKGROUND_OPTIONS, hint: 'Используется, если не загружено фото' },
    { key: 'background.solid', type: 'color', label: 'Цвет фона', group: 'background', when: (s) => s.background.preset === 'solid' && !s.background.assetId },
    { key: 'background.assetId', type: 'image', label: 'Фото фона', group: 'background', kind: 'background', hint: 'JPEG/PNG/WebP, до 25 МБ' },
    range('background.scale', 'Масштаб фото', 'background', 100, 250, 1, { unit: '%', when: (s) => !!s.background.assetId }),
    range('background.x', 'Позиция по горизонтали', 'background', 0, 100, 1, { unit: '%', when: (s) => !!s.background.assetId }),
    range('background.y', 'Позиция по вертикали', 'background', 0, 100, 1, { unit: '%', when: (s) => !!s.background.assetId }),
    range('background.blur', 'Размытие', 'background', 0, 20, 1, { unit: 'px', when: (s) => !!s.background.assetId }),
    range('background.grayscale', 'Обесцвечивание', 'background', 0, 100, 1, { unit: '%', when: (s) => !!s.background.assetId }),
    range('background.brightness', 'Яркость', 'background', 40, 140, 1, { unit: '%', when: (s) => !!s.background.assetId }),
    { key: 'overlay.enabled', type: 'toggle', label: 'Затемнение', group: 'background' },
    { key: 'overlay.color', type: 'color', label: 'Цвет затемнения', group: 'background', when: (s) => s.overlay.enabled },
    range('overlay.opacity', 'Сила затемнения', 'background', 0, 90, 1, { unit: '%', when: (s) => s.overlay.enabled }),
  ];
  if (o.gradient) {
    out.push(
      { key: 'gradient.enabled', type: 'toggle', label: 'Градиент', group: 'background' },
      { key: 'gradient.color', type: 'color', label: 'Цвет градиента', group: 'background', when: (s) => s.gradient.enabled },
      range('gradient.opacity', 'Плотность градиента', 'background', 0, 100, 1, { unit: '%', when: (s) => s.gradient.enabled }),
      range('gradient.size', 'Высота градиента', 'background', 20, 100, 1, { unit: '%', when: (s) => s.gradient.enabled }),
      { key: 'gradient.angle', type: 'segmented', label: 'Направление', group: 'background', options: [{ value: 0, label: 'Снизу' }, { value: 180, label: 'Сверху' }, { value: 90, label: 'Слева' }, { value: 270, label: 'Справа' }], when: (s) => s.gradient.enabled },
    );
  }
  if (o.player) {
    out.push(
      { key: 'player.assetId', type: 'image', label: 'Изображение игрока / героя', group: 'player', kind: 'player', hint: 'Лучше PNG с прозрачным фоном' },
      range('player.scale', 'Масштаб', 'player', 40, 200, 1, { unit: '%', when: (s) => !!s.player.assetId }),
      range('player.x', 'Смещение по горизонтали', 'player', 0, 100, 1, { unit: '%', when: (s) => !!s.player.assetId }),
      range('player.y', 'Смещение по вертикали', 'player', -30, 40, 1, { unit: '%', when: (s) => !!s.player.assetId }),
      { key: 'player.flip', type: 'toggle', label: 'Отразить', group: 'player', when: (s) => !!s.player.assetId },
      { key: 'player.shadow', type: 'toggle', label: 'Тень', group: 'player', when: (s) => !!s.player.assetId },
    );
  }
  out.push(
    { key: 'font.family', type: 'font', label: 'Шрифт заголовка', group: 'typography', options: FONT_OPTIONS },
    range('font.weight', 'Насыщенность заголовка', 'typography', 100, 1000, 10),
    range('font.slant', 'Наклон заголовка', 'typography', -15, 0, 1, { unit: '°' }),
    range('font.width', 'Ширина знаков', 'typography', 25, 151, 1, { unit: '%', when: (s) => s.font.family === 'roboto-flex' }),
    { key: 'bodyFont.family', type: 'font', label: 'Шрифт подписей', group: 'typography', options: FONT_OPTIONS },
    range('bodyFont.weight', 'Насыщенность подписей', 'typography', 100, 900, 10),
    range('bodyFont.slant', 'Наклон подписей', 'typography', -15, 0, 1, { unit: '°' }),
    { key: 'uppercase', type: 'toggle', label: 'Верхний регистр', group: 'typography' },
  );
  if (o.dateStyle) out.push({ key: 'dateStyle', type: 'select', label: 'Формат даты', group: 'typography', options: DATE_STYLES });
  for (const el of o.elements) out.push({ key: `show.${el.key}`, type: 'toggle', label: el.label, group: 'elements' });
  if (o.socials) {
    out.push(
      { key: 'show.socials', type: 'toggle', label: 'Показывать соцсети', group: 'socials' },
      { key: 'socials.line1', type: 'text', label: 'Строка 1', group: 'socials', maxLength: 40, when: (s) => s.show.socials },
      { key: 'socials.line2', type: 'text', label: 'Строка 2', group: 'socials', maxLength: 40, when: (s) => s.show.socials },
      { key: 'show.handle', type: 'toggle', label: 'Показывать подпись автора', group: 'socials' },
      { key: 'socials.handle', type: 'text', label: 'Подпись автора', group: 'socials', maxLength: 32, when: (s) => s.show.handle },
    );
  }
  return out;
}

/** Standard element-visibility toggles that match-based templates reuse. */
export const ELEMENTS = {
  tournament: { key: 'tournament', label: 'Турнир' },
  stage: { key: 'stage', label: 'Стадия' },
  format: { key: 'format', label: 'Формат серии' },
  date: { key: 'date', label: 'Дата' },
  time: { key: 'time', label: 'Время' },
  timezone: { key: 'timezone', label: 'Часовой пояс' },
  logos: { key: 'logos', label: 'Логотипы' },
  names: { key: 'names', label: 'Названия команд' },
};

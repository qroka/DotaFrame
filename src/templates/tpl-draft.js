/**
 * Dota Draft — one map: Radiant and Dire teams, 5 picks each, variable ban lists,
 * map number, tournament, format, optional map winner.
 */
import { h } from '../core/dom.js';
import { defineTemplate } from './registry.js';
import { commonSettings, ELEMENTS } from './shared/settings.js';
import { baseLayers, posterRoot, teamLogo, fitText, handleBlock, tournamentLine, formatLong, displayName, hexA } from './shared/primitives.js';
import { heroTile } from './shared/heroes.js';

export const SIDE_COLORS = { radiant: '#3ddc84', dire: '#ff4b3e' };
export const MAX_BANS = 10;

export function draftHeroes(data) {
  return [...(data.picksRadiant ?? []), ...(data.picksDire ?? []), ...(data.bansRadiant ?? []), ...(data.bansDire ?? [])];
}

export default defineTemplate({
  id: 'draft',
  type: 'draft',
  version: 1,
  order: 60,
  name: 'Dota Draft',
  description: 'Драфт одной карты: по 5 пиков Radiant и Dire, баны, номер карты и турнир.',
  source: 'draft',
  base: { width: 1080, height: 1080 },
  exportSizes: [
    { width: 1080, height: 1080 },
    { width: 1280, height: 1280 },
  ],
  texts: [
    { key: 'title', label: 'Заголовок', default: 'DRAFT', maxLength: 14 },
    { key: 'mapLabel', label: 'Подпись карты', default: 'GAME', maxLength: 10 },
    { key: 'radiantLabel', label: 'Radiant', default: 'RADIANT', maxLength: 12 },
    { key: 'direLabel', label: 'Dire', default: 'DIRE', maxLength: 12 },
    { key: 'bansLabel', label: 'Подпись банов', default: 'BANS', maxLength: 12 },
    { key: 'winnerLabel', label: 'Победа на карте', default: 'WIN', maxLength: 10 },
  ],
  defaults: {
    theme: 'midnight',
    sideColors: true,
    showBans: true,
    showHeroNames: true,
    useShortNames: false,
    player: { enabled: false },
    gradient: { enabled: true, opacity: 60, size: 50, angle: 0 },
  },
  settings: [
    ...commonSettings({ player: false, elements: [ELEMENTS.logos, ELEMENTS.tournament, ELEMENTS.stage, ELEMENTS.format] }),
    { key: 'sideColors', type: 'toggle', label: 'Цвета Radiant / Dire', group: 'layout', hint: 'Иначе используется акцентный цвет' },
    { key: 'showBans', type: 'toggle', label: 'Показывать баны', group: 'layout' },
    { key: 'showHeroNames', type: 'toggle', label: 'Имена героев', group: 'layout' },
    { key: 'useShortNames', type: 'toggle', label: 'Короткие названия команд', group: 'layout' },
  ],
  validate(data) {
    const out = [];
    if (!data.radiant?.name || !data.dire?.name) out.push({ level: 'error', message: 'Назначьте команды Radiant и Dire' });
    if (data.radiant?.teamId && data.radiant.teamId === data.dire?.teamId) out.push({ level: 'error', message: 'Radiant и Dire должны быть разными командами' });
    const picks = [...(data.picksRadiant ?? []), ...(data.picksDire ?? [])];
    if ((data.picksRadiant ?? []).length !== 5 || (data.picksDire ?? []).length !== 5 || picks.some((p) => !p)) out.push({ level: 'error', message: 'Нужно выбрать по 5 героев каждой команде' });
    if ((data.bansRadiant ?? []).length > MAX_BANS || (data.bansDire ?? []).length > MAX_BANS) out.push({ level: 'error', message: `Не больше ${MAX_BANS} банов у каждой команды` });
    const ids = draftHeroes(data).filter(Boolean).map((x) => x.heroId);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dup.length) {
      const names = [...new Set(dup)].map((id) => draftHeroes(data).find((x) => x?.heroId === id)?.name ?? id);
      out.push({ level: 'error', message: `Герой выбран несколько раз: ${names.join(', ')}` });
    }
    const heroes = draftHeroes(data).filter(Boolean);
    const noPortrait = heroes.filter((x) => !x.portraitAssetId).length;
    if (heroes.length && noPortrait) out.push({ level: 'warning', message: `Нет портретов для ${noPortrait} из ${heroes.length} героев — показаны заглушки. Загрузите набор портретов в «Данные и настройки».` });
    return out;
  },
  render(ctx) {
    const { data, style } = ctx;
    const t = data.texts ?? {};
    const P = 60;
    const W = 960;
    const sideColor = (side) => (style.sideColors ? SIDE_COLORS[side] : style.accent);

    const meta = [tournamentLine(ctx), style.show.format ? formatLong(data.format) : ''].filter(Boolean);
    const header = h(
      'div',
      { style: { position: 'absolute', left: `${P}px`, right: `${P}px`, top: `${P}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' } },
      fitText(t.title || 'DRAFT', { ctx, role: 'head', size: 120, min: 60, width: 520, label: 'Заголовок', className: 'df-trim' }),
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '14px' } },
        fitText(`${t.mapLabel || 'GAME'} ${data.mapNumber ?? 1}`, { ctx, role: 'head', size: 56, min: 28, width: 400, align: 'right', label: 'Номер карты', className: 'df-trim' }),
        meta.map((line) => fitText(line, { ctx, size: 22, min: 12, width: 420, weight: 600, align: 'right', label: 'Турнир', className: 'df-trim', letterSpacing: '0.04em' })),
      ),
    );
    header.querySelectorAll('.df-fit')[1].style.color = style.accent;

    const pickW = (W - 4 * 14) / 5;
    const pickH = style.showBans ? 150 : 210;

    const section = (side, team, picks, bans) => {
      const color = sideColor(side);
      const label = side === 'radiant' ? t.radiantLabel || 'RADIANT' : t.direLabel || 'DIRE';
      const won = data.mapWinner === side;
      const bar = h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '18px', height: '64px' } },
        style.show.logos ? teamLogo(ctx, team, 60) : null,
        fitText(displayName(team, style.useShortNames), { ctx, size: 40, min: 18, width: style.show.logos ? 560 : 640, weight: 800, label: 'Команда', className: 'df-trim' }),
        h(
          'div',
          { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '14px' } },
          won ? h('div', { style: { background: color, color: '#0b0b0d', padding: '9px 16px 8px', borderRadius: '6px' } }, fitText(t.winnerLabel || 'WIN', { ctx, size: 22, min: 12, width: 90, weight: 900, align: 'center', label: 'Победа', className: 'df-trim', letterSpacing: '0.08em' })) : null,
          fitText(label, { ctx, size: 24, min: 12, width: 190, weight: 800, align: 'right', label: 'Сторона', className: 'df-trim', letterSpacing: '0.14em' }),
        ),
      );
      bar.lastChild.lastChild.style.color = color;

      const pickRow = h(
        'div',
        { style: { display: 'flex', gap: '14px', position: 'relative' } },
        [0, 1, 2, 3, 4].map((i) => heroTile(ctx, picks?.[i] ?? null, { width: pickW, height: pickH, showName: style.showHeroNames, nameSize: 18 })),
      );
      const accentLine = h('div', { style: { height: '4px', width: `${W}px`, background: `linear-gradient(to right, ${color}, ${hexA(color, 0)})`, borderRadius: '2px' } });

      let banRow = null;
      if (style.showBans) {
        const n = Math.min(bans?.length ?? 0, MAX_BANS);
        const labelW = 110;
        const avail = W - labelW;
        const gap = 8;
        const bw = n ? Math.min(84, (avail - (n - 1) * gap) / n) : 0;
        banRow = h(
          'div',
          { style: { display: 'flex', alignItems: 'center', height: '52px' } },
          fitText(t.bansLabel || 'BANS', { ctx, size: 18, min: 10, width: labelW - 14, weight: 700, label: 'Баны', className: 'df-trim', letterSpacing: '0.14em' }),
          n
            ? h('div', { style: { display: 'flex', gap: `${gap}px` } }, bans.slice(0, MAX_BANS).map((b) => heroTile(ctx, b, { width: bw, height: Math.round(bw * 0.6), banned: true, radius: 4 })))
            : h('div', { style: { opacity: '0.45', fontSize: '18px', fontWeight: '600' } }, '—'),
        );
        banRow.firstChild.style.opacity = '0.7';
      }
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } }, bar, accentLine, pickRow, banRow);
    };

    const body = h(
      'div',
      { style: { position: 'absolute', left: `${P}px`, right: `${P}px`, top: '236px', display: 'flex', flexDirection: 'column', gap: '40px' } },
      section('radiant', data.radiant, data.picksRadiant, data.bansRadiant),
      section('dire', data.dire, data.picksDire, data.bansDire),
    );

    const footer = h(
      'div',
      { style: { position: 'absolute', left: `${P}px`, right: `${P}px`, bottom: `${P}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' } },
      handleBlock(ctx, { size: 20, align: 'left' }) ?? h('div'),
      style.show.socials && [style.socials.line1, style.socials.line2].some((l) => l?.trim())
        ? fitText([style.socials.line1, style.socials.line2].filter((l) => l?.trim()).join('   ·   '), { ctx, size: 20, min: 12, width: 620, align: 'right', label: 'Соцсети' })
        : h('div'),
    );
    footer.lastChild.style.textTransform = 'lowercase';

    return posterRoot(ctx, 'tpl-draft', ...baseLayers(ctx), h('div', { class: 'df-content' }, header, body, footer));
  },
});

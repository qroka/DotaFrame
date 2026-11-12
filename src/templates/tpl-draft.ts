/**
 * Dota Draft — one map: Radiant and Dire teams, 5 picks each, variable ban lists,
 * map number, tournament, format, optional map winner.
 */
import { h } from '../core/dom';
import { heroPortraitUrl } from '../data/heroes';
import { defineTemplate } from './registry';
import { commonSettings, ELEMENTS } from './shared/settings';
import { baseLayers, posterRoot, teamLogo, fitText, handleBlock, formatLong, displayName } from './shared/primitives';
import { heroTile } from './shared/heroes';
import type { DraftPosterData, HeroSnapshot, TeamSnapshot } from '../types';
import type { PosterIssue } from './types';

export const MAX_BANS = 10;

export function draftHeroes(data: Pick<DraftPosterData, 'picksRadiant' | 'picksDire' | 'bansRadiant' | 'bansDire'>): Array<HeroSnapshot | null> {
  return [...(data.picksRadiant ?? []), ...(data.picksDire ?? []), ...(data.bansRadiant ?? []), ...(data.bansDire ?? [])];
}

export default defineTemplate<DraftPosterData>({
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
  ],
  defaults: {
    theme: 'mono',
    accent: '#ffffff',
    text: '#ffffff',
    font: { family: 'roboto-flex', weight: 700, slant: -10, width: 100 },
    bodyFont: { family: 'roboto-flex', weight: 500, slant: -10, width: 100 },
    background: { preset: 'solid', solid: '#000000', grayscale: 0, brightness: 100 },
    overlay: { enabled: false, color: '#000000', opacity: 0 },
    showBans: true,
    showHeroNames: true,
    useShortNames: false,
    player: { enabled: false },
    gradient: { enabled: false, color: '#000000', opacity: 0, size: 50, angle: 0 },
  },
  settings: [
    ...commonSettings({ player: false, elements: [ELEMENTS.logos, ELEMENTS.tournament, ELEMENTS.stage, ELEMENTS.format] }),
    { key: 'showBans', type: 'toggle', label: 'Показывать баны', group: 'layout' },
    { key: 'showHeroNames', type: 'toggle', label: 'Имена героев', group: 'layout' },
    { key: 'useShortNames', type: 'toggle', label: 'Короткие названия команд', group: 'layout' },
  ],
  validate(data) {
    const out: PosterIssue[] = [];
    if (!data.radiant?.name || !data.dire?.name) out.push({ level: 'error', message: 'Назначьте команды Radiant и Dire' });
    if (data.radiant?.teamId && data.radiant.teamId === data.dire?.teamId) out.push({ level: 'error', message: 'Radiant и Dire должны быть разными командами' });
    const picks = [...(data.picksRadiant ?? []), ...(data.picksDire ?? [])];
    if ((data.picksRadiant ?? []).length !== 5 || (data.picksDire ?? []).length !== 5 || picks.some((p) => !p)) out.push({ level: 'error', message: 'Нужно выбрать по 5 героев каждой команде' });
    if ((data.bansRadiant ?? []).length > MAX_BANS || (data.bansDire ?? []).length > MAX_BANS) out.push({ level: 'error', message: `Не больше ${MAX_BANS} банов у каждой команды` });
    const ids = draftHeroes(data).filter((x): x is HeroSnapshot => !!x).map((x) => x.heroId);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dup.length) {
      const names = [...new Set(dup)].map((id) => draftHeroes(data).find((x) => x?.heroId === id)?.name ?? id);
      out.push({ level: 'error', message: `Герой выбран несколько раз: ${names.join(', ')}` });
    }
    const heroes = draftHeroes(data).filter((x): x is HeroSnapshot => !!x);
    const noPortrait = heroes.filter((x) => !x.portraitAssetId && !heroPortraitUrl(x)).length;
    if (heroes.length && noPortrait) out.push({ level: 'warning', message: `Нет портретов для ${noPortrait} из ${heroes.length} героев — показаны заглушки. Загрузите набор портретов в «Данные и настройки».` });
    return out;
  },
  render(ctx) {
    const { data, style } = ctx;
    const t = data.texts ?? {};
    const P = 51;
    const W = 979;

    const meta = [
      style.show.tournament ? data.tournament : '',
      [style.show.format ? formatLong(data.format) : '', style.show.stage ? data.stage : ''].filter(Boolean).join(' · '),
    ].filter(Boolean);
    const header = h(
      'div',
      { style: { position: 'absolute', left: `${P}px`, right: `${P}px`, top: `${P}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
      fitText(t.title || 'DRAFT', { ctx, role: 'head', size: 169, min: 60, width: 481, weight: 700, label: 'Заголовок', className: 'df-trim' }),
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '20px', width: '266px' } },
        fitText(`${t.mapLabel || 'GAME'} ${data.mapNumber ?? 1}`, { ctx, role: 'head', size: 68, min: 28, width: 231, weight: 700, align: 'right', label: 'Номер карты', className: 'df-trim' }),
        meta.map((line) => fitText(line, { ctx, size: 27, min: 12, width: 266, weight: 400, align: 'right', label: 'Турнир', className: 'df-trim' })),
      ),
    );
    header.querySelectorAll<HTMLElement>('.df-fit')[1]!.style.color = style.accent;

    const pickW = W / 5;
    const pickH = style.showBans ? 110 : 180;

    const section = (side: 'radiant' | 'dire', team: TeamSnapshot, picks: Array<HeroSnapshot | null> | undefined, bans: HeroSnapshot[] | undefined) => {
      const bar = h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '10px', height: '54px' } },
        style.show.logos ? teamLogo(ctx, team, 54) : null,
        fitText(displayName(team, style.useShortNames), { ctx, size: 41, min: 18, width: style.show.logos ? 600 : 660, weight: 500, label: 'Команда', className: 'df-trim' }),
      );

      const pickTiles = [0, 1, 2, 3, 4].map((i) => {
        const tile = heroTile(ctx, picks?.[i] ?? null, { width: pickW, height: pickH, showName: false, radius: 0 });
        tile.style.boxShadow = 'inset 0 0 0 1px rgba(255,255,255,.58)';
        return tile;
      });
      const pickRow = h('div', { style: { display: 'flex', gap: '0', position: 'relative' } }, pickTiles);
      const nameRow = style.showHeroNames
        ? h('div', { style: { display: 'flex', width: `${W}px`, height: '14px' } }, [0, 1, 2, 3, 4].map((i) => fitText(picks?.[i]?.name ?? '—', { ctx, size: 20, min: 10, width: pickW, weight: 500, align: 'center', label: 'Имя героя', className: 'df-trim' })))
        : null;

      let banRow = null;
      if (style.showBans) {
        const n = Math.min(bans?.length ?? 0, MAX_BANS);
        const labelW = 0;
        const avail = W;
        const gap = 0;
        const bw = n ? avail / n : 0;
        banRow = h(
          'div',
          { style: { display: 'flex', alignItems: 'center', height: '79px' } },
          n
            ? h('div', { style: { display: 'flex', gap: `${gap}px` } }, (bans ?? []).slice(0, MAX_BANS).map((b) => {
                const tile = heroTile(ctx, b, { width: bw, height: 79, banned: true, radius: 0 });
                tile.style.boxShadow = 'inset 0 0 0 1px rgba(255,255,255,.58)';
                return tile;
              }))
            : h('div', { style: { opacity: '0.45', fontSize: '18px', fontWeight: '600' } }, '—'),
        );
      }
      const rows = side === 'radiant' ? [bar, nameRow, pickRow, banRow] : [bar, banRow, pickRow, nameRow];
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } }, rows);
    };

    const body = h(
      'div',
      { style: { position: 'absolute', left: `${P}px`, right: `${P}px`, top: '290px', display: 'flex', flexDirection: 'column', gap: '41px' } },
      section('radiant', data.radiant, data.picksRadiant, data.bansRadiant),
      section('dire', data.dire, data.picksDire, data.bansDire),
    );

    const footer = h(
      'div',
      { style: { position: 'absolute', left: `${P}px`, right: `${P}px`, bottom: `${P}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' } },
      handleBlock(ctx, { size: 27, align: 'left' }) ?? h('div'),
      style.show.socials && [style.socials.line1, style.socials.line2].some((l) => l?.trim())
        ? fitText([style.socials.line1, style.socials.line2].filter((l) => l?.trim()).join('   ·   '), { ctx, size: 27, min: 12, width: 620, align: 'right', label: 'Соцсети' })
        : h('div'),
    );
    (footer.lastChild as HTMLElement).style.textTransform = 'lowercase';

    return posterRoot(ctx, 'tpl-draft', ...baseLayers(ctx), h('div', { class: 'df-content' }, header, body, footer));
  },
});

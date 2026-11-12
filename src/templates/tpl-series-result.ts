/**
 * Series Result — neutral final card: both teams, big centred score, winner highlighted.
 * Supports BO2 draws (1:1).
 */
import { h } from '../core/dom';
import { defineTemplate } from './registry';
import { commonSettings, ELEMENTS } from './shared/settings';
import { baseLayers, playerLayer, posterRoot, teamLogo, fitText, socialsBlock, handleBlock, dateLine, tournamentLine, formatLong, displayName } from './shared/primitives';
import { validateScore } from '../domain/series';
import type { MatchPosterData, Side, TeamSnapshot } from '../types';
import type { PosterIssue } from './types';

export default defineTemplate<MatchPosterData>({
  id: 'series-result',
  type: 'series-result',
  version: 1,
  order: 50,
  name: 'Series Result',
  description: 'Итог серии: обе команды, крупный счёт по центру, победитель выделен акцентом.',
  source: 'match',
  base: { width: 1080, height: 1080 },
  exportSizes: [
    { width: 1080, height: 1080 },
    { width: 1280, height: 1280 },
  ],
  texts: [
    { key: 'title', label: 'Заголовок', default: 'FINAL SCORE', maxLength: 24 },
    { key: 'winnerLabel', label: 'Подпись победителя', default: 'WINNER', maxLength: 14 },
    { key: 'drawLabel', label: 'Подпись ничьей', default: 'DRAW', maxLength: 14 },
  ],
  defaults: { theme: 'midnight', dimLoser: true, useShortNames: false, player: { enabled: false } },
  settings: [
    ...commonSettings({ player: false, elements: [ELEMENTS.logos, ELEMENTS.names, ELEMENTS.tournament, ELEMENTS.stage, ELEMENTS.format, ELEMENTS.date, ELEMENTS.time] }),
    { key: 'dimLoser', type: 'toggle', label: 'Приглушать проигравшего', group: 'layout' },
    { key: 'useShortNames', type: 'toggle', label: 'Короткие названия', group: 'layout' },
  ],
  validate(data) {
    const out: PosterIssue[] = [];
    if (!data.teamA?.name || !data.teamB?.name) out.push({ level: 'error', message: 'Нужны обе команды' });
    if (data.status !== 'completed') {
      out.push({ level: 'error', message: 'Серия ещё не завершена — укажите итоговый счёт и статус «Завершён» в матче' });
      return out;
    }
    const res = validateScore(data.format, 'completed', data.scoreA, data.scoreB);
    if (!res.ok) out.push({ level: 'error', message: res.errors[0]! });
    return out;
  },
  render(ctx) {
    const { data, style } = ctx;
    const t = data.texts ?? {};
    const P = 60;
    const w = data.status === 'completed' ? data.winner : null;
    const dim = (side: Side) => (style.dimLoser && w && w !== 'draw' && w !== side ? '0.45' : '1');
    const hasScore = data.scoreA !== null && data.scoreA !== undefined && data.scoreB !== null && data.scoreB !== undefined;

    const top = h(
      'div',
      { style: { position: 'absolute', top: `${P}px`, left: `${P}px`, right: `${P}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '22px' } },
      fitText(t.title || 'FINAL SCORE', { ctx, role: 'head', size: 92, min: 40, width: 960, align: 'center', label: 'Заголовок', className: 'df-trim' }),
      tournamentLine(ctx) ? fitText(tournamentLine(ctx), { ctx, size: 30, min: 16, width: 900, weight: 600, align: 'center', label: 'Турнир', className: 'df-trim', letterSpacing: '0.04em' }) : null,
    );

    const side = (team: TeamSnapshot, key: Side) =>
      h(
        'div',
        { style: { width: '330px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '26px', opacity: dim(key) } },
        style.show.logos ? teamLogo(ctx, team, 230) : null,
        style.show.names ? fitText(displayName(team, style.useShortNames), { ctx, size: 44, min: 18, width: 330, height: 92, mode: 'box', lineHeight: '1.02', weight: 800, align: 'center', label: 'Команда' }) : null,
        w === key
          ? fitText(t.winnerLabel || 'WINNER', { ctx, size: 22, min: 12, width: 300, weight: 700, align: 'center', label: 'Победитель', className: 'df-trim', letterSpacing: '0.18em' })
          : h('div', { style: { height: '22px' } }),
      );
    const winnerTag = (el: HTMLElement) => {
      const last = el.lastChild as HTMLElement | null;
      if (last?.classList?.contains('df-fit')) last.style.color = style.accent;
      return el;
    };

    const scoreEl = h(
      'div',
      { style: { width: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px' } },
      fitText(hasScore ? `${data.scoreA}:${data.scoreB}` : '–:–', { ctx, role: 'head', size: 210, min: 90, width: 300, align: 'center', label: 'Счёт', className: 'df-trim', lineHeight: '0.85' }),
      w === 'draw' ? fitText(t.drawLabel || 'DRAW', { ctx, size: 24, min: 12, width: 260, weight: 700, align: 'center', label: 'Ничья', letterSpacing: '0.18em', className: 'df-trim' }) : null,
    );
    if (w === 'A' || w === 'B') {
      // Accent the winner's digit.
      const inner = scoreEl.firstChild!.firstChild as HTMLElement;
      const [a, b] = [data.scoreA, data.scoreB];
      inner.replaceChildren(h('span', { style: { color: w === 'A' ? style.accent : 'inherit' } }, String(a)), h('span', { style: { opacity: '0.6' } }, ':'), h('span', { style: { color: w === 'B' ? style.accent : 'inherit' } }, String(b)));
    }

    const middle = h(
      'div',
      { style: { position: 'absolute', left: `${P}px`, right: `${P}px`, top: '300px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      winnerTag(side(data.teamA, 'A')),
      scoreEl,
      winnerTag(side(data.teamB, 'B')),
    );

    const info = [style.show.format ? formatLong(data.format) : '', dateLine(ctx)].filter(Boolean).join('  ·  ');
    const bottom = h(
      'div',
      { style: { position: 'absolute', left: `${P}px`, right: `${P}px`, bottom: `${P}px`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px' } },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } }, info ? fitText(info, { ctx, size: 26, min: 14, width: 520, weight: 600, label: 'Формат и дата', className: 'df-trim', letterSpacing: '0.03em' }) : null),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'flex-end' } }, socialsBlock(ctx, { size: 22 }), handleBlock(ctx, { size: 20 })),
    );

    return posterRoot(ctx, 'tpl-series-result', ...baseLayers(ctx), playerLayer(ctx, { anchor: 'center' }), h('div', { class: 'df-content' }, top, middle, bottom));
  },
});

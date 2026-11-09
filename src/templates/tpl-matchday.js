/**
 * Matchday — several matches in one poster: big MATCHDAY headline, optional player,
 * semi-transparent rows (order, teams + logos, time, date, format, tournament).
 * Rows adapt to the count (1–6); more than 6 is a blocking error, never a silent crop.
 */
import { h } from '../core/dom.js';
import { defineTemplate } from './registry.js';
import { commonSettings, ELEMENTS } from './shared/settings.js';
import { baseLayers, playerLayer, posterRoot, teamLogo, fitText, handleBlock, formatLong, displayName, hexA } from './shared/primitives.js';
import { formatPosterDate, weekday, tzShort } from '../domain/time.js';

export const MATCHDAY_MAX = 6;

/** Density presets by row count. */
function density(n) {
  if (n === 1) return { rowH: 230, gap: 0, logo: 64, name: 48, time: 72, meta: 22, num: 84, lineGap: 18, metaW: 300 };
  if (n <= 2) return { rowH: 170, gap: 22, logo: 50, name: 38, time: 54, meta: 20, num: 64, lineGap: 14, metaW: 260 };
  if (n <= 4) return { rowH: 124, gap: 16, logo: 38, name: 30, time: 42, meta: 17, num: 50, lineGap: 10, metaW: 230 };
  return { rowH: 92, gap: 12, logo: 28, name: 23, time: 32, meta: 14, num: 38, lineGap: 7, metaW: 210 };
}

export default defineTemplate({
  id: 'matchday',
  type: 'matchday',
  version: 1,
  order: 20,
  name: 'Matchday',
  description: 'Афиша игрового дня: до 6 матчей в одной публикации.',
  source: 'matches',
  capacity: { min: 1, max: MATCHDAY_MAX },
  base: { width: 1080, height: 1080 },
  exportSizes: [
    { width: 1080, height: 1080 },
    { width: 1280, height: 1280 },
  ],
  texts: [
    { key: 'title', label: 'Заголовок', default: 'MATCHDAY', maxLength: 16 },
    { key: 'subtitle', label: 'Подзаголовок', default: '', maxLength: 40 },
  ],
  defaults: { theme: 'ember', rowOpacity: 55, showNumbers: true, useShortNames: false, showHeaderDate: true, gradient: { enabled: true, angle: 90, opacity: 75, size: 75 } },
  settings: [
    ...commonSettings({ elements: [ELEMENTS.logos, ELEMENTS.tournament, ELEMENTS.stage, ELEMENTS.format, ELEMENTS.date, ELEMENTS.time, ELEMENTS.timezone] }),
    { key: 'showHeaderDate', type: 'toggle', label: 'Дата под заголовком', group: 'layout' },
    { key: 'showNumbers', type: 'toggle', label: 'Номера матчей', group: 'layout' },
    { key: 'useShortNames', type: 'toggle', label: 'Короткие названия команд', group: 'layout' },
    { key: 'rowOpacity', type: 'range', label: 'Плотность плашек', group: 'layout', min: 0, max: 90, step: 1, unit: '%' },
  ],
  validate(data) {
    const out = [];
    const items = data.items ?? [];
    if (!items.length) out.push({ level: 'error', message: 'Добавьте хотя бы один матч' });
    if (items.length > MATCHDAY_MAX) out.push({ level: 'error', message: `Максимум ${MATCHDAY_MAX} матчей — уберите лишние или разделите на две публикации (сейчас ${items.length})` });
    items.forEach((it, i) => {
      if (!it.teamA?.name || !it.teamB?.name) out.push({ level: 'error', message: `Матч ${i + 1}: нужны обе команды` });
      else if (!it.startTime) out.push({ level: 'warning', message: `Матч ${i + 1}: не указано время` });
    });
    return out;
  },
  render(ctx) {
    const { data, style } = ctx;
    const t = data.texts ?? {};
    const P = 60;
    const all = data.items ?? [];
    const items = all.slice(0, MATCHDAY_MAX);
    const d = density(items.length || 1);
    const hasPlayer = !!(style.player?.enabled && style.player?.assetId && ctx.url(style.player.assetId));
    const rowW = hasPlayer ? 680 : 960;

    const headerDate = style.showHeaderDate && data.date ? `${formatPosterDate(data.date, style.dateStyle)} · ${weekday(data.date, 'ru')}` : '';
    // Same tournament/stage for every row → show it once in the header.
    const tLine = (it) => [style.show.tournament ? it.tournament : '', style.show.stage ? it.stage : ''].filter(Boolean).join(' · ');
    const sharedTournament = items.length > 1 && items.every((it) => tLine(it) === tLine(items[0])) ? tLine(items[0]) : '';
    const header = h(
      'div',
      { style: { position: 'absolute', left: `${P}px`, top: `${P}px`, display: 'flex', flexDirection: 'column', gap: '24px' } },
      fitText(t.title || 'MATCHDAY', { ctx, role: 'head', size: 150, min: 70, width: hasPlayer ? 720 : 960, label: 'Заголовок', className: 'df-trim' }),
      [headerDate, sharedTournament, t.subtitle].filter(Boolean).length
        ? fitText([headerDate, sharedTournament, t.subtitle].filter(Boolean).join('  ·  '), { ctx, size: 34, min: 16, width: hasPlayer ? 700 : 960, weight: 700, label: 'Подзаголовок', className: 'df-trim', letterSpacing: '0.03em' })
        : null,
    );

    // Same date for every row → don't repeat it in each row.
    const sameDate = items.length > 0 && items.every((it) => it.startDate === items[0].startDate) && items[0].startDate === data.date && style.showHeaderDate;
    const metaW = d.metaW;
    const numW = style.showNumbers ? d.num * 1.15 : 0;
    const teamsW = rowW - 5 - 28 - numW - metaW - 28;

    const teamLine = (team) =>
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: `${Math.round(d.logo * 0.35)}px` } },
        style.show.logos ? teamLogo(ctx, team, d.logo) : null,
        fitText(displayName(team, style.useShortNames), { ctx, size: d.name, min: Math.max(12, d.name * 0.5), width: teamsW - (style.show.logos ? d.logo * 1.35 : 0), weight: 800, label: 'Команда', className: 'df-trim' }),
      );

    const rows = items.map((it, i) => {
      const time = style.show.time && it.startTime ? it.startTime : '';
      const tz = style.show.timezone && it.timezone && time ? tzShort(it.timezone) : '';
      const metaLines = [
        !sameDate && style.show.date && it.startDate ? formatPosterDate(it.startDate, style.dateStyle) : '',
        [style.show.format ? formatLong(it.format) : '', tz].filter(Boolean).join(' · '),
        sharedTournament ? '' : tLine(it),
      ].filter(Boolean);
      return h(
        'div',
        { class: 'df-md-row', style: { width: `${rowW}px`, height: `${d.rowH}px`, background: hexA('#08080a', (style.rowOpacity ?? 55) / 100), padding: `0 28px 0 ${5 + 22}px`, gap: '0' } },
        style.showNumbers
          ? fitText(String(i + 1).padStart(2, '0'), { ctx, role: 'head', size: d.num, min: 16, width: numW, label: 'Номер', className: 'df-trim' })
          : null,
        h('div', { style: { width: `${teamsW}px`, display: 'flex', flexDirection: 'column', gap: `${d.lineGap}px` } }, teamLine(it.teamA), teamLine(it.teamB)),
        h(
          'div',
          { style: { width: `${metaW}px`, marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: `${Math.round(d.lineGap * 0.9)}px` } },
          time ? fitText(time, { ctx, role: 'head', size: d.time, min: 16, width: metaW, align: 'right', label: 'Время', className: 'df-trim' }) : null,
          metaLines.slice(0, d.rowH > 100 ? 3 : 2).map((line) => fitText(line, { ctx, size: d.meta, min: 10, width: metaW, weight: 600, align: 'right', label: 'Детали матча', className: 'df-trim', letterSpacing: '0.03em' })),
        ),
      );
    });
    // Accent colour for numbers / times.
    for (const row of rows) row.querySelectorAll(':scope > .df-fit:first-child').forEach((n) => (n.style.color = style.accent));

    const totalH = items.length * d.rowH + Math.max(0, items.length - 1) * d.gap;
    const list = h(
      'div',
      { style: { position: 'absolute', left: `${P}px`, bottom: `${P + 64}px`, display: 'flex', flexDirection: 'column', gap: `${d.gap}px`, height: `${totalH}px` } },
      rows,
    );

    const footer = h(
      'div',
      { style: { position: 'absolute', left: `${P}px`, right: `${P}px`, bottom: `${P}px`, height: '28px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' } },
      handleBlock(ctx, { size: 20, align: 'left' }) ?? h('div'),
      style.show.socials && [style.socials.line1, style.socials.line2].some((l) => l?.trim())
        ? fitText([style.socials.line1, style.socials.line2].filter((l) => l?.trim()).join('   ·   '), { ctx, size: 20, min: 12, width: 620, align: 'right', label: 'Соцсети' })
        : h('div'),
    );
    footer.lastChild.style.textTransform = 'lowercase';

    return posterRoot(ctx, 'tpl-matchday', ...baseLayers(ctx), playerLayer(ctx, { anchor: 'right', height: 1000 }), h('div', { class: 'df-content' }, header, list, footer));
  },
});


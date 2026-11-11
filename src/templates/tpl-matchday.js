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
  if (n === 1) return { rowH: 128, gap: 0, logo: 54, name: 41, time: 101, meta: 41, num: 54, lineGap: 20, metaW: 250 };
  if (n <= 2) return { rowH: 126, gap: 20, logo: 44, name: 34, time: 68, meta: 24, num: 46, lineGap: 16, metaW: 250 };
  if (n <= 4) return { rowH: 104, gap: 16, logo: 31, name: 26, time: 48, meta: 18, num: 38, lineGap: 11, metaW: 230 };
  return { rowH: 82, gap: 12, logo: 24, name: 20, time: 34, meta: 13, num: 30, lineGap: 6, metaW: 205 };
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
  defaults: {
    theme: 'mono',
    accent: '#ffffff',
    text: '#ffffff',
    font: { family: 'roboto-flex', weight: 700, slant: -10, width: 100 },
    bodyFont: { family: 'roboto-flex', weight: 500, slant: -10, width: 100 },
    background: { preset: 'solid', solid: '#000000', grayscale: 0, brightness: 100 },
    overlay: { enabled: false, color: '#000000', opacity: 0 },
    gradient: { enabled: false, color: '#000000', opacity: 0, angle: 90, size: 75 },
    rowOpacity: 0,
    showNumbers: false,
    useShortNames: false,
    showHeaderDate: true,
  },
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
    const P = 51;
    const all = data.items ?? [];
    const items = all.slice(0, MATCHDAY_MAX);
    const d = density(items.length || 1);
    const hasPlayer = !!(style.player?.enabled && style.player?.assetId && ctx.url(style.player.assetId));
    const rowW = hasPlayer ? 700 : 979;

    const headerDate = style.showHeaderDate && data.date ? `${formatPosterDate(data.date, style.dateStyle)} ${weekday(data.date, 'ru')}` : '';
    const sameValue = (key) => items.length > 0 && items.every((it) => it[key] === items[0][key]) ? items[0][key] : '';
    const sharedTournament = style.show.tournament ? sameValue('tournament') : '';
    const sharedStage = style.show.stage ? sameValue('stage') : '';
    const header = h(
      'div',
      { style: { position: 'absolute', left: `${P}px`, top: `${P}px`, display: 'flex', flexDirection: 'column', gap: '20px' } },
      fitText(t.title || 'MATCHDAY', { ctx, role: 'head', size: 169, min: 70, width: hasPlayer ? 760 : 834, label: 'Заголовок', className: 'df-trim' }),
      [headerDate, sharedStage, t.subtitle].filter(Boolean).length
        ? fitText([headerDate, sharedStage, t.subtitle].filter(Boolean).join(' · '), { ctx, size: 54, min: 16, width: hasPlayer ? 720 : 834, weight: 500, label: 'Подзаголовок', className: 'df-trim' })
        : null,
    );

    // Same date for every row → don't repeat it in each row.
    const sameDate = items.length > 0 && items.every((it) => it.startDate === items[0].startDate) && items[0].startDate === data.date && style.showHeaderDate;
    const metaW = d.metaW;
    const numW = style.showNumbers ? d.num * 1.15 : 0;
    const teamsW = rowW - 3 - 20 - numW - metaW;

    const teamLine = (team) =>
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: `${Math.round(d.logo * 0.35)}px` } },
        style.show.logos ? teamLogo(ctx, team, d.logo) : null,
        fitText(displayName(team, style.useShortNames), { ctx, size: d.name, min: Math.max(12, d.name * 0.5), width: teamsW - (style.show.logos ? d.logo * 1.25 : 0), weight: 500, label: 'Команда', className: 'df-trim' }),
      );

    const rows = items.map((it, i) => {
      const time = style.show.time && it.startTime ? it.startTime : '';
      const tz = style.show.timezone && it.timezone && time ? tzShort(it.timezone) : '';
      const metaLines = [
        !sameDate && style.show.date && it.startDate ? formatPosterDate(it.startDate, style.dateStyle) : '',
        [style.show.format ? formatLong(it.format) : '', tz].filter(Boolean).join(' · '),
        !sharedTournament && style.show.tournament ? it.tournament : '',
        !sharedStage && style.show.stage ? it.stage : '',
      ].filter(Boolean);
      return h(
        'div',
        { class: 'df-md-row', style: { width: `${rowW}px`, height: `${d.rowH}px`, background: hexA('#000000', (style.rowOpacity ?? 0) / 100), padding: '0 0 0 20px', gap: '0', borderRadius: '0', overflow: 'visible' } },
        style.showNumbers
          ? fitText(String(i + 1).padStart(2, '0'), { ctx, role: 'head', size: d.num, min: 16, width: numW, label: 'Номер', className: 'df-trim' })
          : null,
        h('div', { style: { width: `${teamsW}px`, display: 'flex', flexDirection: 'column', gap: `${d.lineGap}px` } }, teamLine(it.teamA), teamLine(it.teamB)),
        h(
          'div',
          { style: { width: `${metaW}px`, marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: `${Math.round(d.lineGap * 0.9)}px` } },
          metaLines.slice(0, d.rowH > 100 ? 3 : 2).map((line) => fitText(line, { ctx, size: d.meta, min: 10, width: metaW, weight: 600, align: 'right', label: 'Детали матча', className: 'df-trim', letterSpacing: '0.03em' })),
          time ? fitText(time, { ctx, role: 'head', size: d.time, min: 16, width: metaW, align: 'right', label: 'Время', className: 'df-trim' }) : null,
        ),
      );
    });
    // Accent colour for numbers / times.
    for (const row of rows) row.querySelectorAll(':scope > .df-fit:first-child').forEach((n) => (n.style.color = style.accent));

    const totalH = items.length * d.rowH + Math.max(0, items.length - 1) * d.gap;
    const list = h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: `${d.gap}px`, height: `${totalH}px` } },
      rows,
    );
    const matchGroup = h(
      'div',
      { style: { position: 'absolute', left: `${P}px`, bottom: '111px', display: 'flex', flexDirection: 'column', gap: sharedTournament ? '40px' : '0' } },
      sharedTournament ? fitText(sharedTournament, { ctx, size: 41, min: 18, width: rowW, weight: 500, label: 'Турнир', className: 'df-trim' }) : null,
      list,
    );

    const footer = h(
      'div',
      { style: { position: 'absolute', left: `${P}px`, right: `${P}px`, bottom: `${P}px`, height: '28px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' } },
      handleBlock(ctx, { size: 27, align: 'left' }) ?? h('div'),
      style.show.socials && [style.socials.line1, style.socials.line2].some((l) => l?.trim())
        ? fitText([style.socials.line1, style.socials.line2].filter((l) => l?.trim()).join('   ·   '), { ctx, size: 27, min: 12, width: 620, align: 'right', label: 'Соцсети' })
        : h('div'),
    );
    footer.lastChild.style.textTransform = 'lowercase';

    return posterRoot(ctx, 'tpl-matchday', ...baseLayers(ctx), playerLayer(ctx, { anchor: 'right', height: 1000 }), h('div', { class: 'df-content' }, header, matchGroup, footer));
  },
});

/**
 * Match Announcement — big slanted MATCH headline, opponent line, vertical logos,
 * optional player cut-out on the right, tournament/format/socials captions.
 * Evolved from the original prototype poster (v0, 1280 px) into the shared system.
 */
import { h } from '../core/dom';
import { defineTemplate } from './registry.js';
import { commonSettings, ELEMENTS } from './shared/settings.js';
import { baseLayers, playerLayer, posterRoot, teamLogo, fitText, socialsBlock, handleBlock, dateLine, perspectiveTeams, displayName } from './shared/primitives.js';

export default defineTemplate({
  id: 'match-announcement',
  type: 'announcement',
  version: 1,
  order: 10,
  name: 'Match Announcement',
  description: 'Анонс предстоящего матча: заголовок MATCH, соперник, логотипы, время и турнир.',
  source: 'match',
  base: { width: 1080, height: 1080 },
  exportSizes: [
    { width: 1080, height: 1080 },
    { width: 1280, height: 1280 },
  ],
  texts: [
    { key: 'title', label: 'Заголовок', default: 'MATCH', maxLength: 16 },
    { key: 'vsPrefix', label: 'Перед соперником', default: 'VS', maxLength: 8 },
    { key: 'note', label: 'Доп. подпись', default: '', maxLength: 40 },
  ],
  defaults: {
    theme: 'mono',
    accent: '#ffffff',
    text: '#ffffff',
    font: { family: 'roboto-flex', weight: 700, slant: -10, width: 100 },
    bodyFont: { family: 'roboto-flex', weight: 500, slant: -10, width: 100 },
    background: { preset: 'solid', solid: '#000000', grayscale: 0, brightness: 100 },
    overlay: { enabled: false, color: '#000000', opacity: 0 },
    gradient: { enabled: false, color: '#000000', opacity: 0, size: 60, angle: 0 },
    logoLayout: 'vertical',
    useShortNames: false,
  },
  settings: [
    ...commonSettings({ elements: [ELEMENTS.logos, ELEMENTS.tournament, ELEMENTS.stage, ELEMENTS.format, ELEMENTS.date, ELEMENTS.time, ELEMENTS.timezone] }),
    { key: 'logoLayout', type: 'segmented', label: 'Логотипы', group: 'layout', options: [{ value: 'vertical', label: 'Столбцом' }, { value: 'horizontal', label: 'В ряд' }] },
    { key: 'useShortNames', type: 'toggle', label: 'Короткое название соперника', group: 'layout' },
  ],
  validate(data) {
    const out = [];
    if (!data.teamA?.name || !data.teamB?.name) out.push({ level: 'error', message: 'Нужны обе команды' });
    if (!data.startDate && !data.startTime) out.push({ level: 'warning', message: 'У матча не указаны дата и время' });
    if (data.status === 'completed') out.push({ level: 'warning', message: 'Матч уже завершён — возможно, нужен шаблон WIN, LOSE или Series Result' });
    return out;
  },
  render(ctx) {
    const { data, style } = ctx;
    const t = data.texts ?? {};
    const { us, them } = perspectiveTeams(data);
    const P = 51; // 60 px on the supplied 1280 px reference

    const header = h(
      'div',
      { style: { position: 'absolute', left: `${P}px`, top: `${P}px`, display: 'flex', flexDirection: 'column', gap: '20px' } },
      fitText(t.title || 'MATCH', { ctx, role: 'head', size: 169, min: 80, width: 538, label: 'Заголовок', className: 'df-trim' }),
      fitText(`${t.vsPrefix ? `${t.vsPrefix} ` : ''}${displayName(them, style.useShortNames)}`, { ctx, size: 54, min: 24, width: 538, height: 63, mode: 'box', lineHeight: '1', weight: 500, label: 'Соперник' }),
    );

    const vertical = style.logoLayout !== 'horizontal';
    // Without a player cut-out the right half is free: logos take it over, larger.
    const hasPlayer = !!(style.player?.enabled && style.player?.assetId && ctx.url(style.player.assetId));
    const free = !hasPlayer;
    const vSize = free ? 216 : 155;
    const hSize = free ? 216 : 190;
    const logos = style.show.logos
      ? h(
          'div',
          {
            style: {
              position: 'absolute',
              left: vertical ? `${P}px` : `${P}px`,
              top: vertical ? '287px' : free ? '390px' : '430px',
              width: vertical ? `${vSize}px` : free ? '960px' : '560px',
              display: 'flex',
              flexDirection: vertical ? 'column' : 'row',
              alignItems: 'center',
              justifyContent: vertical ? 'flex-start' : free ? 'flex-start' : 'space-between',
              gap: vertical ? '40px' : free ? '72px' : '0',
              color: style.text,
            },
          },
          teamLogo(ctx, us, vertical ? vSize : hSize),
          crossMark(vertical ? 64 : 48, style.text),
          teamLogo(ctx, them, vertical ? vSize : hSize),
        )
      : null;

    const info = [style.show.stage ? data.stage : '', tournamentLineOnly(ctx), t.note, dateLine(ctx)].filter(Boolean);
    const footer = h(
      'div',
      { style: { position: 'absolute', left: `${P}px`, bottom: `${P}px`, display: 'flex', flexDirection: 'column', gap: '20px' } },
      info.map((line, i) =>
        fitText(line, {
          ctx,
          size: i === info.length - 1 ? 41 : 27,
          min: 16,
          width: 520,
          weight: i === info.length - 1 ? 700 : 500,
          label: 'Подпись',
          className: 'df-trim',
          letterSpacing: i === 0 ? '0' : '0.02em',
        }),
      ),
    );

    const right = h(
      'div',
      { style: { position: 'absolute', right: `${P}px`, top: `${P}px`, bottom: `${P}px`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end' } },
      socialsBlock(ctx, { size: 27 }) ?? h('div'),
      handleBlock(ctx, { size: 27 }) ?? h('div'),
    );

    return posterRoot(ctx, 'tpl-announcement', ...baseLayers(ctx), playerLayer(ctx, { anchor: 'right', height: 980 }), h('div', { class: 'df-content' }, header, logos, footer, right));
  },
});

function tournamentLineOnly(ctx) {
  return ctx.style.show.tournament ? ctx.data.tournament : '';
}

/** Thin × mark from the original prototype. */
function crossMark(size, color) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 76 76');
  el.setAttribute('width', size);
  el.setAttribute('height', size);
  el.style.flexShrink = '0';
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M76 2.84082L40.8408 38L76 73.1592L73.1592 76L38 40.8408L2.84082 76L0 73.1592L35.1592 38L0 2.84082L2.84082 0L38 35.1592L73.1592 0L76 2.84082Z');
  p.setAttribute('fill', color);
  el.append(p);
  return el;
}

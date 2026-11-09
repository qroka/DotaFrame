/**
 * Shared factory for outcome posters (WIN / LOSE): one composition system,
 * one validation rule set, parametrised by the expected outcome.
 */
import { h } from '../../core/dom.js';
import { defineTemplate } from '../registry.js';
import { commonSettings, ELEMENTS } from './settings.js';
import { baseLayers, playerLayer, posterRoot, fitText, socialsBlock, handleBlock, dateLine, tournamentLine, formatLong, perspectiveTeams, displayName } from './primitives.js';

/** Validation shared by WIN and LOSE. `outcome`: 'win' | 'lose'. */
export function validateOutcome(data, outcome) {
  const out = [];
  if (!data.teamA?.name || !data.teamB?.name) {
    out.push({ level: 'error', message: 'Нужны обе команды' });
    return out;
  }
  const { us, ours } = perspectiveTeams(data);
  const hasScore = data.scoreA !== null && data.scoreA !== undefined && data.scoreB !== null && data.scoreB !== undefined;
  if (data.status !== 'completed') out.push({ level: 'warning', message: 'Матч ещё не завершён — счёт может измениться' });
  if (!hasScore) out.push({ level: 'warning', message: 'Счёт серии не указан' });
  if (data.status === 'completed') {
    if (data.winner === 'draw') {
      out.push({ level: 'error', message: 'Серия завершилась вничью — используйте шаблон Series Result' });
    } else if (data.winner) {
      const won = data.winner === ours;
      if (outcome === 'win' && !won) out.push({ level: 'error', message: `${us.name} не выиграла эту серию — используйте шаблон LOSE или выберите другую команду` });
      if (outcome === 'lose' && won) out.push({ level: 'error', message: `${us.name} выиграла эту серию — используйте шаблон WIN или выберите другую команду` });
    }
  }
  return out;
}

export function createOutcomeTemplate({ id, type, order, word, name, description, defaults }) {
  return defineTemplate({
    id,
    type,
    version: 1,
    order,
    name,
    description,
    source: 'match',
    base: { width: 1080, height: 1080 },
    exportSizes: [
      { width: 1080, height: 1080 },
      { width: 1280, height: 1280 },
    ],
    texts: [
      { key: 'title', label: 'Заголовок', default: word, maxLength: 12 },
      { key: 'vsPrefix', label: 'Перед соперником', default: 'VS', maxLength: 8 },
      { key: 'note', label: 'Доп. подпись', default: '', maxLength: 48 },
    ],
    defaults: { showScore: true, useShortNames: false, ...defaults },
    settings: [
      ...commonSettings({ elements: [ELEMENTS.tournament, ELEMENTS.stage, ELEMENTS.format, ELEMENTS.date] }),
      { key: 'align', type: 'segmented', label: 'Выравнивание', group: 'layout', options: [{ value: 'left', label: 'Слева' }, { value: 'right', label: 'Справа' }] },
      { key: 'showScore', type: 'toggle', label: 'Показывать счёт', group: 'layout' },
      { key: 'useShortNames', type: 'toggle', label: 'Короткое название соперника', group: 'layout' },
    ],
    validate: (data) => validateOutcome(data, type),
    render(ctx) {
      const { data, style } = ctx;
      const t = data.texts ?? {};
      const { them, usScore, themScore } = perspectiveTeams(data);
      const right = style.align === 'right';
      const P = 60;
      const hasScore = style.showScore && usScore !== null && usScore !== undefined && themScore !== null && themScore !== undefined;

      // Top captions: tournament/format on the aligned side, socials opposite.
      const meta = [tournamentLine(ctx), style.show.format ? formatLong(data.format) : '', style.show.date ? dateLine(ctx) : ''].filter(Boolean);
      const metaBlock = h(
        'div',
        { style: { position: 'absolute', top: `${P}px`, [right ? 'right' : 'left']: `${P}px`, display: 'flex', flexDirection: 'column', gap: '14px', alignItems: right ? 'flex-end' : 'flex-start' } },
        meta.map((line, i) => fitText(line, { ctx, size: i === 0 ? 30 : 24, min: 14, width: 520, weight: i === 0 ? 700 : 500, align: right ? 'right' : 'left', label: 'Подпись', className: 'df-trim', letterSpacing: '0.03em' })),
      );
      const social = h(
        'div',
        { style: { position: 'absolute', top: `${P}px`, [right ? 'left' : 'right']: `${P}px`, display: 'flex', flexDirection: 'column', gap: '14px', alignItems: right ? 'flex-start' : 'flex-end' } },
        socialsBlock(ctx, { size: 24, align: right ? 'left' : 'right' }),
        handleBlock(ctx, { size: 20, align: right ? 'left' : 'right' }),
      );

      // Bottom block: opponent caption → huge word + score on one baseline.
      const word = fitText(t.title || type.toUpperCase(), { ctx, role: 'head', size: 360, min: 120, width: hasScore ? 640 : 960, label: 'Заголовок', className: 'df-trim', align: right ? 'right' : 'left', lineHeight: '0.8' });
      const score = hasScore
        ? fitText(`${usScore}:${themScore}`, { ctx, role: 'head', size: 210, min: 90, width: 300, label: 'Счёт', className: 'df-trim', align: right ? 'left' : 'right', lineHeight: '0.8' })
        : null;
      if (score) score.style.color = style.accent;
      const opponent = fitText(`${t.vsPrefix ? `${t.vsPrefix} ` : ''}${displayName(them, style.useShortNames)}`, {
        ctx,
        size: 54,
        min: 24,
        width: 960,
        weight: 700,
        label: 'Соперник',
        className: 'df-trim',
        align: right ? 'right' : 'left',
      });
      const note = t.note ? fitText(t.note, { ctx, size: 26, min: 14, width: 960, weight: 500, label: 'Подпись', align: right ? 'right' : 'left', className: 'df-trim' }) : null;

      const row = h('div', { style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexDirection: right ? 'row-reverse' : 'row', width: '960px', gap: '20px' } }, word, score);
      const bottom = h(
        'div',
        { style: { position: 'absolute', left: `${P}px`, right: `${P}px`, bottom: `${P}px`, display: 'flex', flexDirection: 'column', gap: '34px', alignItems: right ? 'flex-end' : 'flex-start' } },
        note,
        opponent,
        row,
      );

      return posterRoot(ctx, `tpl-${type}`, ...baseLayers(ctx), playerLayer(ctx, { anchor: 'center', height: 1000 }), h('div', { class: 'df-content' }, metaBlock, social, bottom));
    },
  });
}

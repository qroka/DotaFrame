/**
 * Shared factory for outcome posters (WIN / LOSE): one composition system,
 * one validation rule set, parametrised by the expected outcome.
 */
import { h } from '../../core/dom.js';
import { defineTemplate } from '../registry.js';
import { commonSettings, ELEMENTS } from './settings.js';
import { baseLayers, playerLayer, posterRoot, fitText, socialsBlock, handleBlock, dateLine, perspectiveTeams, displayName } from './primitives.js';

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
      const P = 51;
      const isLose = type === 'lose';
      const hasScore = style.showScore && usScore !== null && usScore !== undefined && themScore !== null && themScore !== undefined;

      // The supplied system keeps match metadata top-left and channel links top-right.
      const meta = [style.show.date ? dateLine(ctx) : '', style.show.tournament ? data.tournament : '', style.show.stage ? data.stage : ''].filter(Boolean);
      const metaBlock = h(
        'div',
        { style: { position: 'absolute', top: `${P}px`, left: `${P}px`, display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'flex-start' } },
        meta.map((line, i) => fitText(line, { ctx, size: i === 0 ? 41 : 27, min: 14, width: 520, weight: i === 0 ? 700 : 500, align: 'left', label: 'Подпись', className: 'df-trim' })),
      );
      const social = h(
        'div',
        { style: { position: 'absolute', top: `${P}px`, right: `${P}px`, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' } },
        socialsBlock(ctx, { size: 27, align: 'right' }),
      );
      if (social.firstChild) social.firstChild.style.gap = '20px';

      // Bottom block: opponent caption → huge word + score on one baseline.
      const blockLeft = isLose ? 133 : 51;
      const blockWidth = isLose ? 896 : 878;
      const wordWidth = isLose ? 621 : 603;
      const word = fitText(t.title || type.toUpperCase(), { ctx, role: 'head', size: isLose ? 284 : 338, min: 120, width: hasScore ? wordWidth : blockWidth, label: 'Заголовок', className: 'df-trim', align: isLose ? 'right' : 'left', lineHeight: '0.8' });
      const score = hasScore
        ? fitText(`${usScore}:${themScore}`, { ctx, role: 'head', size: 186, min: 80, width: 255, label: 'Счёт', className: 'df-trim', align: isLose ? 'left' : 'right', lineHeight: '0.8' })
        : null;
      if (score) score.style.color = style.accent;
      const opponent = fitText(`${t.vsPrefix ? `${t.vsPrefix} ` : ''}${displayName(them, style.useShortNames)}`, {
        ctx,
        size: 54,
        min: 24,
        width: blockWidth,
        weight: 500,
        label: 'Соперник',
        className: 'df-trim',
        align: isLose ? 'right' : 'left',
      });
      const note = t.note ? fitText(t.note, { ctx, size: 27, min: 14, width: blockWidth, weight: 500, label: 'Подпись', align: isLose ? 'right' : 'left', className: 'df-trim' }) : null;

      const row = h('div', { style: { display: 'flex', alignItems: 'flex-end', width: `${blockWidth}px`, gap: '20px' } }, isLose ? score : word, isLose ? word : score);
      const bottom = h(
        'div',
        { style: { position: 'absolute', left: `${blockLeft}px`, bottom: `${P}px`, width: `${blockWidth}px`, display: 'flex', flexDirection: 'column', gap: '20px', alignItems: isLose ? 'flex-end' : 'flex-start' } },
        note,
        opponent,
        row,
      );
      const handle = h(
        'div',
        { style: { position: 'absolute', bottom: '17px', [isLose ? 'right' : 'left']: isLose ? '73px' : '84px' } },
        handleBlock(ctx, { size: 20, align: isLose ? 'right' : 'left' }) ?? h('div'),
      );

      return posterRoot(ctx, `tpl-${type}`, ...baseLayers(ctx), playerLayer(ctx, { anchor: 'center', height: 1000 }), h('div', { class: 'df-content' }, metaBlock, social, bottom, handle));
    },
  });
}

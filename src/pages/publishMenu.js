/** "Создать публикацию" menu for a match: every match/draft template + matchday. */
import { openMenu } from '../ui/feedback.js';
import { listTemplates } from '../templates/index.js';
import { navigate } from '../app/router.js';

const TYPE_ICON = { announcement: 'calendar', win: 'trophy', lose: 'shield', 'series-result': 'grid', draft: 'draft', matchday: 'layers' };

export function openPublishMenu(anchor, match) {
  const tpls = listTemplates();
  const items = tpls
    .filter((t) => t.source === 'match' || t.source === 'draft')
    .map((t) => ({ label: t.name, icon: TYPE_ICON[t.type] ?? 'image', onClick: () => navigate('/new', { template: t.id, match: match.id }) }));
  const matchday = tpls.find((t) => t.source === 'matches');
  if (matchday) {
    items.push('separator', { label: 'Афиша дня с этим матчем', icon: TYPE_ICON.matchday, onClick: () => navigate('/new', { template: matchday.id, matches: match.id }) });
  }
  if (!items.length) items.push({ label: 'Шаблоны недоступны', disabled: true });
  return openMenu(anchor, items);
}

export function matchdayTemplateId() {
  return listTemplates().find((t) => t.source === 'matches')?.id ?? 'matchday';
}

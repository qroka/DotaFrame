/** LOSE — same visual system as WIN, mirrored, cooler desaturated treatment by default. */
import { createOutcomeTemplate } from './shared/result';

export default createOutcomeTemplate({
  id: 'lose',
  type: 'lose',
  order: 40,
  word: 'LOSE',
  name: 'LOSE',
  description: 'Поражение выбранной команды: крупное LOSE, счёт серии и соперник.',
  defaults: {
    theme: 'mono',
    accent: '#8d8d8d',
    text: '#ffffff',
    align: 'right',
    font: { family: 'roboto-flex', weight: 700, slant: -10, width: 100 },
    bodyFont: { family: 'roboto-flex', weight: 500, slant: -10, width: 100 },
    background: { preset: 'solid', solid: '#000000', grayscale: 0, brightness: 100 },
    overlay: { enabled: false, color: '#000000', opacity: 0 },
    gradient: { enabled: false, color: '#000000', opacity: 0, size: 70, angle: 0 },
  },
});

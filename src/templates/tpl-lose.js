/** LOSE — same visual system as WIN, mirrored, cooler desaturated treatment by default. */
import { createOutcomeTemplate } from './shared/result.js';

export default createOutcomeTemplate({
  id: 'lose',
  type: 'lose',
  order: 40,
  word: 'LOSE',
  name: 'LOSE',
  description: 'Поражение выбранной команды: крупное LOSE, счёт серии и соперник.',
  defaults: {
    theme: 'mono',
    accent: '#c9ced6',
    text: '#ffffff',
    align: 'right',
    background: { preset: 'graphite', grayscale: 70, brightness: 85 },
    overlay: { enabled: true, color: '#000000', opacity: 35 },
    gradient: { enabled: true, color: '#000000', opacity: 80, size: 70, angle: 0 },
  },
});

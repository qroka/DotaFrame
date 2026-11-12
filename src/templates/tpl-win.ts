/** WIN — victory of the selected team: huge WIN + series score, opponent caption. */
import { createOutcomeTemplate } from './shared/result';

export default createOutcomeTemplate({
  id: 'win',
  type: 'win',
  order: 30,
  word: 'WIN',
  name: 'WIN',
  description: 'Победа выбранной команды: крупное WIN, счёт серии и соперник.',
  defaults: {
    theme: 'mono',
    accent: '#ffffff',
    text: '#ffffff',
    align: 'left',
    font: { family: 'roboto-flex', weight: 700, slant: -10, width: 100 },
    bodyFont: { family: 'roboto-flex', weight: 500, slant: -10, width: 100 },
    background: { preset: 'solid', solid: '#000000', grayscale: 0, brightness: 100 },
    overlay: { enabled: false, color: '#000000', opacity: 0 },
    gradient: { enabled: false, color: '#000000', opacity: 0, size: 70, angle: 0 },
  },
});

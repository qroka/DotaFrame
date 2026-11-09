/** WIN — victory of the selected team: huge WIN + series score, opponent caption. */
import { createOutcomeTemplate } from './shared/result.js';

export default createOutcomeTemplate({
  id: 'win',
  type: 'win',
  order: 30,
  word: 'WIN',
  name: 'WIN',
  description: 'Победа выбранной команды: крупное WIN, счёт серии и соперник.',
  defaults: { theme: 'ember', align: 'left', gradient: { enabled: true, opacity: 80, size: 70, angle: 0 } },
});

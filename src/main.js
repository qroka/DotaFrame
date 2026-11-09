/**
 * DotaFrame entry point: styles, templates, routes, storage warnings.
 */
import './styles/app.css';
import './templates/index.js';
import { createShell } from './app/shell.js';
import { route, startRouter } from './app/router.js';
import { openDb } from './data/db.js';
import { on } from './core/events.js';
import { toast } from './ui/feedback.js';

const app = document.getElementById('app');

const lazy = (loader, name) => async (ctx) => (await loader())[name](ctx);

route('/', lazy(() => import('./pages/dashboard.js'), 'dashboardPage'));
route('/teams', lazy(() => import('./pages/teams.js'), 'teamsPage'));
route('/matches', lazy(() => import('./pages/matches.js'), 'matchesPage'));
route('/matches/new', lazy(() => import('./pages/matchForm.js'), 'matchFormPage'));
route('/matches/:id', lazy(() => import('./pages/matchForm.js'), 'matchFormPage'));
route('/projects', lazy(() => import('./pages/projects.js'), 'projectsPage'));
route('/templates', lazy(() => import('./pages/templates.js'), 'templatesPage'));
route('/settings', lazy(() => import('./pages/settings.js'), 'settingsPage'));
route('/new', lazy(() => import('./editor/editorPage.js'), 'newProjectPage'), { fullBleed: true });
route('/editor/:id', lazy(() => import('./editor/editorPage.js'), 'editorPage'), { fullBleed: true });
route('*', lazy(() => import('./pages/notFound.js'), 'notFoundPage'));

async function boot() {
  const shell = createShell();
  app.replaceChildren(shell.root);
  try {
    await openDb();
  } catch (err) {
    toast(`Локальное хранилище недоступно: ${err.message}. Данные не будут сохраняться.`, { type: 'error', duration: 0 });
  }
  on('storage:versionchange', () => toast('DotaFrame открыт в другой вкладке с новой версией данных. Перезагрузите страницу.', { type: 'warning', duration: 0 }));
  on('storage:blocked', () => toast('Закройте другие вкладки DotaFrame, чтобы обновить базу данных.', { type: 'warning' }));
  startRouter(shell.outlet, { onChange: shell.onRoute });
}

boot();

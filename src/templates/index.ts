/**
 * Registers every built-in template. To add a template: create a module that
 * default-exports `defineTemplate({...})` and add it to this list.
 */
import { registerTemplate } from './registry';
import type { PosterTemplate } from './types';
import announcement from './announcement';

const modules = import.meta.glob<PosterTemplate>('./tpl-*.ts', { eager: true, import: 'default' });

registerTemplate(announcement);
for (const key of Object.keys(modules).sort()) {
  const tpl = modules[key];
  if (tpl) registerTemplate(tpl);
}

export * from './registry';

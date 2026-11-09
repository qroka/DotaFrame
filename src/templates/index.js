/**
 * Registers every built-in template. To add a template: create a module that
 * default-exports `defineTemplate({...})` and add it to this list.
 */
import { registerTemplate } from './registry.js';
import announcement from './announcement.js';

const modules = import.meta.glob('./tpl-*.js', { eager: true, import: 'default' });

registerTemplate(announcement);
for (const key of Object.keys(modules).sort()) {
  const tpl = modules[key];
  if (tpl) registerTemplate(tpl);
}

export * from './registry.js';

import { h } from '../core/dom.js';
import { emptyState } from '../ui/controls.js';

export function notFoundPage() {
  return {
    title: 'Страница не найдена',
    el: h(
      'div',
      { class: 'h-full grid place-items-center' },
      emptyState({ icon: 'alert', title: 'Страница не найдена', text: 'Возможно, ссылка устарела или материал был удалён.', action: h('a', { class: 'btn btn-primary', href: '#/' }, 'На главную') }),
    ),
  };
}

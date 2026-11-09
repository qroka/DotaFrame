/**
 * Create / edit team modal. Reused by the teams directory and the match form.
 * Logo replacement always stores a NEW immutable MediaAsset (see imageField),
 * so saved posters that snapshot the old logo id keep their image.
 */
import { h } from '../core/dom.js';
import { openModal, confirmDialog, toast } from '../ui/feedback.js';
import { field, textInput, imageField, nextId } from '../ui/controls.js';
import { teams, validateTeam, ValidationError } from '../data/repos.js';
import { icon } from '../ui/icons.js';

/** @returns {Promise<object|null>} saved team or null when cancelled */
export function openTeamDialog({ team = null, initialName = '' } = {}) {
  return new Promise((resolve) => {
    const draft = {
      id: team?.id ?? null,
      name: team?.name ?? initialName,
      shortName: team?.shortName ?? '',
      region: team?.region ?? '',
      notes: team?.notes ?? '',
      logoAssetId: team?.logoAssetId ?? null,
    };
    let result = null;
    let saving = false;
    let errors = {};

    const ids = { name: nextId('tn'), short: nextId('ts'), region: nextId('tr'), notes: nextId('tno') };
    const form = h('form', { class: 'flex flex-col gap-4', novalidate: true });
    const saveBtn = h('button', { type: 'submit', class: 'btn btn-primary', form: 'team-form' }, team ? 'Сохранить' : 'Создать команду');
    form.id = 'team-form';

    function renderForm() {
      form.replaceChildren(
        field({
          label: 'Название команды *',
          id: ids.name,
          error: errors.name,
          children: textInput({ id: ids.name, value: draft.name, maxLength: 60, placeholder: 'Например, Team Spirit', autofocus: true, invalid: !!errors.name, onInput: (v) => (draft.name = v) }),
        }),
        h(
          'div',
          { class: 'grid grid-cols-2 gap-3' },
          field({
            label: 'Короткое название',
            id: ids.short,
            error: errors.shortName,
            hint: 'До 12 символов, например TS',
            children: textInput({ id: ids.short, value: draft.shortName, maxLength: 12, placeholder: 'TS', invalid: !!errors.shortName, onInput: (v) => (draft.shortName = v) }),
          }),
          field({ label: 'Регион', id: ids.region, children: textInput({ id: ids.region, value: draft.region, maxLength: 40, placeholder: 'EEU, WEU, SA…', onInput: (v) => (draft.region = v) }) }),
        ),
        field({
          label: 'Логотип',
          hint: 'PNG с прозрачным фоном выглядит лучше всего. Замена создаёт новую версию файла — сохранённые постеры не изменятся.',
          children: imageField({
            assetId: draft.logoAssetId,
            kind: 'logo',
            label: 'Логотип загружен',
            emptyText: 'Логотип не выбран — будет показана заглушка',
            defaultAssetId: team?.logoAssetId ?? null,
            onChange: (id) => (draft.logoAssetId = id),
          }),
        }),
        field({
          label: 'Заметки',
          id: ids.notes,
          children: h('textarea', { id: ids.notes, class: 'input', rows: 2, maxLength: 300, placeholder: 'Необязательно', onInput: (e) => (draft.notes = e.target.value) }, draft.notes),
        }),
        team ? h('p', { class: 'flex gap-2 text-[12px] text-fg-faint leading-relaxed' }, icon('info', { size: 14, className: 'mt-px' }), 'Изменения применятся к новым публикациям. Уже сохранённые постеры хранят собственный снимок данных.') : null,
      );
    }

    async function submit(e) {
      e?.preventDefault();
      if (saving) return;
      errors = validateTeam(draft);
      if (Object.keys(errors).length) {
        renderForm();
        form.querySelector('[aria-invalid="true"]')?.focus();
        return;
      }
      const dup = await teams.findDuplicate(draft.name, draft.id);
      if (dup) {
        const ok = await confirmDialog({ title: 'Похожая команда уже есть', message: `В справочнике уже есть «${dup.name}». Всё равно сохранить ещё одну команду с таким названием?`, confirmLabel: 'Сохранить' });
        if (!ok) return;
      }
      saving = true;
      saveBtn.disabled = true;
      saveBtn.replaceChildren(h('span', { class: 'spinner' }), 'Сохранение…');
      try {
        result = await teams.save(draft);
        toast(team ? 'Команда обновлена' : `Команда «${result.name}» создана`, { type: 'success' });
        modal.close();
      } catch (err) {
        if (err instanceof ValidationError) {
          errors = err.errors;
          renderForm();
        } else toast(err.message, { type: 'error' });
      } finally {
        saving = false;
        saveBtn.disabled = false;
        saveBtn.replaceChildren(team ? 'Сохранить' : 'Создать команду');
      }
    }

    form.addEventListener('submit', submit);
    renderForm();
    const modal = openModal({
      title: team ? 'Редактирование команды' : 'Новая команда',
      width: 500,
      content: form,
      footer: ({ close }) => [h('button', { type: 'button', class: 'btn', onClick: () => close() }, 'Отмена'), saveBtn],
      onClose: () => resolve(result),
    });
  });
}

import { test, expect } from '@playwright/test';
import { seed, waitPreview, pngSize, makePng } from './helpers.js';

test.describe('Editor, templates, export, history', () => {
  test('every template renders and exports a PNG of the exact size', async ({ page }) => {
    const { matches } = await seed(page);
    const cases = [
      ['match-announcement', `match=${matches.m2.id}`],
      ['win', `match=${matches.m1.id}`],
      ['lose', `match=${matches.m1.id}`],
      ['series-result', `match=${matches.m1.id}`],
      ['matchday', `matches=${[matches.m1.id, matches.m2.id, matches.m3.id].join(',')}`],
    ];
    for (const [tpl, q] of cases) {
      await page.goto(`/#/new?template=${tpl}&${q}`);
      await waitPreview(page);
      await expect(page.locator('[data-preview-scaler] .df-poster')).toHaveAttribute('data-template', tpl);
      for (const size of [1080, 1280]) {
        await page.locator('button[aria-label="Параметры экспорта"]').click();
        const download = page.waitForEvent('download');
        await page.getByRole('menuitem', { name: `PNG ${size} × ${size}` }).click();
        const file = await (await download).path();
        expect(pngSize(file), `${tpl} @${size}`).toEqual({ width: size, height: size });
      }
      // Export saves first → URL now points to a persisted project.
      await expect(page).toHaveURL(/#\/editor\/poster_/);
      await page.screenshot({ path: `test-results/visual-${tpl}-${test.info().project.name}.png` });
    }
  });

  test('WIN for the losing team is a blocking error', async ({ page }) => {
    const { matches } = await seed(page);
    await page.goto(`/#/new?template=win&match=${matches.m1.id}`);
    await waitPreview(page);
    // Switch "our team" to the loser (Team Spirit).
    await page.getByRole('group', { name: 'Наша команда' }).getByRole('button', { name: 'TS' }).click();
    await expect(page.getByRole('log', { name: 'Проверка макета' })).toContainText('LOSE');
    await expect(page.locator('button[title*="Исправьте ошибки"]')).toBeDisabled();
  });

  test('saved poster keeps its snapshot after team & match edits (history immutability)', async ({ page }) => {
    const { matches, teams } = await seed(page);
    await page.goto(`/#/new?template=series-result&match=${matches.m1.id}`);
    await waitPreview(page);
    await page.locator('[data-preview-stage]').click({ position: { x: 10, y: 10 } });
    await page.keyboard.press('Control+s');
    await expect(page).toHaveURL(/#\/editor\/poster_/);
    const projectUrl = page.url();

    // Rename team, replace logo (new asset) and change the score.
    await page.evaluate(
      async ({ teamId, matchId }) => {
        const r = await import('/src/data/repos.js');
        const t = await r.teams.get(teamId);
        await r.teams.save({ ...t, name: 'Переименованная', logoAssetId: null });
        const m = await r.matches.get(matchId);
        await r.matches.save({ ...m, scoreA: 0, scoreB: 2 });
      },
      { teamId: teams.a.id, matchId: matches.m1.id },
    );
    await page.goto('/#/');
    await page.goto(projectUrl);
    await page.reload();
    await waitPreview(page);
    const poster = page.locator('[data-preview-scaler] .df-poster');
    await expect(poster).toContainText('Nemiga Gaming');
    await expect(poster).not.toContainText('Переименованная');
    await expect(poster).toContainText('2');
    // The logo of the snapshot is still an image (asset version kept).
    await expect(poster.locator('img').first()).toBeVisible();
    // And the editor offers an explicit refresh.
    await expect(page.getByRole('button', { name: 'Обновить из матча' })).toBeVisible();
  });

  test('appearance: theme, background photo, player image, undo/redo, reset', async ({ page }) => {
    const { matches } = await seed(page);
    await page.goto(`/#/new?template=match-announcement&match=${matches.m2.id}`);
    await waitPreview(page);
    const poster = () => page.locator('[data-preview-scaler] .df-poster');
    const accentBefore = await poster().evaluate((el) => el.style.getPropertyValue('--accent'));
    await page.getByRole('radio', { name: 'Radiant' }).first().click();
    await expect.poll(() => poster().evaluate((el) => el.style.getPropertyValue('--accent'))).not.toBe(accentBefore);

    // Upload background (opens the "Фон" group already open by default).
    const png = await makePng(page, { w: 1600, h: 900, color: '#225588', text: 'BG' });
    await page.locator('[data-image-field="background"] input[type=file]').setInputFiles({ name: 'bg.png', mimeType: 'image/png', buffer: png });
    await expect(poster().locator('.df-bg-photo')).toBeVisible();

    // Undo removes the photo, redo brings it back.
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await expect(poster().locator('.df-bg-photo')).toHaveCount(0);
    await page.keyboard.press('Control+Shift+z');
    await expect(poster().locator('.df-bg-photo')).toHaveCount(1);

    // Broken file is rejected with a message.
    await page.locator('[data-image-field="background"] input[type=file]').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image at all') });
    await expect(page.getByRole('alert').filter({ hasText: /PNG|изображение|формат/i })).toBeVisible();
  });

  test('draft generator: picks, duplicate protection, save and export', async ({ page }) => {
    const { matches } = await seed(page);
    await page.goto(`/#/new?template=draft&match=${matches.m1.id}`);
    await waitPreview(page);
    const heroes = ['Pudge', 'Invoker', 'Axe', 'Lion', 'Juggernaut', 'Tidehunter', 'Lina', 'Sniper', 'Earthshaker', 'Crystal Maiden'];
    const pick = async (slot, name) => {
      await page.locator(`[data-slot="${slot}"]`).click();
      await page.getByRole('searchbox', { name: 'Поиск героя' }).fill(name);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('searchbox', { name: 'Поиск героя' })).toHaveCount(0);
    };
    for (let i = 0; i < 5; i++) await pick(`picksRadiant-${i}`, heroes[i]);
    for (let i = 0; i < 5; i++) await pick(`picksDire-${i}`, heroes[5 + i]);

    // Duplicate protection: Pudge is already picked → disabled in the picker.
    await page.locator('[data-add-ban="dire"], [data-add-ban="Dire"], [data-add-ban]').last().click();
    await page.getByRole('searchbox', { name: 'Поиск героя' }).fill('Pudge');
    const pudge = page.locator('[role="listbox"][aria-label="Герои"] [data-hero-id]').first();
    await expect(pudge).toBeDisabled();
    await page.keyboard.press('Escape');

    const poster = page.locator('[data-preview-scaler] .df-poster');
    await expect(poster).toContainText(/pudge/i);
    await expect(page.getByRole('log', { name: 'Проверка макета' })).not.toContainText('Нужно выбрать по 5 героев');

    await page.locator('button[aria-label="Параметры экспорта"]').click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'PNG 1080 × 1080' }).click();
    expect(pngSize(await (await download).path())).toEqual({ width: 1080, height: 1080 });

    // GameDraft persisted for (match, map 1) and survives reload.
    const stored = await page.evaluate(async (matchId) => {
      const r = await import('/src/data/repos.js');
      return (await r.drafts.find(matchId, 1))?.picksRadiant?.filter(Boolean).length;
    }, matches.m1.id);
    expect(stored).toBe(5);
    await page.reload();
    await waitPreview(page);
    await expect(page.locator('[data-preview-scaler] .df-poster')).toContainText(/invoker/i);
  });
});

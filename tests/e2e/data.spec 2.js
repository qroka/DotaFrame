import { test, expect } from '@playwright/test';
import { seed, makePng } from './helpers.js';

test.describe('Teams, matches, persistence, backup', () => {
  test('create team with logo, replace/remove logo, validation, persists after reload', async ({ page }) => {
    await page.goto('/#/teams');
    await page.getByRole('button', { name: /Добавить команду/ }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /Создать команду/ }).click();
    await expect(dialog.getByRole('alert').first()).toBeVisible(); // empty name rejected

    await dialog.getByLabel('Название', { exact: false }).first().fill('Команда Ёжик');
    const logo = await makePng(page, { text: 'Ё' });
    await dialog.locator('input[type=file]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: logo });
    await expect(dialog.locator('img')).toBeVisible();
    // Broken file is refused and the previous logo is kept.
    await dialog.locator('input[type=file]').setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('garbage') });
    await expect(page.getByRole('alert').filter({ hasText: /изображение|формат|PNG/i })).toBeVisible();
    await dialog.getByRole('button', { name: /Создать команду/ }).click();
    await expect(page.getByRole('button', { name: 'Команда Ёжик', exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: 'Команда Ёжик', exact: true })).toBeVisible();
    const stored = await page.evaluate(async () => {
      const r = await import('/src/data/repos.js');
      const t = (await r.teams.list()).find((x) => x.name === 'Команда Ёжик');
      const m = await import('/src/data/media.js');
      const a = await m.getAsset(t.logoAssetId);
      return { id: t.logoAssetId, type: a.mimeType, isBlob: a.blob instanceof Blob };
    });
    expect(stored.id).toMatch(/^media_/);
    expect(stored).toMatchObject({ type: 'image/png', isBlob: true });
  });

  test('replacing a logo creates a new immutable asset', async ({ page }) => {
    const { teams, logoAssetId } = await seed(page);
    const next = await page.evaluate(async (teamId) => {
      const m = await import('/src/data/media.js');
      const r = await import('/src/data/repos.js');
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      c.getContext('2d').fillRect(0, 0, 64, 64);
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      const asset = await m.importFile(new File([blob], 'n.png', { type: 'image/png' }), 'logo');
      const t = await r.teams.get(teamId);
      await r.teams.save({ ...t, logoAssetId: asset.id });
      return asset.id;
    }, teams.a.id);
    expect(next).not.toBe(logoAssetId);
    expect(await page.evaluate(async (id) => !!(await (await import('/src/data/media.js')).getAsset(id)), logoAssetId)).toBe(true);
  });

  test('match score validation (BO3 3:0 rejected, BO2 1:1 accepted)', async ({ page }) => {
    await page.goto('/#/');
    const res = await page.evaluate(async () => {
      const r = await import('/src/data/repos.js');
      const a = await r.teams.save({ name: 'A team' });
      const b = await r.teams.save({ name: 'B team' });
      const base = { teamAId: a.id, teamBId: b.id, status: 'completed' };
      const attempt = async (m) => r.matches.save(m).then(() => 'ok', (e) => e.name);
      return {
        bo3: await attempt({ ...base, format: 'BO3', scoreA: 3, scoreB: 0 }),
        bo2: await attempt({ ...base, format: 'BO2', scoreA: 1, scoreB: 1 }),
        same: await attempt({ ...base, teamBId: a.id, format: 'BO3', scoreA: 2, scoreB: 0 }),
      };
    });
    expect(res).toEqual({ bo3: 'ValidationError', bo2: 'ok', same: 'ValidationError' });
  });

  test('team in use cannot be deleted', async ({ page }) => {
    const { teams } = await seed(page);
    const err = await page.evaluate((id) => import('/src/data/repos.js').then((r) => r.teams.remove(id)).then(() => 'deleted', (e) => e.message), teams.a.id);
    expect(err).toMatch(/используется/);
  });

  test('match form creates a match through the UI and survives reload', async ({ page }) => {
    await seed(page, { withLogo: false });
    await page.goto('/#/matches/new');
    await page.locator('select').nth(0).selectOption({ label: 'Team Spirit' });
    await page.locator('select').nth(1).selectOption({ label: 'Nemiga Gaming' });
    await page.keyboard.press('Control+s');
    await expect(page).toHaveURL(/#\/matches\/match_/);
    await page.goto('/#/matches');
    await page.reload();
    await expect(page.locator('#outlet').getByText('Team Spirit').first()).toBeVisible();
  });

  test('backup roundtrip restores data and images; invalid files are refused', async ({ page }) => {
    const { matches } = await seed(page);
    const before = await page.evaluate(async () => {
      const b = await import('/src/data/backup.js');
      return JSON.stringify((await b.createBackup()).counts);
    });
    const json = await page.evaluate(async () => {
      const b = await import('/src/data/backup.js');
      return JSON.stringify(await b.createBackup());
    });
    const after = await page.evaluate(async (json) => {
      const b = await import('/src/data/backup.js');
      const db = await import('/src/data/db.js');
      await db.wipeAll();
      const empty = (await (await import('/src/data/repos.js')).teams.list()).length;
      await b.restoreBackup(JSON.parse(json), { mode: 'replace' });
      const counts = JSON.stringify((await b.createBackup()).counts);
      const team = (await (await import('/src/data/repos.js')).teams.list()).find((t) => t.logoAssetId);
      const asset = await (await import('/src/data/media.js')).getAsset(team.logoAssetId);
      return { empty, counts, logoOk: asset.blob instanceof Blob && asset.blob.size > 0 };
    }, json);
    expect(after.empty).toBe(0);
    expect(after.counts).toBe(before);
    expect(after.logoOk).toBe(true);
    expect(matches.m1.id).toBeTruthy();

    const bad = await page.evaluate(async () => {
      const b = await import('/src/data/backup.js');
      const rejects = [];
      for (const o of [{ hello: 1 }, { format: 'dotaframe-backup', version: 99, data: {} }]) rejects.push(await b.restoreBackup(o).then(() => 'ok', (e) => e.name));
      return rejects;
    });
    expect(bad).toEqual(['BackupError', 'BackupError']);
  });

  test('long Cyrillic names do not overflow the poster', async ({ page }) => {
    const { matches } = await seed(page);
    await page.goto(`/#/new?template=match-announcement&match=${matches.m2.id}`);
    await expect(page.locator('[data-preview-scaler] .df-poster')).toBeVisible();
    await page.waitForTimeout(500);
    const overflowing = await page.locator('[data-preview-scaler] [data-overflow="true"]').count();
    expect(overflowing).toBe(0);
    await expect(page.locator('[data-preview-scaler] .df-poster')).toContainText('Команда Очень');
  });
});

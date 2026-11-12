import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

const title = (page) => page.getByRole('textbox', { name: 'Название публикации' });
const undo = (page) => page.getByRole('button', { name: /Отменить/ });
const redo = (page) => page.getByRole('button', { name: /Повторить/ });

test.describe('Editor history, saving and export', () => {
  test('Ctrl+S saves from the title field, undo/redo track the saved state', async ({ page }) => {
    await openApp(page, '/new?template=match-announcement');
    await expect(page.locator('.df-poster')).toBeVisible();
    await expect(page.getByText('Не сохранено', { exact: true })).toBeVisible();

    await title(page).fill('E2E история');
    await title(page).press('Control+s');
    await expect(page).toHaveURL(/\/editor\/poster_/);
    await expect(page.getByText('Сохранено', { exact: true })).toBeVisible();
    await expect(undo(page)).toBeDisabled();

    await title(page).fill('E2E изменено');
    await expect(page.getByText('Не сохранено', { exact: true })).toBeVisible();
    await expect(undo(page)).toBeEnabled();

    await undo(page).click();
    await expect(title(page)).toHaveValue('E2E история');
    await expect(page.getByText('Сохранено', { exact: true })).toBeVisible();
    await expect(redo(page)).toBeEnabled();

    await redo(page).click();
    await expect(title(page)).toHaveValue('E2E изменено');
    await expect(page.getByText('Не сохранено', { exact: true })).toBeVisible();

    // The undo shortcut works outside text fields and also reverts a template switch.
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByText('Сохранено', { exact: true })).toBeVisible();
    await page.locator('header').getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Matchday' }).click();
    await expect(page.locator('.df-poster')).toHaveAttribute('data-template', 'matchday');
    await page.locator('main').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await expect(page.locator('.df-poster')).toHaveAttribute('data-template', 'match-announcement');
    await expect(page.getByText('Сохранено', { exact: true })).toBeVisible();

    await page.reload();
    await expect(title(page)).toHaveValue('E2E изменено');
  });

  test('leaving with unsaved changes asks for confirmation', async ({ page }) => {
    await openApp(page, '/new?template=match-announcement');
    await title(page).fill('Черновик');
    const dialogs = [];
    page.once('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    await page.getByRole('link', { name: 'К публикациям' }).click();
    await expect.poll(() => dialogs.length).toBe(1);
    expect(dialogs[0]).toContain('несохранённые');
    await expect(page).toHaveURL(/\/new/);
  });

  test('PNG export saves the publication and downloads a 1080 x 1080 image', async ({ page }) => {
    await openApp(page, '/new?template=match-announcement');
    await expect(page.locator('.df-poster')).toBeVisible();
    const download = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByRole('button', { name: 'PNG' }).click();
    const file = await (await download).path();
    const bytes = readFileSync(file);
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1080, 1080]);
    await expect(page).toHaveURL(/\/editor\/poster_/); // exported poster is a saved version
  });
});

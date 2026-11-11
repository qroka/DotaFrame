import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test.describe('Nuxt UI template library and editor', () => {
  test('all poster templates are available', async ({ page }) => {
    await openApp(page, '/templates');
    for (const name of ['Match Announcement', 'Matchday', 'WIN', 'LOSE', 'Series Result', 'Dota Draft']) {
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    }
  });

  test('new editor renders the shared poster pipeline', async ({ page }) => {
    await openApp(page, '/new?template=match-announcement');
    await expect(page.locator('.df-poster')).toBeVisible();
    await expect(page.locator('.df-poster')).toContainText('MATCH');
    await expect(page.getByRole('button', { name: 'Сохранить' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'PNG' })).toBeVisible();
    await expect(page.getByText('Нет матчей')).toBeVisible();
  });

  test('editor switches templates without leaving the workspace', async ({ page }) => {
    await openApp(page, '/new?template=match-announcement');
    const templateSelect = page.locator('header').getByRole('combobox').first();
    await templateSelect.click();
    await page.getByRole('option', { name: 'Matchday' }).click();
    await expect(page.locator('.df-poster')).toHaveAttribute('data-template', 'matchday');
  });
});

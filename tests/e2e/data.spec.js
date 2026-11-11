import { test, expect } from '@playwright/test';
import { createTeam, openApp } from './helpers.js';

test.describe('Nuxt dashboard and SQLite data', () => {
  test('dashboard navigation uses Nuxt routes', async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole('heading', { name: 'Матчевые данные — в готовую графику' })).toBeVisible();
    await page.getByRole('link', { name: 'Команды' }).click();
    await expect(page).toHaveURL(/\/teams$/);
    await expect(page.getByRole('heading', { name: 'Команды', exact: true })).toBeVisible();
  });

  test('team can be created and survives reload', async ({ page }) => {
    await createTeam(page, 'Team Spirit', 'TS');
    await page.reload();
    await expect(page.getByText('Team Spirit', { exact: true })).toBeVisible();
    await expect(page.getByText('TS', { exact: true })).toBeVisible();
  });

  test('settings exposes backup and SQLite status', async ({ page }) => {
    await openApp(page, '/settings');
    await expect(page.getByRole('button', { name: 'Скачать копию' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Восстановить и объединить' })).toBeVisible();
    await expect(page.getByText('Данные хранятся на сервере Nuxt', { exact: false })).toBeVisible();
  });
});

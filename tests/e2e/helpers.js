import { expect } from '@playwright/test';

export async function openApp(page, path = '/') {
  await page.goto(path);
}

export async function createTeam(page, name, shortName = '') {
  await openApp(page, '/teams');
  await page.getByRole('button', { name: 'Добавить команду' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название', { exact: true }).fill(name);
  if (shortName) await dialog.getByLabel('Короткое название').fill(shortName);
  await dialog.getByRole('button', { name: 'Добавить команду' }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

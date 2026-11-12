import { test, expect } from '@playwright/test'
import { openApp } from './helpers.js'

test('PandaScore match import, package readiness, sync and deduplication', async ({ page, request }) => {
  const localTeam = await request.post('/api/teams', { data: { name: 'Alpha', shortName: 'ALP', region: '', notes: '', logoAssetId: null } })
  expect(localTeam.ok()).toBe(true)
  await openApp(page)
  await expect(page.getByRole('heading', { name: 'Матчи PandaScore' })).toBeVisible()
  await expect(page.getByText('Dota League')).toHaveCount(0)
  await page.getByText('Выберите команды', { exact: true }).click()
  await page.getByRole('option', { name: 'Alpha' }).click()
  await page.getByRole('button', { name: 'Показать матчи' }).click()
  const externalCard = page.getByText('Alpha', { exact: true }).locator('xpath=ancestor::*[.//button[contains(., "Создать пакет")]][1]')
  await externalCard.getByRole('button', { name: 'Создать пакет' }).click()
  await expect(page).toHaveURL(/\/matches\/match_.+\/package$/)

  await expect(page.getByTestId('package-item-announcement-0')).toContainText('Готово')
  await expect(page.getByTestId('package-item-draft-1')).toContainText('Требуется заполнение')
  await expect(page.getByTestId('package-item-map-result-1')).toContainText('Ожидает карту')
  await expect(page.getByTestId('package-item-series-result-0')).toContainText('Ожидает серию')

  await page.getByRole('combobox', { name: 'Наша команда' }).click()
  await page.getByRole('option', { name: 'Alpha' }).click()

  await request.post('http://127.0.0.1:5200/__state/map')
  await page.getByRole('button', { name: 'Обновить данные' }).click()
  await expect(page.getByTestId('package-item-draft-1')).toContainText('Готово')
  await expect(page.getByTestId('package-item-map-result-1')).toContainText('Готово')
  await expect(page.getByTestId('package-item-series-result-0')).toContainText('Ожидает серию')

  await request.post('http://127.0.0.1:5200/__state/finished')
  await page.getByRole('button', { name: 'Обновить данные' }).click()
  await expect(page.getByTestId('package-item-series-result-0')).toContainText('Готово')

  const first = await request.post('/api/integrations/pandascore/import', { data: { externalMatchId: '1791736' } })
  const second = await request.post('/api/integrations/pandascore/import', { data: { externalMatchId: '1791736' } })
  expect((await first.json()).matchId).toBe((await second.json()).matchId)
  const bootstrap = await (await request.get('/api/bootstrap')).json()
  expect(bootstrap.teams.filter(team => ['Alpha', 'Beta'].includes(team.name))).toHaveLength(2)
  expect(bootstrap.matches.filter(match => match.tournament === 'Dota League')).toHaveLength(1)

  const backup = await (await request.get('/api/backup')).json()
  expect(backup.version).toBe(5)
  expect(backup.data.external_entities.length).toBeGreaterThan(0)
  expect(backup.data.match_games).toHaveLength(1)
  expect(JSON.stringify(backup)).not.toContain('e2e-secret')
  const oldBackup = structuredClone(backup)
  oldBackup.version = 1
  delete oldBackup.data.external_entities
  delete oldBackup.data.match_games
  for (const match of oldBackup.data.matches) delete match.winner_team_id
  for (const project of oldBackup.data.projects) { delete project.dedupe_key; delete project.source_json }
  const restore = await request.post('/api/backup', { data: oldBackup })
  expect(restore.ok()).toBe(true)
})

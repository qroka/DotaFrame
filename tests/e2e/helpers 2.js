import { expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Read PNG width/height from the IHDR chunk. */
export function pngSize(path) {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Tiny valid PNG logo generated in-page (canvas), returned as a Buffer. */
export async function makePng(page, { w = 256, h = 256, color = '#ff5a3c', text = 'L' } = {}) {
  const b64 = await page.evaluate(
    async ({ w, h, color, text }) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${w / 2}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2);
      return c.toDataURL('image/png').split(',')[1];
    },
    { w, h, color, text },
  );
  return Buffer.from(b64, 'base64');
}

/** Seed teams + matches straight through the app's repositories. */
export async function seed(page, { withLogo = true } = {}) {
  await page.goto('/#/');
  return page.evaluate(async (withLogo) => {
    const r = await import('/src/data/repos.js');
    const media = await import('/src/data/media.js');
    let logoAssetId = null;
    if (withLogo) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#3ddc84';
      ctx.fillRect(16, 16, 96, 96);
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      logoAssetId = (await media.importFile(new File([blob], 'logo.png', { type: 'image/png' }), 'logo')).id;
    }
    const a = await r.teams.save({ name: 'Nemiga Gaming', shortName: 'NMG', logoAssetId });
    const b = await r.teams.save({ name: 'Команда Очень Длинного Названия Esports Club', shortName: 'КОД' });
    const c = await r.teams.save({ name: 'Team Spirit', shortName: 'TS' });
    const m1 = await r.matches.save({ teamAId: a.id, teamBId: c.id, tournament: 'EPL Masters 3', stage: 'Плей-офф', startDate: '2026-11-21', startTime: '18:00', timezone: 'Europe/Moscow', format: 'BO3', status: 'completed', scoreA: 2, scoreB: 1 });
    const m2 = await r.matches.save({ teamAId: a.id, teamBId: b.id, tournament: 'Кубок Сообщества', stage: 'Группа A', startDate: '2026-11-22', startTime: '20:30', timezone: 'Europe/Moscow', format: 'BO2', status: 'scheduled' });
    const m3 = await r.matches.save({ teamAId: c.id, teamBId: b.id, tournament: 'EPL Masters 3', startDate: '2026-11-22', startTime: '16:00', timezone: 'Europe/Moscow', format: 'BO5', status: 'scheduled' });
    return { teams: { a, b, c }, matches: { m1, m2, m3 }, logoAssetId };
  }, withLogo);
}

export async function waitPreview(page) {
  await expect(page.locator('[data-preview-scaler] .df-poster')).toBeVisible();
  await page.waitForTimeout(400);
}

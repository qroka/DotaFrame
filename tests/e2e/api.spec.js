import { test, expect } from '@playwright/test';

const upload = (request, bytes, name, type, kind = 'logo') =>
  request.post('/api/media', { multipart: { kind, file: { name, mimeType: type, buffer: Buffer.from(bytes) } } });

test.describe('API: media and backup safety', () => {
  test('upload type comes from the file bytes, not the declared type', async ({ request }) => {
    const html = await upload(request, '<script>alert(1)</script>', 'a.png', 'image/png');
    expect(html.status()).toBe(415);

    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><script>alert(1)</script></svg>';
    const response = await upload(request, svg, 'logo.svg', 'text/html');
    expect(response.status()).toBe(200);
    const asset = await response.json();
    expect(asset.mimeType).toBe('image/svg+xml');

    const served = await request.get(asset.url);
    expect(served.headers()['content-type']).toBe('image/svg+xml');
    expect(served.headers()['x-content-type-options']).toBe('nosniff');
    expect(served.headers()['content-security-policy']).toContain('sandbox');
  });

  test('restore refuses newer formats and non-image media, and writes nothing on failure', async ({ request }) => {
    const post = (body) => request.post('/api/backup', { data: body });
    const newer = await post({ format: 'dotaframe-sqlite-backup', version: 999, data: {} });
    expect(newer.status()).toBe(422);
    expect((await newer.json()).statusMessage).toContain('более новой версией');

    const media = [{ id: 'asset_e2e_evil', kind: 'logo', mime_type: 'text/html', bytes: Buffer.from('<b>x</b>').toString('base64'), name: 'x', created_at: '2020-01-01' }];
    const evil = await post({ format: 'dotaframe-sqlite-backup', version: 1, data: { media } });
    expect(evil.status()).toBe(422);
    expect((await request.get('/api/media/asset_e2e_evil')).status()).toBe(404);
  });

  test('backup export includes the current schema version and survives a restore round trip', async ({ request }) => {
    const backup = await (await request.get('/api/backup')).json();
    expect(backup.format).toBe('dotaframe-sqlite-backup');
    expect(backup.version).toBeGreaterThanOrEqual(3);
    const restored = await request.post('/api/backup', { data: backup });
    expect(restored.status()).toBe(200);
    expect((await restored.json()).ok).toBe(true);
  });

  test('backup is a streamed download that restores line by line and refuses a truncated file', async ({ request }) => {
    const response = await request.get('/api/backup');
    expect(response.headers()['content-disposition']).toContain('attachment');
    const text = await response.text();
    const lines = text.trimEnd().split('\n');
    expect(lines[0]).toMatch(/,"data":\{$/);
    expect(lines.at(-1)).toBe('}}');
    expect(JSON.parse(text).layout).toBe('lines');

    const send = (body) => request.post('/api/backup', { data: body, headers: { 'content-type': 'application/json' } });
    expect((await send(text)).status()).toBe(200);
    const truncated = await send(text.slice(0, Math.floor(text.length / 2)));
    expect(truncated.status()).toBe(422);
  });

  test('image cleanup is a dry run unless confirmed', async ({ request }) => {
    const report = await (await request.get('/api/media/orphans')).json();
    expect(report).toEqual(expect.objectContaining({ count: expect.any(Number), bytes: expect.any(Number), items: expect.any(Array) }));
    const refused = await request.post('/api/media/gc', { data: {} });
    expect(refused.status()).toBe(400);
  });

  test('bootstrap returns a lightweight project list', async ({ request }) => {
    const { projects } = await (await request.get('/api/bootstrap')).json();
    for (const project of projects) {
      expect(project).not.toHaveProperty('data');
      expect(project).not.toHaveProperty('style');
    }
  });
});

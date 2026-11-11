/**
 * Poster Lab — dev-only harness (not part of the production build).
 * Renders every registered template with fictional sample data through the real
 * renderPoster() pipeline and can run renderPng() to check export sizes.
 *
 * URL params: ?t=<templateId>  &w=<scale 0.1–1>  &v=<variant>
 * Variants: default | long | nologo | items1 | items3 | items6 | items7 | bans0 | bans10 | full | empty
 * Playwright: window.__lab = { renderAll, render, exportOne, ready }
 */
import '../src/styles/poster.css';
import '../src/templates/index.js';
import { listTemplates, getTemplate, defaultStyle, defaultTexts } from '../src/templates/registry.js';
import { renderPoster } from '../src/render/renderPoster.js';
import { renderPng } from '../src/export/exportPng.js';
import { sampleData } from '../src/domain/snapshot.js';
import { importFile } from '../src/data/media.js';

/* Variant "assets": canvas-generated logos, player and background stored as real MediaAssets. */
let demo = null;
async function canvasPng(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return new File([blob], 'demo.png', { type: 'image/png' });
}
export async function ensureDemoAssets() {
  if (demo) return demo;
  const logo = (color) => canvasPng(400, 400, (x) => { x.fillStyle = color; x.beginPath(); x.arc(200, 200, 180, 0, Math.PI * 2); x.fill(); x.fillStyle = '#fff'; x.font = 'bold 160px sans-serif'; x.textAlign = 'center'; x.fillText('L', 200, 258); });
  const player = canvasPng(600, 900, (x) => { x.fillStyle = '#d9d9d9'; x.beginPath(); x.arc(300, 220, 140, 0, Math.PI * 2); x.fill(); x.fillRect(90, 400, 420, 500); });
  const bg = canvasPng(1600, 1000, (x, w, h) => { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#1f4e5f'); g.addColorStop(1, '#c97b2a'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  const [a, b, p, bgf] = await Promise.all([logo('#2f7de1'), logo('#e13b2f'), player, bg]);
  demo = {
    logoA: (await importFile(a, 'logo')).id,
    logoB: (await importFile(b, 'logo')).id,
    player: (await importFile(p, 'player')).id,
    background: (await importFile(bgf, 'background')).id,
  };
  return demo;
}
export function buildStyle(tpl, v = variant) {
  const style = defaultStyle(tpl);
  if (v === 'assets' && demo) {
    style.background = { ...style.background, assetId: demo.background };
    style.player = { ...style.player, enabled: true, assetId: demo.player };
  }
  return style;
}

const params = new URLSearchParams(location.search);
const scale = Math.max(0.1, Math.min(1, Number(params.get('w') ?? 0.45)));
const only = params.get('t');
const variant = params.get('v') ?? 'default';

const DEMO_HEROES = [
  ['Axe', 'str'], ['Lina', 'int'], ['Juggernaut', 'agi'], ['Pudge', 'str'], ['Crystal Maiden', 'int'],
  ['Shadow Fiend', 'agi'], ['Invoker', 'all'], ['Tidehunter', 'str'], ['Phantom Assassin', 'agi'], ['Lion', 'int'],
  ['Earthshaker', 'str'], ['Mirana', 'all'], ['Sniper', 'agi'], ['Zeus', 'int'], ['Sven', 'str'],
  ['Windranger', 'all'], ['Storm Spirit', 'int'], ['Slark', 'agi'], ['Bristleback', 'str'], ['Rubick', 'int'],
  ['Templar Assassin', 'agi'], ['Marci', 'all'], ['Mars', 'str'], ['Dazzle', 'all'], ['Morphling', 'agi'],
  ['Puck', 'int'], ['Tiny', 'str'], ['Enigma', 'all'], ['Luna', 'agi'], ['Oracle', 'int'],
].map(([name, attr], i) => ({ heroId: i + 1, name, slug: name.toLowerCase().replace(/\s+/g, '_'), attr, portraitAssetId: null }));

const LONG_A = 'Команда Очень Длинного Названия Esports Club';
const LONG_B = 'Объединённая Киберспортивная Организация Северо-Запада';

export function buildData(tpl, v = variant) {
  const texts = defaultTexts(tpl);
  const data = sampleData(tpl.source, texts);
  if (v === 'long' || v === 'nologo') {
    if (data.teamA) data.teamA = { ...data.teamA, name: LONG_A, shortName: 'КОДН' };
    if (data.teamB) data.teamB = { ...data.teamB, name: LONG_B, shortName: 'ОКОСЗ' };
    if (data.radiant) data.radiant = { ...data.radiant, name: LONG_A };
    if (data.dire) data.dire = { ...data.dire, name: LONG_B };
    if (data.tournament !== undefined) data.tournament = 'Международный Чемпионат Сезона Осень–Зима 2026';
    if (data.items) data.items = data.items.map((it) => ({ ...it, teamA: { ...it.teamA, name: LONG_A }, teamB: { ...it.teamB, name: LONG_B }, tournament: 'Международный Чемпионат' }));
  }
  if (tpl.source === 'matches') {
    const m = /^items(\d+)$/.exec(v);
    const n = m ? Number(m[1]) : null;
    if (n !== null) {
      const base = data.items[0];
      const names = ['Northern Lights', 'Desert Foxes', 'Красная Звезда', 'Iron Wolves', 'Polar Bears', 'Sky Pirates', 'Night Owls', 'Steel Hawks'];
      data.items = Array.from({ length: n }, (_, i) => ({ ...base, teamB: { teamId: null, name: names[i % names.length], shortName: '', logoAssetId: null }, startTime: `${String(14 + i).padStart(2, '0')}:00`, format: i % 3 === 2 ? 'BO2' : 'BO3' }));
    }
  }
  if (tpl.source === 'draft') {
    const take = (a, b) => DEMO_HEROES.slice(a, b);
    if (v !== 'empty') {
      data.picksRadiant = take(0, 5);
      data.picksDire = take(5, 10);
      const bans = v === 'bans0' ? 0 : v === 'bans10' ? 10 : 7;
      data.bansRadiant = take(10, 10 + Math.ceil(bans / 2) + (v === 'bans10' ? 5 - Math.ceil(bans / 2) : 0));
      data.bansDire = take(20, 20 + (v === 'bans10' ? 10 : Math.floor(bans / 2)));
      if (v === 'bans10') data.bansRadiant = take(10, 20);
      data.mapWinner = 'radiant';
    }
  }
  if (v === 'assets' && demo) {
    const withLogo = (t, id) => (t ? { ...t, logoAssetId: id } : t);
    if (data.teamA) data.teamA = withLogo(data.teamA, demo.logoA);
    if (data.teamB) data.teamB = withLogo(data.teamB, demo.logoB);
    if (data.radiant) data.radiant = withLogo(data.radiant, demo.logoA);
    if (data.dire) data.dire = withLogo(data.dire, demo.logoB);
    if (data.items) data.items = data.items.map((it) => ({ ...it, teamA: withLogo(it.teamA, demo.logoA), teamB: withLogo(it.teamB, demo.logoB) }));
  }
  if (tpl.type === 'lose') {
    data.perspective = 'B';
  }
  if (v === 'draw') Object.assign(data, { format: 'BO2', scoreA: 1, scoreB: 1, winner: 'draw' });
  return data;
}

const root = document.getElementById('lab');
root.style.cssText = 'padding:24px;display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start';

export async function render(id, v = variant, s = scale) {
  const tpl = getTemplate(id);
  const card = document.createElement('section');
  card.dataset.lab = id;
  card.style.cssText = 'display:flex;flex-direction:column;gap:8px';
  const head = document.createElement('div');
  head.style.cssText = 'font:500 13px/1.3 Inter Variable, sans-serif;color:#a1a4ad;display:flex;gap:8px;align-items:center';
  head.textContent = `${tpl.name} · ${tpl.id}@${tpl.version} · ${v}`;
  const btn = document.createElement('button');
  btn.className = 'btn btn-sm';
  btn.textContent = 'PNG';
  head.append(btn);
  const frame = document.createElement('div');
  frame.style.cssText = `width:${tpl.base.width * s}px;height:${tpl.base.height * s}px;overflow:hidden;position:relative`;
  const stage = document.createElement('div');
  stage.style.cssText = `width:${tpl.base.width}px;height:${tpl.base.height}px;transform:scale(${s});transform-origin:0 0`;
  frame.append(stage);
  const issues = document.createElement('div');
  issues.style.cssText = `max-width:${tpl.base.width * s}px;font:12px/1.4 Inter Variable,sans-serif;color:#f5b84a`;
  card.append(head, frame, issues);
  root.append(card);
  if (v === 'assets') await ensureDemoAssets();
  const style = buildStyle(tpl, v);
  const data = buildData(tpl, v);
  const res = await renderPoster(stage, { template: tpl, data, style });
  issues.textContent = res.issues.map((i) => `${i.level}: ${i.message}`).join(' | ');
  btn.onclick = () => exportOne(id, v).then((r) => (btn.textContent = `${r.width}×${r.height}`));
  return { id, issues: res.issues };
}

export async function renderAll(v = variant) {
  root.replaceChildren();
  const out = [];
  for (const tpl of listTemplates()) if (!only || tpl.id === only) out.push(await render(tpl.id, v));
  return out;
}

export async function exportOne(id, v = variant, width) {
  const tpl = getTemplate(id);
  const size = width ? tpl.exportSizes.find((x) => x.width === width) : tpl.exportSizes[0];
  if (v === 'assets') await ensureDemoAssets();
  const { blob, width: w, height: h, issues } = await renderPng({ template: tpl, data: buildData(tpl, v), style: buildStyle(tpl, v), size });
  return { width: w, height: h, bytes: blob.size, issues: issues.map((i) => i.message) };
}

/** Export and return the PNG as base64 (for saving from Playwright). */
export async function exportBase64(id, v = variant, width) {
  const tpl = getTemplate(id);
  const size = width ? tpl.exportSizes.find((x) => x.width === width) : tpl.exportSizes[0];
  if (v === 'assets') await ensureDemoAssets();
  const { blob } = await renderPng({ template: tpl, data: buildData(tpl, v), style: buildStyle(tpl, v), size });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

window.__lab = { renderAll, render, exportOne, exportBase64, buildData, templates: () => listTemplates().map((t) => t.id) };
window.__lab.ready = renderAll();

import { describe, it, expect } from 'vitest';
import { HEROES, HEROES_BY_ID, getHero, searchHeroes, matchHeroFile, heroInitials, heroPortraitUrl, ATTRIBUTES } from '../../src/data/heroes.js';

describe('hero catalog', () => {
  it('has a full roster with unique ids, slugs and names', () => {
    expect(HEROES.length).toBeGreaterThanOrEqual(120);
    expect(new Set(HEROES.map((h) => h.id)).size).toBe(HEROES.length);
    expect(new Set(HEROES.map((h) => h.slug)).size).toBe(HEROES.length);
    expect(new Set(HEROES.map((h) => h.name)).size).toBe(HEROES.length);
  });

  it('every hero has a valid attribute and integer id', () => {
    for (const h of HEROES) {
      expect(ATTRIBUTES[h.attr]).toBeTruthy();
      expect(Number.isInteger(h.id)).toBe(true);
      expect(Array.isArray(h.aliases)).toBe(true);
    }
  });

  it('known ids map to known heroes', () => {
    expect(getHero(1).name).toBe('Anti-Mage');
    expect(getHero(11).slug).toBe('nevermore');
    expect(getHero(22).name).toBe('Zeus');
    expect(getHero('8').name).toBe('Juggernaut');
    expect(HEROES_BY_ID[24]).toBeUndefined();
    expect(getHero(null)).toBeNull();
  });

  it('is sorted by name', () => {
    const names = HEROES.map((h) => h.name);
    expect([...names].sort((a, b) => a.localeCompare(b, 'en'))).toEqual(names);
  });

  it('searches by name, alias (latin and Russian) and attribute', () => {
    expect(searchHeroes('anti').map((h) => h.id)).toContain(1);
    expect(searchHeroes('SF').map((h) => h.id)).toContain(11);
    expect(searchHeroes('Антимаг').map((h) => h.id)).toContain(1);
    expect(searchHeroes('фурион').map((h) => h.id)).toContain(53);
    expect(searchHeroes('', { attr: 'str' }).every((h) => h.attr === 'str')).toBe(true);
    expect(searchHeroes('zzzzzz')).toEqual([]);
  });

  it('matches portrait file names', () => {
    expect(matchHeroFile('antimage.png')?.id).toBe(1);
    expect(matchHeroFile('Anti-Mage.webp')?.id).toBe(1);
    expect(matchHeroFile('npc_dota_hero_antimage_png.png')?.id).toBe(1);
    expect(matchHeroFile('npc_dota_hero_zuus.webp')?.id).toBe(22);
    expect(matchHeroFile('1.png')?.id).toBe(1);
    expect(matchHeroFile("Nature's Prophet.jpg")?.id).toBe(53);
    expect(matchHeroFile('queen_of_pain.png')?.id).toBe(39);
    expect(matchHeroFile('random-file.png')).toBeNull();
  });

  it('builds initials', () => {
    expect(heroInitials(getHero(1))).toBe('AM');
    expect(heroInitials(getHero(91))).toBe('IO');
  });

  it('builds a local bundled portrait URL', () => {
    expect(heroPortraitUrl(getHero(1))).toBe('/images/heroes/antimage.png');
    expect(heroPortraitUrl({ slug: '../escape' })).toBeNull();
    expect(heroPortraitUrl(null)).toBeNull();
  });
});

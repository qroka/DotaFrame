/**
 * Static Dota 2 hero catalog with optional bundled portraits.
 *
 * `id` is the numeric hero id used by the game client / OpenDota (stable across patches),
 * `slug` is the internal npc short name (npc_dota_hero_<slug>), useful for matching
 * user-provided portrait files. Primary attributes reflect the post-7.33 system
 * ('all' = Universal) and may drift with balance patches — they are only used for
 * filtering and placeholder tint, never as game data on posters.
 *
 * Uncertain ids are marked with "verify". Bundled portraits are used by default;
 * user-supplied immutable MediaAssets override them when present.
 */
import { matchesQuery } from '../core/utils';
import type { Hero, HeroAttr } from '../types';

export const ATTRIBUTES: Record<HeroAttr, { id: HeroAttr; label: string; short: string; color: string }> = {
  str: { id: 'str', label: 'Сила', short: 'STR', color: '#e5484d' },
  agi: { id: 'agi', label: 'Ловкость', short: 'AGI', color: '#3ddc84' },
  int: { id: 'int', label: 'Интеллект', short: 'INT', color: '#4f9dff' },
  all: { id: 'all', label: 'Универсальные', short: 'UNI', color: '#e9b949' },
};

// [id, slug, name, attr, aliases]
const RAW: Array<[number, string, string, HeroAttr, string[]]> = [
  [1, 'antimage', 'Anti-Mage', 'agi', ['AM', 'Антимаг', 'Анти-маг']],
  [2, 'axe', 'Axe', 'str', ['Акс']],
  [3, 'bane', 'Bane', 'all', ['Бейн']],
  [4, 'bloodseeker', 'Bloodseeker', 'agi', ['BS', 'Бладсикер', 'Блад']],
  [5, 'crystal_maiden', 'Crystal Maiden', 'int', ['CM', 'Цм', 'Кристалка', 'Рыло']],
  [6, 'drow_ranger', 'Drow Ranger', 'agi', ['Drow', 'Дроу', 'Траксекс']],
  [7, 'earthshaker', 'Earthshaker', 'str', ['ES', 'Шейкер', 'Эс']],
  [8, 'juggernaut', 'Juggernaut', 'agi', ['Jugg', 'Джагернаут', 'Джагер']],
  [9, 'mirana', 'Mirana', 'all', ['POTM', 'Мирана']],
  [10, 'morphling', 'Morphling', 'agi', ['Morph', 'Морфлинг', 'Морф']],
  [11, 'nevermore', 'Shadow Fiend', 'agi', ['SF', 'Сф', 'Невермор']],
  [12, 'phantom_lancer', 'Phantom Lancer', 'agi', ['PL', 'Пл', 'Лансер']],
  [13, 'puck', 'Puck', 'int', ['Пак']],
  [14, 'pudge', 'Pudge', 'str', ['Пудж']],
  [15, 'razor', 'Razor', 'agi', ['Разор']],
  [16, 'sand_king', 'Sand King', 'all', ['SK', 'Сенд Кинг', 'Скорпион']],
  [17, 'storm_spirit', 'Storm Spirit', 'int', ['Storm', 'Шторм', 'Сторм']],
  [18, 'sven', 'Sven', 'str', ['Свен']],
  [19, 'tiny', 'Tiny', 'str', ['Тини', 'Тайни']],
  [20, 'vengefulspirit', 'Vengeful Spirit', 'all', ['VS', 'Венга']],
  [21, 'windrunner', 'Windranger', 'all', ['WR', 'Вр', 'Виндраннер']],
  [22, 'zuus', 'Zeus', 'int', ['Зевс']],
  [23, 'kunkka', 'Kunkka', 'str', ['Кунка', 'Адмирал']],
  [25, 'lina', 'Lina', 'int', ['Лина']],
  [26, 'lion', 'Lion', 'int', ['Лион', 'Лайон']],
  [27, 'shadow_shaman', 'Shadow Shaman', 'int', ['Rhasta', 'Шаман', 'Раста']],
  [28, 'slardar', 'Slardar', 'str', ['Слардар']],
  [29, 'tidehunter', 'Tidehunter', 'str', ['Tide', 'Тайд', 'Тайдхантер']],
  [30, 'witch_doctor', 'Witch Doctor', 'int', ['WD', 'Вд', 'Витч']],
  [31, 'lich', 'Lich', 'int', ['Лич']],
  [32, 'riki', 'Riki', 'agi', ['Рики']],
  [33, 'enigma', 'Enigma', 'all', ['Энигма']],
  [34, 'tinker', 'Tinker', 'int', ['Тинкер']],
  [35, 'sniper', 'Sniper', 'agi', ['Снайпер']],
  [36, 'necrolyte', 'Necrophos', 'int', ['Necro', 'Некрофос', 'Некр']],
  [37, 'warlock', 'Warlock', 'int', ['WL', 'Варлок']],
  [38, 'beastmaster', 'Beastmaster', 'all', ['BM', 'Бистмастер', 'Бм']],
  [39, 'queenofpain', 'Queen of Pain', 'int', ['QoP', 'Квопа', 'Акаша']],
  [40, 'venomancer', 'Venomancer', 'all', ['Veno', 'Веномансер', 'Веник']],
  [41, 'faceless_void', 'Faceless Void', 'agi', ['FV', 'Войд', 'Фв']],
  [42, 'skeleton_king', 'Wraith King', 'str', ['WK', 'Вк', 'Скелет', 'Леорик']],
  [43, 'death_prophet', 'Death Prophet', 'int', ['DP', 'Дп', 'Кробелус']],
  [44, 'phantom_assassin', 'Phantom Assassin', 'agi', ['PA', 'Па', 'Фантомка', 'Мортред']],
  [45, 'pugna', 'Pugna', 'int', ['Пугна']],
  [46, 'templar_assassin', 'Templar Assassin', 'agi', ['TA', 'Та', 'Темплар', 'Ланая']],
  [47, 'viper', 'Viper', 'agi', ['Вайпер']],
  [48, 'luna', 'Luna', 'agi', ['Луна']],
  [49, 'dragon_knight', 'Dragon Knight', 'str', ['DK', 'Дк', 'Драгон']],
  [50, 'dazzle', 'Dazzle', 'all', ['Дазл']],
  [51, 'rattletrap', 'Clockwerk', 'all', ['Clock', 'Клок', 'Клокверк']],
  [52, 'leshrac', 'Leshrac', 'int', ['Lesh', 'Лешрак', 'Леш']],
  [53, 'furion', "Nature's Prophet", 'int', ['NP', 'Furion', 'Фурион', 'Профет']],
  [54, 'life_stealer', 'Lifestealer', 'str', ['LS', 'Naix', 'Гуль', 'Лайфстилер']],
  [55, 'dark_seer', 'Dark Seer', 'all', ['DS', 'Дарк Сир', 'Сир']],
  [56, 'clinkz', 'Clinkz', 'agi', ['Клинкз', 'Клинкс']],
  [57, 'omniknight', 'Omniknight', 'str', ['Omni', 'Омник', 'Омнинайт']],
  [58, 'enchantress', 'Enchantress', 'int', ['Ench', 'Энча', 'Энчантресс']],
  [59, 'huskar', 'Huskar', 'str', ['Хускар']],
  [60, 'night_stalker', 'Night Stalker', 'str', ['NS', 'Балананр', 'Найт Сталкер']],
  [61, 'broodmother', 'Broodmother', 'all', ['Brood', 'Бруда', 'Паучиха']],
  [62, 'bounty_hunter', 'Bounty Hunter', 'agi', ['BH', 'Баунти', 'Гондар']],
  [63, 'weaver', 'Weaver', 'agi', ['Вивер']],
  [64, 'jakiro', 'Jakiro', 'int', ['Джакиро', 'Twin Head Dragon']],
  [65, 'batrider', 'Batrider', 'all', ['Bat', 'Бэтрайдер', 'Бэт']],
  [66, 'chen', 'Chen', 'all', ['Чен']],
  [67, 'spectre', 'Spectre', 'agi', ['Спектра', 'Спектр']],
  [68, 'doom_bringer', 'Doom', 'str', ['Дум']],
  [69, 'ancient_apparition', 'Ancient Apparition', 'int', ['AA', 'Аа', 'Апарат']],
  [70, 'ursa', 'Ursa', 'agi', ['Урса']],
  [71, 'spirit_breaker', 'Spirit Breaker', 'str', ['SB', 'Бара', 'Спирит Брейкер']],
  [72, 'gyrocopter', 'Gyrocopter', 'agi', ['Gyro', 'Гиро', 'Гирокоптер']],
  [73, 'alchemist', 'Alchemist', 'str', ['Alch', 'Алхимик', 'Алх']],
  [74, 'invoker', 'Invoker', 'all', ['Invo', 'Инвокер', 'Карл']],
  [75, 'silencer', 'Silencer', 'int', ['Сайленсер', 'Сало']],
  [76, 'obsidian_destroyer', 'Outworld Destroyer', 'int', ['OD', 'Од', 'Outworld Devourer']],
  [77, 'lycan', 'Lycan', 'all', ['Ликан']],
  [78, 'brewmaster', 'Brewmaster', 'all', ['Brew', 'Панда', 'Брюмастер']],
  [79, 'shadow_demon', 'Shadow Demon', 'int', ['SD', 'Шадоу Демон']],
  [80, 'lone_druid', 'Lone Druid', 'all', ['LD', 'Друид', 'Сильван']],
  [81, 'chaos_knight', 'Chaos Knight', 'str', ['CK', 'Цк', 'Хаос']],
  [82, 'meepo', 'Meepo', 'agi', ['Мипо']],
  [83, 'treant', 'Treant Protector', 'str', ['Treant', 'Трент', 'Дерево']],
  [84, 'ogre_magi', 'Ogre Magi', 'str', ['Ogre', 'Огр']],
  [85, 'undying', 'Undying', 'str', ['Андаинг', 'Андаин']],
  [86, 'rubick', 'Rubick', 'int', ['Рубик']],
  [87, 'disruptor', 'Disruptor', 'int', ['Дизраптор']],
  [88, 'nyx_assassin', 'Nyx Assassin', 'all', ['Nyx', 'Никс']],
  [89, 'naga_siren', 'Naga Siren', 'agi', ['Naga', 'Нага']],
  [90, 'keeper_of_the_light', 'Keeper of the Light', 'int', ['KotL', 'Котл', 'Эзалор']],
  [91, 'wisp', 'Io', 'all', ['Wisp', 'Висп', 'Ио']],
  [92, 'visage', 'Visage', 'all', ['Визаж']],
  [93, 'slark', 'Slark', 'agi', ['Сларк']],
  [94, 'medusa', 'Medusa', 'agi', ['Dusa', 'Медуза', 'Дуза']],
  [95, 'troll_warlord', 'Troll Warlord', 'agi', ['Troll', 'Тролль']],
  [96, 'centaur', 'Centaur Warrunner', 'str', ['Centaur', 'Кентавр', 'Цента']],
  [97, 'magnataur', 'Magnus', 'all', ['Magnus', 'Магнус', 'Мага']],
  [98, 'shredder', 'Timbersaw', 'str', ['Timber', 'Тимбер', 'Тимбермен']],
  [99, 'bristleback', 'Bristleback', 'str', ['BB', 'Бб', 'Бристл']],
  [100, 'tusk', 'Tusk', 'str', ['Таск']],
  [101, 'skywrath_mage', 'Skywrath Mage', 'int', ['Sky', 'Скай', 'Скайрат']],
  [102, 'abaddon', 'Abaddon', 'all', ['Абаддон', 'Аба']],
  [103, 'elder_titan', 'Elder Titan', 'str', ['ET', 'Титан', 'Элдер']],
  [104, 'legion_commander', 'Legion Commander', 'str', ['LC', 'Легионка', 'Лц']],
  [105, 'techies', 'Techies', 'all', ['Техис', 'Минер']],
  [106, 'ember_spirit', 'Ember Spirit', 'agi', ['Ember', 'Эмбер']],
  [107, 'earth_spirit', 'Earth Spirit', 'str', ['Earth', 'Кадаш', 'Эрс Спирит']],
  [108, 'abyssal_underlord', 'Underlord', 'str', ['Pitlord', 'Андерлорд', 'Питлорд']],
  [109, 'terrorblade', 'Terrorblade', 'agi', ['TB', 'Тб', 'Терорблейд']],
  [110, 'phoenix', 'Phoenix', 'all', ['Феникс']],
  [111, 'oracle', 'Oracle', 'int', ['Оракл']],
  [112, 'winter_wyvern', 'Winter Wyvern', 'all', ['WW', 'Виверна']],
  [113, 'arc_warden', 'Arc Warden', 'agi', ['Arc', 'Арк', 'Зет']],
  [114, 'monkey_king', 'Monkey King', 'agi', ['MK', 'Мк', 'Обезьяна']],
  [119, 'dark_willow', 'Dark Willow', 'all', ['Willow', 'Вилоу', 'Мирейска']],
  [120, 'pangolier', 'Pangolier', 'all', ['Pango', 'Панго', 'Панголиер']],
  [121, 'grimstroke', 'Grimstroke', 'int', ['Grim', 'Гримстрок', 'Грим']],
  [123, 'hoodwink', 'Hoodwink', 'agi', ['Худвинк', 'Белка']],
  [126, 'void_spirit', 'Void Spirit', 'all', ['Void Spirit', 'Войд Спирит', 'Инаи']],
  [128, 'snapfire', 'Snapfire', 'all', ['Snap', 'Снэпфаер', 'Бабка']],
  [129, 'mars', 'Mars', 'str', ['Марс']],
  [131, 'ringmaster', 'Ringmaster', 'int', ['Рингмастер']], // verify: id 131 (7.37e)
  [135, 'dawnbreaker', 'Dawnbreaker', 'str', ['Dawn', 'Доубрейкер', 'Валора']],
  [136, 'marci', 'Marci', 'all', ['Марси']],
  [137, 'primal_beast', 'Primal Beast', 'str', ['PB', 'Праймал', 'Бист']],
  [138, 'muerta', 'Muerta', 'int', ['Муэрта', 'Муерта']],
  [145, 'kez', 'Kez', 'agi', ['Кез']], // verify: id 145 (7.37)
];

export const HEROES: Hero[] = RAW.map(([id, slug, name, attr, aliases]) => ({ id, slug, name, attr, aliases })).sort((a, b) => a.name.localeCompare(b.name, 'en'));

export const HEROES_BY_ID: Record<string | number, Hero | undefined> = Object.fromEntries(HEROES.map((h) => [h.id, h]));

export const getHero = (id: number | string | null | undefined): Hero | null => (id === null || id === undefined ? null : (HEROES_BY_ID[id] ?? HEROES_BY_ID[Number(id)] ?? null));

export function searchHeroes(query = '', { attr }: { attr?: HeroAttr | '' } = {}): Hero[] {
  return HEROES.filter((h) => (!attr || h.attr === attr) && matchesQuery([h.name, h.slug.replace(/_/g, ' '), ...h.aliases], query));
}

/** Initials for placeholder tiles: "Anti-Mage" → "AM", "Io" → "IO". */
export function heroInitials(hero: Pick<Hero, 'name'> | string | null | undefined): string {
  const name = typeof hero === 'string' ? hero : (hero?.name ?? '');
  const parts = name.replace(/'/g, '').split(/[\s-]+/).filter(Boolean);
  if (parts.length >= 2) return ((parts[0]![0] ?? '') + (parts[1]![0] ?? '')).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Public URL for a portrait bundled under public/images/heroes. */
export function heroPortraitUrl(hero: Pick<Hero, 'slug'> | null | undefined): string | null {
  const slug = String(hero?.slug ?? '').trim();
  return /^[a-z0-9_]+$/.test(slug) ? `/images/heroes/${slug}.png` : null;
}

/** Normalize a string for file-name matching: lowercase, letters/digits only. */
const norm = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const MATCH_INDEX = (() => {
  const map = new Map<string, Hero>();
  for (const h of HEROES) {
    map.set(norm(h.slug), h);
    map.set(norm(h.name), h);
    for (const a of h.aliases) if (/^[a-z0-9\s'-]+$/i.test(a) && a.length > 3) map.set(norm(a), h);
  }
  return map;
})();

/**
 * Match a portrait file name to a hero.
 * Accepts slug ('antimage.png'), display name ('Anti-Mage.webp'), npc name
 * ('npc_dota_hero_antimage_png.png') or numeric id ('1.png').
 */
export function matchHeroFile(fileName: unknown): Hero | null {
  let base = String(fileName ?? '').replace(/\.[a-z0-9]+$/i, '');
  base = base.replace(/^npc_dota_hero_/i, '').replace(/[_-](png|jpe?g|webp|gif|full|vert|portrait|icon|sb|lg)$/i, '').replace(/[_-](png|jpe?g|webp|full|vert|portrait|icon|sb|lg)$/i, '');
  if (/^\d+$/.test(base.trim())) return getHero(Number(base.trim()));
  return MATCH_INDEX.get(norm(base)) ?? null;
}

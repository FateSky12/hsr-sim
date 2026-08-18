import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { FALLBACK_NAME_CATALOG } from '../../../apps/web/src/name-catalog.js';

const starRailRevision = 'b95e75c7e1273d819d20c530c0b7e13a3ef19fb4';
const turnBasedRevision = '648b08fbdb2e49739ebbf1210c9a189fcfc5e2d7';
const starRailRoot = new URL(`../generated/starrailres/${starRailRevision}/`, import.meta.url);
const turnBasedRoot = new URL(`../generated/turnbasedgamedata/${turnBasedRevision}/`, import.meta.url);

function readJson<T>(url: URL): T {
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

describe('versioned UI localization catalogs', () => {
  test('keeps the cn character sibling aligned with the pinned en catalog', () => {
    const english = readJson<Array<{ id: string; name: string }>>(new URL('en/direct-characters.json', starRailRoot));
    const chinese = readJson<Array<{ id: string; name: string }>>(new URL('cn/direct-characters.json', starRailRoot));
    expect(chinese).toHaveLength(english.length);
    expect(chinese.map((record) => record.id)).toEqual(english.map((record) => record.id));
    expect(english.find((record) => record.id === '1001')?.name).toBe('March 7th');
    expect(chinese.find((record) => record.id === '1001')?.name).toBe('三月七');
    expect(chinese.every((record) => record.name.trim().length > 0)).toBe(true);
  });

  test('covers every currently exposed scene and enemy ID in both locales', () => {
    const catalog = readJson<{
      locales: Record<string, { scenarios: Record<string, string>; enemies: Record<string, string> }>;
    }>(new URL('catalog-i18n.json', turnBasedRoot));
    const scenarioIds = [
      'memory-of-chaos-4.4-abstracted',
      'apocalyptic-shadow-4.4-abstracted',
      'pure-fiction-4.4-abstracted',
      'turnbased-stage-30124121',
      'turnbased-stage-30501011',
      'turnbased-stage-30501012',
    ];
    const enemyIds = [
      'moc_4_4_training_boss',
      'as_4_4_training_boss',
      'pf_4_4_training_wave',
      '1023020',
      '3004012',
      '3012020',
      '3013010',
      '3014020',
      '3024020',
      '4053010',
    ];
    for (const locale of ['en', 'zh-CN']) {
      expect(Object.keys(catalog.locales[locale]!.scenarios)).toEqual(expect.arrayContaining(scenarioIds));
      expect(Object.keys(catalog.locales[locale]!.enemies)).toEqual(expect.arrayContaining(enemyIds));
      expect(Object.values(catalog.locales[locale]!.scenarios).every((name) => name.trim().length > 0)).toBe(true);
      expect(Object.values(catalog.locales[locale]!.enemies).every((name) => name.trim().length > 0)).toBe(true);
      expect(Object.keys(FALLBACK_NAME_CATALOG.locales[locale]!.scenarios ?? {})).toEqual(expect.arrayContaining(scenarioIds));
      expect(Object.keys(FALLBACK_NAME_CATALOG.locales[locale]!.enemies ?? {})).toEqual(expect.arrayContaining(enemyIds));
    }
  });
});

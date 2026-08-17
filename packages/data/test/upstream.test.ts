import { describe, expect, it } from 'vitest';
import { parseStarRailResCharacterIndex, createStarRailResIndexUrl } from '../src/index.js';

describe('StarRailRes index adapter', () => {
  it('parses the upstream character index without pretending it contains executable battle formulas', () => {
    const result = parseStarRailResCharacterIndex({
      '1001': { id: '1001', name: 'March 7th', tag: 'mar7th', rarity: 4, path: 'Knight', element: 'Ice', max_sp: 120, ranks: ['100101'], skills: ['100101'], skill_trees: ['1001001'], icon: 'icon/character/1001.png' },
    }, { revision: 'starrailres-fixture-1', language: 'en' });

    expect(result[0]).toEqual(expect.objectContaining({ id: '1001', name: 'March 7th', path: 'Knight', maxEnergy: 120 }));
    expect(result[0]?.coverage).toBe('unsupported');
    expect(result[0]?.source).toEqual({ kind: 'StarRailRes', revision: 'starrailres-fixture-1' });
  });

  it('builds a pinned URL from an explicit revision and language', () => {
    expect(createStarRailResIndexUrl('abc123', 'en', 'characters.json')).toBe('https://raw.githubusercontent.com/Mar-7th/StarRailRes/abc123/index_new/en/characters.json');
  });
});

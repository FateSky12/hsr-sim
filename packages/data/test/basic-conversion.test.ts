import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseStarRailResBasicCharacter } from '../src/index.js';

const revision = 'b95e75c7e1273d819d20c530c0b7e13a3ef19fb4';
const root = new URL(`../generated/starrailres/${revision}/en/`, import.meta.url);
function read(file: string): unknown { return JSON.parse(readFileSync(new URL(file, root), 'utf8')); }

describe('StarRailRes executable fragment conversion', () => {
  it('converts one character base panel and basic multiplier while declaring partial coverage', () => {
    const character = parseStarRailResBasicCharacter(
      (read('characters.json') as Record<string, unknown>)['1001'],
      (read('character_promotions.json') as Record<string, unknown>)['1001'],
      (read('character_skills.json') as Record<string, unknown>)['100101'],
      { revision, level: 80 },
    );

    expect(character).toMatchObject({
      id: '1001',
      name: 'March 7th',
      element: 'ice',
      level: 80,
      coverage: 'abstracted',
    });
    expect(character.baseStats).toMatchObject({ hp: 1058.4, atk: 511.56, def: 573.3, spd: 101 });
    expect(character.abilities[0]?.effects[0]).toMatchObject({ multiplier: 1.4, scaling: 'ATK', element: 'ice' });
  });
});

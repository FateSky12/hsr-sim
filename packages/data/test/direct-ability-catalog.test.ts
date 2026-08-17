import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseStarRailResDirectCharacterCatalog } from '../src/index.js';

const revision = 'b95e75c7e1273d819d20c530c0b7e13a3ef19fb4';
const root = new URL(`../generated/starrailres/${revision}/en/`, import.meta.url);
function read(file: string): unknown { return JSON.parse(readFileSync(new URL(file, root), 'utf8')); }

describe('conservative direct-attack conversion', () => {
  it('converts simple single/AoE and blast attacks while leaving stateful skills out', () => {
    const characters = parseStarRailResDirectCharacterCatalog({
      characters: read('characters.json'),
      promotions: read('character_promotions.json'),
      skills: read('character_skills.json'),
    }, { revision, level: 80 });
    const march = characters.find((character) => character.id === '1001')!;

    expect(characters).toHaveLength(95);
    expect(characters.reduce((sum, character) => sum + character.abilities.length, 0)).toBe(256);
    expect(march.abilities.map((ability) => ability.id)).toEqual(['basic', 'skill', 'ultimate']);
    expect(march.abilities.find((ability) => ability.id === 'skill')?.effects[0]).toMatchObject({ kind: 'shield', multiplier: 0.665, flatAmount: 973.75, scaling: 'DEF', duration: 3, target: 'first_target' });
    expect(march.abilities.find((ability) => ability.id === 'ultimate')?.effects[0]).toMatchObject({ multiplier: 1.8, scaling: 'ATK', target: 'all_enemies' });
    const himeko = characters.find((character) => character.id === '1003')!;
    expect(himeko.abilities.find((ability) => ability.id === 'skill')?.effects).toEqual([
      expect.objectContaining({ multiplier: 2.5, target: 'first_target' }),
      expect.objectContaining({ multiplier: 1, target: 'adjacent_targets' }),
    ]);
    const welt = characters.find((character) => character.id === '1004')!;
    expect(welt.abilities.find((ability) => ability.id === 'skill')?.effects).toContainEqual(expect.objectContaining({ kind: 'bounceDamage', hits: 2, multiplier: 0.9, target: 'random_enemy' }));
    const kafka = characters.find((character) => character.id === '1005')!;
    expect(kafka.abilities.find((ability) => ability.id === 'skill')?.effects).toContainEqual(expect.objectContaining({ kind: 'detonateDots', multiplier: 0.825, target: 'first_target' }));
    const bronya = characters.find((character) => character.id === '1101')!;
    expect(bronya.abilities.find((ability) => ability.id === 'skill')?.effects).toEqual([
      expect.objectContaining({ kind: 'cleanse', count: 1, target: 'first_target' }),
      expect.objectContaining({ kind: 'advanceForward', ratio: 1, target: 'first_target' }),
      expect.objectContaining({ kind: 'modifyStat', stat: 'DmgBoostAll', percent: 0.825, duration: 1, target: 'first_target' }),
    ]);
    const serval = characters.find((character) => character.id === '1103')!;
    expect(serval.abilities.find((ability) => ability.id === 'skill')?.effects).toContainEqual(expect.objectContaining({
      kind: 'applyDot',
      id: '110302:dot',
      multiplier: 1.3,
      duration: 2,
      chance: 0.8,
      target: 'all_enemies',
    }));
    const hanya = characters.find((character) => character.id === '1215')!;
    expect(hanya.abilities.find((ability) => ability.id === 'ultimate')?.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'modifyStat', stat: 'SPD', percent: 0.225, duration: 2, target: 'first_target' }),
      expect.objectContaining({ kind: 'modifyStat', stat: 'ATK', percent: 0.72, duration: 2, target: 'first_target' }),
    ]));
    const asta = characters.find((character) => character.id === '1009')!;
    expect(asta.abilities.find((ability) => ability.id === 'ultimate')?.effects).toContainEqual(expect.objectContaining({ kind: 'modifyStat', stat: 'SPD', flat: 57, duration: 2, target: 'all_allies' }));
    expect(characters.find((character) => character.id === '1101')?.abilities.find((ability) => ability.id === 'ultimate')?.effects).toContainEqual(expect.objectContaining({ kind: 'modifyStat', stat: 'ATK', percent: 0.66, duration: 2, target: 'all_allies' }));
    expect(characters.find((character) => character.id === '1306')?.abilities.find((ability) => ability.id === 'ultimate')?.effects).toContainEqual(expect.objectContaining({ kind: 'gainSkillPoints', amount: 4 }));
    expect(characters.find((character) => character.id === '1313')?.abilities.find((ability) => ability.id === 'ultimate')?.effects).toContainEqual(expect.objectContaining({ kind: 'gainEnergy', ratio: 0.2, target: 'first_target' }));
    expect(characters.find((character) => character.id === '8001')?.abilities.find((ability) => ability.id === 'skill')?.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'dealDamage', multiplier: 1.5625, target: 'first_target' }),
      expect.objectContaining({ kind: 'dealDamage', multiplier: 1.5625, target: 'adjacent_targets' }),
    ]));
  });

  it('ships the compiled direct catalog with the same revision provenance', () => {
    const compiled = JSON.parse(readFileSync(new URL('direct-characters.json', root), 'utf8')) as Array<{ source: { revision: string }; abilities: unknown[] }>;
    expect(compiled).toHaveLength(95);
    expect(compiled.every((character) => character.source.revision === revision)).toBe(true);
    expect(compiled.reduce((sum, character) => sum + character.abilities.length, 0)).toBe(256);
  });
});

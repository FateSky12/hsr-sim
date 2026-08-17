import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseStarRailResBasicCharacterCatalog } from '../src/index.js';

const revision = 'b95e75c7e1273d819d20c530c0b7e13a3ef19fb4';
const root = new URL(`../generated/starrailres/${revision}/en/`, import.meta.url);
function read(file: string): unknown { return JSON.parse(readFileSync(new URL(file, root), 'utf8')); }

describe('bulk basic-attack conversion', () => {
  it('converts the pinned character index into partial executable modules without dropping records', () => {
    const characters = parseStarRailResBasicCharacterCatalog({
      characters: read('characters.json'),
      promotions: read('character_promotions.json'),
      skills: read('character_skills.json'),
    }, { revision, level: 80 });

    expect(characters).toHaveLength(95);
    expect(new Set(characters.map((character) => character.id)).size).toBe(95);
    expect(characters.every((character) => character.abilities.some((ability) => ability.id === 'basic'))).toBe(true);
  });

  it('ships the generated basic catalog with source provenance on every record', () => {
    const compiled = JSON.parse(readFileSync(new URL('basic-characters.json', root), 'utf8')) as Array<{ source: { revision: string } }>;
    expect(compiled).toHaveLength(95);
    expect(new Set(compiled.map((character) => character.source.revision))).toEqual(new Set([revision]));
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseStarRailResLightConeIndex, parseStarRailResRelicIndex, parseStarRailResRelicSetIndex } from '../src/index.js';

const revision = 'b95e75c7e1273d819d20c530c0b7e13a3ef19fb4';
const root = new URL(`../generated/starrailres/${revision}/en/`, import.meta.url);

function read(file: string): unknown {
  return JSON.parse(readFileSync(new URL(file, root), 'utf8'));
}

describe('pinned StarRailRes snapshot', () => {
  it('contains real upstream indexes while keeping them unsupported until converted/calibrated', () => {
    const lightCones = parseStarRailResLightConeIndex(read('light_cones.json'), { revision });
    const relics = parseStarRailResRelicIndex(read('relics.json'), { revision });
    const sets = parseStarRailResRelicSetIndex(read('relic_sets.json'), { revision });

    expect(lightCones.length).toBe(165);
    expect(relics.length).toBe(742);
    expect(sets.length).toBe(60);
    expect(lightCones[0]?.coverage).toBe('unsupported');
    expect(relics[0]?.source.revision).toBe(revision);
  });
});

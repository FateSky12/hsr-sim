import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseStarRailResLightConeData, parseStarRailResLightConeIndex } from '../src/index.js';

const revision = 'b95e75c7e1273d819d20c530c0b7e13a3ef19fb4';
const root = new URL(`../generated/starrailres/${revision}/en/`, import.meta.url);
function read(file: string): unknown { return JSON.parse(readFileSync(new URL(file, root), 'utf8')); }

describe('StarRailRes light-cone conversion', () => {
  it('converts level-80 base stats while leaving missing passive logic explicitly unsupported', () => {
    const index = parseStarRailResLightConeIndex(read('light_cones.json'), { revision }).find((entry) => entry.id === '20000')!;
    const data = parseStarRailResLightConeData(index, (read('light_cone_promotions.json') as Record<string, unknown>)['20000'], { revision, level: 80 });

    expect(data.baseStats).toEqual({ hp: 846.72, atk: 317.52, def: 264.6, spd: 0 });
    expect(data.staticStats).toEqual([]);
    expect(data.coverage).toBe('unsupported');
  });
});

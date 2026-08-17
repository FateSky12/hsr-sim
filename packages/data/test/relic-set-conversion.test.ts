import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseStarRailResRelicSetData, parseStarRailResRelicSetIndex } from '../src/index.js';

const revision = 'b95e75c7e1273d819d20c530c0b7e13a3ef19fb4';
const root = new URL(`../generated/starrailres/${revision}/en/`, import.meta.url);
function read(file: string): unknown { return JSON.parse(readFileSync(new URL(file, root), 'utf8')); }

describe('StarRailRes relic-set conversion', () => {
  it('converts recognized static property entries and preserves partial coverage', () => {
    const index = parseStarRailResRelicSetIndex(read('relic_sets.json'), { revision }).find((entry) => entry.id === '102')!;
    const data = parseStarRailResRelicSetData(index, { revision });

    expect(data.twoPiece).toEqual([{ stat: 'ATKPercent', value: 0.12 }]);
    expect(data.fourPiece).toEqual([{ stat: 'SPDPercent', value: 0.06 }]);
    expect(data.passives).toEqual([]);
    expect(data.coverage).toBe('abstracted');
  });

  it('converts only simple, duration-bounded four-piece trigger text', () => {
    const index = parseStarRailResRelicSetIndex(read('relic_sets.json'), { revision }).find((entry) => entry.id === '104')!;
    const data = parseStarRailResRelicSetData(index, { revision });

    expect(data.passives).toContainEqual(expect.objectContaining({
      trigger: 'ULT_USED',
      modifier: { stat: 'CritDmg', value: 0.25 },
      duration: 2,
      target: 'self',
    }));
  });
});

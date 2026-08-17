import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LightConeDataSchema, RelicSetDataSchema } from '../src/schema.js';

const revision = 'b95e75c7e1273d819d20c530c0b7e13a3ef19fb4';
const root = new URL(`../generated/starrailres/${revision}/en/`, import.meta.url);

describe('compiled equipment catalog', () => {
  it('contains fixed-revision level-80 light-cone base stats without inventing passives', () => {
    const records = JSON.parse(readFileSync(new URL('light-cone-catalog.json', root), 'utf8')) as unknown[];
    const catalog = records.map((record) => LightConeDataSchema.parse(record));
    const arrows = catalog.find((record) => record.id === '20000');

    expect(catalog).toHaveLength(165);
    expect(arrows).toMatchObject({
      name: 'Arrows',
      level: 80,
      baseStats: { hp: 846.72, atk: 317.52, def: 264.6, spd: 0 },
      staticStats: [],
      coverage: 'unsupported',
    });
  });

  it('contains static two/four-piece set effects with explicit abstracted coverage', () => {
    const records = JSON.parse(readFileSync(new URL('relic-set-catalog.json', root), 'utf8')) as unknown[];
    const catalog = records.map((record) => RelicSetDataSchema.parse(record));
    const first = catalog.find((record) => record.id === '101');

    expect(catalog).toHaveLength(60);
    expect(first).toMatchObject({
      twoPiece: [{ stat: 'HealBoost', value: 0.1 }],
      fourPiece: [],
      coverage: 'abstracted',
    });
  });
});

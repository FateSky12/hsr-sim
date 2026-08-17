import { describe, expect, it } from 'vitest';
import { StatKey, calculateDamage, createBattleState, createStats, createUnit } from '../src/index.js';

describe('sampled RNG replay evidence', () => {
  it('exposes the sampled roll and advances the deterministic cursor exactly once', () => {
    const source = createUnit({ id: 'source', faction: 'ally', stats: createStats({ hp: 1, atk: 100, def: 1, spd: 100, critRate: 0.5 }), });
    const target = createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 1, atk: 1, def: 0, spd: 100, critRate: 0 }), toughness: { current: 0, max: 1, broken: true }, weaknesses: ['physical'], resistance: { physical: 0 } });
    const state = createBattleState({ units: [source, target], rngSeed: 123 });
    const result = calculateDamage(state, { kind: 'damage', source: source.id, target: target.id, ability: 'basic', element: 'physical', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: 1 }, { mode: 'sampled' });

    expect(result.rng.cursor).toBe(1);
    expect(result.rngDraw).toBeGreaterThanOrEqual(0);
    expect(result.rngDraw).toBeLessThan(1);
  });
});

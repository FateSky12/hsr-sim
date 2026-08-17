import { describe, expect, it } from 'vitest';
import { StatKey, calculateDamage, createBattleState, createStats, createUnit } from '../src/index.js';

describe('damage pipeline', () => {
  it('applies defense and defense ignore to the target defense term', () => {
    const source = createUnit({ id: 'source', faction: 'ally', level: 80, stats: createStats({ hp: 1, atk: 100, def: 1, spd: 100, critRate: 0 }) });
    const target = createUnit({ id: 'target', faction: 'enemy', level: 80, stats: createStats({ hp: 1000, atk: 1, def: 100, spd: 100, critRate: 0 }), weaknesses: ['physical'], resistance: { physical: 0 }, toughness: { current: 1, max: 1, broken: true } });
    const state = createBattleState({ units: [source, target] });
    const base = calculateDamage(state, { kind: 'damage', source: 'source', target: 'target', ability: 'basic', element: 'physical', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: 1 });

    source.stats.base[StatKey.DefIgnore] = 0.5;
    const ignored = calculateDamage({ ...state, units: [source, target] }, { kind: 'damage', source: 'source', target: 'target', ability: 'basic', element: 'physical', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: 1 });

    expect(base.amount).toBe(90);
    expect(ignored.amount).toBe(95);
  });

  it('matches the equal-baseline defense identity for every level pair 1..100', () => {
    for (let sourceLevel = 1; sourceLevel <= 100; sourceLevel += 1) {
      for (let targetLevel = 1; targetLevel <= 100; targetLevel += 1) {
        const source = createUnit({ id: 'source', faction: 'ally', level: sourceLevel, stats: createStats({ hp: 1, atk: 1, def: 1, spd: 100, critRate: 0 }) });
        const target = createUnit({ id: 'target', faction: 'enemy', level: targetLevel, stats: createStats({ hp: 1000, atk: 1, def: 200 + 10 * targetLevel, spd: 100, critRate: 0 }), weaknesses: ['physical'], resistance: { physical: 0 }, toughness: { current: 0, max: 1, broken: true } });
        const result = calculateDamage(createBattleState({ units: [source, target] }), { kind: 'damage', source: 'source', target: 'target', ability: 'basic', element: 'physical', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: 1 });
        const expected = (20 + sourceLevel) / ((20 + sourceLevel) + (20 + targetLevel));
        expect(result.defenseMultiplier).toBeCloseTo(expected, 12);
      }
    }
  });

  it('keeps super break on its separate non-critical, non-normal-boost branch', () => {
    const source = createUnit({ id: 'source', faction: 'ally', level: 80, stats: createStats({ hp: 1, atk: 100, def: 1, spd: 100, critRate: 1, critDmg: 1, percent: { [StatKey.DmgBoostAll]: 0.5 } }) });
    const target = createUnit({ id: 'target', faction: 'enemy', level: 80, stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['fire'], resistance: { fire: 0 }, toughness: { current: 0, max: 10, broken: true } });
    const state = createBattleState({ units: [source, target] });

    const result = calculateDamage(state, { kind: 'damage', source: 'source', target: 'target', ability: 'super_break', element: 'fire', damageType: 'super_break', scalingStat: StatKey.ATK, multiplier: 1 });

    expect(result.amount).toBe(100);
    expect(result.critical).toBe(false);
    expect(result.damageBoostMultiplier).toBe(1);
  });

  it('supports the explicit toughness-driven super-break formula', () => {
    const source = createUnit({ id: 'source', faction: 'ally', level: 80, stats: createStats({ hp: 1, atk: 100, def: 1, spd: 100, critRate: 1, breakEffect: 0.5, percent: { [StatKey.DmgBoostAll]: 0.5 } }) });
    const target = createUnit({ id: 'target', faction: 'enemy', level: 80, stats: createStats({ hp: 10000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['fire'], resistance: { fire: 0 }, toughness: { current: 0, max: 10, broken: true } });
    const state = createBattleState({ units: [source, target] });

    const result = calculateDamage(state, {
      kind: 'damage',
      source: 'source',
      target: 'target',
      ability: 'super_break',
      element: 'fire',
      damageType: 'super_break',
      scalingStat: StatKey.ATK,
      multiplier: 1,
      toughnessDamage: 20,
    });

    // LevelMultiplier(80) * (20 / 10) * (1 + 50% BE).
    expect(result.amount).toBe(11302);
    expect(result.critical).toBe(false);
    expect(result.damageBoostMultiplier).toBe(1);
    expect(result.rng.cursor).toBe(state.rng.cursor);
  });

  it('supports expected-value mode without consuming an RNG draw', () => {
    const source = createUnit({ id: 'source', faction: 'ally', level: 80, stats: createStats({ hp: 1, atk: 100, def: 1, spd: 100, critRate: 0.5, critDmg: 1 }) });
    const target = createUnit({ id: 'target', faction: 'enemy', level: 80, stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['physical'], resistance: { physical: 0 }, toughness: { current: 0, max: 10, broken: true } });
    const state = createBattleState({ units: [source, target], rngSeed: 11 });
    const result = calculateDamage(state, { kind: 'damage', source: 'source', target: 'target', ability: 'basic', element: 'physical', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: 1 }, { mode: 'expected' });

    expect(result.amount).toBe(150);
    expect(result.expected).toBe(true);
    expect(result.criticalProbability).toBe(0.5);
    expect(result.rng).toEqual(state.rng);
  });
});

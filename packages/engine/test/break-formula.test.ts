import { describe, expect, it } from 'vitest';
import {
  breakBaseDamage,
  breakElementMultiplier,
  breakLevelMultiplier,
  calculateDamage,
  createBattleState,
  createStats,
  createUnit,
  defaultBreakToughnessFactor,
  StatKey,
} from '../src/index.js';

describe('versioned Weakness Break constants', () => {
  it('pins representative level multipliers from the public table', () => {
    expect(breakLevelMultiplier(1)).toBe(54);
    expect(breakLevelMultiplier(4)).toBe(67.52638);
    expect(breakLevelMultiplier(70)).toBe(2659.6406);
    expect(breakLevelMultiplier(80)).toBe(3767.5535);
    expect(breakLevelMultiplier(95)).toBe(7494.3716);
    expect(breakLevelMultiplier(0)).toBe(54);
    expect(breakLevelMultiplier(100)).toBe(9261.387);
  });

  it('keeps the immediate break element coefficient separate from the level table', () => {
    expect(breakElementMultiplier('fire')).toBe(2);
    expect(breakElementMultiplier('lightning')).toBe(1);
    expect(breakBaseDamage(80, 'fire')).toBeCloseTo(7535.107, 10);
    expect(breakBaseDamage(80, 'ice')).toBe(3767.5535);
  });

  it('uses raw toughness points for the max-toughness coefficient', () => {
    expect(defaultBreakToughnessFactor(30)).toBe(0.75);
    expect(defaultBreakToughnessFactor(60)).toBe(1);
    expect(defaultBreakToughnessFactor(120)).toBe(1.5);
  });

  it('does not apply the immediate-break elemental coefficient to Super Break', () => {
    const source = createUnit({ id: 'source', faction: 'ally', level: 80, stats: createStats({ hp: 1, atk: 100, def: 1, spd: 100, critRate: 0, breakEffect: 0 }) });
    const target = createUnit({ id: 'target', faction: 'enemy', level: 80, stats: createStats({ hp: 100000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['fire', 'ice'], resistance: { fire: 0, ice: 0 }, toughness: { current: 0, max: 30, broken: true } });
    const state = createBattleState({ units: [source, target] });
    const common = { kind: 'damage' as const, source: 'source', target: 'target', ability: 'super_break', damageType: 'super_break' as const, scalingStat: StatKey.ATK, multiplier: 1, toughnessDamage: 20 };

    const fire = calculateDamage(state, { ...common, element: 'fire' });
    const ice = calculateDamage(state, { ...common, element: 'ice' });

    expect(fire.amount).toBe(ice.amount);
    expect(fire.amount).toBe(Math.floor(3767.5533 * 2));
  });

  it('does not produce Super Break while the target is not broken', () => {
    const source = createUnit({ id: 'source', faction: 'ally', level: 80, stats: createStats({ hp: 1, atk: 100, def: 1, spd: 100, critRate: 0 }) });
    const target = createUnit({ id: 'target', faction: 'enemy', level: 80, stats: createStats({ hp: 100000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['fire'], resistance: { fire: 0 }, toughness: { current: 10, max: 30, broken: false } });
    const result = calculateDamage(createBattleState({ units: [source, target] }), { kind: 'damage', source: 'source', target: 'target', ability: 'super_break', element: 'fire', damageType: 'super_break', scalingStat: StatKey.ATK, multiplier: 1, toughnessDamage: 20 });
    expect(result.amount).toBe(0);
  });
});

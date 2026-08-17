import { describe, expect, it } from 'vitest';
import { StatKey, createStats, statValue } from '../src/index.js';

describe('stat rules', () => {
  it('keeps base-scaled and flat attack modifiers in one additive pool', () => {
    const stats = createStats({
      hp: 1000,
      atk: 601,
      def: 400,
      spd: 104,
      percent: { [StatKey.ATK]: 0.98 },
      flat: { [StatKey.ATK]: 352 },
    });

    expect(statValue(stats, StatKey.ATK)).toBeCloseTo(1541.98, 10);
  });

  it('uses additive semantics for crit and rate-like stats', () => {
    const stats = createStats({
      hp: 1000,
      atk: 100,
      def: 100,
      spd: 100,
      critRate: 0.05,
      critDmg: 0.5,
      percent: { [StatKey.CritRate]: 0.25 },
    });

    expect(statValue(stats, StatKey.CritRate)).toBeCloseTo(0.3, 10);
  });
});

import { describe, expect, it } from 'vitest';
import { calculateDamage } from '../src/damage.js';
import { createBattleState, createStats, createUnit } from '../src/index.js';
import { StatKey } from '../src/types.js';

describe('complete damage pipeline multipliers', () => {
  it('applies action-type bonus, defense reduction/ignore, vulnerability and damage reduction in distinct stages', () => {
    const source = createUnit({
      id: 'source',
      faction: 'ally',
      stats: createStats({ hp: 1000, atk: 100, def: 100, spd: 100, critRate: 0 }),
    });
    source.stats.flat[StatKey.DmgBoostAll] = 0.2;
    source.stats.flat[StatKey.DmgBoostPhysical] = 0.1;
    source.stats.flat[StatKey.DmgBoostSkill] = 0.3;
    source.stats.flat[StatKey.DefIgnore] = 0.1;

    const target = createUnit({
      id: 'target',
      faction: 'enemy',
      stats: createStats({ hp: 5000, atk: 1, def: 100, spd: 100, critRate: 0 }),
      resistance: { physical: 0 },
      toughness: { current: 0, max: 0, broken: true },
    });
    target.stats.flat[StatKey.DefReduction] = 0.2;
    target.stats.flat[StatKey.Vulnerability] = 0.2;
    target.stats.flat[StatKey.DmgReduction] = 0.1;

    const result = calculateDamage(createBattleState({ units: [source, target] }), {
      kind: 'damage',
      source: source.id,
      target: target.id,
      ability: 'skill',
      actionType: 'skill',
      element: 'physical',
      damageType: 'normal',
      scalingStat: StatKey.ATK,
      multiplier: 1,
    }, { mode: 'expected' });

    const defense = 1 - 70 / (70 + 200 + 10 * 80);
    const expectedRaw = 100 * 1.6 * defense * 1.2 * 0.9;
    expect(result.rawAmount).toBeCloseTo(expectedRaw, 10);
    expect(result.defenseMultiplier).toBeCloseTo(defense, 10);
    expect(result.damageBoostMultiplier).toBeCloseTo(1.6, 10);
    expect(result.vulnerabilityMultiplier).toBeCloseTo(1.2, 10);
    expect(result.damageReductionMultiplier).toBeCloseTo(0.9, 10);
  });
});

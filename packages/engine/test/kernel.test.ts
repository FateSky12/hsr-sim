import { describe, expect, it } from 'vitest';
import {
  BattleKernel,
  StatKey,
  createBattleState,
  createRuleCatalog,
  createStats,
  createUnit,
  type EffectIntent,
} from '../src/index.js';

describe('BattleKernel.step', () => {
  it('resolves a basic damage command through the public transition seam', () => {
    const rules = createRuleCatalog({
      striker: {
        actions: {
          basic: {
            id: 'basic',
            actionType: 'basic',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{
              kind: 'damage',
              source: actor.id,
              target: targetIds[0]!,
              ability: 'basic',
              element: 'physical',
              damageType: 'normal',
              scalingStat: StatKey.ATK,
              multiplier: 1,
              toughnessDamage: 10,
            }],
          },
        },
      },
    });

    const state = createBattleState({
      skillPoints: 3,
      units: [
        createUnit({
          id: 'striker',
          name: '测试攻击者',
          faction: 'ally',
          level: 1,
          stats: createStats({ hp: 1000, atk: 100, def: 0, spd: 100, critRate: 0 }),
          maxEnergy: 100,
        }),
        createUnit({
          id: 'target',
          name: '测试目标',
          faction: 'enemy',
          level: 1,
          stats: createStats({ hp: 1000, atk: 0, def: 0, spd: 100, critRate: 0 }),
          toughness: { current: 20, max: 20, broken: true },
          weaknesses: ['physical'],
          resistance: { physical: 0 },
        }),
      ],
      rngSeed: 7,
    });

    const result = new BattleKernel(rules).step(state, {
      actor: 'striker',
      ability: 'basic',
      targets: ['target'],
    });

    expect(state.units.find((unit) => unit.id === 'target')?.hp).toBe(1000);
    expect(result.state.units.find((unit) => unit.id === 'target')?.hp).toBe(900);
    expect(result.events.map((event) => event.type)).toEqual([
      'ACTION_STARTED',
      'BEFORE_ACTION',
      'BEFORE_HIT',
      'BEFORE_DAMAGE',
      'DAMAGE_DEALT',
      'HP_CHANGED',
      'HP_LOSS',
      'TOUGHNESS_REDUCED',
      'AFTER_DAMAGE',
      'AFTER_HIT',
      'BASIC_USED',
      'ACTION_SCHEDULED',
      'AFTER_ACTION',
      'TURN_END',
    ]);

    const damage = result.events.find((event) => event.type === 'DAMAGE_DEALT');
    expect(damage?.type).toBe('DAMAGE_DEALT');
    if (damage?.type === 'DAMAGE_DEALT') {
      expect(damage.amount).toBe(100);
      expect(damage.critical).toBe(false);
    }
  });

  it('treats an ultimate as an inserted action without rescheduling the turn', () => {
    const rules = createRuleCatalog({
      striker: {
        actions: {
          ultimate: {
            id: 'ultimate',
            actionType: 'ultimate',
            energyCost: 100,
            resolve: (): EffectIntent[] => [],
          },
        },
      },
    });
    const striker = createUnit({
      id: 'striker',
      faction: 'ally',
      stats: createStats({ hp: 1000, atk: 100, def: 0, spd: 100, critRate: 0 }),
      energy: 100,
      maxEnergy: 100,
      nextActionAt: 42,
    });

    const result = new BattleKernel(rules).step(createBattleState({ units: [striker] }), {
      actor: striker.id,
      ability: 'ultimate',
      targets: [],
    });

    expect(result.state.units[0]?.energy).toBe(0);
    expect(result.state.units[0]?.nextActionAt).toBe(42);
    expect(result.events.map((event) => event.type)).toEqual(['ACTION_STARTED', 'BEFORE_ACTION', 'ENERGY_CHANGED', 'ENERGY_SPENT', 'ULT_USED', 'AFTER_ACTION']);
  });
});

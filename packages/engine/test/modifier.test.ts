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

describe('serializable stat modifiers', () => {
  it('changes a later damage transition without changing the damage formula', () => {
    const rules = createRuleCatalog({
      support: {
        actions: {
          skill: {
            id: 'skill',
            actionType: 'skill',
            resolve: ({ actor }): EffectIntent[] => [{
              kind: 'modify_stat',
              source: actor.id,
              target: 'striker',
              modifier: { id: 'support_atk', stat: StatKey.ATK, percent: 0.5, remainingTurns: 2, stacking: 'replace' },
            }],
          },
        },
      },
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
            }],
          },
        },
      },
    });
    const state = createBattleState({
      skillPoints: 3,
      units: [
        createUnit({ id: 'support', faction: 'ally', stats: createStats({ hp: 1000, atk: 1, def: 1, spd: 100, critRate: 0 }) }),
        createUnit({ id: 'striker', faction: 'ally', stats: createStats({ hp: 1000, atk: 100, def: 1, spd: 100, critRate: 0 }) }),
        createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['physical'], resistance: { physical: 0 }, toughness: { current: 10, max: 10, broken: true } }),
      ],
    });

    const afterBuff = new BattleKernel(rules).step(state, {
      actor: 'support',
      ability: 'skill',
      targets: ['striker'],
      advanceTurn: false,
    });
    expect(afterBuff.state.units.find((unit) => unit.id === 'striker')?.modifiers).toHaveLength(1);

    const afterAttack = new BattleKernel(rules).step(afterBuff.state, {
      actor: 'striker',
      ability: 'basic',
      targets: ['target'],
      advanceTurn: false,
    });
    expect(afterAttack.events.find((event) => event.type === 'DAMAGE_DEALT')).toMatchObject({ amount: 150 });

    const afterExpiry = new BattleKernel(rules).step(afterAttack.state, {
      actor: 'striker',
      ability: 'basic',
      targets: ['target'],
      advanceTurn: false,
    });
    expect(afterExpiry.state.units.find((unit) => unit.id === 'striker')?.modifiers).toHaveLength(0);
    expect(afterExpiry.events.some((event) => event.type === 'MODIFIER_REMOVED')).toBe(true);
  });
});

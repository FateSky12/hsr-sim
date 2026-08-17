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

describe('priority rule hooks', () => {
  it('runs a character hook from an immutable break fact with recursion protection', () => {
    const rules = createRuleCatalog({
      breaker: {
        actions: {
          basic: {
            id: 'basic',
            actionType: 'basic',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{
              kind: 'damage', source: actor.id, target: targetIds[0]!, ability: 'basic', element: 'fire', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: 1, toughnessDamage: 10,
            }],
          },
        },
        hooks: [{
          id: 'breaker_on_break',
          owner: 'breaker',
          on: 'WEAKNESS_BREAK',
          priority: 100,
          resolve: ({ event, owner }): EffectIntent[] => event.source === owner ? [{
            kind: 'modify_stat',
            source: owner,
            target: owner,
            modifier: { id: 'break_power', stat: StatKey.BreakEffect, percent: 0.2, stacking: 'replace' },
          }] : [],
        }],
      },
    });
    const state = createBattleState({
      units: [
        createUnit({ id: 'breaker', faction: 'ally', level: 80, stats: createStats({ hp: 1000, atk: 100, def: 1, spd: 100, critRate: 0 }) }),
        createUnit({ id: 'target', faction: 'enemy', level: 80, stats: createStats({ hp: 10000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['fire'], resistance: { fire: 0 }, toughness: { current: 10, max: 10, broken: false } }),
      ],
    });

    const result = new BattleKernel(rules).step(state, { actor: 'breaker', ability: 'basic', targets: ['target'], advanceTurn: false });
    const breaker = result.state.units.find((unit) => unit.id === 'breaker')!;
    const breakDamage = result.events.find((event) => event.type === 'DAMAGE_DEALT' && event.ability === 'break');

    expect(breaker.modifiers).toHaveLength(1);
    expect(result.events.findIndex((event) => event.type === 'WEAKNESS_BREAK')).toBeLessThan(result.events.findIndex((event) => event.type === 'MODIFIER_APPLIED'));
    expect(breakDamage).toMatchObject({ amount: 5274 });
  });
});

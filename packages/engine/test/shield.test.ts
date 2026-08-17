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

describe('shield state and damage absorption', () => {
  it('absorbs damage before HP and emits breakable shield facts in order', () => {
    const rules = createRuleCatalog({
      defender: {
        actions: {
          shield: {
            id: 'shield',
            actionType: 'skill',
            resolve: ({ actor }): EffectIntent[] => [{
              kind: 'shield', source: actor.id, target: actor.id, id: 'test_shield', scalingStat: StatKey.DEF, multiplier: 0, flatAmount: 100, duration: 2,
            }],
          },
        },
      },
      attacker: {
        actions: {
          basic: {
            id: 'basic',
            actionType: 'basic',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{
              kind: 'damage', source: actor.id, target: targetIds[0]!, ability: 'basic', element: 'physical', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: 1,
            }],
          },
        },
      },
    });
    const defender = createUnit({ id: 'defender', faction: 'ally', stats: createStats({ hp: 500, atk: 1, def: 100, spd: 100, critRate: 0 }) });
    const attacker = createUnit({ id: 'attacker', faction: 'enemy', stats: createStats({ hp: 500, atk: 200, def: 1, spd: 100, critRate: 0 }) });
    const kernel = new BattleKernel(rules);
    const shielded = kernel.step(createBattleState({ units: [defender, attacker] }), { actor: defender.id, ability: 'shield', targets: [], advanceTurn: false });
    const hit = kernel.step(shielded.state, { actor: attacker.id, ability: 'basic', targets: [defender.id], advanceTurn: false });

    expect(hit.state.units.find((unit) => unit.id === defender.id)?.hp).toBe(470);
    expect(hit.state.units.find((unit) => unit.id === defender.id)?.shields).toEqual([]);
    expect(hit.events.map((event) => event.type)).toEqual(['ACTION_STARTED', 'BEFORE_ACTION', 'BEFORE_HIT', 'BEFORE_DAMAGE', 'DAMAGE_DEALT', 'SHIELD_ABSORBED', 'SHIELD_BROKEN', 'HP_CHANGED', 'HP_LOSS', 'AFTER_DAMAGE', 'AFTER_HIT', 'BASIC_USED', 'ENEMY_ATTACK', 'AFTER_ACTION', 'TURN_END']);
    expect(hit.events.find((event) => event.type === 'SHIELD_ABSORBED')).toMatchObject({ amount: 100 });
  });
});

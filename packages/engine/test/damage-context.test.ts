import { describe, expect, it } from 'vitest';
import { BattleKernel, StatKey, createBattleState, createRuleCatalog, createStats, createUnit, type EffectIntent } from '../src/index.js';

describe('before-damage context hooks', () => {
  it('lets a rule change only the current hit without mutating the serializable unit state', () => {
    const rules = createRuleCatalog({
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
        hooks: [{
          id: 'attacker:conditional-damage',
          owner: 'attacker',
          on: 'BEFORE_DAMAGE',
          priority: 100,
          resolve: ({ event }): EffectIntent[] => event.type === 'BEFORE_DAMAGE'
            ? [{ kind: 'modify_damage', damageBoost: 0.5 }]
            : [],
        }],
      },
    });
    const attacker = createUnit({ id: 'attacker', faction: 'ally', stats: createStats({ hp: 1000, atk: 100, def: 1, spd: 100, critRate: 0 }) });
    const target = createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['physical'], resistance: { physical: 0 }, toughness: { current: 0, max: 0, broken: true } });
    const result = new BattleKernel(rules).step(createBattleState({ units: [attacker, target] }), { actor: attacker.id, ability: 'basic', targets: [target.id], advanceTurn: false });

    expect(result.events).toContainEqual(expect.objectContaining({ type: 'DAMAGE_DEALT', amount: 150 }));
    expect(result.state.units.find((unit) => unit.id === attacker.id)?.modifiers).toEqual([]);
  });
});

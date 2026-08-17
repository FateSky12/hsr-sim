import { describe, expect, it } from 'vitest';
import { BattleKernel, StatKey, createBattleState, createRuleCatalog, createStats, createUnit, type EffectIntent } from '../src/index.js';

describe('battle terminal event', () => {
  it('emits BATTLE_END only after the final enemy is defeated', () => {
    const rules = createRuleCatalog({
      ally: {
        actions: {
          basic: {
            id: 'basic',
            actionType: 'basic',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{ kind: 'damage', source: actor.id, target: targetIds[0]!, ability: 'basic', element: 'physical', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: 1 }],
          },
        },
      },
    });
    const ally = createUnit({ id: 'ally', faction: 'ally', stats: createStats({ hp: 100, atk: 10, def: 1, spd: 100, critRate: 0 }) });
    const enemy = createUnit({ id: 'enemy', faction: 'enemy', hp: 1, stats: createStats({ hp: 1, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['physical'], resistance: { physical: 0 }, toughness: { current: 0, max: 0, broken: true } });
    const result = new BattleKernel(rules).step(createBattleState({ units: [ally, enemy] }), { actor: ally.id, ability: 'basic', targets: [enemy.id], advanceTurn: false });

    expect(result.events).toContainEqual(expect.objectContaining({ type: 'BATTLE_END', reason: 'all_enemies_defeated' }));
  });
});

import { describe, expect, it } from 'vitest';
import { BattleKernel, StatKey, createBattleState, createRuleCatalog, createStats, createUnit, type EffectIntent } from '../src/index.js';

describe('versioned break calibration seam', () => {
  it('allows a dated break base table and toughness factor without changing the normal formula', () => {
    const rules = createRuleCatalog({
      breaker: {
        actions: {
          basic: {
            id: 'basic',
            actionType: 'basic',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{ kind: 'damage', source: actor.id, target: targetIds[0]!, ability: 'basic', element: 'fire', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: 1, toughnessDamage: 10 }],
          },
        },
      },
    });
    const state = createBattleState({ units: [
      createUnit({ id: 'breaker', faction: 'ally', level: 80, stats: createStats({ hp: 1000, atk: 100, def: 1, spd: 100, critRate: 0 }) }),
      createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 10000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['fire'], resistance: { fire: 0 }, toughness: { current: 10, max: 10, broken: false } }),
    ] });
    const kernel = new BattleKernel(rules, 'expected', { breakBaseDamage: () => 100, breakToughnessFactor: () => 2 });

    const result = kernel.step(state, { actor: 'breaker', ability: 'basic', targets: ['target'], advanceTurn: false });

    expect(result.events).toContainEqual(expect.objectContaining({ type: 'BREAK_DMG_DEALT', amount: 200 }));
  });
});

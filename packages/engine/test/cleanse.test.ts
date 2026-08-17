import { describe, expect, it } from 'vitest';
import { BattleKernel, createBattleState, createRuleCatalog, createStats, createUnit, type EffectIntent } from '../src/index.js';

describe('status cleansing', () => {
  it('removes only the requested number of statuses and records each fact', () => {
    const rules = createRuleCatalog({
      cleanser: {
        actions: {
          skill: {
            id: 'skill',
            actionType: 'skill',
            resolve: ({ actor }): EffectIntent[] => [{ kind: 'cleanse', source: actor.id, target: actor.id, count: 1 }],
          },
        },
      },
    });
    const cleanser = createUnit({ id: 'cleanser', faction: 'ally', statuses: [
      { id: 'buff', remainingTurns: 2, stacks: 1, category: 'buff' },
      { id: 'debuff_a', remainingTurns: 2, stacks: 1, category: 'debuff' },
      { id: 'debuff_b', remainingTurns: 2, stacks: 1, category: 'debuff' },
    ], stats: createStats({ hp: 1, atk: 1, def: 1, spd: 100 }) });
    const result = new BattleKernel(rules).step(createBattleState({ units: [cleanser] }), { actor: cleanser.id, ability: 'skill', targets: [], advanceTurn: false });

    expect(result.state.units[0]?.statuses).toHaveLength(2);
    expect(result.state.units[0]?.statuses[0]?.id).toBe('buff');
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'STATUS_REMOVED', target: cleanser.id, id: 'debuff_a' }));
  });
});

import { describe, expect, it } from 'vitest';
import { BattleKernel, StatKey, createBattleState, createRuleCatalog, createStats, createUnit, type EffectIntent } from '../src/index.js';

describe('speed changes preserve absolute action progress', () => {
  it('recalculates a target future action from its remaining progress', () => {
    const rules = createRuleCatalog({
      buffer: {
        actions: {
          skill: {
            id: 'skill',
            actionType: 'skill',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{
              kind: 'modify_stat',
              source: actor.id,
              target: targetIds[0]!,
              modifier: { id: 'speed_up', stat: StatKey.SPD, flat: 100, remainingTurns: 2, stacking: 'replace' },
            }],
          },
        },
      },
    });
    const buffer = createUnit({ id: 'buffer', faction: 'ally', stats: createStats({ hp: 1000, atk: 1, def: 1, spd: 100 }) });
    const target = createUnit({ id: 'target', faction: 'ally', stats: createStats({ hp: 1000, atk: 1, def: 1, spd: 100 }), nextActionAt: 100 });

    const result = new BattleKernel(rules).step(createBattleState({ units: [buffer, target] }), {
      actor: buffer.id,
      ability: 'skill',
      targets: [target.id],
      advanceTurn: false,
    });

    expect(result.state.units.find((unit) => unit.id === target.id)?.nextActionAt).toBe(50);
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'SPD_CHANGED', target: target.id }));
  });
});

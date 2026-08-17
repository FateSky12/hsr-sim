import { describe, expect, it } from 'vitest';
import { BattleKernel, StatKey, createBattleState, createRuleCatalog, createStats, createUnit, type EffectIntent } from '@hsr-sim/engine';
import { FixedScriptPolicy, runPolicy } from '../src/index.js';

describe('policy turn preparation', () => {
  it('ticks an actor DoT automatically before its action', () => {
    const rules = createRuleCatalog({
      source: {
        actions: {
          apply: {
            id: 'apply',
            actionType: 'skill',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{ kind: 'apply_dot', source: actor.id, target: targetIds[0]!, ability: 'apply', dotId: 'burn', element: 'physical', scalingStat: StatKey.ATK, multiplier: 1, duration: 2 }],
          },
        },
      },
      target: { actions: { basic: { id: 'basic', actionType: 'basic', resolve: (): EffectIntent[] => [] } } },
    });
    const source = createUnit({ id: 'source', faction: 'ally', stats: createStats({ hp: 100, atk: 100, def: 1, spd: 100, critRate: 0 }) });
    const target = createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['physical'], resistance: { physical: 0 }, toughness: { current: 0, max: 1, broken: true } });
    const kernel = new BattleKernel(rules);
    const applied = kernel.step(createBattleState({ units: [source, target] }), { actor: source.id, ability: 'apply', targets: [target.id], advanceTurn: false });
    const run = runPolicy(kernel, applied.state, new FixedScriptPolicy([{ actor: target.id, ability: 'basic', targets: [] }]), { maxActions: 1 });

    expect(run.events).toContainEqual(expect.objectContaining({ type: 'DOT_TICK', target: target.id, amount: 100 }));
    expect(run.finalState.units.find((unit) => unit.id === target.id)?.hp).toBe(900);
  });
});

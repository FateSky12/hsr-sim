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

describe('serializable status, summon and triggered-action seams', () => {
  it('applies a status and expires it at the affected unit turn boundary', () => {
    const rules = createRuleCatalog({
      source: {
        actions: {
          apply: {
            id: 'apply',
            actionType: 'skill',
            resolve: ({ actor }): EffectIntent[] => [{
              kind: 'apply_status',
              source: actor.id,
              target: 'target',
              status: { id: 'burn', source: actor.id, remainingTurns: 2, stacks: 1, category: 'debuff' },
            } as EffectIntent],
          },
        },
      },
      target: {
        actions: {
          basic: { id: 'basic', actionType: 'basic', resolve: (): EffectIntent[] => [] },
        },
      },
    });
    const state = createBattleState({ units: [
      createUnit({ id: 'source', faction: 'ally', stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }) }),
      createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }) }),
    ] });
    const kernel = new BattleKernel(rules);
    const applied = kernel.step(state, { actor: 'source', ability: 'apply', targets: ['target'], advanceTurn: false });

    expect(applied.state.units.find((unit) => unit.id === 'target')?.statuses).toHaveLength(1);
    expect(applied.events).toContainEqual(expect.objectContaining({ type: 'STATUS_APPLIED', id: 'burn', duration: 2 }));

    const firstTurn = kernel.step(applied.state, { actor: 'target', ability: 'basic', targets: [], advanceTurn: false });
    expect(firstTurn.state.units.find((unit) => unit.id === 'target')?.statuses[0]?.remainingTurns).toBe(1);
    const secondTurn = kernel.step(firstTurn.state, { actor: 'target', ability: 'basic', targets: [], advanceTurn: false });
    expect(secondTurn.state.units.find((unit) => unit.id === 'target')?.statuses).toHaveLength(0);
    expect(secondTurn.events).toContainEqual(expect.objectContaining({ type: 'STATUS_EXPIRED', id: 'burn' }));
  });

  it('merges stackable statuses without losing the longer remaining duration', () => {
    const rules = createRuleCatalog({
      source: {
        actions: {
          apply: {
            id: 'apply',
            actionType: 'skill',
            resolve: (): EffectIntent[] => [
              { kind: 'apply_status', source: 'source', target: 'target', status: { id: 'interpretation', remainingTurns: 2, stacks: 2, category: 'debuff', stacking: 'add', maxStacks: 3 } },
              { kind: 'apply_status', source: 'source', target: 'target', status: { id: 'interpretation', remainingTurns: 1, stacks: 2, category: 'debuff', stacking: 'add', maxStacks: 3 } },
            ],
          },
        },
      },
    });
    const state = createBattleState({ units: [
      createUnit({ id: 'source', faction: 'ally', stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }) }),
      createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }) }),
    ] });

    const result = new BattleKernel(rules).step(state, { actor: 'source', ability: 'apply', targets: ['target'], advanceTurn: false });
    expect(result.state.units.find((unit) => unit.id === 'target')?.statuses).toEqual([
      expect.objectContaining({ id: 'interpretation', stacks: 3, remainingTurns: 2, maxStacks: 3, stacking: 'add' }),
    ]);
  });

  it('summons a pure-data unit and can trigger its action without a second ordinary turn', () => {
    const rules = createRuleCatalog({
      source: {
        actions: {
          summon: {
            id: 'summon',
            actionType: 'skill',
            resolve: ({ actor }): EffectIntent[] => [{
              kind: 'summon',
              source: actor.id,
              unit: {
                id: 'memory',
                name: '记忆体测试召唤物',
                faction: 'ally',
                level: 80,
                stats: createStats({ hp: 100, atk: 10, def: 1, spd: 100 }),
                maxEnergy: 0,
              },
            } as EffectIntent],
          },
          follow: {
            id: 'follow',
            actionType: 'skill',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{
              kind: 'trigger_action',
              source: actor.id,
              actor: 'memory',
              ability: 'basic',
              targets: [targetIds[0]!],
            } as EffectIntent],
          },
        },
      },
      memory: {
        actions: {
          basic: {
            id: 'basic',
            actionType: 'follow_up',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{
              kind: 'damage', source: actor.id, target: targetIds[0]!, ability: 'basic', element: 'physical', damageType: 'additional', scalingStat: StatKey.ATK, multiplier: 1,
            }],
          },
        },
      },
    });
    const source = createUnit({ id: 'source', faction: 'ally', stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100, critRate: 0 }) });
    const target = createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 100, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['physical'], resistance: { physical: 0 }, toughness: { current: 0, max: 1, broken: true } });
    const kernel = new BattleKernel(rules);
    const summoned = kernel.step(createBattleState({ units: [source, target] }), { actor: 'source', ability: 'summon', targets: [target.id], advanceTurn: false });

    expect(summoned.state.units.find((unit) => unit.id === 'memory')).toMatchObject({ name: '记忆体测试召唤物', faction: 'ally' });
    expect(summoned.events).toContainEqual(expect.objectContaining({ type: 'UNIT_SUMMONED', target: 'memory' }));

    const followed = kernel.step(summoned.state, { actor: 'source', ability: 'follow', targets: [target.id], advanceTurn: false });
    expect(followed.events).toContainEqual(expect.objectContaining({ type: 'ACTION_STARTED', actor: 'memory', ability: 'basic' }));
    expect(followed.events).toContainEqual(expect.objectContaining({ type: 'DAMAGE_DEALT', source: 'memory', target: 'target', damageType: 'additional', amount: 10 }));
  });

  it('applies status hit chance through the same deterministic expected/sampled seam as DoT', () => {
    const rules = createRuleCatalog({
      source: {
        actions: {
          apply: {
            id: 'apply',
            actionType: 'skill',
            resolve: ({ actor }): EffectIntent[] => [{ kind: 'apply_status', source: actor.id, target: 'target', chance: 0, status: { id: 'freeze', remainingTurns: 1, stacks: 1, category: 'debuff' } }],
          },
        },
      },
    });
    const state = createBattleState({ units: [
      createUnit({ id: 'source', faction: 'ally', stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }) }),
      createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }) }),
    ] });
    const result = new BattleKernel(rules).step(state, { actor: 'source', ability: 'apply', targets: ['target'], advanceTurn: false });

    expect(result.state.units.find((unit) => unit.id === 'target')?.statuses).toEqual([]);
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'STATUS_RESISTED', id: 'freeze', chance: 0 }));
  });
});

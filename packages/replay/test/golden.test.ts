import { describe, expect, it } from 'vitest';
import { BattleKernel, StatKey, createBattleState, createRuleCatalog, createStats, createUnit, type EffectIntent } from '@hsr-sim/engine';
import { createGoldenCase, runGoldenCase } from '../src/index.js';

describe('L3 complete-battle golden cases', () => {
  it('replays a full command/event trace and compares action, damage and final-state fields', () => {
    const rules = createRuleCatalog({
      striker: {
        actions: {
          basic: {
            id: 'basic',
            actionType: 'basic',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{ kind: 'damage', source: actor.id, target: targetIds[0]!, ability: 'basic', element: 'physical', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: 1 }],
          },
        },
      },
    });
    const state = createBattleState({ units: [
      createUnit({ id: 'striker', faction: 'ally', stats: createStats({ hp: 1000, atk: 100, def: 1, spd: 100, critRate: 0 }) }),
      createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }), toughness: { current: 0, max: 0, broken: true }, resistance: { physical: 0 } }),
    ] });
    const kernel = new BattleKernel(rules);
    const command = { actor: 'striker', ability: 'basic', targets: ['target'] } as const;
    const start = kernel.beginTurn(state, command.actor);
    const transition = kernel.step(start.state, command);
    const golden = createGoldenCase({
      name: 'single-hit-fixture',
      rulesetVersion: 'engine-test',
      dataRevision: 'fixture-test',
      initialState: state,
      commands: [command],
      expect: {
        actions: 1,
        eventCount: start.events.length + transition.events.length,
        damageInstances: [{ value: 100, tolerance: 0 }],
        actionsTrace: [{ actor: 'striker', ability: 'basic', at: 0, tolerance: 1e-9 }],
      },
    });

    const report = runGoldenCase(golden, kernel);
    expect(report.passed).toBe(true);
    expect(report.calibration.mismatches).toEqual([]);
    expect(runGoldenCase({ ...golden, expect: { ...golden.expect, damageInstances: [{ value: 101, tolerance: 0 }] } }, kernel).passed).toBe(false);
  });
});

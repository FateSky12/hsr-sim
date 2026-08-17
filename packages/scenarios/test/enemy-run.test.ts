import { describe, expect, it } from 'vitest';
import { BattleKernel } from '@hsr-sim/engine';
import { CompositePolicy, EnemyPolicy, FixedScriptPolicy, runPolicy } from '@hsr-sim/policy';
import { createTrainingCatalog, trainingScenario } from '../src/index.js';

describe('scenario with live enemy target selection', () => {
  it('lets an enemy act when the fixed ally script is waiting for its timeline', () => {
    const state = trainingScenario.createInitialState();
    const enemy = state.units.find((unit) => unit.id === 'training_enemy')!;
    const support = state.units.find((unit) => unit.id === 'training_support')!;
    const striker = state.units.find((unit) => unit.id === 'training_striker')!;
    striker.taunt = 5;
    const policy = new CompositePolicy([
      new FixedScriptPolicy([
        { actor: support.id, ability: 'basic', targets: [enemy.id] },
        { actor: striker.id, ability: 'basic', targets: [enemy.id] },
      ], { waitForActor: true }),
      new EnemyPolicy([{ enemyId: enemy.id, ability: 'basic' }]),
    ]);
    const run = runPolicy(new BattleKernel(createTrainingCatalog()), state, policy, { maxActions: 3 });

    expect(run.events.some((event) => event.type === 'DAMAGE_DEALT' && event.source === enemy.id && event.target === striker.id)).toBe(true);
  });
});

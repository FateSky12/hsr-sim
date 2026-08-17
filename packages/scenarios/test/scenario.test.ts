import { describe, expect, it } from 'vitest';
import { BattleKernel } from '@hsr-sim/engine';
import { FixedScriptPolicy, runPolicy } from '@hsr-sim/policy';
import { createTrainingCatalog, trainingScenario } from '../src/index.js';

describe('scenario adapters', () => {
  it('owns setup and scoring without putting scenario rules into the engine', () => {
    const initial = trainingScenario.createInitialState();
    const striker = initial.units.find((unit) => unit.id === 'training_striker')!;
    const enemy = initial.units.find((unit) => unit.id === 'training_enemy')!;
    const run = runPolicy(new BattleKernel(createTrainingCatalog()), initial, new FixedScriptPolicy([
      { actor: striker.id, ability: 'skill', targets: [enemy.id], advanceTurn: false },
      { actor: enemy.id, ability: 'basic', targets: [striker.id], advanceTurn: false },
    ]));
    const score = trainingScenario.score(run.finalState, run.events);

    expect(score.totalDamage).toBeGreaterThan(0);
    expect(run.finalState.units.find((unit) => unit.id === striker.id)?.hp).toBeLessThan(striker.maxHp);
    expect(score.cycles).toBe(0);
    expect(trainingScenario.coverage).toBe('abstracted');
  });
});

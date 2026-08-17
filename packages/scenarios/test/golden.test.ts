import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BattleKernel } from '@hsr-sim/engine';
import { FixedScriptPolicy, runPolicy } from '@hsr-sim/policy';
import { createGoldenCase, runGoldenCase } from '@hsr-sim/replay';
import { createTrainingCatalog, trainingScenario } from '../src/index.js';

describe('golden training replay', () => {
  it('keeps the complete vertical slice deterministic', () => {
    const golden = JSON.parse(readFileSync(new URL('../../../tests/golden/training-slice.json', import.meta.url), 'utf8')) as {
      name: string;
      rulesetVersion: string;
      dataRevision: string;
      commands: Array<{ actor: string; ability: string; targets: string[] }>;
      expect: { actions: number; eventCount: number; enemyHp: number; breaks: number; totalDamage: number; cycles: number };
    };
    const initial = trainingScenario.createInitialState();
    const kernel = new BattleKernel(createTrainingCatalog());
    const run = runPolicy(kernel, initial, new FixedScriptPolicy(golden.commands));
    const score = trainingScenario.score(run.finalState, run.events);
    const enemy = run.finalState.units.find((unit) => unit.id === 'training_enemy')!;

    expect({
      actions: run.commands.length,
      eventCount: run.events.length,
      enemyHp: enemy.hp,
      breaks: score.breaks,
      totalDamage: score.totalDamage,
      cycles: score.cycles,
    }).toEqual(golden.expect);

    const goldenCase = createGoldenCase({
      name: golden.name,
      rulesetVersion: golden.rulesetVersion,
      dataRevision: golden.dataRevision,
      initialState: initial,
      commands: golden.commands,
      expect: {
        actions: golden.expect.actions,
        eventCount: golden.expect.eventCount,
        cycles: golden.expect.cycles,
      },
    });
    expect(runGoldenCase(goldenCase, kernel).passed).toBe(true);
  });
});

import { BattleKernel } from '@hsr-sim/engine';
import { mergeRuleCatalogs } from '@hsr-sim/engine';
import { FixedScriptPolicy, runPolicy } from '@hsr-sim/policy';
import { createReplayDocument, stateHash, verifyReplay } from '@hsr-sim/replay';
import { createTrainingCatalog, trainingScenario } from '@hsr-sim/scenarios';
import { trainingStriker } from '@hsr-sim/data';
import { createEquippedUnit, createEquipmentCatalog, createEquipmentRules } from '@hsr-sim/equipment';
import { compareCalibrationDocument, parseCalibrationDocument } from '@hsr-sim/replay';
import { readFileSync } from 'node:fs';

export function createTrainingRun() {
  const initialState = trainingScenario.createInitialState();
  const support = initialState.units.find((unit) => unit.id === 'training_support')!;
  const striker = createEquippedUnit(trainingStriker, 'training_build');
  const enemy = initialState.units.find((unit) => unit.id === 'training_enemy')!;
  initialState.units = initialState.units.map((unit) => unit.id === striker.id ? striker : unit);
  const equipmentCatalog = createEquipmentCatalog();
  const policy = new FixedScriptPolicy([
    { actor: support.id, ability: 'skill', targets: [striker.id] },
    { actor: striker.id, ability: 'skill', targets: [enemy.id] },
    { actor: striker.id, ability: 'basic', targets: [enemy.id] },
  ]);
  const kernel = new BattleKernel(mergeRuleCatalogs(createTrainingCatalog(), createEquipmentRules(equipmentCatalog, [striker])));
  const run = runPolicy(kernel, initialState, policy, { maxActions: 10 });
  const replay = createReplayDocument({
    rulesetVersion: 'engine-0.1.0',
    dataRevision: 'fixture-0.1',
    initialState,
    commands: run.commands,
    events: run.events,
    finalState: run.finalState,
  });
  return { run, replay, verification: verifyReplay(replay, kernel) };
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === 'calibrate') {
  const file = process.argv[3];
  if (!file) throw new Error('Usage: npm run calibrate -- <calibration.json>');
  const document = parseCalibrationDocument(JSON.parse(readFileSync(file, 'utf8')) as unknown);
  const report = compareCalibrationDocument(document);
  console.log(JSON.stringify({ name: document.name, source: document.source, passed: report.passed, mismatches: report.mismatches }, null, 2));
  if (!report.passed) process.exitCode = 1;
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const { run, replay, verification } = createTrainingRun();
  const enemy = run.finalState.units.find((unit) => unit.faction === 'enemy');
  console.log(JSON.stringify({
    stoppedBecause: run.stoppedBecause,
    actions: run.commands.length,
    enemyHp: enemy?.hp,
    finalStateHash: stateHash(run.finalState),
    eventCount: run.events.length,
    replayVerified: verification.passed,
    replay,
  }, null, 2));
}

import { BattleKernel, cyclesElapsed, type ActionCommand, type BattleState, type ReplayEvent } from '@hsr-sim/engine';
import { compareCalibration, compareDamageTrace, compareActionTrace, type CalibrationReport } from './calibration.js';
import { decodeState, encodeState, stateHash, type EncodedBattleState } from './codec.js';

export interface GoldenDamageExpectation {
  value: number;
  tolerance?: number;
  source?: string;
}

export interface GoldenActionExpectation {
  actor: string;
  ability?: string;
  at: number;
  tolerance?: number;
}

export interface GoldenCase {
  schemaVersion: 1;
  name: string;
  rulesetVersion: string;
  dataRevision: string;
  initialState: EncodedBattleState;
  commands: ActionCommand[];
  expect: {
    actions: number;
    eventCount: number;
    cycles?: number;
    finalStateHash?: string;
    damageInstances?: GoldenDamageExpectation[];
    actionsTrace?: GoldenActionExpectation[];
  };
}

export interface GoldenRunReport {
  passed: boolean;
  name: string;
  finalState: BattleState;
  events: ReplayEvent[];
  finalStateHash: string;
  calibration: CalibrationReport;
}

/** Execute a complete event/action golden case with the same turn-start path as runPolicy. */
export function runGoldenCase(golden: GoldenCase, kernel: BattleKernel): GoldenRunReport {
  if (golden.schemaVersion !== 1) throw new Error(`Unsupported golden case schema: ${golden.schemaVersion}`);
  let state = decodeState(golden.initialState);
  const events: ReplayEvent[] = [];
  for (const command of golden.commands) {
    const turnStart = kernel.beginTurn(state, command.actor);
    state = turnStart.state;
    events.push(...turnStart.events);
    const transition = kernel.step(state, command);
    state = transition.state;
    events.push(...transition.events);
  }

  const damage = events
    .filter((event): event is Extract<ReplayEvent, { type: 'DAMAGE_DEALT' }> => event.type === 'DAMAGE_DEALT')
    .map((event) => event.amount);
  const actionEvents = events.filter((event): event is Extract<ReplayEvent, { type: 'ACTION_STARTED' }> => event.type === 'ACTION_STARTED');
  const observations = [
    { field: 'actions', expected: golden.expect.actions, observed: golden.commands.length },
    { field: 'eventCount', expected: golden.expect.eventCount, observed: events.length },
    ...(golden.expect.cycles === undefined ? [] : [{ field: 'cycles', expected: golden.expect.cycles, observed: cyclesElapsed(state.clock) }]),
    ...(golden.expect.finalStateHash === undefined ? [] : [{ field: 'finalStateHash', expected: golden.expect.finalStateHash, observed: stateHash(state) }]),
  ];
  const summary = compareCalibration(observations);
  const damageReport = compareDamageTrace((golden.expect.damageInstances ?? []).map((expected, index) => ({
    index,
    expected: expected.value,
    observed: damage[index] ?? Number.NaN,
    tolerance: expected.tolerance ?? 0,
    source: expected.source,
  })));
  const actionReport = compareActionTrace((golden.expect.actionsTrace ?? []).map((expected, index) => ({
    index,
    expectedActor: expected.actor,
    observedActor: actionEvents[index]?.actor ?? '',
    expectedAt: expected.at,
    observedAt: actionEvents[index]?.at ?? Number.NaN,
    atTolerance: expected.tolerance,
    expectedAbility: expected.ability,
    observedAbility: actionEvents[index]?.ability,
  })));
  const calibration: CalibrationReport = {
    passed: summary.passed && damageReport.passed && actionReport.passed,
    mismatches: [...summary.mismatches, ...damageReport.mismatches, ...actionReport.mismatches],
  };
  return {
    passed: calibration.passed,
    name: golden.name,
    finalState: state,
    events,
    finalStateHash: stateHash(state),
    calibration,
  };
}

export function createGoldenCase(input: Omit<GoldenCase, 'schemaVersion' | 'initialState'> & { initialState: BattleState }): GoldenCase {
  return { ...input, schemaVersion: 1, initialState: encodeState(input.initialState) };
}

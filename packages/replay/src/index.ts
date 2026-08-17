import { BattleKernel, type ActionCommand, type BattleState, type ReplayEvent } from '@hsr-sim/engine';
import { canonicalJson, decodeCompressedJson, decodeState, encodeCompressedJson, encodeState, stateHash, type EncodedBattleState } from './codec.js';

export * from './codec.js';
export * from './calibration.js';
export * from './golden.js';

export interface ReplayDocument {
  schemaVersion: 1;
  rulesetVersion: string;
  dataRevision: string;
  /** Host-side registry hints needed to rebuild executable rules for a share. */
  metadata?: { characterId?: string; characterIds?: string[]; enemyId?: string; scenarioId?: string };
  initialState: EncodedBattleState;
  commands: ActionCommand[];
  events: ReplayEvent[];
  finalStateHash: string;
}

export interface ReplayVerification {
  passed: boolean;
  expectedFinalStateHash: string;
  actualFinalStateHash: string;
  expectedEventCount: number;
  actualEventCount: number;
  firstEventMismatch?: number;
  finalState: BattleState;
  events: ReplayEvent[];
}

export interface ReplayVerificationOptions {
  /**
   * Optional host-owned wave transition. The core replay package does not
   * depend on scenario definitions, so a host can supply the same immutable
   * transition used while producing a multi-wave replay.
   */
  advanceWave?: (state: BattleState) => { state: BattleState; events: ReplayEvent[] };
}

export function createReplayDocument(input: {
  rulesetVersion: string;
  dataRevision: string;
  metadata?: { characterId?: string; characterIds?: string[]; enemyId?: string; scenarioId?: string };
  initialState: BattleState;
  commands: ActionCommand[];
  events: ReplayEvent[];
  finalState: BattleState;
}): ReplayDocument {
  return {
    schemaVersion: 1,
    rulesetVersion: input.rulesetVersion,
    dataRevision: input.dataRevision,
    metadata: input.metadata ? { ...input.metadata, characterIds: input.metadata.characterIds ? [...input.metadata.characterIds] : undefined } : undefined,
    initialState: encodeState(input.initialState),
    commands: input.commands.map((command) => ({ ...command, targets: [...command.targets] })),
    events: input.events.map((event) => ({ ...event })),
    finalStateHash: stateHash(input.finalState),
  };
}

/**
 * Re-run a replay document against the supplied rules and report the first
 * observable divergence. The rules are intentionally provided by the caller:
 * a replay records the ruleset/data revisions, while executable hooks remain
 * in the host registry rather than inside structured-cloneable state.
 */
export function verifyReplay(document: ReplayDocument, kernel: BattleKernel, options: ReplayVerificationOptions = {}): ReplayVerification {
  let state = decodeState(document.initialState);
  const events: ReplayEvent[] = [];
  // Replays produced by runPolicy include the explicit turn-start trace;
  // low-level formula fixtures may intentionally contain only step events.
  // Preserve both public seams so a document verifies exactly the path that
  // produced its recorded event stream.
  const includesTurnStart = document.events.some((event) => event.type === 'TURN_BEGIN');
  for (const command of document.commands) {
    const actorPresent = state.units.some((unit) => unit.id === command.actor);
    const enemiesCleared = state.units.every((unit) => unit.faction !== 'enemy' || !unit.alive);
    if (options.advanceWave && state.wave < state.totalWaves && (!actorPresent || enemiesCleared)) {
      const wave = options.advanceWave(state);
      state = wave.state;
      events.push(...wave.events);
    }
    if (includesTurnStart) {
      const turnStart = kernel.beginTurn(state, command.actor);
      state = turnStart.state;
      events.push(...turnStart.events);
    }
    const transition = kernel.step(state, command);
    state = transition.state;
    events.push(...transition.events);
  }

  const firstEventMismatch = findFirstEventMismatch(document.events, events);
  const actualFinalStateHash = stateHash(state);
  return {
    passed: actualFinalStateHash === document.finalStateHash && firstEventMismatch === undefined && events.length === document.events.length,
    expectedFinalStateHash: document.finalStateHash,
    actualFinalStateHash,
    expectedEventCount: document.events.length,
    actualEventCount: events.length,
    firstEventMismatch,
    finalState: state,
    events,
  };
}

function findFirstEventMismatch(expected: readonly ReplayEvent[], actual: readonly ReplayEvent[]): number | undefined {
  const length = Math.min(expected.length, actual.length);
  for (let index = 0; index < length; index += 1) {
    if (canonicalJson(expected[index]) !== canonicalJson(actual[index])) return index;
  }
  return expected.length === actual.length ? undefined : length;
}

export function encodeReplay(document: ReplayDocument): string {
  return JSON.stringify(document);
}

export function decodeReplay(value: string): ReplayDocument {
  const document = JSON.parse(value) as ReplayDocument;
  if (document.schemaVersion !== 1) throw new Error(`Unsupported replay schema: ${document.schemaVersion}`);
  return document;
}

export async function encodeCompressedReplay(document: ReplayDocument): Promise<string> {
  return encodeCompressedJson(document);
}

export async function decodeCompressedReplay(value: string): Promise<ReplayDocument> {
  const document = await decodeCompressedJson<ReplayDocument>(value);
  if (document.schemaVersion !== 1) throw new Error(`Unsupported replay schema: ${document.schemaVersion}`);
  return document;
}

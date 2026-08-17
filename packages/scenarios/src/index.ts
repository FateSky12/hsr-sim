import { ScenarioDefinitionSchema, parseEnemyConfig, trainingCharacters, trainingEnemy, type EnemyData, type ScenarioDefinition } from '@hsr-sim/data';
import { createContentCatalog, createUnitFromCharacter, createUnitFromEnemy, enemyToRules } from '@hsr-sim/content';
import { BattleKernel, StatKey, advanceBattleWave, createStats, cyclesElapsed, mergeRuleCatalogs, type ActionCommand, type BattleState, type CreateUnitInput, type ReplayEvent, createBattleState, createRuleCatalog } from '@hsr-sim/engine';

export interface ScenarioScore {
  value: number;
  cycles: number;
  totalDamage: number;
  breaks: number;
}

export interface ScenarioPolicy {
  next(state: BattleState): ActionCommand | undefined;
}

export interface ScenarioRun {
  finalState: BattleState;
  commands: ActionCommand[];
  events: ReplayEvent[];
  scores: ScenarioScore[];
  stoppedBecause: 'all_waves_cleared' | 'policy_exhausted' | 'max_actions' | 'no_command';
}

export interface ScenarioAdapter {
  id: string;
  version: string;
  coverage: 'verified' | 'abstracted' | 'unsupported';
  createInitialState(): BattleState;
  score(state: BattleState, events: readonly ReplayEvent[]): ScenarioScore;
  waves?: readonly ScenarioDefinition['waves'][number][];
}

export type ScenarioMode = ScenarioDefinition['mode'];

export interface EndgameScore extends ScenarioScore {
  mode: ScenarioMode;
  cleared: boolean;
  kills: number;
  breakDamage: number;
  remainingEnemies: number;
}

export interface EndgameScoringConfig {
  mode: ScenarioMode;
  cycleBudget?: number;
  damageWeight?: number;
  breakWeight?: number;
  breakDamageWeight?: number;
  killWeight?: number;
  waveWeight?: number;
  clearBonus?: number;
}

/**
 * Parameterized endgame scoring. These are intentionally coefficients rather
 * than hard-coded live-season rules: the scenario adapter can be calibrated
 * from a dated stage definition without changing the engine.
 */
export function scoreEndgameScenario(
  state: BattleState,
  events: readonly ReplayEvent[],
  config: EndgameScoringConfig,
): EndgameScore {
  const damageEvents = events.filter((event): event is Extract<ReplayEvent, { type: 'DAMAGE_DEALT' }> => event.type === 'DAMAGE_DEALT');
  const totalDamage = damageEvents.reduce((total, event) => total + event.amount, 0);
  const breakDamage = damageEvents.reduce((total, event) => total + (event.damageType === 'break' || event.damageType === 'super_break' ? event.amount : 0), 0);
  const breaks = events.filter((event) => event.type === 'WEAKNESS_BREAK').length;
  const defeated = new Set(events.filter((event): event is Extract<ReplayEvent, { type: 'UNIT_DEFEATED' }> => event.type === 'UNIT_DEFEATED').map((event) => event.target));
  const remainingEnemies = state.units.filter((unit) => unit.faction === 'enemy' && unit.alive).length;
  const cleared = remainingEnemies === 0;
  const cycles = cyclesElapsed(state.clock);
  const cycleValue = Math.max(0, (config.cycleBudget ?? 0) - cycles);
  const clearValue = cleared ? (config.clearBonus ?? 0) : 0;
  const value = clearValue
    + cycleValue
    + totalDamage * (config.damageWeight ?? 0)
    + breaks * (config.breakWeight ?? 0)
    + breakDamage * (config.breakDamageWeight ?? 0)
    + defeated.size * (config.killWeight ?? 0)
    + state.wave * (config.waveWeight ?? 0);
  return { value, cycles, totalDamage, breaks, mode: config.mode, cleared, kills: defeated.size, breakDamage, remainingEnemies };
}

export function createParametricEndgameScenario(input: {
  id: string;
  version: string;
  mode: ScenarioMode;
  coverage?: ScenarioAdapter['coverage'];
  createInitialState: () => BattleState;
  scoring: Omit<EndgameScoringConfig, 'mode'>;
}): ScenarioAdapter & { mode: ScenarioMode } {
  return {
    id: input.id,
    version: input.version,
    mode: input.mode,
    coverage: input.coverage ?? 'abstracted',
    createInitialState: input.createInitialState,
    score: (state, events) => scoreEndgameScenario(state, events, { ...input.scoring, mode: input.mode }),
  };
}

export function createScenarioFromDefinition(
  value: unknown,
  allies: readonly CreateUnitInput[],
): ScenarioAdapter & { mode: ScenarioMode; definition: ScenarioDefinition } {
  const raw = isRecord(value) ? value : {};
  const rawEnemies = Array.isArray(raw.enemies) ? raw.enemies : [];
  const rawWaves = Array.isArray(raw.waves) ? raw.waves : [];
  const explicitWaves = rawWaves.map((wave, index) => {
    const record = isRecord(wave) ? wave : {};
    const enemies = Array.isArray(record.enemies) ? record.enemies : [];
    return {
      id: typeof record.id === 'string' ? record.id : `wave-${index + 1}`,
      enemies: enemies.map((enemy) => parseEnemyConfig(enemy, { sourceRevision: readEnemyRevision(enemy, String(raw.version ?? 'scenario-unknown')) })),
    };
  });
  const normalizedEnemies = rawEnemies.map((enemy) => parseEnemyConfig(enemy, { sourceRevision: readEnemyRevision(enemy, String(raw.version ?? 'scenario-unknown')) }));
  const requestedWaveCount = typeof raw.totalWaves === 'number' && Number.isInteger(raw.totalWaves) && raw.totalWaves > 0 ? raw.totalWaves : 1;
  // A compact fixture may provide one enemy template plus totalWaves instead
  // of repeating the same JSON. Expand that shorthand into stable wave IDs so
  // the runner still has an explicit, replayable wave definition.
  const normalizedWaves = explicitWaves.length > 0
    ? explicitWaves
    : requestedWaveCount > 1 && normalizedEnemies.length > 0
      ? Array.from({ length: requestedWaveCount }, (_, index) => ({ id: `wave-${index + 1}`, enemies: normalizedEnemies }))
      : [];
  const normalized: Record<string, unknown> = {
    ...raw,
    enemies: normalizedEnemies,
    waves: normalizedWaves,
  };
  if (normalizedWaves.length > 0 && raw.totalWaves === undefined) normalized.totalWaves = normalizedWaves.length;
  const definition = ScenarioDefinitionSchema.parse(normalized);
  const initialEnemies = definition.waves[0]?.enemies ?? definition.enemies;
  return {
    id: definition.id,
    version: definition.version,
    mode: definition.mode,
    definition,
    coverage: definition.coverage,
    waves: definition.waves,
    createInitialState: () => createBattleState({
      units: [...allies, ...initialEnemies.map((enemy) => createUnitFromEnemy(enemy))],
      totalWaves: definition.waves.length > 0 ? definition.waves.length : definition.totalWaves,
    }),
    score: (state, events) => scoreEndgameScenario(state, events, { ...definition.scoring, mode: definition.mode }),
  };
}

/** Advance a data-defined scenario to its next wave and retain the emitted wave events. */
export function advanceScenarioWave(
  scenario: Pick<ScenarioAdapter, 'waves'>,
  state: BattleState,
  options: { preserveTemporaryEffects?: boolean } = {},
): { state: BattleState; events: ReplayEvent[] } {
  const wave = scenario.waves?.[state.wave];
  if (!wave) throw new Error(`Scenario has no definition for wave ${state.wave + 1}`);
  return advanceBattleWave(state, wave.enemies.map(enemyToCreateUnitInput), options);
}

/** Run a policy across every data-defined wave, retaining one replay stream. */
export function runScenario(
  kernel: BattleKernel,
  scenario: ScenarioAdapter,
  policy: ScenarioPolicy,
  options: { maxActions?: number; preserveTemporaryEffects?: boolean } = {},
): ScenarioRun {
  let state = scenario.createInitialState();
  const commands: ActionCommand[] = [];
  const events: ReplayEvent[] = [];
  const scores: ScenarioScore[] = [];
  const maxActions = options.maxActions ?? 1000;

  for (let index = 0; index < maxActions; index += 1) {
    if (state.units.every((unit) => unit.faction !== 'enemy' || !unit.alive)) {
      if (scenario.waves && scenario.waves.length > 0 && state.wave < state.totalWaves) {
        scores.push(scenario.score(state, events));
        const next = advanceScenarioWave(scenario, state, options);
        state = next.state;
        events.push(...next.events);
        continue;
      }
      scores.push(scenario.score(state, events));
      return { finalState: state, commands, events, scores, stoppedBecause: 'all_waves_cleared' };
    }
    const command = policy.next(state);
    if (!command) {
      scores.push(scenario.score(state, events));
      return { finalState: state, commands, events, scores, stoppedBecause: commands.length === 0 ? 'no_command' : 'policy_exhausted' };
    }
    const turnStart = kernel.beginTurn(state, command.actor);
    state = turnStart.state;
    events.push(...turnStart.events);
    const committedCommand = { ...command, targets: [...command.targets], rngState: { ...state.rng } };
    const transition = kernel.step(state, committedCommand);
    state = transition.state;
    commands.push(committedCommand);
    events.push(...transition.events);
  }
  scores.push(scenario.score(state, events));
  return { finalState: state, commands, events, scores, stoppedBecause: 'max_actions' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readEnemyRevision(value: unknown, fallback: string): string {
  if (!isRecord(value) || !isRecord(value.source) || typeof value.source.revision !== 'string' || value.source.revision.length === 0) return fallback;
  return value.source.revision;
}

function enemyToCreateUnitInput(enemy: EnemyData): CreateUnitInput {
  return {
    id: enemy.id,
    name: enemy.name,
    faction: 'enemy',
    level: enemy.level,
    stats: createStats({ hp: enemy.hp, atk: enemy.atk, def: enemy.def, spd: enemy.spd, critRate: 0 }),
    maxHp: enemy.hp,
    toughness: { current: enemy.toughness, max: enemy.toughness, broken: false },
    weaknesses: enemy.weaknesses,
    resistance: enemy.resistance,
    custom: { enemyRank: enemy.rank ?? 'normal', sourceIds: enemy.sourceIds ?? {} },
  };
}

export const trainingScenario: ScenarioAdapter = {
  id: 'training_fixture',
  version: 'fixture-0.1',
  coverage: 'abstracted',
  createInitialState() {
    const state = createBattleState({
      units: [
        createUnitFromCharacter(trainingCharacters[1]),
        createUnitFromCharacter(trainingCharacters[0]),
        createUnitFromEnemy(trainingEnemy),
      ],
      skillPoints: 3,
      rngSeed: 20260814,
    });
    for (const unit of state.units) {
      if (unit.faction === 'ally') unit.stats.base[StatKey.CritRate] = 0;
    }
    return state;
  },
  score(state, events) {
    const totalDamage = events.reduce((total, event) => total + (event.type === 'DAMAGE_DEALT' ? event.amount : 0), 0);
    const breaks = events.filter((event) => event.type === 'WEAKNESS_BREAK').length;
    const cycles = cyclesElapsed(state.clock);
    return { value: totalDamage + breaks * 1000, cycles, totalDamage, breaks };
  },
};

export function createTrainingCatalog() {
  return mergeRuleCatalogs(
    createContentCatalog(trainingCharacters),
    createRuleCatalog({ [trainingEnemy.id]: enemyToRules(trainingEnemy) }),
  );
}

export function advanceWave(
  state: BattleState,
  enemies: readonly CreateUnitInput[],
  options: { preserveTemporaryEffects?: boolean } = {},
): BattleState {
  return advanceBattleWave(state, enemies, options).state;
}

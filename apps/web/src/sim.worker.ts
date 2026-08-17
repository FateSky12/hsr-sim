import { BattleKernel } from '@hsr-sim/engine';
import { mergeRuleCatalogs } from '@hsr-sim/engine';
import { ActorPatternPolicy, CompositePolicy, EnemyPolicy, FixedScriptPolicy, PriorityPolicy, parseApl, runPolicy } from '@hsr-sim/policy';
import { createReplayDocument, decodeCompressedReplay, decodeState, encodeCompressedReplay, stateHash, verifyReplay, type ReplayVerificationOptions } from '@hsr-sim/replay';
import { advanceScenarioWave, createScenarioFromDefinition, createTrainingCatalog, runScenario, trainingScenario } from '@hsr-sim/scenarios';
import { parseCharacterData, parseEnemyConfig, trainingCharacters, trainingEnemy, trainingRelics, trainingStriker, ScenarioDefinitionSchema, resolveTurnBasedBreakDamage, type CharacterData, type ScenarioDefinition, type TurnBasedBreakDamageTable } from '@hsr-sim/data';
import { LightConeDataSchema, RelicSetDataSchema, type RelicInstanceData } from '@hsr-sim/data';
import { createEquippedUnit, createEquippedUnitFromLoadout, createEquipmentCatalog, createEquipmentRules } from '@hsr-sim/equipment';
import { createContentCatalog, createUnitFromCharacter, createUnitFromEnemy, enemyToRules } from '@hsr-sim/content';
import { breakElementMultiplier, createBattleState, type CreateUnitInput, type UnitState } from '@hsr-sim/engine';
import { createRuleCatalog } from '@hsr-sim/engine';
import { generateLoadoutCandidates, scoreStaticCandidate, twoStageSearch } from '@hsr-sim/search';

function postResult(requestId: string | undefined, result: Omit<SimulationWorkerResult, 'requestId'>): void {
  self.postMessage({ ...result, requestId: requestId ?? 'legacy' });
}

interface SimulationWorkerResult {
  requestId: string;
  enemyHp: number;
  actions: number;
  events: number;
  hash: string;
  lines: string[];
  shareToken?: string;
  replayVerified?: boolean;
  search?: { candidates: number; retained: number; bestId?: string; bestScore?: number; bestEnemyHp?: number; usedImportedRelics?: number };
  scenario?: { id: string; mode: string; version: string; waves: number; stoppedBecause: string; score?: number };
  error?: string;
}

self.addEventListener('message', async (event: MessageEvent<{ kind: string; text?: string; shareToken?: string; relics?: readonly RelicInstanceData[]; lightConeIds?: readonly string[]; characterId?: string; characterIds?: readonly string[]; scenarioId?: string; requestId?: string }>) => {
  try {
  if (event.data.kind === 'run_apl') {
    const initial = trainingScenario.createInitialState();
    const striker = createEquippedUnit(trainingStriker, 'training_build');
    const enemy = initial.units.find((unit) => unit.id === 'training_enemy')!;
    initial.units = initial.units.map((unit) => unit.id === striker.id ? striker : unit);
    // This panel is a single-actor APL editor. Keep the other fixture units
    // out of the demo actor's decision lane instead of silently returning
    // `no_command` when the faster support would act first.
    for (const unit of initial.units) {
      if (unit.id !== striker.id) unit.nextActionAt = 1_000_000_000_000;
    }
    const equipmentCatalog = createEquipmentCatalog();
    const rules = mergeRuleCatalogs(createTrainingCatalog(), createEquipmentRules(equipmentCatalog, [striker]));
    const apl = parseApl(event.data.text ?? 'basic', { actor: striker.id, targets: [enemy.id] });
    const kernel = new BattleKernel(rules);
    const run = runPolicy(kernel, initial, new PriorityPolicy(apl), { maxActions: 20 });
    const finalEnemy = run.finalState.units.find((unit) => unit.id === enemy.id)!;
    const replay = createReplayDocument({ rulesetVersion: 'engine-0.1.0', dataRevision: 'fixture-0.1', initialState: initial, commands: run.commands, events: run.events, finalState: run.finalState });
    postResult(event.data.requestId, { enemyHp: finalEnemy.hp, actions: run.commands.length, events: run.events.length, hash: stateHash(run.finalState), replayVerified: verifyReplay(replay, kernel).passed, shareToken: await encodeCompressedReplay(replay), lines: run.events.map((item) => `${item.seq.toString().padStart(2, '0')} ${item.type}`) });
    return;
  }
  if (event.data.kind === 'run_pinned_character') {
    const character = (await loadPinnedCharacters()).find((candidate) => candidate.id === event.data.characterId);
    if (!character) throw new Error(`Unknown pinned character: ${event.data.characterId ?? ''}`);
    const equipmentCatalog = await loadPinnedEquipment();
    const compatibleLightCone = [...equipmentCatalog.lightCones.values()].find((lightCone) => lightCone.id !== 'training_light_cone' && lightCone.path.toLowerCase() === character.path.toLowerCase());
    const actor = compatibleLightCone
      ? createEquippedUnitFromLoadout(character, { lightConeId: compatibleLightCone.id, relicIds: [] }, equipmentCatalog)
      : createUnitFromCharacter(character);
    const enemy = createUnitFromEnemy(trainingEnemy);
    const initial = createBattleState({ units: [actor, enemy], skillPoints: 3, rngSeed: 20260814 });
    const rules = mergeRuleCatalogs(
      createContentCatalog([character]),
      createRuleCatalog({ [enemy.id]: enemyToRules(trainingEnemy) }),
      createEquipmentRules(equipmentCatalog, [actor]),
    );
    const skill = character.abilities.find((ability) => ability.id === 'skill')?.id ?? 'basic';
    const run = runPolicy(new BattleKernel(rules), initial, new FixedScriptPolicy([
      { actor: actor.id, ability: skill, targets: [enemy.id] },
      { actor: actor.id, ability: 'basic', targets: [enemy.id] },
      { actor: actor.id, ability: 'basic', targets: [enemy.id] },
    ]));
    const finalEnemy = run.finalState.units.find((unit) => unit.id === enemy.id)!;
    const replay = createReplayDocument({
      rulesetVersion: 'engine-0.1.0',
      dataRevision: character.source.revision,
      metadata: { characterId: character.id, enemyId: enemy.id },
      initialState: initial,
      commands: run.commands,
      events: run.events,
      finalState: run.finalState,
    });
    const kernel = new BattleKernel(rules);
    postResult(event.data.requestId, {
      enemyHp: finalEnemy.hp,
      actions: run.commands.length,
      events: run.events.length,
      hash: stateHash(run.finalState),
      replayVerified: verifyReplay(replay, kernel).passed,
      shareToken: await encodeCompressedReplay(replay),
      lines: run.events.map((item) => `${item.seq.toString().padStart(2, '0')} ${item.type}`),
    });
    return;
  }
  if (event.data.kind === 'run_scenario') {
    const scenarioId = event.data.scenarioId ?? 'memory-of-chaos-4.4-abstracted';
    const definition = await loadScenarioDefinition(scenarioId);
    const requestedIds = [...new Set((event.data.characterIds ?? []).filter((id): id is string => typeof id === 'string' && id.length > 0))].slice(0, 4);
    let allies: CreateUnitInput[];
    let allyRules;
    if (requestedIds.length > 0) {
      const pinned = await loadPinnedCharacters();
      const selected = requestedIds.map((id) => pinned.find((character) => character.id === id)).filter((character): character is CharacterData => character !== undefined);
      if (selected.length === 0) throw new Error('四人队伍中没有可用的固定角色');
      const equipmentCatalog = await loadPinnedEquipment();
      const actorUnits = selected.map((character) => {
        const compatibleLightCone = [...equipmentCatalog.lightCones.values()].find((lightCone) => lightCone.id !== 'training_light_cone' && lightCone.path.toLowerCase() === character.path.toLowerCase());
        return compatibleLightCone
          ? createEquippedUnitFromLoadout(character, { lightConeId: compatibleLightCone.id, relicIds: [] }, equipmentCatalog)
          : createUnitFromCharacter(character);
      });
      allies = actorUnits.map(unitToCreateInput);
      allyRules = mergeRuleCatalogs(createContentCatalog(selected), createEquipmentRules(equipmentCatalog, actorUnits));
    } else {
      const base = trainingScenario.createInitialState();
      const equipmentCatalog = createEquipmentCatalog();
      const striker = createEquippedUnit(trainingStriker, 'training_build');
      allies = base.units
        .filter((unit) => unit.faction === 'ally')
        .map((unit): CreateUnitInput => unit.id === striker.id ? unitToCreateInput(striker) : unitToCreateInput(unit));
      allyRules = mergeRuleCatalogs(createTrainingCatalog(), createEquipmentRules(equipmentCatalog, [striker]));
    }
    const scenario = createScenarioFromDefinition(definition, allies);
    const enemyDefinitions = scenario.definition.waves.flatMap((wave) => wave.enemies);
    const enemyRules = Object.fromEntries(enemyDefinitions.map((enemy) => [enemy.id, enemyToRules(enemy)]));
    const rules = mergeRuleCatalogs(allyRules, createRuleCatalog(enemyRules));
    const patterns = allies.map((ally) => ({ actorId: ally.id, pattern: ['basic'], targeting: 'highest_aggro' as const }));
    const enemyPatterns = enemyDefinitions.map((enemy) => ({ enemyId: enemy.id, pattern: enemy.behavior?.pattern ?? ['basic'], targeting: 'highest_aggro' as const }));
    const policy = new CompositePolicy([
      new ActorPatternPolicy(patterns),
      new EnemyPolicy(enemyPatterns),
    ]);
    const initial = scenario.createInitialState();
    const kernel = await createScenarioKernel(rules, scenarioId.startsWith('turnbased-stage-'));
    const run = runScenario(kernel, scenario, policy, { maxActions: 200 });
    const finalEnemy = run.finalState.units.find((unit) => unit.faction === 'enemy');
    const score = run.scores.at(-1);
    const replay = createReplayDocument({
      rulesetVersion: 'engine-0.1.0',
      dataRevision: scenario.version,
      metadata: { scenarioId, characterIds: requestedIds.length > 0 ? requestedIds : undefined },
      initialState: initial,
      commands: run.commands,
      events: run.events,
      finalState: run.finalState,
    });
    const replayContext = createReplayContext(kernel, scenario);
    postResult(event.data.requestId, {
      enemyHp: finalEnemy?.hp ?? 0,
      actions: run.commands.length,
      events: run.events.length,
      hash: stateHash(run.finalState),
      replayVerified: verifyReplay(replay, replayContext.kernel, replayContext.options).passed,
      shareToken: await encodeCompressedReplay(replay),
      scenario: { id: scenario.id, mode: scenario.mode, version: scenario.version, waves: scenario.definition.totalWaves, stoppedBecause: run.stoppedBecause, score: score?.value },
      lines: run.events.map((item) => `${item.seq.toString().padStart(2, '0')} ${item.type}`),
    });
    return;
  }
  if (event.data.kind === 'verify_share') {
    const replay = await decodeCompressedReplay(event.data.shareToken ?? '');
    const initialState = decodeState(replay.initialState);
    const replayContext = await createReplayKernel(replay, initialState.units);
    const verification = verifyReplay(replay, replayContext.kernel, replayContext.options);
    const finalEnemy = verification.finalState.units.find((unit) => unit.faction === 'enemy');
    postResult(event.data.requestId, {
      enemyHp: finalEnemy?.hp ?? 0,
      actions: replay.commands.length,
      events: verification.events.length,
      hash: verification.actualFinalStateHash,
      replayVerified: verification.passed,
      lines: verification.events.map((item) => `${item.seq.toString().padStart(2, '0')} ${item.type}`),
    });
    return;
  }
  if (event.data.kind === 'run_custom_enemy') {
    const enemyData = parseEnemyConfig(JSON.parse(event.data.text ?? '{}'), { sourceRevision: 'web-custom-enemy-1' });
    const initial = trainingScenario.createInitialState();
    const support = initial.units.find((unit) => unit.id === 'training_support')!;
    const striker = createEquippedUnit(trainingStriker, 'training_build');
    const enemy = createUnitFromEnemy(enemyData);
    initial.units = [support, striker, enemy];
    const equipmentCatalog = createEquipmentCatalog();
    const kernel = new BattleKernel(mergeRuleCatalogs(
      createContentCatalog(trainingCharacters),
      createRuleCatalog({ [enemy.id]: enemyToRules(enemyData) }),
      createEquipmentRules(equipmentCatalog, [striker]),
    ));
    const run = runPolicy(kernel, initial, new FixedScriptPolicy([
      { actor: support.id, ability: 'skill', targets: [striker.id] },
      { actor: striker.id, ability: 'skill', targets: [enemy.id] },
      { actor: striker.id, ability: 'basic', targets: [enemy.id] },
    ]));
    const finalEnemy = run.finalState.units.find((unit) => unit.id === enemy.id)!;
    const replay = createReplayDocument({ rulesetVersion: 'engine-0.1.0', dataRevision: enemyData.source.revision, initialState: initial, commands: run.commands, events: run.events, finalState: run.finalState });
    postResult(event.data.requestId, {
      enemyHp: finalEnemy.hp,
      actions: run.commands.length,
      events: run.events.length,
      hash: stateHash(run.finalState),
      replayVerified: verifyReplay(replay, kernel).passed,
      shareToken: await encodeCompressedReplay(replay),
      lines: run.events.map((item) => `${item.seq.toString().padStart(2, '0')} ${item.type}`),
    });
    return;
  }
  if (event.data.kind === 'search_training_loadouts') {
    const importedRelics = event.data.relics ?? [];
    const relics = importedRelics.length > 0 ? importedRelics : trainingRelics;
    const equipmentCatalog = await createImportedEquipmentCatalog(importedRelics, event.data.lightConeIds ?? []);
    const target = createUnitFromEnemy(trainingEnemy);
    const importedLightCones = (event.data.lightConeIds ?? []).filter((id) => equipmentCatalog.lightCones.has(id));
    const candidates = generateLoadoutCandidates({ lightConeIds: importedLightCones.length > 0 ? importedLightCones : ['training_light_cone'], relics });
    const search = twoStageSearch({
      candidates,
      coarseScore: (candidate) => scoreStaticCandidate(trainingStriker, candidate, equipmentCatalog, { target, element: 'physical' }),
      keep: Math.min(8, candidates.length),
      simulate: (candidate) => {
        const source = createEquippedUnitFromLoadout(trainingStriker, candidate.loadout, equipmentCatalog);
        const state = createBattleState({ units: [source, target], skillPoints: 3, rngSeed: 20260814 });
        const run = runPolicy(new BattleKernel(mergeRuleCatalogs(createTrainingCatalog(), createEquipmentRules(equipmentCatalog, [source]))), state, new FixedScriptPolicy([{ actor: source.id, ability: 'basic', targets: [target.id], advanceTurn: false }]));
        const score = run.events.reduce((sum, item) => sum + (item.type === 'DAMAGE_DEALT' ? item.amount : 0), 0);
        return { score, result: { enemyHp: run.finalState.units.find((unit) => unit.id === target.id)?.hp ?? 0 } };
      },
    });
    postResult(event.data.requestId, {
      enemyHp: search.best?.result.enemyHp ?? target.hp,
      actions: 0,
      events: 0,
      hash: 'search',
      lines: [],
      search: {
        candidates: candidates.length,
        retained: search.evaluated.length,
        bestId: search.best?.candidate.id,
        bestScore: search.best?.fullScore,
        bestEnemyHp: search.best?.result.enemyHp,
        usedImportedRelics: importedRelics.length || undefined,
      },
    });
    return;
  }
  if (event.data.kind !== 'run_training_fixture') return;
  const initial = trainingScenario.createInitialState();
  const support = initial.units.find((unit) => unit.id === 'training_support')!;
  const striker = createEquippedUnit(trainingStriker, 'training_build');
  const enemy = initial.units.find((unit) => unit.id === 'training_enemy')!;
  initial.units = initial.units.map((unit) => unit.id === striker.id ? striker : unit);
  const equipmentCatalog = createEquipmentCatalog();
  const kernel = new BattleKernel(mergeRuleCatalogs(createTrainingCatalog(), createEquipmentRules(equipmentCatalog, [striker])));
  const run = runPolicy(kernel, initial, new FixedScriptPolicy([
    { actor: support.id, ability: 'skill', targets: [striker.id] },
    { actor: striker.id, ability: 'skill', targets: [enemy.id] },
    { actor: striker.id, ability: 'basic', targets: [enemy.id] },
  ]));
  const finalEnemy = run.finalState.units.find((unit) => unit.id === enemy.id)!;
  const replay = createReplayDocument({ rulesetVersion: 'engine-0.1.0', dataRevision: 'fixture-0.1', initialState: initial, commands: run.commands, events: run.events, finalState: run.finalState });
  const lines = run.events.map((item) => {
    switch (item.type) {
      case 'DAMAGE_DEALT': return `${item.seq.toString().padStart(2, '0')} 伤害 ${item.source} -> ${item.target}: ${item.amount}`;
      case 'MODIFIER_APPLIED': return `${item.seq.toString().padStart(2, '0')} 增益 ${item.target}: ${item.id}`;
      case 'WEAKNESS_BREAK': return `${item.seq.toString().padStart(2, '0')} 击破 ${item.target}`;
      default: return `${item.seq.toString().padStart(2, '0')} ${item.type}`;
    }
  });
  postResult(event.data.requestId, { enemyHp: finalEnemy.hp, actions: run.commands.length, events: run.events.length, hash: stateHash(run.finalState), replayVerified: verifyReplay(replay, kernel).passed, shareToken: await encodeCompressedReplay(replay), lines });
  } catch (error) {
    self.postMessage({ requestId: event.data.requestId ?? 'legacy', error: error instanceof Error ? error.message : 'Simulation worker failed' });
  }
});

function createTrainingKernel(units: readonly UnitState[]): BattleKernel {
  const equipmentCatalog = createEquipmentCatalog();
  return new BattleKernel(mergeRuleCatalogs(createTrainingCatalog(), createEquipmentRules(equipmentCatalog, units)));
}

function unitToCreateInput(unit: UnitState): CreateUnitInput {
  return {
    id: unit.id,
    name: unit.name,
    faction: unit.faction,
    baseAggro: unit.baseAggro,
    taunt: unit.taunt,
    level: unit.level,
    hp: unit.hp,
    maxHp: unit.maxHp,
    stats: unit.stats,
    energy: unit.energy,
    maxEnergy: unit.maxEnergy,
    toughness: unit.toughness,
    weaknesses: unit.weaknesses,
    resistance: unit.resistance,
    statuses: unit.statuses,
    modifiers: unit.modifiers,
    dots: unit.dots,
    shields: unit.shields,
    damageReductions: unit.damageReductions,
    equipment: unit.equipment,
    custom: unit.custom,
    nextActionAt: unit.nextActionAt,
  };
}

async function createReplayKernel(replay: Awaited<ReturnType<typeof decodeCompressedReplay>>, units: readonly UnitState[]): Promise<{ kernel: BattleKernel; options?: ReplayVerificationOptions }> {
  if (replay.metadata?.scenarioId) {
    const definition = await loadScenarioDefinition(replay.metadata.scenarioId);
    const scenario = createScenarioFromDefinition(definition, units.filter((unit) => unit.faction === 'ally').map(unitToCreateInput));
    const enemyDefinitions = scenario.definition.waves.flatMap((wave) => wave.enemies);
    const enemyRules = createRuleCatalog(Object.fromEntries(enemyDefinitions.map((enemy) => [enemy.id, enemyToRules(enemy)])));
    const equipmentCatalog = await loadPinnedEquipment();
    const characterIds = replay.metadata.characterIds ?? [];
    if (characterIds.length > 0) {
      const pinned = await loadPinnedCharacters();
      const selected = characterIds.map((id) => pinned.find((character) => character.id === id)).filter((character): character is CharacterData => character !== undefined);
      return createReplayContext(
        await createScenarioKernel(mergeRuleCatalogs(createContentCatalog(selected), enemyRules, createEquipmentRules(equipmentCatalog, units)), replay.metadata.scenarioId.startsWith('turnbased-stage-')),
        scenario,
      );
    }
    return createReplayContext(
      await createScenarioKernel(mergeRuleCatalogs(createTrainingCatalog(), enemyRules, createEquipmentRules(equipmentCatalog, units)), replay.metadata.scenarioId.startsWith('turnbased-stage-')),
      scenario,
    );
  }
  const characterId = replay.metadata?.characterId;
  if (!characterId) return { kernel: createTrainingKernel(units) };
  const character = (await loadPinnedCharacters()).find((candidate) => candidate.id === characterId);
  if (!character) throw new Error(`Pinned replay character is unavailable: ${characterId}`);
  const equipmentCatalog = await loadPinnedEquipment();
  return { kernel: new BattleKernel(mergeRuleCatalogs(
      createContentCatalog([character]),
      createEquipmentRules(equipmentCatalog, units),
    )) };
}

function createReplayContext(kernel: BattleKernel, scenario: ReturnType<typeof createScenarioFromDefinition>): { kernel: BattleKernel; options: ReplayVerificationOptions } {
  return {
    kernel,
    options: { advanceWave: (state) => advanceScenarioWave(scenario, state) },
  };
}

let pinnedCharactersPromise: Promise<CharacterData[]> | undefined;

async function loadPinnedCharacters(): Promise<CharacterData[]> {
  pinnedCharactersPromise ??= fetch(new URL(/* @vite-ignore */ '../data/direct-characters.json', import.meta.url))
    .then(async (response) => {
      if (!response.ok) throw new Error(`Pinned character catalog request failed: ${response.status}`);
      const records = await response.json() as unknown[];
      return records.map((record) => parseCharacterData(record));
    });
  return pinnedCharactersPromise;
}

let pinnedEquipmentPromise: Promise<ReturnType<typeof createEquipmentCatalog>> | undefined;
let pinnedTurnBasedPromise: Promise<{ breakDamage: TurnBasedBreakDamageTable; scenarios: ScenarioDefinition[] }> | undefined;

async function loadPinnedEquipment(): Promise<ReturnType<typeof createEquipmentCatalog>> {
  pinnedEquipmentPromise ??= Promise.all([
    fetch(new URL(/* @vite-ignore */ '../data/light-cone-catalog.json', import.meta.url)).then(async (response) => {
      if (!response.ok) throw new Error(`Pinned light-cone catalog request failed: ${response.status}`);
      return (await response.json() as unknown[]).map((record) => LightConeDataSchema.parse(record));
    }),
    fetch(new URL(/* @vite-ignore */ '../data/relic-set-catalog.json', import.meta.url)).then(async (response) => {
      if (!response.ok) throw new Error(`Pinned relic-set catalog request failed: ${response.status}`);
      return (await response.json() as unknown[]).map((record) => RelicSetDataSchema.parse(record));
    }),
  ]).then(([lightCones, sets]) => createEquipmentCatalog({ lightCones, sets }));
  return pinnedEquipmentPromise;
}

async function createImportedEquipmentCatalog(relics: readonly RelicInstanceData[], requestedLightConeIds: readonly string[]) {
  if (relics.length === 0 && requestedLightConeIds.length === 0) return createEquipmentCatalog();
  const pinned = await loadPinnedEquipment();
  const knownSetIds = new Set(relics.map((relic) => relic.setId));
  const sets = [...knownSetIds].map((id) => RelicSetDataSchema.parse({
    id,
    name: `Imported set ${id}`,
    twoPiece: [],
    fourPiece: [],
    source: { kind: 'HSR-Scanner', revision: relics[0]?.source.revision ?? 'unknown' },
    coverage: 'abstracted',
  }));
  const availableLightCones = requestedLightConeIds
    .map((id) => pinned.lightCones.get(id))
    .filter((lightCone): lightCone is NonNullable<typeof lightCone> => lightCone !== undefined);
  return createEquipmentCatalog({
    lightCones: availableLightCones,
    relics,
    sets: [...pinned.sets.values(), ...sets],
  });
}

async function loadScenarioDefinition(scenarioId: string): Promise<ScenarioDefinition> {
  if (scenarioId.startsWith('turnbased-stage-')) {
    const data = await loadPinnedTurnBasedData();
    const definition = data.scenarios.find((candidate) => candidate.id === scenarioId);
    if (!definition) throw new Error(`TurnBased 场景不存在：${scenarioId}`);
    return definition;
  }
  const response = await fetch(`/data/scenarios/${encodeURIComponent(scenarioId)}.json`);
  if (!response.ok) throw new Error(`场景 fixture 加载失败：${response.status}`);
  return ScenarioDefinitionSchema.parse(await response.json());
}

async function loadPinnedTurnBasedData(): Promise<{ breakDamage: TurnBasedBreakDamageTable; scenarios: ScenarioDefinition[] }> {
  pinnedTurnBasedPromise ??= Promise.all([
    fetch('/data/turnbased/break-damage.json').then(async (response) => {
      if (!response.ok) throw new Error(`TurnBased 破韧表加载失败：${response.status}`);
      return await response.json() as TurnBasedBreakDamageTable;
    }),
    fetch('/data/turnbased/scenario-catalog.json').then(async (response) => {
      if (!response.ok) throw new Error(`TurnBased 场景目录加载失败：${response.status}`);
      return (await response.json() as unknown[]).map((record) => ScenarioDefinitionSchema.parse(record));
    }),
  ]).then(([breakDamage, scenarios]) => ({ breakDamage, scenarios }));
  return pinnedTurnBasedPromise;
}

async function createScenarioKernel(rules: ReturnType<typeof createRuleCatalog>, useTurnBasedBreakTable: boolean): Promise<BattleKernel> {
  if (!useTurnBasedBreakTable) return new BattleKernel(rules);
  const { breakDamage } = await loadPinnedTurnBasedData();
  return new BattleKernel(rules, 'expected', {
    breakLevelMultiplier: (level) => resolveTurnBasedBreakDamage(breakDamage, level),
    breakBaseDamage: (level, element) => resolveTurnBasedBreakDamage(breakDamage, level) * breakElementMultiplier(element),
  });
}

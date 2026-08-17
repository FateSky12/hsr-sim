import { EnemyDataSchema, type Element, type EnemyData, type ScenarioDefinition, type ScenarioMode } from './schema.js';

export interface TurnBasedBreakDamageTable {
  source: { kind: 'TurnBasedGameData'; revision: string };
  levels: number[];
}

export interface TurnBasedEnemyCatalogInput {
  monsters: unknown;
  templates: unknown;
  textMap?: unknown;
}

export interface TurnBasedEnemyCatalogOptions {
  revision: string;
  level?: number;
  includeMonsterIds?: readonly (string | number)[];
}

export interface TurnBasedScenarioCatalogInput extends TurnBasedEnemyCatalogInput {
  stages: unknown;
}

export interface TurnBasedScenarioCatalogOptions extends TurnBasedEnemyCatalogOptions {
  stageIds: readonly (string | number)[];
  version?: string;
  defaultMode?: ScenarioMode;
  modeByStage?: Readonly<Record<string, ScenarioMode>>;
  scoring?: ScenarioDefinition['scoring'];
}

/**
 * Convert the client's level-indexed break base table into a sparse-safe
 * resolver table. The client dump contains levels 1..100 and a level-120
 * entry; missing levels are intentionally left as zero and resolved to the
 * nearest lower available level instead of being silently interpolated.
 */
export function parseTurnBasedBreakDamageTable(
  value: unknown,
  options: { revision: string },
): TurnBasedBreakDamageTable {
  const records = asRecords(value);
  const entries = records.flatMap((record) => {
    const level = readNumber(record.Level);
    const amount = readNumber(readRecord(record.BreakBaseDamage)?.Value);
    return level !== undefined && amount !== undefined && level > 0 && amount >= 0
      ? [{ level: Math.floor(level), amount }]
      : [];
  });
  if (entries.length === 0) throw new Error('TurnBased break-damage table contains no usable levels');
  const maxLevel = Math.max(...entries.map((entry) => entry.level));
  const levels = Array.from({ length: maxLevel + 1 }, () => 0);
  for (const entry of entries) levels[entry.level] = entry.amount;
  return { source: { kind: 'TurnBasedGameData', revision: options.revision }, levels };
}

export function resolveTurnBasedBreakDamage(table: Pick<TurnBasedBreakDamageTable, 'levels'>, level: number): number {
  const requested = Math.max(1, Math.floor(level));
  const clamped = Math.min(requested, table.levels.length - 1);
  for (let index = clamped; index >= 1; index -= 1) {
    const value = table.levels[index];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  }
  throw new Error(`Break-damage table has no value for level ${level}`);
}

/**
 * Compile the raw monster/template pair into the simulator's portable enemy
 * schema. Template values are the source values and the MonsterConfig ratio
 * modifiers are preserved; stage level scaling and executable enemy skills
 * remain explicit abstracted seams rather than guessed formulas.
 */
export function parseTurnBasedEnemyCatalog(
  input: TurnBasedEnemyCatalogInput,
  options: TurnBasedEnemyCatalogOptions,
): EnemyData[] {
  const templates = new Map(asRecords(input.templates).flatMap((record) => {
    const id = readId(record.MonsterTemplateID);
    return id ? [[id, record] as const] : [];
  }));
  const requested = options.includeMonsterIds === undefined
    ? undefined
    : new Set(options.includeMonsterIds.map(String));
  const textMap = asTextMap(input.textMap);
  const level = Math.max(1, Math.floor(options.level ?? 80));

  return asRecords(input.monsters).flatMap((monster) => {
    const id = readId(monster.MonsterID);
    if (!id || (requested && !requested.has(id))) return [];
    const templateId = readId(monster.MonsterTemplateID);
    const template = templateId ? templates.get(templateId) : undefined;
    if (!template) return [];
    const hp = multiplyRatio(readNumber(readRecord(template.HPBase)?.Value) ?? readNumber(template.HPBase), readRecord(monster.HPModifyRatio));
    const atk = multiplyRatio(readNumber(readRecord(template.AttackBase)?.Value) ?? readNumber(template.AttackBase), readRecord(monster.AttackModifyRatio));
    const def = multiplyRatio(readNumber(readRecord(template.DefenceBase)?.Value) ?? readNumber(template.DefenceBase), readRecord(monster.DefenceModifyRatio));
    // Some multi-phase boss templates intentionally omit a normal speed or
    // stance base and obtain it from a phase-specific config. Keep the source
    // record importable with conservative zero/100 fallbacks; coverage stays
    // abstracted so these values cannot be mistaken for client calibration.
    const spdBase = readNumber(readRecord(template.SpeedBase)?.Value) ?? readNumber(template.SpeedBase) ?? 100;
    const toughnessBase = readNumber(readRecord(template.StanceBase)?.Value) ?? readNumber(template.StanceBase) ?? 0;
    const spd = multiplyRatio(spdBase, readRecord(monster.SpeedModifyRatio));
    const toughness = multiplyRatio(toughnessBase, readRecord(monster.StanceModifyRatio));
    if (hp === undefined || hp <= 0 || atk === undefined || def === undefined || spd === undefined || spd <= 0 || toughness === undefined) return [];

    const skillIds = readIdArray(monster.SkillList);
    const patternIds = readSkillSequence(monster.OverrideAISkillSequence);
    const rawPattern = patternIds.length > 0 ? patternIds : readSkillSequence(template.AISkillSequence);
    const rank = mapRank(template.Rank);
    const enemy = EnemyDataSchema.parse({
      id,
      name: resolveText(monster.MonsterName, textMap) ?? resolveText(template.MonsterName, textMap) ?? `Monster ${id}`,
      level,
      rank,
      hp,
      atk,
      def,
      spd,
      toughness,
      weaknesses: readElements(monster.StanceWeakList),
      resistance: readResistance(monster.DamageTypeResistance),
      // The client skill IDs are preserved for a later L2/L3 converter. An
      // executable fallback is deliberately not manufactured from a skill
      // description whose coefficients are not present in this table.
      behavior: { pattern: ['basic'], phases: [] },
      sourceIds: {
        monsterId: id,
        monsterTemplateId: templateId,
        skillIds: [...new Set([...skillIds, ...rawPattern])],
      },
      source: { kind: 'TurnBasedGameData', revision: options.revision },
      coverage: 'abstracted',
    });
    return [enemy];
  });
}

/**
 * Compile selected StageConfig records into explicit wave definitions. Stage
 * records are selected by ID on purpose: the upstream dump contains many
 * story, test, tutorial, and historical stages that should not be exposed as
 * current scenario choices by accident.
 */
export function parseTurnBasedScenarioCatalog(
  input: TurnBasedScenarioCatalogInput,
  options: TurnBasedScenarioCatalogOptions,
): ScenarioDefinition[] {
  const stageRecords = new Map(asRecords(input.stages).flatMap((record) => {
    const id = readId(record.StageID);
    return id ? [[id, record] as const] : [];
  }));
  const selected = options.stageIds.map(String).map((id) => {
    const stage = stageRecords.get(id);
    if (!stage) throw new Error(`Missing TurnBased stage ${id}`);
    return { id, stage };
  });
  const referencedMonsterIds = [...new Set(selected.flatMap(({ stage }) => readStageMonsterIds(stage)))];
  const level = Math.max(...selected.map(({ stage }) => Math.max(1, Math.floor(readNumber(stage.Level) ?? options.level ?? 80))));
  const enemies = parseTurnBasedEnemyCatalog(input, {
    ...options,
    level,
    includeMonsterIds: referencedMonsterIds,
  });
  const enemyById = new Map(enemies.map((enemy) => [enemy.id, enemy]));
  const textMap = asTextMap(input.textMap);

  return selected.map(({ id, stage }) => {
    const waves = readMonsterWaves(stage).map((monsterIds, waveIndex) => ({
      id: `wave-${waveIndex + 1}`,
      enemies: monsterIds.map((monsterId, slot) => {
        const base = enemyById.get(monsterId);
        if (!base) throw new Error(`Stage ${id} references missing monster ${monsterId}`);
        return {
          ...base,
          id: `${base.id}@${id}:w${waveIndex + 1}:${slot + 1}`,
        };
      }),
    }));
    if (waves.length === 0) throw new Error(`TurnBased stage ${id} contains no monster waves`);
    const mode = options.modeByStage?.[id] ?? options.defaultMode ?? 'memory_of_chaos';
    return {
      id: `turnbased-stage-${id}`,
      name: resolveText(stage.StageName, textMap) ?? `Stage ${id}`,
      mode,
      version: options.version ?? '4.4',
      totalWaves: waves.length,
      enemies: [],
      waves,
      scoring: options.scoring ?? {
        cycleBudget: mode === 'pure_fiction' ? 5 : 30,
        damageWeight: mode === 'pure_fiction' ? 0.001 : 0,
        breakWeight: 100,
        breakDamageWeight: 0.001,
        killWeight: mode === 'pure_fiction' ? 1000 : 100,
        waveWeight: 1000,
        clearBonus: 10000,
      },
      source: { kind: 'TurnBasedGameData', revision: options.revision },
      coverage: 'abstracted',
    } satisfies ScenarioDefinition;
  });
}

function readStageMonsterIds(stage: Record<string, unknown>): string[] {
  return readMonsterWaves(stage).flat();
}

function readMonsterWaves(stage: Record<string, unknown>): string[][] {
  const raw = Array.isArray(stage.MonsterList) ? stage.MonsterList : [];
  return raw.map((wave) => {
    if (wave === null || typeof wave !== 'object' || Array.isArray(wave)) return [];
    return Object.entries(wave as Record<string, unknown>)
      .filter(([key]) => /^Monster\d+$/i.test(key))
      .sort(([left], [right]) => Number(left.replace(/\D/g, '')) - Number(right.replace(/\D/g, '')))
      .flatMap(([, value]) => {
        const id = readId(value);
        return id ? [id] : [];
      });
  }).filter((wave) => wave.length > 0);
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value)) return Object.values(value).filter(isRecord);
  throw new Error('TurnBased source must be an array or object map');
}

function asTextMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, text]) => typeof text === 'string' ? [[key, text]] : []));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function readId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  return undefined;
}

function readNumber(value: unknown): number | undefined {
  const candidate = isRecord(value) ? value.Value : value;
  const number = typeof candidate === 'number' ? candidate : typeof candidate === 'string' && candidate.trim() !== '' ? Number(candidate) : undefined;
  return typeof number === 'number' && Number.isFinite(number) ? number : undefined;
}

function multiplyRatio(base: number | undefined, ratio: unknown): number | undefined {
  if (base === undefined) return undefined;
  const modifier = readNumber(ratio) ?? 1;
  return base * modifier;
}

function readIdArray(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => {
    const id = readId(item);
    return id ? [id] : [];
  }) : [];
}

function readSkillSequence(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    return Object.values(item).flatMap((candidate) => {
      const id = readId(candidate);
      return id ? [id] : [];
    });
  });
}

function readHash(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return readId(value.Hash);
}

function resolveText(value: unknown, textMap: Record<string, string>): string | undefined {
  const hash = readHash(value);
  const text = hash ? textMap[hash] : undefined;
  if (typeof text !== 'string' || text.trim().length === 0) return undefined;
  return text.replace(/<[^>]+>/g, '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function readElements(value: unknown): Element[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((item) => {
    const element = mapElement(item);
    return element ? [element] : [];
  }))];
}

function readResistance(value: unknown): Record<Element, number> {
  const resistance: Record<Element, number> = {
    physical: 0,
    fire: 0,
    ice: 0,
    lightning: 0,
    wind: 0,
    quantum: 0,
    imaginary: 0,
  };
  if (!Array.isArray(value)) return resistance;
  for (const item of value) {
    if (!isRecord(item)) continue;
    const element = mapElement(item.DamageType);
    const amount = readNumber(item.Value);
    if (element && amount !== undefined) resistance[element] = amount;
  }
  return resistance;
}

function mapElement(value: unknown): Element | undefined {
  if (typeof value !== 'string') return undefined;
  switch (value.trim().toLowerCase()) {
    case 'physical': return 'physical';
    case 'fire': return 'fire';
    case 'ice': return 'ice';
    case 'thunder':
    case 'lightning': return 'lightning';
    case 'wind': return 'wind';
    case 'quantum': return 'quantum';
    case 'imaginary': return 'imaginary';
    default: return undefined;
  }
}

function mapRank(value: unknown): EnemyData['rank'] {
  if (typeof value !== 'string') return 'normal';
  if (/boss/i.test(value)) return 'boss';
  if (/elite/i.test(value)) return 'elite';
  return 'normal';
}

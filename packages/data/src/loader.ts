import { z } from 'zod';
import { CharacterDataSchema, EnemyDataSchema, type CharacterData, type EnemyData, type Element } from './schema.js';
import { RelicInstanceDataSchema, type RelicInstanceData, type EquipmentStat, type RelicSlot } from './schema.js';

export const DataManifestSchema = z.object({
  schemaVersion: z.literal(1),
  sourceKind: z.string(),
  revision: z.string().min(1),
  // A source Git revision is mandatory. Some upstream snapshots do not carry
  // a client-version label, so that field is optional rather than guessed.
  clientVersion: z.string().min(1).optional(),
  fetchedAt: z.string().datetime().optional(),
});

export type DataManifest = z.infer<typeof DataManifestSchema>;

export function parseCharacterData(value: unknown): CharacterData {
  return CharacterDataSchema.parse(value);
}

export function parseEnemyData(value: unknown): EnemyData {
  return EnemyDataSchema.parse(value);
}

/** Normalize the plan's editable enemy JSON aliases into the engine schema. */
export function parseEnemyConfig(value: unknown, options: { sourceRevision: string }): EnemyData {
  if (!isRecord(value)) throw new Error('Enemy config must be an object');
  const id = readString(value.id ?? value.name, 'enemy');
  const rawResistance = isRecord(value.resistance) ? value.resistance : {};
  const rawOverrides = isRecord(value.resOverrides) ? value.resOverrides : {};
  const resistance = defaultResistance();
  for (const element of Object.keys(resistance) as Element[]) {
    const candidate = rawResistance[element] ?? rawOverrides[element];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) resistance[element] = candidate;
  }
  return EnemyDataSchema.parse({
    id,
    name: readString(value.name, id),
    level: readNumber(value.level, `${id} level`),
    hp: readNumber(value.hp, `${id} hp`),
    atk: typeof value.atk === 'number' ? value.atk : 0,
    def: readNumber(value.def ?? value.defBase, `${id} def`),
    spd: readNumber(value.spd, `${id} speed`),
    toughness: readNumber(value.toughness ?? value.maxToughness, `${id} toughness`),
    weaknesses: value.weaknesses ?? [],
    resistance,
    abilities: value.abilities,
    behavior: value.behavior,
    source: { kind: 'enemy-config', revision: options.sourceRevision },
    coverage: 'abstracted',
  });
}

export function assertRevision(manifest: DataManifest, revision: string): void {
  if (manifest.revision !== revision) {
    throw new Error(`Data revision mismatch: expected ${revision}, got ${manifest.revision}`);
  }
}

export interface ScannerRelicImportOptions {
  setIdByName: Readonly<Record<string, string>>;
  sourceRevision: string;
}

export interface ScannerExportImportOptions extends ScannerRelicImportOptions {}

export interface ScannerExportImportResult {
  relics: RelicInstanceData[];
  lightConeIds: string[];
  characterIds: string[];
  metadata: Record<string, unknown>;
  sourceRevision: string;
}

/** Parse the official top-level HSR-Scanner v4 export without retaining UID/account secrets. */
export function parseScannerExport(input: unknown, options: ScannerExportImportOptions): ScannerExportImportResult {
  if (!isRecord(input)) throw new Error('Scanner export must be an object');
  const relics = parseScannerRelics(input, options);
  const lightConeIds = Array.isArray(input.light_cones)
    ? input.light_cones.filter(isRecord).map((value) => readIdentifier(value.id ?? value._uid)).filter(Boolean)
    : [];
  const characterIds = Array.isArray(input.characters)
    ? input.characters.filter(isRecord).map((value) => readIdentifier(value.id)).filter(Boolean)
    : [];
  const rawMetadata = isRecord(input.metadata) ? input.metadata : {};
  const metadata = Object.fromEntries(Object.entries(rawMetadata).filter(([key]) => key !== 'uid'));
  return { relics, lightConeIds, characterIds, metadata, sourceRevision: options.sourceRevision };
}

export function parseScannerRelics(input: unknown, options: ScannerRelicImportOptions): RelicInstanceData[] {
  if (!isRecord(input) || !Array.isArray(input.relics)) throw new Error('Scanner export must contain a relics array');
  const seen = new Set<string>();
  return input.relics.map((raw, index) => {
    if (!isRecord(raw)) throw new Error(`Invalid relic at index ${index}`);
    const id = readIdentifier(raw.id ?? raw._uid, `scanner-relic-${index}`);
    if (seen.has(id)) throw new Error(`Duplicate relic ID: ${id}`);
    seen.add(id);
    const setId = readScannerSetId(raw, options, index);
    const slot = normalizeRelicSlot(readString(raw.slot));
    const level = readNumber(raw.level, `relic ${id} level`);
    const rarity = typeof raw.rarity === 'number' ? raw.rarity : 5;
    const main = readStatValue(raw.main ?? raw.mainStat ?? raw.mainstat, 'mainStat', { main: true, slot, level, rarity });
    const substats = raw.substats ?? raw.subStats;
    if (!Array.isArray(substats)) throw new Error(`Relic ${id} has no substats array`);
    return RelicInstanceDataSchema.parse({
      id,
      slot,
      setId,
      mainStat: main,
      subStats: substats.map((value, subIndex) => readStatValue(value, `subStats[${subIndex}]`)),
      level,
      source: { kind: 'HSR-Scanner', revision: options.sourceRevision },
      coverage: 'abstracted',
    });
  });
}

function readScannerSetId(raw: Record<string, unknown>, options: ScannerRelicImportOptions, index: number): string {
  const explicitId = raw.setId ?? raw.set_id;
  if (explicitId !== undefined) return readIdentifier(explicitId, `relic ${index} setId`);

  if (isRecord(raw.set)) {
    const nestedId = raw.set.id ?? raw.set.setId ?? raw.set.set_id;
    if (nestedId !== undefined) return readIdentifier(nestedId, `relic ${index} set.id`);
  }

  const setName = typeof raw.set === 'string'
    ? raw.set
    : isRecord(raw.set) && typeof raw.set.name === 'string'
      ? raw.set.name
      : undefined;
  if (setName) {
    const setId = options.setIdByName[setName];
    if (setId) return setId;
  }
  throw new Error(`Unknown relic set at index ${index}${setName ? `: ${setName}` : ''}`);
}

function readStatValue(value: unknown, field: string, context: { main?: boolean; slot?: RelicSlot; level?: number; rarity?: number } = {}): { stat: EquipmentStat; value: number } {
  const key = typeof value === 'string'
    ? value
    : isRecord(value)
      ? readString(value.key ?? value.stat)
      : (() => { throw new Error(`Invalid ${field}`); })();
  const stat = normalizeEquipmentStat(key);
  const rawValue = isRecord(value) ? value.value : undefined;
  if (rawValue === undefined) {
    if (!context.main || !context.slot || context.level === undefined) throw new Error(`Invalid ${field}: a numeric value is required for substats`);
    return { stat, value: resolveScannerMainStat(stat, context.slot, context.level, context.rarity ?? 5) };
  }
  return { stat, value: normalizeScannerStatValue(stat, readNumber(rawValue, `${field} value`)) };
}

function normalizeRelicSlot(value: string): 'head' | 'hands' | 'body' | 'feet' | 'planar_sphere' | 'link_rope' {
  switch (value.toUpperCase()) {
    case 'HEAD': return 'head';
    case 'HANDS': return 'hands';
    case 'BODY': return 'body';
    case 'FEET': return 'feet';
    case 'PLANAR_SPHERE':
    case 'PLANAR SPHERE':
    case 'SPHERE': return 'planar_sphere';
    case 'LINK_ROPE':
    case 'LINK ROPE':
    case 'ROPE': return 'link_rope';
    default: throw new Error(`Unknown relic slot: ${value}`);
  }
}

function normalizeEquipmentStat(value: string): EquipmentStat {
  const trimmed = value.trim().toUpperCase();
  const explicitPercent = trimmed.endsWith('_') || trimmed.includes('%');
  const normalized = trimmed.replace(/_$/, '').replaceAll('_', ' ');
  switch (normalized) {
    case 'HP': return explicitPercent ? 'HPPercent' : 'HP';
    case 'HP%':
    case 'HP PERCENT': return 'HPPercent';
    case 'ATK': return explicitPercent ? 'ATKPercent' : 'ATK';
    case 'ATK%':
    case 'ATK PERCENT': return 'ATKPercent';
    case 'DEF': return explicitPercent ? 'DEFPercent' : 'DEF';
    case 'DEF%':
    case 'DEF PERCENT': return 'DEFPercent';
    case 'SPD': return 'SPD';
    case 'SPD%':
    case 'SPD PERCENT': return 'SPDPercent';
    case 'CRIT RATE':
    case 'CRIT RATE%':
    case 'CRITRATE': return 'CritRate';
    case 'CRIT DMG':
    case 'CRIT DAMAGE':
    case 'CRITDMG': return 'CritDmg';
    case 'BREAK EFFECT':
    case 'BREAKEFFECT': return 'BreakEffect';
    case 'EFFECT HIT RATE':
    case 'EFFECTHITRATE': return 'EffectHitRate';
    case 'EFFECT RES':
    case 'EFFECTRES': return 'EffectRes';
    case 'ENERGY REGEN':
    case 'ENERGY REGENERATION':
    case 'ENERGY REGENERATION RATE':
    case 'ENERGY REGEN RATE':
    case 'ERR': return 'EnergyRegen';
    case 'OUTGOING HEALING':
    case 'OUTGOING HEALING BOOST':
    case 'HEAL BOOST':
    case 'HEALING BONUS': return 'HealBoost';
    case 'DMG%':
    case 'DMG BOOST':
    case 'ALL TYPE DMG': return 'DmgBoostAll';
    case 'PHYSICAL DMG':
    case 'PHYSICAL DAMAGE':
    case 'PHYSICAL DMG BOOST': return 'DmgBoostPhysical';
    case 'FIRE DMG':
    case 'FIRE DAMAGE':
    case 'FIRE DMG BOOST': return 'DmgBoostFire';
    case 'ICE DMG':
    case 'ICE DAMAGE':
    case 'ICE DMG BOOST': return 'DmgBoostIce';
    case 'LIGHTNING DMG':
    case 'LIGHTNING DAMAGE':
    case 'LIGHTNING DMG BOOST':
    case 'THUNDER DMG': return 'DmgBoostLightning';
    case 'WIND DMG':
    case 'WIND DAMAGE':
    case 'WIND DMG BOOST': return 'DmgBoostWind';
    case 'QUANTUM DMG':
    case 'QUANTUM DAMAGE':
    case 'QUANTUM DMG BOOST': return 'DmgBoostQuantum';
    case 'IMAGINARY DMG':
    case 'IMAGINARY DAMAGE':
    case 'IMAGINARY DMG BOOST': return 'DmgBoostImaginary';
    default: throw new Error(`Unknown equipment stat: ${value}`);
  }
}

interface MainStatFormula { stat: EquipmentStat; base: number; step: number }

const FIVE_STAR_MAIN_STATS: Record<RelicSlot, readonly MainStatFormula[]> = {
  head: [{ stat: 'HP', base: 112.896, step: 39.5136 }],
  hands: [{ stat: 'ATK', base: 56.448, step: 19.7568 }],
  body: [
    { stat: 'HPPercent', base: 0.06912, step: 0.024192 },
    { stat: 'ATKPercent', base: 0.06912, step: 0.024192 },
    { stat: 'DEFPercent', base: 0.0864, step: 0.03024 },
    { stat: 'CritRate', base: 0.05184, step: 0.018144 },
    { stat: 'CritDmg', base: 0.10368, step: 0.036288 },
    { stat: 'HealBoost', base: 0.055296, step: 0.019354 },
    { stat: 'EffectHitRate', base: 0.06912, step: 0.024192 },
  ],
  feet: [
    { stat: 'HPPercent', base: 0.06912, step: 0.024192 },
    { stat: 'ATKPercent', base: 0.06912, step: 0.024192 },
    { stat: 'DEFPercent', base: 0.0864, step: 0.03024 },
    { stat: 'SPD', base: 4.032, step: 1.4 },
  ],
  planar_sphere: [
    { stat: 'HPPercent', base: 0.06912, step: 0.024192 },
    { stat: 'ATKPercent', base: 0.06912, step: 0.024192 },
    { stat: 'DEFPercent', base: 0.0864, step: 0.03024 },
    { stat: 'DmgBoostPhysical', base: 0.062208, step: 0.021773 },
    { stat: 'DmgBoostFire', base: 0.062208, step: 0.021773 },
    { stat: 'DmgBoostIce', base: 0.062208, step: 0.021773 },
    { stat: 'DmgBoostLightning', base: 0.062208, step: 0.021773 },
    { stat: 'DmgBoostWind', base: 0.062208, step: 0.021773 },
    { stat: 'DmgBoostQuantum', base: 0.062208, step: 0.021773 },
    { stat: 'DmgBoostImaginary', base: 0.062208, step: 0.021773 },
  ],
  link_rope: [
    { stat: 'HPPercent', base: 0.06912, step: 0.024192 },
    { stat: 'ATKPercent', base: 0.06912, step: 0.024192 },
    { stat: 'DEFPercent', base: 0.0864, step: 0.03024 },
    { stat: 'BreakEffect', base: 0.10368, step: 0.036288 },
    { stat: 'EnergyRegen', base: 0.031104, step: 0.010886 },
  ],
};

function resolveScannerMainStat(stat: EquipmentStat, slot: RelicSlot, level: number, rarity: number): number {
  const formula = FIVE_STAR_MAIN_STATS[slot].find((candidate) => candidate.stat === stat);
  if (!formula) throw new Error(`Unsupported main stat ${stat} for relic slot ${slot}`);
  const rarityScale = rarity >= 5 ? 1 : Math.max(0.5, rarity / 5);
  return (formula.base + formula.step * Math.max(0, Math.min(15, level))) * rarityScale;
}

function normalizeScannerStatValue(stat: EquipmentStat, value: number): number {
  const rateStats = new Set<EquipmentStat>([
    'HPPercent', 'ATKPercent', 'DEFPercent', 'CritRate', 'CritDmg', 'BreakEffect', 'EffectHitRate', 'EffectRes', 'EnergyRegen', 'HealBoost',
    'DmgBoostAll', 'DmgBoostPhysical', 'DmgBoostFire', 'DmgBoostIce', 'DmgBoostLightning', 'DmgBoostWind', 'DmgBoostQuantum', 'DmgBoostImaginary', 'ResPen',
  ]);
  return rateStats.has(stat) && Math.abs(value) > 1 ? Math.round((value / 100) * 1e12) / 1e12 : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown, fallback?: string): string {
  if (typeof value === 'string' && value.length > 0) return value;
  if (fallback !== undefined) return fallback;
  throw new Error('Expected non-empty string');
}

function readIdentifier(value: unknown, fallback?: string): string {
  if (typeof value === 'number' && Number.isInteger(value)) return String(value);
  return readString(value, fallback);
}

function readNumber(value: unknown, field: string): number {
  const result = typeof value === 'string' ? Number(value) : value;
  if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error(`Invalid number for ${field}`);
  return result;
}

function defaultResistance(): Record<Element, number> {
  return {
    physical: 0.2,
    fire: 0.2,
    ice: 0.2,
    lightning: 0.2,
    wind: 0.2,
    quantum: 0.2,
    imaginary: 0.2,
  };
}

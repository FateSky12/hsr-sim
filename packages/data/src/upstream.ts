import { z } from 'zod';
import { CharacterDataSchema, LightConeDataSchema, RelicSetDataSchema, type AbilityData, type CharacterData, type EquipmentPassive, type LightConeData } from './schema.js';

const UpstreamCharacterEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  tag: z.string(),
  rarity: z.number().int(),
  path: z.string(),
  element: z.string(),
  max_sp: z.number().int().positive(),
  ranks: z.array(z.string()),
  skills: z.array(z.string()),
  skill_trees: z.array(z.string()),
  icon: z.string(),
});

export interface CharacterIndexRecord {
  id: string;
  name: string;
  tag: string;
  rarity: number;
  path: string;
  element: string;
  maxEnergy: number;
  ranks: string[];
  skills: string[];
  skillTrees: string[];
  icon: string;
  source: { kind: 'StarRailRes'; revision: string };
  coverage: 'unsupported';
}

export interface LightConeIndexRecord {
  id: string;
  name: string;
  rarity: number;
  path: string;
  description: string;
  icon: string;
  source: { kind: 'StarRailRes'; revision: string };
  coverage: 'unsupported';
}

export interface RelicIndexRecord {
  id: string;
  setId: string;
  name: string;
  rarity: number;
  slot: string;
  maxLevel: number;
  mainAffixId: string;
  subAffixId: string;
  icon: string;
  source: { kind: 'StarRailRes'; revision: string };
  coverage: 'unsupported';
}

export interface RelicSetIndexRecord {
  id: string;
  name: string;
  descriptions: string[];
  properties: unknown[][];
  icon: string;
  source: { kind: 'StarRailRes'; revision: string };
  coverage: 'unsupported';
}

export type CharacterAbilityCoverage = 'direct' | 'compiled' | 'unsupported' | 'missing';

export interface CharacterCoverageRecord {
  id: string;
  name: string;
  basic: 'present' | 'missing';
  skill: CharacterAbilityCoverage;
  ultimate: CharacterAbilityCoverage;
}

export interface CharacterCoverageReport {
  source: { kind: 'StarRailRes'; revision: string };
  totalCharacters: number;
  basicCharacters: number;
  directSkillCharacters: number;
  directUltimateCharacters: number;
  compiledSkillCharacters: number;
  compiledUltimateCharacters: number;
  effectCounts: Record<string, number>;
  characters: CharacterCoverageRecord[];
}

export function parseStarRailResCharacterIndex(
  value: unknown,
  options: { revision: string; language: string },
): CharacterIndexRecord[] {
  if (!options.revision) throw new Error('StarRailRes revision is required');
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Character index must be an object map');
  return Object.values(value).map((entry) => {
    const parsed = UpstreamCharacterEntrySchema.parse(entry);
    return {
      id: parsed.id,
      name: parsed.name,
      tag: parsed.tag,
      rarity: parsed.rarity,
      path: parsed.path,
      element: parsed.element,
      maxEnergy: parsed.max_sp,
      ranks: [...parsed.ranks],
      skills: [...parsed.skills],
      skillTrees: [...parsed.skill_trees],
      icon: parsed.icon,
      source: { kind: 'StarRailRes', revision: options.revision },
      coverage: 'unsupported',
    };
  });
}

export function parseStarRailResBasicCharacter(
  characterValue: unknown,
  promotionValue: unknown,
  basicSkillValue: unknown,
  options: { revision: string; level: number },
): CharacterData {
  const character = z.object({ id: z.string(), name: z.string(), path: z.string(), element: z.string(), max_sp: z.number().positive().nullable() }).parse(characterValue);
  const promotion = z.object({ values: z.array(z.record(z.string(), z.object({ base: z.number(), step: z.number() }))) }).parse(promotionValue);
  const skill = z.object({ id: z.string(), type: z.string(), element: z.string(), params: z.array(z.array(z.number())) }).parse(basicSkillValue);
  if (skill.type !== 'Normal') throw new Error(`Skill ${skill.id} is not a Normal attack`);
  const finalPromotion = promotion.values[promotion.values.length - 1];
  if (!finalPromotion) throw new Error(`Character ${character.id} has no promotion values`);
  const multiplier = skill.params[skill.params.length - 1]?.[0];
  if (multiplier === undefined) throw new Error(`Skill ${skill.id} has no multiplier`);
  const level = options.level;
  const stat = (key: string): number => {
    const value = finalPromotion[key];
    if (!value) throw new Error(`Character ${character.id} is missing ${key} promotion data`);
    return value.base + value.step * (level - 1);
  };
  return CharacterDataSchema.parse({
    id: character.id,
    name: character.name,
    path: character.path,
    element: normalizeElement(character.element),
    level,
    baseStats: { hp: stat('hp'), atk: stat('atk'), def: stat('def'), spd: stat('spd') },
    maxEnergy: character.max_sp ?? 100,
    abilities: [{
      id: 'basic',
      actionType: 'basic',
      spGain: 1,
      energyGain: 20,
      effects: [{ kind: 'dealDamage', multiplier, scaling: 'ATK', element: normalizeElement(skill.element), damageType: 'normal', toughnessDamage: 10, target: 'first_target' }],
    }],
    source: { kind: 'StarRailRes', revision: options.revision },
    coverage: 'abstracted',
  });
}

export function parseStarRailResBasicCharacterCatalog(
  input: { characters: unknown; promotions: unknown; skills: unknown },
  options: { revision: string; level: number },
): CharacterData[] {
  if (!isObjectMap(input.characters) || !isObjectMap(input.promotions) || !isObjectMap(input.skills)) throw new Error('StarRailRes character bundle must contain object maps');
  const characters = input.characters;
  const promotions = input.promotions;
  const skills = input.skills;
  return Object.values(characters).map((characterValue) => {
    const character = z.object({ skills: z.array(z.string()) }).parse(characterValue);
    const basicSkillId = character.skills.find((skillId) => {
      const skill = skills[skillId];
      return isRecord(skill) && skill.type === 'Normal';
    });
    if (!basicSkillId) throw new Error('Character has no Normal skill');
    const characterRecord = z.object({ id: z.string() }).parse(characterValue);
    const promotion = promotions[characterRecord.id];
    const skill = skills[basicSkillId];
    if (promotion === undefined || skill === undefined) throw new Error(`Missing source records for character ${characterRecord.id}`);
    return parseStarRailResBasicCharacter(characterValue, promotion, skill, options);
  });
}

export function parseStarRailResDirectCharacterCatalog(
  input: { characters: unknown; promotions: unknown; skills: unknown },
  options: { revision: string; level: number },
): CharacterData[] {
  if (!isObjectMap(input.characters) || !isObjectMap(input.promotions) || !isObjectMap(input.skills)) throw new Error('StarRailRes character bundle must contain object maps');
  const characters = input.characters;
  const promotions = input.promotions;
  const skills = input.skills;
  return Object.values(characters).map((characterValue) => {
    const character = z.object({ id: z.string(), skills: z.array(z.string()) }).parse(characterValue);
    const basicSkillId = character.skills.find((skillId) => isRecord(skills[skillId]) && skills[skillId].type === 'Normal');
    if (!basicSkillId || promotions[character.id] === undefined || skills[basicSkillId] === undefined) throw new Error(`Missing basic records for character ${character.id}`);
    const base = parseStarRailResBasicCharacter(characterValue, promotions[character.id], skills[basicSkillId], options);
    const abilities = [base.abilities[0]!];
    const skill = character.skills.find((skillId) => isRecord(skills[skillId]) && skills[skillId].type === 'BPSkill' && isSupportedAbility(skills[skillId]));
    const ultimate = character.skills.find((skillId) => isRecord(skills[skillId]) && skills[skillId].type === 'Ultra' && isSupportedAbility(skills[skillId]));
    if (skill) abilities.push(parseDirectAbility(skills[skill]!, 'skill', options.revision, 1));
    if (ultimate) {
      const characterInfo = z.object({ max_sp: z.number().positive().nullable() }).parse(characterValue);
      abilities.push(parseDirectAbility(skills[ultimate]!, 'ultimate', options.revision, characterInfo.max_sp ?? 100));
    }
    return { ...base, abilities };
  });
}

export function parseStarRailResCharacterCoverageReport(
  input: { characters: unknown; skills: unknown },
  options: { revision: string },
): CharacterCoverageReport {
  if (!isObjectMap(input.characters) || !isObjectMap(input.skills)) throw new Error('StarRailRes character coverage input must contain object maps');
  const characters = Object.values(input.characters).map((value) => z.object({ id: z.string(), name: z.string(), skills: z.array(z.string()) }).parse(value));
  const skills = input.skills;
  const effectCounts: Record<string, number> = {};
  for (const value of Object.values(skills)) {
    if (!isRecord(value) || (value.type !== 'BPSkill' && value.type !== 'Ultra') || typeof value.effect !== 'string') continue;
    effectCounts[value.effect] = (effectCounts[value.effect] ?? 0) + 1;
  }

  const records = characters.map((character): CharacterCoverageRecord => {
    const hasBasic = character.skills.some((skillId) => isRecord(skills[skillId]) && skills[skillId].type === 'Normal');
    return {
      id: character.id,
      name: character.name,
      basic: hasBasic ? 'present' : 'missing',
      skill: classifyCharacterAbility(character.skills, skills, 'BPSkill'),
      ultimate: classifyCharacterAbility(character.skills, skills, 'Ultra'),
    };
  });

  return {
    source: { kind: 'StarRailRes', revision: options.revision },
    totalCharacters: records.length,
    basicCharacters: records.filter((record) => record.basic === 'present').length,
    directSkillCharacters: records.filter((record) => record.skill === 'direct').length,
    directUltimateCharacters: records.filter((record) => record.ultimate === 'direct').length,
    compiledSkillCharacters: records.filter((record) => record.skill === 'direct' || record.skill === 'compiled').length,
    compiledUltimateCharacters: records.filter((record) => record.ultimate === 'direct' || record.ultimate === 'compiled').length,
    effectCounts,
    characters: records,
  };
}

export function parseStarRailResLightConeIndex(value: unknown, options: { revision: string }): LightConeIndexRecord[] {
  return parseRecordMap(value, options.revision, (entry) => ({
    id: readRequiredString(entry.id, 'light cone id'),
    name: readRequiredString(entry.name, 'light cone name'),
    rarity: readRequiredNumber(entry.rarity, 'light cone rarity'),
    path: readRequiredString(entry.path, 'light cone path'),
    description: readRequiredString(entry.desc, 'light cone description'),
    icon: readRequiredString(entry.icon, 'light cone icon'),
  }));
}

export function parseStarRailResLightConeData(
  index: LightConeIndexRecord,
  promotionValue: unknown,
  options: { revision: string; level: number },
): LightConeData {
  const promotion = z.object({ values: z.array(z.record(z.string(), z.object({ base: z.number(), step: z.number() }))) }).parse(promotionValue);
  const finalPromotion = promotion.values[promotion.values.length - 1];
  if (!finalPromotion) throw new Error(`Light cone ${index.id} has no promotion values`);
  const stat = (key: string): number => {
    const value = finalPromotion[key];
    if (!value) throw new Error(`Light cone ${index.id} is missing ${key} promotion data`);
    return value.base + value.step * (options.level - 1);
  };
  return LightConeDataSchema.parse({
    id: index.id,
    name: index.name,
    path: index.path,
    rarity: index.rarity,
    level: options.level,
    superimposition: 1,
    baseStats: { hp: stat('hp'), atk: stat('atk'), def: stat('def'), spd: 0 },
    staticStats: [],
    source: { kind: 'StarRailRes', revision: options.revision },
    coverage: 'unsupported',
  });
}

export function parseStarRailResLightConeCatalog(
  input: { index: unknown; promotions: unknown },
  options: { revision: string; level: number },
): LightConeData[] {
  const promotions = input.promotions;
  if (!isObjectMap(promotions)) throw new Error('StarRailRes light-cone promotions must be an object map');
  const indexes = parseStarRailResLightConeIndex(input.index, { revision: options.revision });
  return indexes.map((index) => {
    const promotion = promotions[index.id];
    if (promotion === undefined) throw new Error(`Missing light-cone promotion data for ${index.id}`);
    return parseStarRailResLightConeData(index, promotion, options);
  });
}

export function parseStarRailResRelicIndex(value: unknown, options: { revision: string }): RelicIndexRecord[] {
  return parseRecordMap(value, options.revision, (entry) => ({
    id: readRequiredString(entry.id, 'relic id'),
    setId: readRequiredString(entry.set_id, 'relic set id'),
    name: readRequiredString(entry.name, 'relic name'),
    rarity: readRequiredNumber(entry.rarity, 'relic rarity'),
    slot: readRequiredString(entry.type, 'relic slot'),
    maxLevel: readRequiredNumber(entry.max_level, 'relic max level'),
    mainAffixId: readRequiredString(entry.main_affix_id, 'relic main affix'),
    subAffixId: readRequiredString(entry.sub_affix_id, 'relic sub affix'),
    icon: readRequiredString(entry.icon, 'relic icon'),
  }));
}

export function parseStarRailResRelicSetIndex(value: unknown, options: { revision: string }): RelicSetIndexRecord[] {
  return parseRecordMap(value, options.revision, (entry) => ({
    id: readRequiredString(entry.id, 'relic set id'),
    name: readRequiredString(entry.name, 'relic set name'),
    descriptions: Array.isArray(entry.desc) ? entry.desc.map((description) => readRequiredString(description, 'relic description')) : [],
    properties: Array.isArray(entry.properties) ? entry.properties as unknown[][] : [],
    icon: readRequiredString(entry.icon, 'relic set icon'),
  }));
}

export function parseStarRailResRelicSetData(index: RelicSetIndexRecord, options: { revision: string }) {
  const convert = (propertyGroup: unknown[]): Array<{ stat: import('./schema.js').EquipmentStat; value: number }> => propertyGroup.flatMap((property) => {
    if (typeof property !== 'object' || property === null || Array.isArray(property)) return [];
    const entry = property as Record<string, unknown>;
    const stat = normalizeUpstreamProperty(entry.type);
    return stat && typeof entry.value === 'number' ? [{ stat, value: entry.value }] : [];
  });
  const twoPiece = convert(index.properties[0] ?? []);
  const fourPiece = convert(index.properties[1] ?? []);
  const passives = index.descriptions.slice(0, 2).flatMap((description, indexNumber) => {
    const passive = parseSimpleEquipmentPassive(description, `${index.id}:conditional:${indexNumber + 1}`);
    return passive ? [passive] : [];
  });
  return RelicSetDataSchema.parse({
    id: index.id,
    name: index.name,
    twoPiece,
    fourPiece,
    passives,
    source: { kind: 'StarRailRes', revision: options.revision },
    coverage: 'abstracted' as const,
  });
}

/**
 * Convert only a small, unambiguous subset of relic text into event hooks.
 * Conditions involving thresholds, summons, target debuffs, or "next attack"
 * semantics stay in the source description and are not silently approximated.
 */
function parseSimpleEquipmentPassive(description: string, id: string): EquipmentPassive | undefined {
  const trigger = /(?:after|when) the wearer uses (?:their )?Ultimate|after unleashing Ultimate/i.test(description)
    ? 'ULT_USED' as const
    : /(?:after|when) the wearer uses (?:their )?Skill/i.test(description)
      ? 'SKILL_USED' as const
      : /(?:after|when) the wearer uses (?:their )?Follow-Up ATK/i.test(description)
        ? 'FOLLOW_UP_USED' as const
        : undefined;
  if (!trigger) return undefined;
  const durationMatch = /for (\d+) turn\(s\)/i.exec(description);
  if (!durationMatch) return undefined;
  const duration = Number(durationMatch[1]);
  const modifier = parseEquipmentModifier(description);
  if (!modifier || !Number.isInteger(duration) || duration <= 0) return undefined;
  return {
    id,
    trigger,
    modifier,
    duration,
    target: /all allies|all ally targets/i.test(description) ? 'all_targets' : 'self',
    stacking: 'replace',
  };
}

function parseEquipmentModifier(description: string): EquipmentPassive['modifier'] | undefined {
  const match = /(?:increases?|boosts?)[^.\n]*?\b(ATK|SPD|CRIT DMG|Break Effect|DMG(?: dealt)?)\b[^.\n]*?by (\d+)%/i.exec(description)
    ?? /\b(ATK|SPD|CRIT DMG|Break Effect|DMG(?: dealt)?)\b[^.\n]*?(?:increases?|boosts?)[^.\n]*?by (\d+)%/i.exec(description);
  if (!match) return undefined;
  const value = Number(match[2]) / 100;
  const stat = match[1]!.toUpperCase().replace(/\s+/g, ' ');
  switch (stat) {
    case 'ATK': return { stat: 'ATKPercent', value };
    case 'SPD': return { stat: 'SPDPercent', value };
    case 'CRIT DMG': return { stat: 'CritDmg', value };
    case 'BREAK EFFECT': return { stat: 'BreakEffect', value };
    case 'DMG':
    case 'DMG DEALT': return { stat: 'DmgBoostAll', value };
    default: return undefined;
  }
}

export function parseStarRailResRelicSetCatalog(
  value: unknown,
  options: { revision: string },
) {
  return parseStarRailResRelicSetIndex(value, { revision: options.revision })
    .map((index) => parseStarRailResRelicSetData(index, options));
}

export function createStarRailResIndexUrl(revision: string, language: string, file: string): string {
  if (!revision) throw new Error('StarRailRes revision is required');
  if (!/^[a-z0-9._-]+$/i.test(language) || !/^[a-z0-9._-]+$/i.test(file)) throw new Error('Invalid StarRailRes path segment');
  return `https://raw.githubusercontent.com/Mar-7th/StarRailRes/${revision}/index_new/${language}/${file}`;
}

export async function fetchStarRailResCharacterIndex(
  revision: string,
  language: string,
  fetcher: typeof fetch = fetch,
): Promise<CharacterIndexRecord[]> {
  const response = await fetcher(createStarRailResIndexUrl(revision, language, 'characters.json'));
  if (!response.ok) throw new Error(`StarRailRes request failed: ${response.status}`);
  return parseStarRailResCharacterIndex(await response.json(), { revision, language });
}

function parseRecordMap<T>(value: unknown, revision: string, convert: (entry: Record<string, unknown>) => Omit<T, 'source' | 'coverage'>): T[] {
  if (!revision) throw new Error('StarRailRes revision is required');
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('StarRailRes index must be an object map');
  return Object.values(value).map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new Error('Invalid StarRailRes index entry');
    return { ...convert(entry as Record<string, unknown>), source: { kind: 'StarRailRes', revision }, coverage: 'unsupported' } as T;
  });
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid ${field}`);
  return value;
}

function readRequiredNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid ${field}`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isObjectMap(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

function normalizeElement(value: string): 'physical' | 'fire' | 'ice' | 'lightning' | 'wind' | 'quantum' | 'imaginary' {
  switch (value.toLowerCase()) {
    case 'physical': return 'physical';
    case 'fire': return 'fire';
    case 'ice': return 'ice';
    case 'lightning':
    case 'thunder': return 'lightning';
    case 'wind': return 'wind';
    case 'quantum': return 'quantum';
    case 'imaginary': return 'imaginary';
    default: throw new Error(`Unknown element: ${value}`);
  }
}

function isDirectDamageSkill(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  if (value.effect !== 'SingleAttack' && value.effect !== 'AoEAttack' && value.effect !== 'Blast' && value.effect !== 'Bounce') return false;
  if (typeof value.desc !== 'string' || !/#\d+\[(?:i|f1)\]%/.test(value.desc)) return false;
  // A Blast can legitimately use one multiplier for the primary and adjacent
  // targets (for example Trailblazer). Multi-term HP-loss/sum formulas need a
  // character-specific rule and stay outside this generic compiler.
  if (value.effect === 'Blast' && ( /\bsum of\b/i.test(value.desc) || /\bplus #\d+\[[^\]]+\]/i.test(value.desc) )) return false;
  if (value.effect === 'Bounce' && !/(?:random enemy|random enemy target)/i.test(value.desc)) return false;
  return Array.isArray(value.params) && value.params.length > 0;
}

function isSupportedAbility(value: unknown): value is Record<string, unknown> {
  if (isDirectDamageSkill(value)) return true;
  if (!isRecord(value) || typeof value.desc !== 'string' || !Array.isArray(value.params) || value.params.length === 0) return false;
  if (value.effect === 'Defence') return (/shield/i.test(value.desc) && /#1\[[^\]]+\]%/.test(value.desc)) || /DMG Reduction by #\d+\[[^\]]+\]%/i.test(value.desc);
  if (value.effect === 'Restore') return /(?:heal|restor)/i.test(value.desc) && /#1\[[^\]]+\]/.test(value.desc);
  if (value.effect === 'Support') return parseSupportEffects(value.desc, value.params[value.params.length - 1] as number[] | undefined).length > 0;
  if (value.effect === 'Enhance') return parseEnhanceEffects(value.desc, value.params[value.params.length - 1] as number[] | undefined).length > 0;
  return false;
}

function classifyCharacterAbility(
  skillIds: readonly string[],
  skills: Record<string, unknown>,
  type: 'BPSkill' | 'Ultra',
): CharacterAbilityCoverage {
  const candidates = skillIds.filter((skillId) => isRecord(skills[skillId]) && skills[skillId].type === type);
  if (candidates.length === 0) return 'missing';
  if (candidates.some((skillId) => isDirectDamageSkill(skills[skillId]))) return 'direct';
  if (candidates.some((skillId) => isSupportedAbility(skills[skillId]))) return 'compiled';
  return 'unsupported';
}

function parseDirectAbility(value: unknown, actionType: 'skill' | 'ultimate', _revision: string, resourceCost: number): AbilityData {
  if (!isSupportedAbility(value)) throw new Error('Skill is not a supported direct or utility ability');
  const skill = z.object({ id: z.string(), element: z.string(), effect: z.string(), params: z.array(z.array(z.number())), desc: z.string() }).parse(value);
  const finalParams = skill.params[skill.params.length - 1];
  const multiplier = finalParams?.[0];
  if (multiplier === undefined) throw new Error(`Skill ${skill.id} has no first parameter`);
  // Only inspect the damage/heal clause. Costs such as Firefly's HP payment
  // mention Max HP too, but do not change the attack's ATK scaling.
  const scalingText = skill.desc.split(/\b(?:If|When|While|This|Using|At the same time|Then)\b/i)[0] ?? skill.desc;
  const scaling = /(?:DMG|heal|restor)[^.!?\n]*?\b(?:of|equal to)\b[^.!?\n]*?MAX HP/i.test(scalingText)
    ? 'HP'
    : /(?:DMG|shield|increases?)[^.!?\n]*?\b(?:of|equal to)\b[^.!?\n]*?\bDEF\b/i.test(scalingText)
      ? 'DEF'
      : /\bDEF\b/i.test(scalingText) && skill.effect === 'Defence' ? 'DEF' : 'ATK';
  const element = skill.element ? normalizeElement(skill.element) : 'physical';
  let effects: AbilityData['effects'];
  if (skill.effect === 'Support') {
    effects = parseSupportEffects(skill.desc, finalParams);
  } else if (skill.effect === 'Enhance') {
    effects = parseEnhanceEffects(skill.desc, finalParams);
  } else if (skill.effect === 'Defence') {
    effects = /shield/i.test(skill.desc)
      ? [{ kind: 'shield' as const, id: `${actionType}:${skill.id}:shield`, multiplier, flatAmount: parameterForPlusAmount(skill.desc, finalParams), scaling: scaling as 'HP' | 'ATK' | 'DEF', duration: parameterForTurnDuration(skill.desc, finalParams), target: /all allies/i.test(skill.desc) ? 'all_allies' as const : 'first_target' as const }]
      : parseDefenceEffects(skill.desc, finalParams);
  } else if (skill.effect === 'Restore') {
    effects = [{ kind: 'heal' as const, multiplier: /#1\[[^\]]+\]%/.test(skill.desc) ? multiplier : 0, flatAmount: /#1\[[^\]]+\]%/.test(skill.desc) ? parameterForPlusAmount(skill.desc, finalParams) : multiplier, scaling: scaling as 'HP' | 'ATK' | 'DEF', target: /all allies/i.test(skill.desc) ? 'all_allies' as const : 'first_target' as const }];
  } else if (skill.effect === 'Blast') {
    effects = parseBlastEffects(skill.desc, finalParams, scaling as 'HP' | 'ATK' | 'DEF', element);
  } else if (skill.effect === 'Bounce') {
    effects = parseBounceEffects(skill.desc, finalParams, scaling as 'HP' | 'ATK' | 'DEF', element);
  } else {
    effects = [{ kind: 'dealDamage' as const, multiplier, scaling: scaling as 'HP' | 'ATK' | 'DEF', element, damageType: 'normal' as const, target: skill.effect === 'AoEAttack' ? 'all_enemies' as const : 'first_target' as const }];
  }
  if (skill.effect !== 'Support' && skill.effect !== 'Enhance') effects = [...parseDetonationEffects(skill.desc, finalParams), ...effects];
  return {
    id: actionType,
    actionType,
    ...(actionType === 'skill' ? { spCost: resourceCost } : { energyCost: resourceCost }),
    // Star Rail's common action-energy defaults are part of the executable
    // action record; character-specific exceptions are handled by L3 modules.
    energyGain: actionType === 'skill' ? 30 : 5,
    effects: [...effects, ...parseDotEffects(skill, finalParams)],
  };
}

function parseBlastEffects(
  description: string,
  params: readonly number[] | undefined,
  scaling: 'HP' | 'ATK' | 'DEF',
  element: import('./schema.js').Element,
): AbilityData['effects'] {
  if (!params) return [];
  const damageRefs = [...description.matchAll(/DMG[^.\n]*?\bequal to #([0-9]+)\[[^\]]+\]%/gi)];
  if (damageRefs.length === 0) return [];
  const firstIndex = Number(damageRefs[0]![1]) - 1;
  const adjacentRef = damageRefs.find((match) => {
    const start = match.index ?? 0;
    const nextDamage = description.indexOf('DMG', start + match[0].length);
    const end = nextDamage >= 0 ? nextDamage : description.length;
    return /adjacent/i.test(description.slice(Math.max(0, start - 80), end));
  });
  const primaryMultiplier = params[firstIndex];
  if (primaryMultiplier === undefined) return [];
  const effects: AbilityData['effects'] = [{
    kind: 'dealDamage',
    multiplier: primaryMultiplier,
    scaling,
    element,
    damageType: 'normal',
    target: 'first_target',
  }];
  if (/adjacent/i.test(description)) {
    const adjacentMultiplier = params[adjacentRef ? Number(adjacentRef[1]) - 1 : firstIndex];
    if (adjacentMultiplier !== undefined) effects.push({
      kind: 'dealDamage',
      multiplier: adjacentMultiplier,
      scaling,
      element,
      damageType: 'normal',
      target: 'adjacent_targets',
    });
  }
  return effects;
}

function parseDefenceEffects(description: string, params: readonly number[] | undefined): AbilityData['effects'] {
  if (!params) return [];
  const effects: AbilityData['effects'] = [];
  const reduction = /DMG Reduction by #([0-9]+)\[[^\]]+\]%/i.exec(description);
  if (reduction) {
    const value = params[Number(reduction[1]) - 1];
    if (value !== undefined) effects.push({ kind: 'modifyStat', id: 'compiled_defence_reduction', stat: 'DmgReduction', percent: value, duration: parameterForTurnDuration(description, params), target: 'self' });
  }
  return effects;
}

function parseBounceEffects(
  description: string,
  params: readonly number[] | undefined,
  scaling: 'HP' | 'ATK' | 'DEF',
  element: import('./schema.js').Element,
): AbilityData['effects'] {
  if (!params) return [];
  const bounceIndex = parameterIndex(description, /each[^#]*?#(\d+)\[[^\]]+\]%/i)
    ?? parameterIndex(description, /each instance[^#]*?#(\d+)\[[^\]]+\]%/i);
  const primaryIndex = parameterIndex(description, /designated enemy(?: target)?[^.]*?equal to #(\d+)\[[^\]]+\]%/i) ?? bounceIndex;
  const hits = resolveBounceHits(description, params);
  if (primaryIndex === undefined || bounceIndex === undefined || hits <= 0) return [];
  const primaryMultiplier = params[primaryIndex];
  const bounceMultiplier = params[bounceIndex];
  if (primaryMultiplier === undefined || bounceMultiplier === undefined) return [];
  return [
    { kind: 'dealDamage', multiplier: primaryMultiplier, scaling, element, damageType: 'normal', target: 'first_target' },
    { kind: 'bounceDamage', multiplier: bounceMultiplier, scaling, element, damageType: 'normal', hits, target: 'random_enemy' },
  ];
}

function resolveBounceHits(description: string, params: readonly number[]): number {
  const hitsPerAction = parameterIndex(description, /#(\d+)\[[^\]]+\] Hits Per Action/i);
  if (hitsPerAction !== undefined) return Math.max(0, Math.round(params[hitsPerAction] ?? 0) - 1);
  const parameterHits = parameterIndex(description, /#(\d+)\[[^\]]+\] instance\(s\) of DMG/i)
    ?? parameterIndex(description, /#(\d+)\[[^\]]+\] extra time/i);
  if (parameterHits !== undefined) return Math.max(0, Math.round(params[parameterHits] ?? 0));
  const literal = /(?:for|deals DMG for) (\d+) extra times?/i.exec(description)
    ?? /deals (\d+) times?, with each time/i.exec(description);
  const instances = /deals (\d+) instances?/i.exec(description);
  return literal ? Number(literal[1]) : instances ? Number(instances[1]) : 0;
}

function parameterIndex(description: string, pattern: RegExp): number | undefined {
  const match = pattern.exec(description);
  if (!match) return undefined;
  const index = Number(match[1]) - 1;
  return Number.isInteger(index) && index >= 0 ? index : undefined;
}

function parseDetonationEffects(description: string, params: readonly number[] | undefined): AbilityData['effects'] {
  if (!params || !/(?:(?:DoT|Burn|Shock|Bleed|Wind Shear).{0,100}(?:immediately|immediate)|(?:immediately|immediate).{0,100}(?:DoT|Burn|Shock|Bleed|Wind Shear)).{0,100}(?:original DMG|original damage)/is.test(description)) return [];
  const match = /equal to #([0-9]+)\[[^\]]+\]% of (?:its|the|their) original (?:DMG|damage)/i.exec(description);
  if (!match) return [];
  const multiplier = params[Number(match[1]) - 1];
  if (multiplier === undefined) return [];
  return [{ kind: 'detonateDots', multiplier, target: /all enemies|all enemy targets/i.test(description) ? 'all_enemies' : 'first_target' }];
}

/**
 * Convert the common “chance to apply X, then X deals ATK-scaled DoT” shape.
 * This deliberately excludes max-HP, stack-dependent and detonation clauses;
 * those need a character-specific L3 hook rather than a misleading generic
 * DoT block.
 */
function parseDotEffects(
  skill: { id: string; effect: string; element: string; desc: string },
  params: readonly number[] | undefined,
): Array<import('./schema.js').EffectBlockData> {
  if (!params || !/(?:DoT|damage over time)/i.test(skill.desc) || /MAX HP/i.test(skill.desc)) return [];
  const chanceMatch = /#(\d+)\[[^\]]+\]%\s+base chance/i.exec(skill.desc);
  const durationMatch = /(?:for|lasting for)\s+#(\d+)\[[^\]]+\]\s+turn/i.exec(skill.desc);
  const dotMatch = /(?:DoT|damage over time)\s+(?:equal to\s+)?#(\d+)\[[^\]]+\]%\s+of\s+[^.\n]*?\bATK\b/i.exec(skill.desc)
    ?? /#(\d+)\[[^\]]+\]%\s+of\s+[^.\n]*?\bATK\b[^.\n]*?(?:DoT|damage over time)/i.exec(skill.desc);
  if (!chanceMatch || !durationMatch || !dotMatch) return [];
  const chance = params[Number(chanceMatch[1]) - 1];
  const duration = params[Number(durationMatch[1]) - 1];
  const multiplier = params[Number(dotMatch[1]) - 1];
  if (chance === undefined || duration === undefined || multiplier === undefined || duration <= 0 || multiplier < 0) return [];
  const target = skill.effect === 'Blast' || skill.effect === 'AoEAttack' ? 'all_enemies' : 'first_target';
  return [{
    kind: 'applyDot',
    id: `${skill.id}:dot`,
    multiplier,
    scaling: 'ATK',
    element: normalizeElement(skill.element),
    duration: Math.round(duration),
    chance,
    target,
  }];
}

function parameterForPlusAmount(description: string, params: readonly number[] | undefined): number | undefined {
  if (!params) return undefined;
  const match = /plus #([0-9]+)\[[^\]]+\]/i.exec(description);
  if (!match) return undefined;
  return params[Number(match[1]) - 1];
}

function parameterForTurnDuration(description: string, params: readonly number[] | undefined): number {
  if (!params) return 1;
  const match = /#([0-9]+)\[[^\]]+\] turn/i.exec(description);
  const value = match ? params[Number(match[1]) - 1] : undefined;
  return typeof value === 'number' && value > 0 ? Math.round(value) : 1;
}

function parseSupportEffects(description: string, params: readonly number[] | undefined): AbilityData['effects'] {
  if (!params) return [];
  const effects: Array<import('./schema.js').EffectBlockData> = [];
  const target = /all allies|all ally targets|all teammates|all teammate/i.test(description) ? 'all_allies' as const : 'first_target' as const;
  if (/dispels? (?:a|#\d+\[[^\]]+\]) debuff/i.test(description)) {
    effects.push({ kind: 'cleanse', count: 1, target: 'first_target' });
  }
  if (/allows? them to immediately take action|immediately take action/i.test(description)) {
    effects.push({ kind: 'advanceForward', ratio: 1, target: target === 'all_allies' ? 'all_allies' : 'first_target' });
  } else {
    const advance = /Advances Forward.*?#(\d+)\[[^\]]+\]%/i.exec(description);
    if (advance) effects.push({ kind: 'advanceForward', ratio: params[Number(advance[1]) - 1] ?? 0, target: target === 'all_allies' ? 'all_allies' : 'first_target' });
  }
  const dmg = /(?:increase|increases|boost|boosts)[^.\n]*?DMG(?: dealt)?[^.\n]*?by #(\d+)\[[^\]]+\]%[^.\n]*?#(\d+)\[[^\]]+\]\s+turn/i.exec(description);
  if (dmg) {
    effects.push({ kind: 'modifyStat', id: 'compiled_support_dmg', stat: 'DmgBoostAll', percent: params[Number(dmg[1]) - 1] ?? 0, duration: Math.round(params[Number(dmg[2]) - 1] ?? 1), target });
  }
  const atk = /(?:increase|increases|boost|boosts)[^.\n]*?ATK[^.\n]*?by #(\d+)\[[^\]]+\]%[^.\n]*?#(\d+)\[[^\]]+\]\s+turn/i.exec(description);
  if (atk) {
    effects.push({ kind: 'modifyStat', id: 'compiled_support_atk', stat: 'ATK', percent: params[Number(atk[1]) - 1] ?? 0, duration: Math.round(params[Number(atk[2]) - 1] ?? 1), target });
  }
  const critDmg = /(?:increase|increases|boost|boosts)[^.\n]*?CRIT DMG[^.\n]*?by #(\d+)\[[^\]]+\]%[^.\n]*?#(\d+)\[[^\]]+\]\s+turn/i.exec(description);
  if (critDmg && !/equal to #\d+[^.\n]*?(?:of|plus)/i.test(description)) {
    effects.push({ kind: 'modifyStat', id: 'compiled_support_crit_dmg', stat: 'CritDmg', percent: params[Number(critDmg[1]) - 1] ?? 0, duration: Math.round(params[Number(critDmg[2]) - 1] ?? 1), target });
  }
  const resPen = /(?:increase|increases|boost|boosts)[^.\n]*?(?:All-Type )?RES PEN[^.\n]*?by #(\d+)\[[^\]]+\]%/i.exec(description);
  if (resPen) {
    effects.push({ kind: 'modifyStat', id: 'compiled_support_res_pen', stat: 'ResPen', percent: params[Number(resPen[1]) - 1] ?? 0, duration: parameterForTurnDuration(description, params), target });
  }
  const breakEffect = /(?:increase|increases|boost|boosts)[^.\n]*?Break Effect[^.\n]*?by #(\d+)\[[^\]]+\]%[^.\n]*?#(\d+)\[[^\]]+\]\s+turn/i.exec(description);
  if (breakEffect) {
    effects.push({ kind: 'modifyStat', id: 'compiled_support_break_effect', stat: 'BreakEffect', percent: params[Number(breakEffect[1]) - 1] ?? 0, duration: Math.round(params[Number(breakEffect[2]) - 1] ?? 1), target });
  }
  const damageReduction = /(?:increase|increases|boost|boosts)[^.\n]*?DMG Reduction[^.\n]*?by #(\d+)\[[^\]]+\]%/i.exec(description);
  if (damageReduction) {
    effects.push({ kind: 'modifyStat', id: 'compiled_support_damage_reduction', stat: 'DmgReduction', percent: params[Number(damageReduction[1]) - 1] ?? 0, duration: parameterForTurnDuration(description, params), target });
  }
  const skillPoints = /(?:recovers?|restores?) #(\d+)\[[^\]]+\]\s+Skill Point/i.exec(description);
  if (skillPoints) {
    effects.push({ kind: 'gainSkillPoints', amount: Math.round(params[Number(skillPoints[1]) - 1] ?? 0) });
  }
  const energy = /(?:regenerates?|restores?) (?:Energy )?by #(\d+)\[[^\]]+\]% of (?:their |the target's |the ally's )?Max Energy/i.exec(description);
  if (energy) {
    effects.push({ kind: 'gainEnergy', ratio: params[Number(energy[1]) - 1] ?? 0, target });
  }
  const spdPercent = /(?:increase|increases|boost|boosts)[^.\n]*?SPD(?: of all allies)?[^.\n]*?by #(\d+)\[[^\]]+\]%[^.\n]*?#(\d+)\[[^\]]+\]\s+turn/i.exec(description);
  if (spdPercent) {
    effects.push({ kind: 'modifyStat', id: 'compiled_support_spd', stat: 'SPD', percent: params[Number(spdPercent[1]) - 1] ?? 0, duration: Math.round(params[Number(spdPercent[2]) - 1] ?? 1), target });
  } else {
    const spdFlat = /(?:increase|increases|boost|boosts)[^.\n]*?SPD(?: of all allies)?[^.\n]*?by #(\d+)\[[^\]]+\](?!%)[^.\n]*?#(\d+)\[[^\]]+\]\s+turn/i.exec(description);
    if (spdFlat) effects.push({ kind: 'modifyStat', id: 'compiled_support_spd_flat', stat: 'SPD', flat: params[Number(spdFlat[1]) - 1] ?? 0, duration: Math.round(params[Number(spdFlat[2]) - 1] ?? 1), target });
  }
  return effects;
}

function parseEnhanceEffects(description: string, params: readonly number[] | undefined): AbilityData['effects'] {
  if (!params) return [];
  const effects: Array<import('./schema.js').EffectBlockData> = [];
  const target = /target ally/i.test(description) ? 'first_target' as const : 'self' as const;
  const duration = parameterForTurnDuration(description, params);
  const advance = /advances? (?:this unit's |the unit's )?Action by 100%/i.exec(description);
  if (advance) effects.push({ kind: 'advanceForward', ratio: 1, target: 'self' });
  else {
    const advancePercent = /advances? (?:this unit's |the unit's )?Action by #(\d+)\[[^\]]+\]%/i.exec(description);
    if (advancePercent) effects.push({ kind: 'advanceForward', ratio: params[Number(advancePercent[1]) - 1] ?? 0, target: 'self' });
  }

  const spdPercent = /increases? (?:the )?SPD.*?by #(\d+)\[[^\]]+\]%/i.exec(description);
  if (spdPercent) effects.push({ kind: 'modifyStat', id: 'compiled_enhance_spd', stat: 'SPD', percent: params[Number(spdPercent[1]) - 1] ?? 0, duration, target });
  else {
    const spdFlat = /increases? (?:the )?SPD.*?by #(\d+)\[[^\]]+\](?!%)/i.exec(description);
    if (spdFlat) effects.push({ kind: 'modifyStat', id: 'compiled_enhance_spd_flat', stat: 'SPD', flat: params[Number(spdFlat[1]) - 1] ?? 0, duration, target });
  }
  const atk = /increases? (?:the )?(?:target ally's |same target ally's |their |this unit's )?ATK by #(\d+)\[[^\]]+\]%/i.exec(description);
  if (atk) effects.push({ kind: 'modifyStat', id: 'compiled_enhance_atk', stat: 'ATK', percent: params[Number(atk[1]) - 1] ?? 0, duration, target });
  const dmg = /increases? (?:the )?(?:target ally's |same target ally's |their |this unit's )?DMG(?: dealt)? by #(\d+)\[[^\]]+\]%/i.exec(description);
  if (dmg) effects.push({ kind: 'modifyStat', id: 'compiled_enhance_dmg', stat: 'DmgBoostAll', percent: params[Number(dmg[1]) - 1] ?? 0, duration, target });
  return effects;
}

function normalizeUpstreamProperty(value: unknown): import('./schema.js').EquipmentStat | undefined {
  if (typeof value !== 'string') return undefined;
  switch (value) {
    case 'HPAddedRatio': return 'HPPercent';
    case 'AttackAddedRatio': return 'ATKPercent';
    case 'DefenceAddedRatio': return 'DEFPercent';
    case 'SpeedAddedRatio': return 'SPDPercent';
    case 'HealRatioBase': return 'HealBoost';
    case 'CriticalChanceBase': return 'CritRate';
    case 'CriticalDamageBase': return 'CritDmg';
    case 'StatusProbabilityBase': return 'EffectHitRate';
    case 'StatusResistanceBase': return 'EffectRes';
    case 'BreakDamageAddedRatioBase': return 'BreakEffect';
    case 'PhysicalAddedRatio': return 'DmgBoostPhysical';
    case 'FireAddedRatio': return 'DmgBoostFire';
    case 'IceAddedRatio': return 'DmgBoostIce';
    case 'ThunderAddedRatio': return 'DmgBoostLightning';
    case 'WindAddedRatio': return 'DmgBoostWind';
    case 'QuantumAddedRatio': return 'DmgBoostQuantum';
    case 'ImaginaryAddedRatio': return 'DmgBoostImaginary';
    default: return undefined;
  }
}

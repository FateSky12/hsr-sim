import { z } from 'zod';
import { CoverageSchema, ElementSchema, type Coverage, type Element } from './schema.js';

export const TurnBasedCharacterSkillSchema = z.object({
  id: z.string(),
  actionType: z.enum(['basic', 'skill', 'ultimate', 'passive', 'technique', 'variant', 'unknown']),
  level: z.number().int().positive(),
  maxLevel: z.number().int().positive(),
  triggerKey: z.string().optional(),
  effect: z.string().optional(),
  description: z.string().optional(),
  params: z.array(z.number()),
  toughness: z.array(z.number()),
  damage: z.array(z.number()),
  source: z.object({ kind: z.string(), revision: z.string() }),
  coverage: CoverageSchema,
});

export const TurnBasedCharacterDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  element: ElementSchema,
  level: z.number().int().positive(),
  baseStats: z.object({
    hp: z.number().nonnegative(),
    atk: z.number().nonnegative(),
    def: z.number().nonnegative(),
    spd: z.number().positive(),
    critRate: z.number().nonnegative(),
    critDmg: z.number().nonnegative(),
    baseAggro: z.number().nonnegative(),
  }),
  maxEnergy: z.number().positive().optional(),
  skillIds: z.array(z.string()),
  skills: z.array(TurnBasedCharacterSkillSchema),
  source: z.object({ kind: z.string(), revision: z.string() }),
  coverage: CoverageSchema,
});

export type TurnBasedCharacterSkill = z.infer<typeof TurnBasedCharacterSkillSchema>;
export type TurnBasedCharacterData = z.infer<typeof TurnBasedCharacterDataSchema>;

export interface TurnBasedAvatarCatalogInput {
  avatars: unknown;
  promotions: unknown;
  skills: unknown;
  textMap?: unknown;
}

export function parseTurnBasedAvatarCatalog(
  input: TurnBasedAvatarCatalogInput,
  options: { revision: string; level?: number },
): TurnBasedCharacterData[] {
  const requestedLevel = Math.max(1, Math.floor(options.level ?? 80));
  const promotions = groupById(input.promotions, 'AvatarID');
  const skills = groupById(input.skills, 'SkillID');
  const textMap = asTextMap(input.textMap);

  return asRecords(input.avatars).flatMap((avatar) => {
    const id = readId(avatar.AvatarID);
    const name = resolveText(avatar.AvatarName, textMap);
    const path = typeof avatar.AvatarBaseType === 'string' ? avatar.AvatarBaseType : undefined;
    const element = mapElement(avatar.DamageType);
    if (!id || !name || !path || !element) return [];
    const promotionRecords = promotions.get(id) ?? [];
    const promotion = choosePromotion(promotionRecords, requestedLevel);
    if (!promotion) return [];
    const level = readNumber(promotion.MaxLevel) ?? requestedLevel;
    const baseStats = {
      hp: levelStat(promotion.HPBase, promotion.HPAdd, level),
      atk: levelStat(promotion.AttackBase, promotion.AttackAdd, level),
      def: levelStat(promotion.DefenceBase, promotion.DefenceAdd, level),
      spd: readNumber(promotion.SpeedBase) ?? 100,
      critRate: readNumber(promotion.CriticalChance) ?? 0.05,
      critDmg: readNumber(promotion.CriticalDamage) ?? 0.5,
      baseAggro: readNumber(promotion.BaseAggro) ?? 100,
    };
    if (baseStats.hp <= 0 || baseStats.atk < 0 || baseStats.def < 0 || baseStats.spd <= 0) return [];
    const skillIds = [...new Set(readIds(avatar.SkillList))];
    const characterSkills = skillIds.flatMap((skillId) => {
      const selected = chooseSkill(skills.get(skillId) ?? []);
      return selected ? [parseSkill(selected, textMap, options.revision)] : [];
    });
    const maxEnergy = readNumber(avatar.SPNeed);
    return [TurnBasedCharacterDataSchema.parse({
      id,
      name,
      path,
      element,
      level,
      baseStats,
      maxEnergy: maxEnergy && maxEnergy > 0 ? maxEnergy : undefined,
      skillIds,
      skills: characterSkills,
      source: { kind: 'TurnBasedGameData', revision: options.revision },
      coverage: 'abstracted',
    })];
  });
}

function parseSkill(record: Record<string, unknown>, textMap: Record<string, string>, revision: string): TurnBasedCharacterSkill {
  const triggerKey = typeof record.SkillTriggerKey === 'string' ? record.SkillTriggerKey : undefined;
  const actionType = mapActionType(triggerKey, record.AttackType);
  return TurnBasedCharacterSkillSchema.parse({
    id: readId(record.SkillID) ?? 'unknown',
    actionType,
    level: Math.max(1, Math.floor(readNumber(record.Level) ?? 1)),
    maxLevel: Math.max(1, Math.floor(readNumber(record.MaxLevel) ?? readNumber(record.Level) ?? 1)),
    triggerKey,
    effect: typeof record.SkillEffect === 'string' ? record.SkillEffect : undefined,
    description: resolveText(record.SkillDesc, textMap),
    params: readValueArray(record.ParamList),
    toughness: readValueArray(record.ShowStanceList),
    damage: readValueArray(record.ShowDamageList),
    source: { kind: 'TurnBasedGameData', revision },
    coverage: 'abstracted',
  });
}

function choosePromotion(records: Array<Record<string, unknown>>, requestedLevel: number): Record<string, unknown> | undefined {
  return [...records].sort((left, right) => Math.abs((readNumber(left.MaxLevel) ?? 0) - requestedLevel) - Math.abs((readNumber(right.MaxLevel) ?? 0) - requestedLevel) || (readNumber(right.MaxLevel) ?? 0) - (readNumber(left.MaxLevel) ?? 0))[0];
}

function chooseSkill(records: Array<Record<string, unknown>>): Record<string, unknown> | undefined {
  return [...records].sort((left, right) => (readNumber(right.Level) ?? 0) - (readNumber(left.Level) ?? 0) || (readNumber(right.MaxLevel) ?? 0) - (readNumber(left.MaxLevel) ?? 0))[0];
}

function mapActionType(trigger: unknown, attackType: unknown): TurnBasedCharacterSkill['actionType'] {
  if (typeof trigger === 'string') {
    if (trigger === 'Skill01') return 'basic';
    if (trigger === 'Skill02') return 'skill';
    if (trigger === 'Skill03') return 'ultimate';
    if (trigger.startsWith('SkillP')) return 'passive';
    if (trigger === 'SkillMaze') return 'technique';
    if (trigger.startsWith('Skill1') || trigger.startsWith('Skill2') || trigger.startsWith('Skill3')) return 'variant';
  }
  if (attackType === 'Maze') return 'technique';
  return 'unknown';
}

function levelStat(base: unknown, add: unknown, level: number): number {
  return (readNumber(base) ?? 0) + (readNumber(add) ?? 0) * Math.max(0, level - 1);
}

function groupById(value: unknown, key: string): Map<string, Array<Record<string, unknown>>> {
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const record of asRecords(value)) {
    const id = readId(record[key]);
    if (!id) continue;
    groups.set(id, [...(groups.get(id) ?? []), record]);
  }
  return groups;
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value)) return Object.values(value).filter(isRecord);
  throw new Error('TurnBased avatar source must be an array or object map');
}

function asTextMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, text]) => typeof text === 'string' ? [[key, text]] : []));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readNumber(value: unknown): number | undefined {
  const candidate = isRecord(value) ? value.Value : value;
  const number = typeof candidate === 'number' ? candidate : typeof candidate === 'string' && candidate.trim() !== '' ? Number(candidate) : undefined;
  return typeof number === 'number' && Number.isFinite(number) ? number : undefined;
}

function readId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  return undefined;
}

function readIds(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => {
    const id = readId(item);
    return id ? [id] : [];
  }) : [];
}

function readValueArray(value: unknown): number[] {
  return Array.isArray(value) ? value.flatMap((item) => {
    const number = readNumber(item);
    return number === undefined ? [] : [number];
  }) : [];
}

function resolveText(value: unknown, textMap: Record<string, string>): string | undefined {
  if (!isRecord(value)) return undefined;
  const hash = readId(value.Hash);
  const text = hash ? textMap[hash] : undefined;
  return typeof text === 'string' && text.trim().length > 0
    ? text.replace(/<[^>]+>/g, '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
    : undefined;
}

function mapElement(value: unknown): Element | undefined {
  if (typeof value !== 'string') return undefined;
  switch (value.toLowerCase()) {
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

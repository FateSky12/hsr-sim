import {
  LightConeDataSchema,
  type EquipmentPassive,
  type EquipmentStat,
  type EquipmentStatValue,
  type LightConeData,
} from './schema.js';
import {
  parseStarRailResLightConeData,
  parseStarRailResLightConeIndex,
  type LightConeIndexRecord,
} from './upstream.js';

export interface TurnBasedLightConeRank {
  level: number;
  description: string;
  params: number[];
  properties?: unknown[];
}

export interface TurnBasedLightConeMechanic {
  id: string;
  skillId?: number | string;
  path?: string;
  ranks: TurnBasedLightConeRank[];
}

export interface ParsedLightConeMechanics {
  staticStats: EquipmentStatValue[];
  passives: EquipmentPassive[];
}

/**
 * Join the human-readable StarRailRes light-cone index with the executable
 * parameter/text extraction from TurnBasedGameData. The two sources are kept
 * separate because StarRailRes is the stable catalogue while the latter is
 * the raw client-data dump that carries skill parameters.
 */
export function parseTurnBasedLightConeCatalog(
  input: { index: unknown; promotions: unknown; mechanics: unknown },
  options: {
    starRailResRevision: string;
    turnBasedRevision: string;
    level: number;
    superimposition?: number;
  },
): LightConeData[] {
  const indexes = parseStarRailResLightConeIndex(input.index, { revision: options.starRailResRevision });
  const mechanics = normalizeMechanics(input.mechanics);
  const mechanicById = new Map(mechanics.map((record) => [record.id, record]));
  const superimposition = Math.max(1, Math.min(5, Math.floor(options.superimposition ?? 1)));

  return indexes.map((index) => {
    const base = parseStarRailResLightConeData(
      index,
      getRecord(input.promotions, index.id),
      { revision: options.starRailResRevision, level: options.level },
    );
    const record = mechanicById.get(index.id);
    const rank = record?.ranks.find((candidate) => candidate.level === superimposition) ?? record?.ranks[0];
    const parsed = rank ? parseLightConeMechanics(rank.description, rank.params) : { staticStats: [], passives: [] };
    const passives = parsed.passives;
    return LightConeDataSchema.parse({
      ...base,
      staticStats: parsed.staticStats,
      passive: passives[0],
      passives: passives.length > 0 ? passives : undefined,
      source: {
        kind: 'StarRailRes+TurnBasedGameData',
        revision: `${options.starRailResRevision}+${options.turnBasedRevision}`,
      },
      coverage: parsed.staticStats.length > 0 || passives.length > 0 ? 'abstracted' : 'unsupported',
    });
  });
}

export function parseLightConeMechanics(description: string, params: readonly number[]): ParsedLightConeMechanics {
  const text = cleanDescription(description);
  const staticText = text.slice(0, firstTriggerIndex(text));
  const staticStats = dedupeStaticStats(parseStatEffects(staticText, params));
  const passives: EquipmentPassive[] = [];
  const triggers = findTriggers(text);
  for (const [index, trigger] of triggers.entries()) {
    const end = triggers.slice(index + 1).find((candidate) => candidate.index > trigger.index)?.index ?? text.length;
    const segment = text.slice(trigger.index, end);
    const duration = parseDuration(segment, params, trigger.trigger === 'BATTLE_START' ? 9999 : 1);
    for (const [effectIndex, effect] of parseStatEffects(segment, params).entries()) {
      // Effects in the static prefix have already been added to the unit's
      // sheet. Only trigger-local effects become event hooks.
      passives.push({
        id: `parsed:${trigger.trigger.toLowerCase()}:${index}:${effectIndex}`,
        trigger: trigger.trigger,
        modifier: effect,
        duration,
        target: targetForEffect(segment),
        stacking: 'replace',
      });
    }
  }
  return { staticStats, passives: dedupePassives(passives) };
}

function parseStatEffects(text: string, params: readonly number[]): EquipmentStatValue[] {
  const effects: EquipmentStatValue[] = [];
  const patterns: Array<{ stat: EquipmentStat; pattern: RegExp }> = [
    { stat: 'DmgBoostBasic', pattern: /DMG(?: dealt)? by (?:the )?wearer's Basic ATK[^.\n]*?by #([0-9]+)\[[^\]]+\]%/i },
    { stat: 'DmgBoostSkill', pattern: /DMG(?: dealt)? by (?:the )?wearer's Skill[^.\n]*?by #([0-9]+)\[[^\]]+\]%/i },
    { stat: 'DmgBoostUltimate', pattern: /DMG(?: dealt)? by (?:the )?wearer's Ultimate[^.\n]*?by #([0-9]+)\[[^\]]+\]%/i },
    { stat: 'DmgBoostFollowUp', pattern: /DMG(?: dealt)? by (?:the )?wearer's Follow-Up ATK[^.\n]*?by #([0-9]+)\[[^\]]+\]%/i },
    { stat: 'DmgBoostDot', pattern: /DMG(?: dealt)? by (?:the )?wearer's?\s+DoT[^.\n]*?by #([0-9]+)\[[^\]]+\]%/i },
    { stat: 'HPPercent', pattern: /(?:Max )?HP[^.\n]*?by #([0-9]+)\[[^\]]+\]%/i },
    { stat: 'ATKPercent', pattern: /\bATK[^.\n]*?by #([0-9]+)\[[^\]]+\]%/i },
    { stat: 'DEFPercent', pattern: /\bDEF[^.\n]*?by #([0-9]+)\[[^\]]+\]%/i },
    { stat: 'SPDPercent', pattern: /\bSPD[^.\n]*?by #([0-9]+)\[[^\]]+\]%/i },
    { stat: 'CritRate', pattern: /CRIT Rate[^.\n]*?by #([0-9]+)\[[^\]]+\]%/i },
    { stat: 'CritDmg', pattern: /CRIT DMG[^.\n]*?by #([0-9]+)\[[^\]]+\]%/i },
    { stat: 'BreakEffect', pattern: /Break Effect[^.\n]*?by #([0-9]+)\[[^\]]+\]%/i },
    { stat: 'EffectHitRate', pattern: /Effect Hit Rate[^.\n]*?by #([0-9]+)\[[^\]]+\]%/i },
    { stat: 'EffectRes', pattern: /Effect RES[^.\n]*?by #([0-9]+)\[[^\]]+\]%/i },
    { stat: 'BreakDmgBoost', pattern: /Break DMG[^.\n]*?by #([0-9]+)\[[^\]]+\]%/i },
    { stat: 'SuperBreakDmgBoost', pattern: /Super Break DMG[^.\n]*?by #([0-9]+)\[[^\]]+\]%/i },
    { stat: 'Vulnerability', pattern: /receives? #([0-9]+)\[[^\]]+\]% increased DMG/i },
    // Keep target vulnerability clauses out of the wearer's all-DMG bucket:
    // "the enemy receives increased DMG" is not "DMG dealt by the wearer".
    { stat: 'DmgBoostAll', pattern: /(?:DMG dealt by (?:the )?wearer|wearer's DMG)[^.\n]*?by #([0-9]+)\[[^\]]+\]%/i },
  ];

  for (const candidate of patterns) {
    const match = candidate.pattern.exec(text);
    if (!match) continue;
    const parameter = params[Number(match[1]) - 1];
    if (parameter === undefined || !Number.isFinite(parameter)) continue;
    const exists = effects.some((effect) => effect.stat === candidate.stat && Math.abs(effect.value - parameter) < 1e-12);
    if (!exists) effects.push({ stat: candidate.stat, value: parameter });
  }
  return effects;
}

function findTriggers(text: string): Array<{ index: number; trigger: EquipmentPassive['trigger'] }> {
  const patterns: Array<[RegExp, EquipmentPassive['trigger']]> = [
    [/(?:after|when|upon) (?:the )?wearer (?:uses?|launches?) (?:their )?Basic ATK/gi, 'BASIC_USED'],
    [/(?:after|when|upon) (?:the )?wearer (?:uses?|launches?) (?:their )?Skill/gi, 'SKILL_USED'],
    [/(?:after|when|upon) (?:the )?wearer (?:uses?|launches?) (?:their )?Ultimate/gi, 'ULT_USED'],
    [/(?:after|when|upon) (?:the )?wearer (?:uses?|launches?) (?:their )?Follow-Up ATK/gi, 'FOLLOW_UP_USED'],
    [/when an enemy is inflicted with Weakness Break/gi, 'WEAKNESS_BREAK'],
    [/(?:when|after) (?:the )?wearer is hit/gi, 'HP_LOSS'],
    [/(?:when|after) (?:the )?wearer defeats? an enemy/gi, 'KILL'],
    [/(?:when entering battle|at the start of battle|when the battle begins)/gi, 'BATTLE_START'],
  ];
  const found: Array<{ index: number; trigger: EquipmentPassive['trigger'] }> = [];
  for (const [pattern, trigger] of patterns) {
    for (const match of text.matchAll(pattern)) found.push({ index: match.index ?? 0, trigger });
  }
  // Client text frequently compresses three action triggers into one clause:
  // "after using Basic ATK, Skill, or Ultimate". Expand the clause to three
  // event hooks while retaining the original source position/order.
  const combinedAction = /(?:after|when|upon) (?:the )?wearer (?:uses?|launches?) (?:their )?Basic ATK, Skill, or Ultimate/gi;
  for (const match of text.matchAll(combinedAction)) {
    const index = match.index ?? 0;
    found.push({ index, trigger: 'BASIC_USED' }, { index, trigger: 'SKILL_USED' }, { index, trigger: 'ULT_USED' });
  }
  return found.sort((left, right) => left.index - right.index || left.trigger.localeCompare(right.trigger));
}

function targetForEffect(text: string): EquipmentPassive['target'] {
  if (/all ally targets|all allies|all teammates/i.test(text)) return 'all_targets';
  if (/enemy target receives|target enemy receives|on the target/i.test(text)) return 'event_target';
  return 'self';
}

function parseDuration(text: string, params: readonly number[], fallback: number): number {
  const parameter = /(?:for|lasting for|lasts? for) #([0-9]+)\[[^\]]+\]\s+turn/i.exec(text);
  if (parameter) return Math.max(1, Math.round(params[Number(parameter[1]) - 1] ?? fallback));
  const literal = /(?:for|lasting for|lasts? for) (\d+) turn/i.exec(text);
  if (literal) return Math.max(1, Number(literal[1]));
  if (/until the end of (?:their|the wearer's) next turn/i.test(text)) return 1;
  return fallback;
}

function firstTriggerIndex(text: string): number {
  const match = /\b(?:After|When|Upon|While|For every|At the|If|Once|Before)\b/i.exec(text);
  return match?.index ?? text.length;
}

function cleanDescription(description: string): string {
  return description
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[’']/g, "'")
    .trim();
}

function normalizeMechanics(value: unknown): TurnBasedLightConeMechanic[] {
  if (Array.isArray(value)) return value.map(normalizeMechanic).filter((item): item is TurnBasedLightConeMechanic => item !== undefined);
  if (value !== null && typeof value === 'object') return Object.values(value).map(normalizeMechanic).filter((item): item is TurnBasedLightConeMechanic => item !== undefined);
  throw new Error('TurnBased light-cone mechanics must be an array or object map');
}

function normalizeMechanic(value: unknown): TurnBasedLightConeMechanic | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || !Array.isArray(record.ranks)) return undefined;
  const ranks = record.ranks.flatMap((rank) => {
    if (rank === null || typeof rank !== 'object' || Array.isArray(rank)) return [];
    const item = rank as Record<string, unknown>;
    if (typeof item.level !== 'number' || typeof item.description !== 'string' || !Array.isArray(item.params)) return [];
    return [{
      level: item.level,
      description: item.description,
      params: item.params.filter((param): param is number => typeof param === 'number' && Number.isFinite(param)),
      properties: Array.isArray(item.properties) ? item.properties : undefined,
    }];
  });
  return { id: record.id, skillId: typeof record.skillId === 'number' || typeof record.skillId === 'string' ? record.skillId : undefined, path: typeof record.path === 'string' ? record.path : undefined, ranks };
}

function getRecord(value: unknown, id: string): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const record = (value as Record<string, unknown>)[id];
    if (record !== undefined) return record;
  }
  throw new Error(`Missing light-cone promotion data for ${id}`);
}

function dedupeStaticStats(values: EquipmentStatValue[]): EquipmentStatValue[] {
  return values.filter((value, index) => values.findIndex((candidate) => candidate.stat === value.stat) === index);
}

function dedupePassives(values: EquipmentPassive[]): EquipmentPassive[] {
  return values.filter((value, index) => values.findIndex((candidate) => candidate.trigger === value.trigger && candidate.modifier.stat === value.modifier.stat && candidate.modifier.value === value.modifier.value && candidate.target === value.target) === index);
}

import type { AbilityId, ActionType, DamageType, Element, JsonValue, StatKey, UnitId } from './types.js';

export interface ReplayEventBase {
  seq: number;
  at: number;
  cause?: string;
}

export type ReplayEvent =
  | (ReplayEventBase & { type: 'BATTLE_START' })
  | (ReplayEventBase & { type: 'WAVE_START'; wave: number })
  | (ReplayEventBase & { type: 'WAVE_END'; wave: number })
  | (ReplayEventBase & { type: 'CYCLE_START'; cycle: number })
  | (ReplayEventBase & { type: 'TURN_BEGIN'; actor: UnitId })
  | (ReplayEventBase & { type: 'ENEMY_TURN_BEGIN'; actor: UnitId })
  | (ReplayEventBase & { type: 'ACTION_STARTED'; actor: UnitId; ability: AbilityId })
  | (ReplayEventBase & { type: 'BEFORE_ACTION'; actor: UnitId; ability: AbilityId; actionType: ActionType })
  | (ReplayEventBase & { type: 'BASIC_USED'; actor: UnitId; ability: AbilityId; targets: UnitId[] })
  | (ReplayEventBase & { type: 'SKILL_USED'; actor: UnitId; ability: AbilityId; targets: UnitId[] })
  | (ReplayEventBase & { type: 'ULT_USED'; actor: UnitId; ability: AbilityId; targets: UnitId[] })
  | (ReplayEventBase & { type: 'FOLLOW_UP_USED'; actor: UnitId; ability: AbilityId; targets: UnitId[] })
  | (ReplayEventBase & { type: 'TECHNIQUE_USED'; actor: UnitId; ability: AbilityId; targets: UnitId[] })
  | (ReplayEventBase & { type: 'ENEMY_ATTACK'; actor: UnitId; ability: AbilityId })
  | (ReplayEventBase & { type: 'INSERT_ACTION_START'; actor: UnitId; ability: AbilityId })
  | (ReplayEventBase & { type: 'INSERT_ACTION_END'; actor: UnitId; ability: AbilityId })
  | (ReplayEventBase & { type: 'AFTER_ACTION'; actor: UnitId; ability: AbilityId; actionType: ActionType })
  | (ReplayEventBase & { type: 'TURN_END'; actor: UnitId })
  | (ReplayEventBase & { type: 'BATTLE_END'; reason: 'all_enemies_defeated' })
  | (ReplayEventBase & { type: 'ACTION_BLOCKED'; actor: UnitId; status: string })
  | (ReplayEventBase & { type: 'BEFORE_HIT'; source: UnitId; target: UnitId; ability: AbilityId; damageType: DamageType; element: Element; actionType?: ActionType; multiplier: number })
  | (ReplayEventBase & { type: 'AFTER_HIT'; source: UnitId; target: UnitId; ability: AbilityId; damageType: DamageType; element: Element; amount: number; critical: boolean })
  | (ReplayEventBase & { type: 'BEFORE_DAMAGE'; source: UnitId; target: UnitId; ability: AbilityId; damageType: DamageType; element: Element; actionType?: ActionType; multiplier: number })
  | (ReplayEventBase & { type: 'DAMAGE_DEALT'; source: UnitId; target: UnitId; ability: AbilityId; damageType: DamageType; element: Element; amount: number; rawAmount: number; critical: boolean; expected?: boolean; rngDraw?: number; toughnessDamage: number })
  | (ReplayEventBase & { type: 'AFTER_DAMAGE'; source: UnitId; target: UnitId; ability: AbilityId; damageType: DamageType; element: Element; amount: number; critical: boolean; toughnessDamage: number; targetBrokenBefore: boolean })
  | (ReplayEventBase & { type: 'CRIT_OCCURRED'; source: UnitId; target: UnitId; ability: AbilityId; amount: number })
  | (ReplayEventBase & { type: 'SHIELD_APPLIED'; source: UnitId; target: UnitId; id: string; amount: number; duration: number })
  | (ReplayEventBase & { type: 'SHIELD_ABSORBED'; source?: UnitId; target: UnitId; id: string; amount: number; remaining: number })
  | (ReplayEventBase & { type: 'SHIELD_BROKEN'; target: UnitId; id: string })
  | (ReplayEventBase & { type: 'SHIELD_EXPIRED'; target: UnitId; id: string })
  | (ReplayEventBase & { type: 'STATUS_REMOVED'; target: UnitId; id: string })
  | (ReplayEventBase & { type: 'STATUS_APPLIED'; source: UnitId; target: UnitId; id: string; duration: number; stacks: number })
  | (ReplayEventBase & { type: 'STATUS_RESISTED'; source: UnitId; target: UnitId; id: string; chance: number; rngDraw?: number })
  | (ReplayEventBase & { type: 'STATUS_EXPIRED'; target: UnitId; id: string })
  | (ReplayEventBase & { type: 'TOUGHNESS_REDUCED'; source: UnitId; target: UnitId; amount: number; remaining: number })
  | (ReplayEventBase & { type: 'TOUGHNESS_RECOVERED'; target: UnitId; amount: number })
  | (ReplayEventBase & { type: 'WEAKNESS_IMPLANTED'; source: UnitId; target: UnitId; element: Element; duration?: number })
  | (ReplayEventBase & { type: 'WEAKNESS_BREAK'; source: UnitId; target: UnitId; element: Element })
  | (ReplayEventBase & { type: 'BREAK_DMG_DEALT'; source: UnitId; target: UnitId; element: Element; amount: number })
  | (ReplayEventBase & { type: 'BREAK_RECOVERED'; target: UnitId; amount: number })
  | (ReplayEventBase & { type: 'KILL'; source: UnitId; target: UnitId })
  | (ReplayEventBase & { type: 'BEFORE_HEAL'; source: UnitId; target: UnitId })
  | (ReplayEventBase & { type: 'HEAL_APPLIED'; source: UnitId; target: UnitId; amount: number })
  | (ReplayEventBase & { type: 'AFTER_HEAL'; source: UnitId; target: UnitId; amount: number })
  | (ReplayEventBase & { type: 'UNIT_REVIVED'; source: UnitId; target: UnitId; amount: number })
  | (ReplayEventBase & { type: 'HP_CHANGED'; target: UnitId; amount: number; value: number })
  | (ReplayEventBase & { type: 'HP_LOSS'; target: UnitId; amount: number; source?: UnitId })
  | (ReplayEventBase & { type: 'ENERGY_CHANGED'; target: UnitId; amount: number; value: number })
  | (ReplayEventBase & { type: 'ENERGY_GAINED'; target: UnitId; amount: number; value: number })
  | (ReplayEventBase & { type: 'ENERGY_SPENT'; target: UnitId; amount: number; value: number })
  | (ReplayEventBase & { type: 'SP_CHANGED'; amount: number; value: number })
  | (ReplayEventBase & { type: 'MODIFIER_APPLIED'; source: UnitId; target: UnitId; id: string; stat: StatKey })
  | (ReplayEventBase & { type: 'CUSTOM_CHANGED'; target: UnitId; key: string; value: JsonValue })
  | (ReplayEventBase & { type: 'MODIFIER_REMOVED'; target: UnitId; id: string })
  | (ReplayEventBase & { type: 'MODIFIER_EXPIRED'; target: UnitId; id: string })
  | (ReplayEventBase & { type: 'DOT_APPLIED'; source: UnitId; target: UnitId; id: string; duration: number; probability?: number; rngDraw?: number })
  | (ReplayEventBase & { type: 'DOT_TICK'; source: UnitId; target: UnitId; id: string; amount: number; remainingTurns: number })
  | (ReplayEventBase & { type: 'DOT_DETONATED'; source: UnitId; target: UnitId; id: string; multiplier: number })
  | (ReplayEventBase & { type: 'DOT_EXPIRED'; source: UnitId; target: UnitId; id: string })
  | (ReplayEventBase & { type: 'DEBUFF_RESISTED'; source: UnitId; target: UnitId; id: string; chance: number; rngDraw?: number })
  | (ReplayEventBase & { type: 'ACTION_SCHEDULED'; actor: UnitId; nextActionAt: number })
  | (ReplayEventBase & { type: 'ACTION_ADVANCED'; actor: UnitId; ratio: number; nextActionAt: number })
  | (ReplayEventBase & { type: 'ACTION_DELAYED'; actor: UnitId; ratio: number; nextActionAt: number })
  | (ReplayEventBase & { type: 'SPD_CHANGED'; target: UnitId })
  | (ReplayEventBase & { type: 'UNIT_DEFEATED'; target: UnitId })
  | (ReplayEventBase & { type: 'ALLY_DOWNED'; target: UnitId })
  | (ReplayEventBase & { type: 'ENEMY_DEFEATED'; target: UnitId })
  | (ReplayEventBase & { type: 'PHASE_ENTERED'; target: UnitId; phase: number; actions: string[] })
  | (ReplayEventBase & { type: 'UNIT_SUMMONED'; source: UnitId; target: UnitId; name: string })
  | (ReplayEventBase & { type: 'ENEMY_SUMMONED'; source: UnitId; target: UnitId; name: string });

export type ReplayEventInput = {
  [K in ReplayEvent['type']]: Omit<Extract<ReplayEvent, { type: K }>, 'seq'>
}[ReplayEvent['type']];

export function withSequence<T extends ReplayEvent>(
  event: Omit<T, 'seq'>,
  seq: number,
): T {
  return { ...event, seq } as T;
}

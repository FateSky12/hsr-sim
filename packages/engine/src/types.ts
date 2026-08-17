import type { ReplayEvent } from './events.js';

export type UnitId = string;
export type AbilityId = string;

export type Faction = 'ally' | 'enemy';

export type Element =
  | 'physical'
  | 'fire'
  | 'ice'
  | 'lightning'
  | 'wind'
  | 'quantum'
  | 'imaginary';

export type DamageType = 'normal' | 'break' | 'super_break' | 'dot' | 'additional';
export type DamageMode = 'sampled' | 'expected';
export type ActionType = 'basic' | 'skill' | 'ultimate' | 'follow_up' | 'technique' | 'insert';

export enum StatKey {
  HP,
  ATK,
  DEF,
  SPD,
  CritRate,
  CritDmg,
  BreakEffect,
  BreakEfficiency,
  EffectHitRate,
  EffectRes,
  EnergyRegen,
  HealBoost,
  DmgBoostPhysical,
  DmgBoostFire,
  DmgBoostIce,
  DmgBoostLightning,
  DmgBoostWind,
  DmgBoostQuantum,
  DmgBoostImaginary,
  DmgBoostAll,
  ResPen,
  DefIgnore,
  Vulnerability,
  DmgBoostBasic,
  DmgBoostSkill,
  DmgBoostUltimate,
  DmgBoostFollowUp,
  DmgBoostTechnique,
  DmgBoostAdditional,
  DmgBoostDot,
  DefReduction,
  DmgReduction,
  BreakDmgBoost,
  SuperBreakDmgBoost,
}

export const STAT_COUNT = StatKey.SuperBreakDmgBoost + 1;

export interface StatSheet {
  /** Base value plus fixed level/weapon/traces input. */
  base: Float64Array;
  /** Additive percentage or additive rate pool. */
  percent: Float64Array;
  /** Additive flat pool. */
  flat: Float64Array;
}

export interface ToughnessState {
  current: number;
  max: number;
  broken: boolean;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface StatusInstance {
  id: string;
  source?: UnitId;
  remainingTurns: number;
  stacks: number;
  stacking?: 'replace' | 'add';
  maxStacks?: number;
  category?: 'buff' | 'debuff' | 'neutral';
  snapshot?: JsonValue;
  custom?: Record<string, JsonValue>;
}

export type ModifierStacking = 'add' | 'replace';

export interface ModifierState {
  id: string;
  source?: UnitId;
  stat: StatKey;
  percent?: number;
  flat?: number;
  remainingTurns?: number;
  stacking: ModifierStacking;
}

export interface DamageSnapshot {
  sourceLevel: number;
  scalingValue: number;
  elementDamageBonus: number;
  allDamageBonus: number;
  resPen: number;
  defIgnore: number;
  dotDamageBonus?: number;
  vulnerability?: number;
}

/** One-hit values exposed to BEFORE_DAMAGE hooks. */
export interface DamageContext {
  damageBoost: number;
  defReduction: number;
  defIgnore: number;
  resPen: number;
  vulnerability: number;
  damageReductions: number[];
  critRateBonus: number;
  critDmgBonus: number;
  multiplierBonus: number;
  flatDamageBonus: number;
  breakDamageBoost: number;
  superBreakDamageBoost: number;
}

/** Calibration seam for versioned energy gained when a unit is hit. */
export interface DamageEnergyContext {
  readonly intent: DamageIntent;
  readonly damage: number;
  readonly hpDamage: number;
  readonly shieldDamage: number;
  readonly critical: boolean;
}

export interface DotState {
  id: string;
  source: UnitId;
  ability: AbilityId;
  element: Element;
  /** Ordinary character DoT or a level-based Weakness Break DoT. */
  damageType?: 'dot' | 'break';
  scalingStat: StatKey;
  multiplier: number;
  toughnessDamage: number;
  remainingTurns: number;
  snapshot: DamageSnapshot;
}

export interface ShieldState {
  id: string;
  source: UnitId;
  amount: number;
  remainingTurns: number;
}

export interface EquipmentLoadoutState {
  lightConeId?: string;
  relicIds: string[];
  setIds: string[];
  /** Number of equipped pieces per set, retained for passive gating. */
  setCounts?: Record<string, number>;
}

export interface UnitState {
  id: UnitId;
  name: string;
  faction: Faction;
  baseAggro: number;
  taunt: number;
  level: number;
  hp: number;
  maxHp: number;
  stats: StatSheet;
  energy: number;
  maxEnergy: number;
  toughness: ToughnessState;
  weaknesses: Element[];
  resistance: Record<Element, number>;
  statuses: StatusInstance[];
  modifiers: ModifierState[];
  dots: DotState[];
  shields: ShieldState[];
  /** Independent target-side reductions; each entry is multiplied. */
  damageReductions: number[];
  equipment?: EquipmentLoadoutState;
  custom: Record<string, JsonValue>;
  alive: boolean;
  nextActionAt: number;
  actionGeneration: number;
}

export interface RngState {
  algorithm: 'xorshift32';
  seed: number;
  cursor: number;
}

export interface BattleState {
  schemaVersion: 1;
  clock: number;
  cycle: number;
  skillPoints: number;
  maxSkillPoints: number;
  units: UnitState[];
  rng: RngState;
  eventSequence: number;
  wave: number;
  totalWaves: number;
  battleStarted: boolean;
}

export interface ActionCommand {
  actor: UnitId;
  ability: AbilityId;
  targets: UnitId[];
  /** RNG state committed by a policy before target selection/action execution. */
  rngState?: RngState;
  /** Direct calls may omit timeline advancement for isolated formula tests. */
  advanceTurn?: boolean;
}

export interface DamageIntent {
  kind: 'damage';
  source: UnitId;
  target: UnitId;
  ability: AbilityId;
  element: Element;
  damageType: DamageType;
  /** The action category that created this hit; omitted for turn-start DoT ticks. */
  actionType?: ActionType;
  scalingStat: StatKey;
  multiplier: number;
  extraFlatDamage?: number;
  toughnessDamage?: number;
  /** Optional multiplier for the explicit super-break formula. */
  superBreakMultiplier?: number;
  /** Permit toughness damage when the target lacks the matching weakness. */
  ignoresWeakness?: boolean;
  /** Fraction of toughness damage retained when the hit is off weakness. */
  offWeaknessToughnessMultiplier?: number;
  /** Element whose Weakness Break effect is emitted when the hit breaks. */
  breakElement?: Element;
  /** Versioned calibration seam for the level-based break base table. */
  breakBaseDamage?: number;
  canCrit?: boolean;
  snapshot?: DamageSnapshot;
}

/** A one-hit adjustment returned by a BEFORE_DAMAGE hook. */
export interface ModifyDamageIntent {
  kind: 'modify_damage';
  damageBoost?: number;
  defReduction?: number;
  defIgnore?: number;
  resPen?: number;
  vulnerability?: number;
  damageReduction?: number;
  critRateBonus?: number;
  critDmgBonus?: number;
  multiplierBonus?: number;
  flatDamageBonus?: number;
  breakDamageBoost?: number;
  superBreakDamageBoost?: number;
}

export interface BounceDamageIntent {
  kind: 'bounce_damage';
  source: UnitId;
  ability: AbilityId;
  element: Element;
  damageType: DamageType;
  scalingStat: StatKey;
  multiplier: number;
  hits: number;
  candidateTargets: UnitId[];
  toughnessDamage?: number;
  ignoresWeakness?: boolean;
  offWeaknessToughnessMultiplier?: number;
  breakElement?: Element;
  canCrit?: boolean;
  actionType?: ActionType;
}

export interface HealIntent {
  kind: 'heal';
  source: UnitId;
  target: UnitId;
  scalingStat: StatKey;
  multiplier: number;
  flatAmount?: number;
}

export interface ReviveIntent {
  kind: 'revive';
  source: UnitId;
  target: UnitId;
  scalingStat?: StatKey;
  multiplier: number;
  flatAmount?: number;
}

export interface ModifyCustomIntent {
  kind: 'modify_custom';
  target: UnitId;
  key: string;
  delta?: number;
  value?: JsonValue;
  min?: number;
  max?: number;
}

export interface ResourceIntent {
  kind: 'energy' | 'skill_points';
  target?: UnitId;
  amount: number;
}

export interface ToughnessIntent {
  kind: 'toughness';
  source: UnitId;
  target: UnitId;
  amount: number;
}

export interface LoseHpIntent {
  kind: 'lose_hp';
  source: UnitId;
  target: UnitId;
  amount: number;
  minimumHp?: number;
}

export interface ImplantWeaknessIntent {
  kind: 'implant_weakness';
  source: UnitId;
  target: UnitId;
  element: Element;
  duration?: number;
}

export interface TauntIntent {
  kind: 'taunt';
  source: UnitId;
  target: UnitId;
  bonus: number;
  duration: number;
}

export interface RemoveModifierIntent {
  kind: 'remove_modifier';
  target: UnitId;
  id: string;
}

export interface TimelineIntent {
  kind: 'advance_forward' | 'delay_action';
  target: UnitId;
  ratio: number;
}

export interface StatModifierIntent {
  kind: 'modify_stat';
  source: UnitId;
  target: UnitId;
  modifier: Omit<ModifierState, 'source'>;
}

export interface ApplyDotIntent {
  kind: 'apply_dot';
  source: UnitId;
  target: UnitId;
  ability: AbilityId;
  dotId: string;
  element: Element;
  /** Break DoTs use the break-level snapshot instead of ATK/HP scaling. */
  damageType?: 'dot' | 'break';
  /** Optional calibrated base value before the intent multiplier. */
  breakBaseDamage?: number;
  scalingStat: StatKey;
  multiplier: number;
  toughnessDamage?: number;
  duration: number;
  /** Base application chance before Effect Hit Rate/Effect RES adjustment. */
  chance?: number;
}

export interface DetonateDotsIntent {
  kind: 'detonate_dots';
  source: UnitId;
  target: UnitId;
  ability: AbilityId;
  multiplier: number;
}

export interface ShieldIntent {
  kind: 'shield';
  source: UnitId;
  target: UnitId;
  id: string;
  scalingStat: StatKey;
  multiplier: number;
  flatAmount?: number;
  duration: number;
}

export interface CleanseIntent {
  kind: 'cleanse';
  source: UnitId;
  target: UnitId;
  count: number;
}

export interface EnterPhaseIntent {
  kind: 'enter_phase';
  target: UnitId;
  phase: number;
  actions: string[];
}

export interface ApplyStatusIntent {
  kind: 'apply_status';
  source: UnitId;
  target: UnitId;
  status: StatusInstance;
  chance?: number;
}

export interface TriggerActionIntent {
  kind: 'trigger_action';
  source: UnitId;
  actor: UnitId;
  ability: AbilityId;
  targets: UnitId[];
}

export interface SummonIntent {
  kind: 'summon';
  source: UnitId;
  unit: CreateUnitInput;
}

export type EffectIntent = DamageIntent | ModifyDamageIntent | BounceDamageIntent | HealIntent | ReviveIntent | ModifyCustomIntent | ResourceIntent | ToughnessIntent | LoseHpIntent | ImplantWeaknessIntent | TauntIntent | RemoveModifierIntent | TimelineIntent | StatModifierIntent | ApplyDotIntent | DetonateDotsIntent | ShieldIntent | CleanseIntent | ApplyStatusIntent | TriggerActionIntent | SummonIntent | EnterPhaseIntent;

export interface ActionResolveContext {
  readonly state: Readonly<BattleState>;
  readonly actor: Readonly<UnitState>;
  readonly targetIds: readonly UnitId[];
  getUnit(id: UnitId): Readonly<UnitState>;
}

export interface ActionDefinition {
  id: AbilityId;
  actionType: ActionType;
  spCost?: number;
  energyCost?: number;
  energyGain?: number;
  spGain?: number;
  resolve(context: ActionResolveContext): EffectIntent[];
}

export interface RuleHookContext {
  readonly state: Readonly<BattleState>;
  readonly event: ReplayEvent;
  readonly owner: UnitId;
  readonly depth: number;
}

export interface RuleHook {
  id: string;
  owner: UnitId;
  on: ReplayEvent['type'];
  priority: number;
  maxTriggersPerStep?: number;
  resolve(context: RuleHookContext): EffectIntent[];
}

export interface UnitRules {
  actions: Record<AbilityId, ActionDefinition>;
  hooks?: RuleHook[];
}

export interface RuleCatalog {
  getUnitRules(unitId: UnitId): UnitRules | undefined;
  getHooks(eventType: ReplayEvent['type']): readonly RuleHook[];
}

export interface CreateUnitInput {
  id: UnitId;
  name?: string;
  faction: Faction;
  baseAggro?: number;
  taunt?: number;
  level?: number;
  stats: StatSheet;
  hp?: number;
  maxHp?: number;
  energy?: number;
  maxEnergy?: number;
  toughness?: ToughnessState;
  weaknesses?: Element[];
  resistance?: Partial<Record<Element, number>>;
  statuses?: StatusInstance[];
  modifiers?: ModifierState[];
  dots?: DotState[];
  shields?: ShieldState[];
  damageReductions?: number[];
  equipment?: EquipmentLoadoutState;
  custom?: Record<string, JsonValue>;
  nextActionAt?: number;
}

export interface CreateBattleStateInput {
  units: CreateUnitInput[];
  skillPoints?: number;
  maxSkillPoints?: number;
  clock?: number;
  cycle?: number;
  rngSeed?: number;
  wave?: number;
  totalWaves?: number;
}

import { clamp, effectiveStats, elementDamageStat, statValue } from './stats.js';
import { nextRandom } from './rng.js';
import { findUnit } from './state.js';
import { StatKey, type BattleState, type DamageContext, type DamageIntent, type DamageMode, type DamageType, type Element, type RngState } from './types.js';

export interface DamageResult {
  amount: number;
  rawAmount: number;
  critical: boolean;
  criticalProbability: number;
  expected: boolean;
  rngDraw?: number;
  defenseMultiplier: number;
  resistanceMultiplier: number;
  damageBoostMultiplier: number;
  damageReductionMultiplier: number;
  vulnerabilityMultiplier: number;
  toughnessMultiplier: number;
  toughnessDamage: number;
  rng: RngState;
}

export function createDamageContext(state: BattleState, intent: DamageIntent): DamageContext {
  const source = findUnit(state, intent.source);
  const target = findUnit(state, intent.target);
  const sourceStats = effectiveStats(source);
  const targetStats = effectiveStats(target);
  const snapshot = intent.snapshot;
  const actionDamageBonus = intent.damageType === 'dot' || intent.actionType === undefined
    ? 0
    : statValue(sourceStats, actionDamageStat(intent.actionType));
  const dotDamageBonus = intent.damageType === 'dot'
    ? (snapshot?.dotDamageBonus ?? statValue(sourceStats, StatKey.DmgBoostDot))
    : 0;
  return {
    damageBoost: (snapshot?.elementDamageBonus ?? statValue(sourceStats, elementDamageStat(intent.element)))
      + (snapshot?.allDamageBonus ?? statValue(sourceStats, StatKey.DmgBoostAll))
      + actionDamageBonus
      + dotDamageBonus,
    defReduction: clamp(statValue(targetStats, StatKey.DefReduction), 0, 1),
    defIgnore: snapshot?.defIgnore ?? clamp(statValue(sourceStats, StatKey.DefIgnore), 0, 1),
    resPen: snapshot?.resPen ?? statValue(sourceStats, StatKey.ResPen),
    vulnerability: snapshot?.vulnerability ?? statValue(targetStats, StatKey.Vulnerability),
    damageReductions: target.damageReductions.slice(),
    critRateBonus: 0,
    critDmgBonus: 0,
    multiplierBonus: 0,
    flatDamageBonus: 0,
    breakDamageBoost: statValue(sourceStats, StatKey.BreakDmgBoost),
    superBreakDamageBoost: statValue(sourceStats, StatKey.SuperBreakDmgBoost),
  };
}

export function calculateDamage(state: BattleState, intent: DamageIntent, options: { mode?: DamageMode; context?: DamageContext } = {}): DamageResult {
  const source = findUnit(state, intent.source);
  const target = findUnit(state, intent.target);
  const sourceStats = effectiveStats(source);
  const targetStats = effectiveStats(target);
  const snapshot = intent.snapshot;
  const context = options.context ?? createDamageContext(state, intent);
  const sourceLevel = snapshot?.sourceLevel ?? source.level;
  let rng = state.rng;
  const mode = options.mode ?? 'sampled';
  const canCrit = intent.canCrit ?? (intent.damageType === 'normal' || intent.damageType === 'additional');
  let critical = false;
  let criticalProbability = 0;
  let critMultiplier = 1;
  let rngDraw: number | undefined;
  if (canCrit) {
    const critRate = clamp(statValue(sourceStats, StatKey.CritRate) + context.critRateBonus, 0, 1);
    criticalProbability = critRate;
    if (mode === 'expected') {
      critMultiplier = 1 + critRate * (statValue(sourceStats, StatKey.CritDmg) + context.critDmgBonus);
    } else {
      if (critRate >= 1) {
        critical = true;
      } else if (critRate > 0) {
        const roll = nextRandom(rng);
        rng = roll.rng;
        rngDraw = roll.value;
        critical = roll.value < critRate;
      }
      critMultiplier = critical ? 1 + statValue(sourceStats, StatKey.CritDmg) + context.critDmgBonus : 1;
    }
  }

  const scaling = snapshot?.scalingValue ?? statValue(sourceStats, intent.scalingStat);
  const isSuperBreak = intent.damageType === 'super_break' && intent.toughnessDamage !== undefined;
  const baseAmount = isSuperBreak
    ? target.toughness.broken
      ? (intent.breakBaseDamage ?? breakLevelMultiplier(sourceLevel))
        * (intent.toughnessDamage! / 10)
        * (1 + statValue(sourceStats, StatKey.BreakEffect))
        * (intent.superBreakMultiplier ?? intent.multiplier)
        * (1 + context.superBreakDamageBoost)
      : 0
    : scaling * (intent.multiplier + context.multiplierBonus) + (intent.extraFlatDamage ?? 0) + context.flatDamageBonus;
  const breakAmount = intent.damageType === 'break' ? baseAmount * (1 + context.breakDamageBoost) : baseAmount;
  const damageBoostMultiplier = intent.damageType === 'break' || intent.damageType === 'super_break'
    ? 1
    : 1 + context.damageBoost;
  const targetDefense = Math.max(0, statValue(targetStats, StatKey.DEF) * (1 - clamp(context.defReduction + context.defIgnore, 0, 1)));
  const defenseMultiplier = 1 - targetDefense / (targetDefense + 200 + 10 * sourceLevel);
  const effectiveResistance = target.weaknesses.includes(intent.element)
    ? 0
    : target.resistance[intent.element] - context.resPen;
  const resistanceMultiplier = 1 - clamp(effectiveResistance, -1, 0.9);
  const vulnerabilityMultiplier = 1 + context.vulnerability;
  const damageReductionMultiplier = context.damageReductions
    .concat(statValue(targetStats, StatKey.DmgReduction))
    .map((reduction) => 1 - clamp(reduction, 0, 1))
    .reduce((product, multiplier) => product * multiplier, 1);
  const toughnessMultiplier = target.toughness.broken || intent.damageType === 'super_break' ? 1 : 0.9;
  const rawAmount = breakAmount
    * critMultiplier
    * damageBoostMultiplier
    * defenseMultiplier
    * resistanceMultiplier
    * vulnerabilityMultiplier
    * damageReductionMultiplier
    * toughnessMultiplier;

  return {
    amount: Math.max(0, Math.floor(rawAmount + 1e-9)),
    rawAmount,
    critical,
    criticalProbability,
    expected: mode === 'expected',
    rngDraw,
    defenseMultiplier,
    resistanceMultiplier,
    damageBoostMultiplier,
    damageReductionMultiplier,
    vulnerabilityMultiplier,
    toughnessMultiplier,
    toughnessDamage: intent.toughnessDamage ?? 0,
    rng,
  };
}

function actionDamageStat(actionType: NonNullable<DamageIntent['actionType']>): StatKey {
  switch (actionType) {
    case 'basic': return StatKey.DmgBoostBasic;
    case 'skill': return StatKey.DmgBoostSkill;
    case 'ultimate': return StatKey.DmgBoostUltimate;
    case 'follow_up': return StatKey.DmgBoostFollowUp;
    case 'technique': return StatKey.DmgBoostTechnique;
    case 'insert': return StatKey.DmgBoostAdditional;
  }
}

export function breakBaseDamage(level: number, element: Element): number {
  return breakLevelMultiplier(level) * breakElementMultiplier(element);
}

/**
 * The level multiplier used by Weakness Break and Super Break.
 *
 * This is intentionally kept in the engine rather than derived from the
 * character's ATK. It is a versioned game constant; callers that are
 * calibrating another client revision can still override the break formula
 * through BattleKernelOptions/DamageIntent.
 */
export function breakLevelMultiplier(level: number): number {
  const clampedLevel = Math.max(1, Math.min(BREAK_LEVEL_MULTIPLIERS.length - 1, Math.floor(level)));
  return BREAK_LEVEL_MULTIPLIERS[clampedLevel] ?? BREAK_LEVEL_MULTIPLIERS[80]!;
}

/** Element coefficient for the immediate Weakness Break hit. */
export function breakElementMultiplier(element: Element): number {
  const elementMultiplier: Record<Element, number> = {
    physical: 2,
    fire: 2,
    ice: 1,
    lightning: 1,
    wind: 1.5,
    quantum: 0.5,
    imaginary: 0.5,
  };
  return elementMultiplier[element];
}

/**
 * Max-toughness multiplier in the engine's canonical toughness unit.
 *
 * Unit convention: `ToughnessState.max` stores raw toughness points (10 for
 * a basic-attack bar unit, 20 for a skill bar unit, etc.), so the calibrated
 * coefficient is 0.5 + max/120. A data adapter may override this when its
 * source represents the bar in another unit.
 */
export function defaultBreakToughnessFactor(maxToughness: number): number {
  return 0.5 + Math.max(0, maxToughness) / 120;
}

export function damageTypeCanCrit(type: DamageType): boolean {
  return type === 'normal' || type === 'additional';
}

// Pinned to the current 4.4 TurnBasedGameData AvatarBreakDamage table
// (levels 1..100; the source also contains a separate level-120 row).
// Index 0 is a sentinel so callers can use the game level directly.
const BREAK_LEVEL_MULTIPLIERS = [
  0,
  54.000000, 58.000000, 62.000000, 67.526380, 70.509400, 73.522820, 76.566050, 79.638466, 82.739460, 85.868440,
  91.494410, 97.067986, 102.589165, 108.057945, 113.474335, 118.838326, 124.149920, 129.409120, 134.615920, 139.770340,
  149.332290, 158.801120, 168.176820, 177.459400, 186.648850, 195.745180, 204.748380, 213.658460, 222.475400, 231.199230,
  246.427570, 261.180970, 275.473330, 289.317900, 302.727480, 315.714400, 328.290470, 340.467130, 352.255370, 363.665800,
  408.124000, 451.788300, 494.679780, 536.818800, 578.224900, 618.917200, 658.913800, 698.232540, 736.890500, 774.904100,
  871.059940, 964.870540, 1056.420700, 1145.791000, 1233.058500, 1318.296500, 1401.575100, 1482.960800, 1562.517800, 1640.306800,
  1752.321500, 1861.901100, 1969.124100, 2074.066000, 2176.798300, 2277.390400, 2375.908400, 2472.416000, 2566.973900, 2659.640600,
  2780.304400, 2898.602300, 3014.603000, 3128.373000, 3239.975800, 3349.473100, 3456.923600, 3562.384300, 3665.910000, 3767.553500,
  3957.861800, 4155.212000, 4359.864000, 4572.088000, 4792.164000, 5020.383300, 5257.047000, 5502.466300, 5756.967000, 6020.884000,
  6294.565400, 6578.373500, 6872.682600, 7177.881000, 7494.371600, 7822.572300, 8162.916500, 8515.854000, 8881.850000, 9261.387000,
] as const;

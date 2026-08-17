import { STAT_COUNT, StatKey, type Element, type StatSheet, type UnitState } from './types.js';

const BASE_SCALED_STATS = new Set<StatKey>([
  StatKey.HP,
  StatKey.ATK,
  StatKey.DEF,
  StatKey.SPD,
]);

export interface CreateStatsInput {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  critRate?: number;
  critDmg?: number;
  breakEffect?: number;
  breakEfficiency?: number;
  breakDmgBoost?: number;
  superBreakDmgBoost?: number;
  effectHitRate?: number;
  effectRes?: number;
  energyRegen?: number;
  healBoost?: number;
  percent?: Partial<Record<StatKey, number>>;
  flat?: Partial<Record<StatKey, number>>;
}

export function createStats(input: CreateStatsInput): StatSheet {
  const base = new Float64Array(STAT_COUNT);
  const percent = new Float64Array(STAT_COUNT);
  const flat = new Float64Array(STAT_COUNT);

  base[StatKey.HP] = input.hp;
  base[StatKey.ATK] = input.atk;
  base[StatKey.DEF] = input.def;
  base[StatKey.SPD] = input.spd;
  base[StatKey.CritRate] = input.critRate ?? 0.05;
  base[StatKey.CritDmg] = input.critDmg ?? 0.5;
  base[StatKey.BreakEffect] = input.breakEffect ?? 0;
  base[StatKey.BreakEfficiency] = input.breakEfficiency ?? 0;
  base[StatKey.BreakDmgBoost] = input.breakDmgBoost ?? 0;
  base[StatKey.SuperBreakDmgBoost] = input.superBreakDmgBoost ?? 0;
  base[StatKey.EffectHitRate] = input.effectHitRate ?? 0;
  base[StatKey.EffectRes] = input.effectRes ?? 0;
  base[StatKey.EnergyRegen] = input.energyRegen ?? 1;
  base[StatKey.HealBoost] = input.healBoost ?? 0;

  for (const [key, value] of Object.entries(input.percent ?? {})) {
    percent[Number(key)] = value;
  }
  for (const [key, value] of Object.entries(input.flat ?? {})) {
    flat[Number(key)] = value;
  }

  return { base, percent, flat };
}

export function cloneStats(stats: StatSheet): StatSheet {
  return {
    base: stats.base.slice(),
    percent: stats.percent.slice(),
    flat: stats.flat.slice(),
  };
}

export function statValue(stats: StatSheet, key: StatKey): number {
  if (BASE_SCALED_STATS.has(key)) {
    return stats.base[key]! * (1 + stats.percent[key]!) + stats.flat[key]!;
  }
  return stats.base[key]! + stats.percent[key]! + stats.flat[key]!;
}

export function addStatModifier(
  stats: StatSheet,
  key: StatKey,
  modifier: { percent?: number; flat?: number },
): StatSheet {
  const next = cloneStats(stats);
  next.percent[key] = next.percent[key]! + (modifier.percent ?? 0);
  next.flat[key] = next.flat[key]! + (modifier.flat ?? 0);
  return next;
}

export function effectiveStats(unit: Pick<UnitState, 'stats' | 'modifiers'>): StatSheet {
  let result = cloneStats(unit.stats);
  for (const modifier of unit.modifiers) {
    result = addStatModifier(result, modifier.stat, modifier);
  }
  return result;
}

export function elementDamageStat(element: Element): StatKey {
  switch (element) {
    case 'physical': return StatKey.DmgBoostPhysical;
    case 'fire': return StatKey.DmgBoostFire;
    case 'ice': return StatKey.DmgBoostIce;
    case 'lightning': return StatKey.DmgBoostLightning;
    case 'wind': return StatKey.DmgBoostWind;
    case 'quantum': return StatKey.DmgBoostQuantum;
    case 'imaginary': return StatKey.DmgBoostImaginary;
  }
}

export function clamp(value: number, lower: number, upper: number): number {
  return Math.min(upper, Math.max(lower, value));
}

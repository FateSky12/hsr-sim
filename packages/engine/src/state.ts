import { cloneStats, statValue } from './stats.js';
import { createRng } from './rng.js';
import {
  type BattleState,
  type CreateBattleStateInput,
  type CreateUnitInput,
  type Element,
  type JsonValue,
  type UnitState,
} from './types.js';
import { StatKey } from './types.js';

const ELEMENTS: Element[] = [
  'physical',
  'fire',
  'ice',
  'lightning',
  'wind',
  'quantum',
  'imaginary',
];

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

export function createUnit(input: CreateUnitInput): UnitState {
  const stats = cloneStats(input.stats);
  const maxHp = input.maxHp ?? statValue(stats, StatKey.HP);
  const resistance = defaultResistance();
  for (const element of ELEMENTS) {
    const value = input.resistance?.[element];
    if (value !== undefined) resistance[element] = value;
  }
  return {
    id: input.id,
    name: input.name ?? input.id,
    faction: input.faction,
    baseAggro: input.baseAggro ?? 1,
    taunt: input.taunt ?? 0,
    level: input.level ?? 80,
    hp: input.hp ?? maxHp,
    maxHp,
    stats,
    energy: input.energy ?? 0,
    maxEnergy: input.maxEnergy ?? 0,
    toughness: input.toughness ?? { current: 0, max: 0, broken: false },
    weaknesses: [...(input.weaknesses ?? [])],
    resistance,
    statuses: input.statuses?.map(cloneStatus) ?? [],
    modifiers: input.modifiers?.map((modifier) => ({ ...modifier })) ?? [],
    dots: input.dots?.map(cloneDot) ?? [],
    shields: input.shields?.map((shield) => ({ ...shield })) ?? [],
    damageReductions: [...(input.damageReductions ?? [])],
    equipment: input.equipment ? { lightConeId: input.equipment.lightConeId, relicIds: [...input.equipment.relicIds], setIds: [...input.equipment.setIds], setCounts: input.equipment.setCounts ? { ...input.equipment.setCounts } : undefined } : undefined,
    custom: cloneJsonObject(input.custom ?? {}),
    alive: (input.hp ?? maxHp) > 0,
    nextActionAt: input.nextActionAt ?? 0,
    actionGeneration: 0,
  };
}

export function createBattleState(input: CreateBattleStateInput): BattleState {
  return {
    schemaVersion: 1,
    clock: input.clock ?? 0,
    cycle: input.cycle ?? 0,
    skillPoints: input.skillPoints ?? 3,
    maxSkillPoints: input.maxSkillPoints ?? 5,
    units: input.units.map(createUnit),
    rng: createRng(input.rngSeed ?? 1),
    eventSequence: 0,
    wave: input.wave ?? 1,
    totalWaves: input.totalWaves ?? 1,
    battleStarted: false,
  };
}

export function cloneBattleState(state: BattleState): BattleState {
  return {
    schemaVersion: 1,
    clock: state.clock,
    cycle: state.cycle,
    skillPoints: state.skillPoints,
    maxSkillPoints: state.maxSkillPoints,
    eventSequence: state.eventSequence,
    wave: state.wave,
    totalWaves: state.totalWaves,
    battleStarted: state.battleStarted,
    rng: { ...state.rng },
    units: state.units.map(cloneUnit),
  };
}

export function cloneUnit(unit: UnitState): UnitState {
  return {
    ...unit,
    stats: {
      base: unit.stats.base.slice(),
      percent: unit.stats.percent.slice(),
      flat: unit.stats.flat.slice(),
    },
    toughness: { ...unit.toughness },
    weaknesses: [...unit.weaknesses],
    resistance: { ...unit.resistance },
    statuses: unit.statuses.map(cloneStatus),
    modifiers: unit.modifiers.map((modifier) => ({ ...modifier })),
    dots: unit.dots.map(cloneDot),
    shields: unit.shields.map((shield) => ({ ...shield })),
    damageReductions: [...unit.damageReductions],
    equipment: unit.equipment ? { lightConeId: unit.equipment.lightConeId, relicIds: [...unit.equipment.relicIds], setIds: [...unit.equipment.setIds], setCounts: unit.equipment.setCounts ? { ...unit.equipment.setCounts } : undefined } : undefined,
    custom: cloneJsonObject(unit.custom),
  };
}

export function findUnit(state: BattleState, id: string): UnitState {
  const unit = state.units.find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`Unknown unit: ${id}`);
  return unit;
}

function cloneStatus(status: UnitState['statuses'][number]): UnitState['statuses'][number] {
  return {
    ...status,
    custom: status.custom ? cloneJsonObject(status.custom) : undefined,
    snapshot: status.snapshot === undefined ? undefined : cloneJson(status.snapshot),
  };
}

function cloneDot(dot: UnitState['dots'][number]): UnitState['dots'][number] {
  return {
    ...dot,
    snapshot: { ...dot.snapshot },
  };
}

function cloneJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (value !== null && typeof value === 'object') {
    return cloneJsonObject(value);
  }
  return value;
}

function cloneJsonObject(value: Record<string, JsonValue>): Record<string, JsonValue> {
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneJson(child)]));
}

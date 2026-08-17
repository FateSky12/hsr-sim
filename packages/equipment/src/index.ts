import {
  trainingEquipmentLoadouts,
  trainingLightCone,
  trainingRelicSet,
  trainingRelics,
} from '@hsr-sim/data';
import type {
  CharacterData,
  EquipmentLoadout,
  EquipmentPassive,
  EquipmentStat,
  EquipmentStatValue,
  LightConeData,
  RelicInstanceData,
  RelicSetData,
} from '@hsr-sim/data';
import {
  createRuleCatalog,
  createStats,
  createUnit,
  StatKey,
  statValue,
  type RuleCatalog,
  type UnitRules,
  type UnitState,
} from '@hsr-sim/engine';

export interface EquipmentCatalog {
  lightCones: ReadonlyMap<string, LightConeData>;
  relics: ReadonlyMap<string, RelicInstanceData>;
  sets: ReadonlyMap<string, RelicSetData>;
  loadouts: ReadonlyMap<string, EquipmentLoadout>;
}

export interface EquipmentCatalogInput {
  lightCones?: readonly LightConeData[];
  relics?: readonly RelicInstanceData[];
  sets?: readonly RelicSetData[];
  loadouts?: Readonly<Record<string, EquipmentLoadout>>;
}

export function createEquipmentCatalog(input: EquipmentCatalogInput = {}): EquipmentCatalog {
  return {
    lightCones: new Map([
      [trainingLightCone.id, trainingLightCone],
      ...(input.lightCones ?? []).map((lightCone) => [lightCone.id, lightCone] as const),
    ]),
    relics: new Map([
      ...trainingRelics.map((relic) => [relic.id, relic] as const),
      ...(input.relics ?? []).map((relic) => [relic.id, relic] as const),
    ]),
    sets: new Map([
      [trainingRelicSet.id, trainingRelicSet],
      ...(input.sets ?? []).map((set) => [set.id, set] as const),
    ]),
    loadouts: new Map([
      ...Object.entries(trainingEquipmentLoadouts),
      ...Object.entries(input.loadouts ?? {}),
    ]),
  };
}

export function createEquippedUnit(
  character: CharacterData,
  loadoutId: string,
  catalog: EquipmentCatalog = createEquipmentCatalog(),
): UnitState {
  const loadout = catalog.loadouts.get(loadoutId);
  if (!loadout) throw new Error(`Unknown equipment loadout: ${loadoutId}`);
  return createEquippedUnitFromLoadout(character, loadout, catalog);
}

export function createEquippedUnitFromLoadout(
  character: CharacterData,
  loadout: EquipmentLoadout,
  catalog: EquipmentCatalog = createEquipmentCatalog(),
): UnitState {
  const unit = createUnit({
    id: character.id,
    name: character.name,
    faction: 'ally',
    level: character.level,
    stats: createStats(character.baseStats),
    maxEnergy: character.maxEnergy ?? 100,
    custom: { element: character.element },
  });

  if (loadout.lightConeId) {
    const lightCone = catalog.lightCones.get(loadout.lightConeId);
    if (!lightCone) throw new Error(`Unknown light cone: ${loadout.lightConeId}`);
    addBaseStats(unit, lightCone.baseStats);
    for (const value of lightCone.staticStats) addEquipmentStat(unit, value);
  }

  const relics = loadout.relicIds.map((id) => {
    const relic = catalog.relics.get(id);
    if (!relic) throw new Error(`Unknown relic: ${id}`);
    return relic;
  });
  validateRelicSlots(relics);
  for (const relic of relics) {
    addEquipmentStat(unit, relic.mainStat);
    for (const subStat of relic.subStats) addEquipmentStat(unit, subStat);
  }

  const setCounts = countSets(relics);
  const setIds = [...setCounts.keys()].sort();
  for (const setId of setIds) {
    const set = catalog.sets.get(setId);
    if (!set) throw new Error(`Unknown relic set: ${setId}`);
    const count = setCounts.get(setId)!;
    if (count >= 2) for (const value of set.twoPiece) addEquipmentStat(unit, value);
    if (count >= 4) for (const value of set.fourPiece) addEquipmentStat(unit, value);
  }

  // Equipment changes the derived HP pool. `createUnit` initialized maxHp
  // before the light cone/relic stats were applied, so refresh the full-health
  // baseline after all static equipment has been folded into the stat sheet.
  unit.maxHp = statValue(unit.stats, StatKey.HP);
  unit.hp = unit.maxHp;

  unit.equipment = {
    lightConeId: loadout.lightConeId,
    relicIds: [...loadout.relicIds],
    setIds,
    setCounts: Object.fromEntries(setCounts),
  };
  return unit;
}

/**
 * Equipment rules have their own seam even when a data revision only contains
 * static passives. Dynamic light-cone/set passives will compile into hooks here.
 */
export function createEquipmentRules(
  catalog: EquipmentCatalog,
  units: readonly UnitState[] = [],
): RuleCatalog {
  const definitions: Record<string, UnitRules> = {};
  for (const unit of units) {
    const hooks = [] as NonNullable<UnitRules['hooks']>;
    const lightCone = unit.equipment?.lightConeId ? catalog.lightCones.get(unit.equipment.lightConeId) : undefined;
    const lightConePassives = lightCone?.passives ?? (lightCone?.passive ? [lightCone.passive] : []);
    if (lightCone) {
      for (const passive of lightConePassives) hooks.push(createPassiveHook(unit, lightCone.id, passive));
    }
    for (const setId of unit.equipment?.setIds ?? []) {
      const setCount = unit.equipment?.setCounts?.[setId];
      if (setCount !== undefined && setCount < 4) continue;
      const set = catalog.sets.get(setId);
      for (const passive of set?.passives ?? []) hooks.push(createPassiveHook(unit, setId, passive));
    }
    definitions[unit.id] = { actions: {}, hooks };
  }
  return createRuleCatalog(definitions);
}

function createPassiveHook(
  ownerUnit: UnitState,
  sourceId: string,
  passive: EquipmentPassive,
): NonNullable<UnitRules['hooks']>[number] {
  return {
    id: `equipment:${sourceId}:${passive.id}:${ownerUnit.id}`,
    owner: ownerUnit.id,
    on: passive.trigger,
    priority: 100,
    maxTriggersPerStep: passive.maxTriggersPerStep ?? 100,
    resolve: ({ event, owner, state }) => {
      if (!equipmentEventMatches(event, passive.trigger, owner)) return [];
      const targets = passive.target === 'all_targets'
        ? state.units.filter((unit) => unit.alive && unit.faction === ownerUnit.faction).map((unit) => unit.id)
        : passive.target === 'event_target'
          ? eventTarget(event)
          : [owner];
      if (targets.length === 0) return [];
      const mapped = mapEquipmentStat(passive.modifier.stat);
      return targets.map((target) => ({
        kind: 'modify_stat' as const,
        source: owner,
        target,
        modifier: {
          id: `equipment:${sourceId}:${passive.id}`,
          stat: mapped.key,
          percent: mapped.percent ? passive.modifier.value : undefined,
          flat: mapped.percent ? undefined : passive.modifier.value,
          remainingTurns: passive.duration,
          stacking: passive.stacking,
        },
      }));
    },
  };
}

function equipmentEventMatches(
  event: Parameters<NonNullable<UnitRules['hooks']>[number]['resolve']>[0]['event'],
  trigger: EquipmentPassive['trigger'],
  owner: string,
  ): boolean {
  switch (trigger) {
    case 'BATTLE_START': return event.type === 'BATTLE_START';
    case 'ACTION_STARTED': return event.type === 'ACTION_STARTED' && event.actor === owner;
    case 'BASIC_USED': return event.type === 'BASIC_USED' && event.actor === owner;
    case 'SKILL_USED': return event.type === 'SKILL_USED' && event.actor === owner;
    case 'ULT_USED': return event.type === 'ULT_USED' && event.actor === owner;
    case 'FOLLOW_UP_USED': return event.type === 'FOLLOW_UP_USED' && event.actor === owner;
    case 'WEAKNESS_BREAK': return event.type === 'WEAKNESS_BREAK' && event.source === owner;
    case 'HP_LOSS': return event.type === 'HP_LOSS' && event.target === owner;
    case 'KILL': return event.type === 'KILL' && event.source === owner;
  }
}

function eventTarget(
  event: Parameters<NonNullable<UnitRules['hooks']>[number]['resolve']>[0]['event'],
): string[] {
  if ('targets' in event && Array.isArray(event.targets)) return event.targets.filter((target): target is string => typeof target === 'string');
  if ('target' in event && typeof event.target === 'string') return [event.target];
  if ('actor' in event && typeof event.actor === 'string') return [event.actor];
  return [];
}

function addBaseStats(unit: UnitState, baseStats: { hp: number; atk: number; def: number; spd: number }): void {
  unit.stats.base[0] = unit.stats.base[0]! + baseStats.hp;
  unit.stats.base[1] = unit.stats.base[1]! + baseStats.atk;
  unit.stats.base[2] = unit.stats.base[2]! + baseStats.def;
  unit.stats.base[3] = unit.stats.base[3]! + baseStats.spd;
}

function addEquipmentStat(unit: UnitState, value: EquipmentStatValue): void {
  const mapped = mapEquipmentStat(value.stat);
  if (mapped.percent) unit.stats.percent[mapped.key] = unit.stats.percent[mapped.key]! + value.value;
  else unit.stats.flat[mapped.key] = unit.stats.flat[mapped.key]! + value.value;
}

function mapEquipmentStat(stat: EquipmentStat): { key: StatKey; percent: boolean } {
  switch (stat) {
    case 'HP': return { key: StatKey.HP, percent: false };
    case 'HPPercent': return { key: StatKey.HP, percent: true };
    case 'ATK': return { key: StatKey.ATK, percent: false };
    case 'ATKPercent': return { key: StatKey.ATK, percent: true };
    case 'DEF': return { key: StatKey.DEF, percent: false };
    case 'DEFPercent': return { key: StatKey.DEF, percent: true };
    case 'SPD': return { key: StatKey.SPD, percent: false };
    case 'SPDPercent': return { key: StatKey.SPD, percent: true };
    case 'CritRate': return { key: StatKey.CritRate, percent: false };
    case 'CritDmg': return { key: StatKey.CritDmg, percent: false };
    case 'BreakEffect': return { key: StatKey.BreakEffect, percent: false };
    case 'EffectHitRate': return { key: StatKey.EffectHitRate, percent: false };
    case 'EffectRes': return { key: StatKey.EffectRes, percent: false };
    case 'EnergyRegen': return { key: StatKey.EnergyRegen, percent: false };
    case 'HealBoost': return { key: StatKey.HealBoost, percent: false };
    case 'DmgBoostAll': return { key: StatKey.DmgBoostAll, percent: false };
    case 'DmgBoostPhysical': return { key: StatKey.DmgBoostPhysical, percent: false };
    case 'DmgBoostFire': return { key: StatKey.DmgBoostFire, percent: false };
    case 'DmgBoostIce': return { key: StatKey.DmgBoostIce, percent: false };
    case 'DmgBoostLightning': return { key: StatKey.DmgBoostLightning, percent: false };
    case 'DmgBoostWind': return { key: StatKey.DmgBoostWind, percent: false };
    case 'DmgBoostQuantum': return { key: StatKey.DmgBoostQuantum, percent: false };
    case 'DmgBoostImaginary': return { key: StatKey.DmgBoostImaginary, percent: false };
    case 'ResPen': return { key: StatKey.ResPen, percent: false };
    case 'DefReduction': return { key: StatKey.DefReduction, percent: false };
    case 'Vulnerability': return { key: StatKey.Vulnerability, percent: false };
    case 'DmgBoostBasic': return { key: StatKey.DmgBoostBasic, percent: false };
    case 'DmgBoostSkill': return { key: StatKey.DmgBoostSkill, percent: false };
    case 'DmgBoostUltimate': return { key: StatKey.DmgBoostUltimate, percent: false };
    case 'DmgBoostFollowUp': return { key: StatKey.DmgBoostFollowUp, percent: false };
    case 'DmgBoostTechnique': return { key: StatKey.DmgBoostTechnique, percent: false };
    case 'DmgBoostAdditional': return { key: StatKey.DmgBoostAdditional, percent: false };
    case 'DmgBoostDot': return { key: StatKey.DmgBoostDot, percent: false };
    case 'BreakDmgBoost': return { key: StatKey.BreakDmgBoost, percent: false };
    case 'SuperBreakDmgBoost': return { key: StatKey.SuperBreakDmgBoost, percent: false };
  }
}

function validateRelicSlots(relics: readonly RelicInstanceData[]): void {
  const slots = new Set<string>();
  for (const relic of relics) {
    if (slots.has(relic.slot)) throw new Error(`Duplicate relic slot: ${relic.slot}`);
    slots.add(relic.slot);
  }
  if (relics.length > 6) throw new Error('A loadout cannot contain more than six relics');
}

function countSets(relics: readonly RelicInstanceData[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const relic of relics) counts.set(relic.setId, (counts.get(relic.setId) ?? 0) + 1);
  return counts;
}

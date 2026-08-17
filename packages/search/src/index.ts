import type {
  EquipmentLoadout,
  RelicInstanceData,
  RelicSlot,
  CharacterData,
} from '@hsr-sim/data';
import {
  type Element,
  StatKey,
  calculateDamage,
  cloneBattleState,
  cloneUnit,
  createBattleState,
  createStats,
  createUnit,
  type BattleState,
  type DamageType,
  type UnitState,
} from '@hsr-sim/engine';
import {
  createEquippedUnitFromLoadout,
  type EquipmentCatalog,
} from '@hsr-sim/equipment';

export const RELIC_SLOTS: readonly RelicSlot[] = ['head', 'hands', 'body', 'feet', 'planar_sphere', 'link_rope'];

export interface LoadoutCandidate {
  id: string;
  loadout: EquipmentLoadout;
}

export interface CandidateSpace {
  lightConeIds?: readonly string[];
  relics: readonly RelicInstanceData[];
  maxCandidates?: number;
}

export function generateLoadoutCandidates(space: CandidateSpace): LoadoutCandidate[] {
  const bySlot = new Map<RelicSlot, RelicInstanceData[]>();
  for (const slot of RELIC_SLOTS) bySlot.set(slot, []);
  for (const relic of space.relics) bySlot.get(relic.slot)?.push(relic);
  for (const slot of RELIC_SLOTS) {
    const options = bySlot.get(slot)!;
    if (options.length === 0) throw new Error(`Search space has no relic for slot ${slot}`);
    options.sort((left, right) => left.id.localeCompare(right.id));
  }

  const lightCones = space.lightConeIds?.length ? [...space.lightConeIds].sort() : [undefined];
  const candidates: LoadoutCandidate[] = [];
  const selected: RelicInstanceData[] = [];
  const maxCandidates = space.maxCandidates ?? Number.POSITIVE_INFINITY;

  const visit = (slotIndex: number): void => {
    if (candidates.length >= maxCandidates) return;
    if (slotIndex === RELIC_SLOTS.length) {
      const relicIds = selected.map((relic) => relic.id);
      for (const lightConeId of lightCones) {
        const loadout: EquipmentLoadout = { lightConeId, relicIds };
        candidates.push({ id: `${lightConeId ?? 'no_light_cone'}:${relicIds.join(',')}`, loadout });
        if (candidates.length >= maxCandidates) return;
      }
      return;
    }
    const slot = RELIC_SLOTS[slotIndex]!;
    for (const relic of bySlot.get(slot)!) {
      selected.push(relic);
      visit(slotIndex + 1);
      selected.pop();
      if (candidates.length >= maxCandidates) return;
    }
  };

  visit(0);
  return candidates;
}

export interface StaticDamageProbe {
  target: UnitState;
  element: Element;
  damageType?: DamageType;
  scalingStat?: StatKey;
  multiplier?: number;
  targetAlreadyBroken?: boolean;
}

export function scoreStaticCandidate(
  character: CharacterData,
  candidate: LoadoutCandidate,
  catalog: EquipmentCatalog,
  probe: StaticDamageProbe,
): number {
  const source = createEquippedUnitFromLoadout(character, candidate.loadout, catalog);
  const target = cloneUnit(probe.target);
  if (probe.targetAlreadyBroken !== undefined) target.toughness.broken = probe.targetAlreadyBroken;
  const state = createStateForProbe(source, target);
  return calculateDamage(state, {
    kind: 'damage',
    source: source.id,
    target: target.id,
    ability: 'static_probe',
    element: probe.element,
    damageType: probe.damageType ?? 'normal',
    scalingStat: probe.scalingStat ?? StatKey.ATK,
    multiplier: probe.multiplier ?? 1,
  }, { mode: 'expected' }).rawAmount;
}

export interface RankedCandidate {
  candidate: LoadoutCandidate;
  score: number;
}

export function rankCandidates(
  candidates: readonly LoadoutCandidate[],
  score: (candidate: LoadoutCandidate) => number,
  keep: number,
): RankedCandidate[] {
  return candidates
    .map((candidate) => ({ candidate, score: score(candidate) }))
    .sort((left, right) => right.score - left.score || left.candidate.id.localeCompare(right.candidate.id))
    .slice(0, Math.max(0, keep));
}

export interface TwoStageSearchResult<T> {
  coarse: RankedCandidate[];
  evaluated: Array<RankedCandidate & { fullScore: number; result: T }>;
  best?: RankedCandidate & { fullScore: number; result: T };
}

export function twoStageSearch<T>(input: {
  candidates: readonly LoadoutCandidate[];
  coarseScore: (candidate: LoadoutCandidate) => number;
  keep: number;
  simulate: (candidate: LoadoutCandidate) => { score: number; result: T };
}): TwoStageSearchResult<T> {
  const coarse = rankCandidates(input.candidates, input.coarseScore, input.keep);
  const evaluated = coarse
    .map((ranked) => {
      const full = input.simulate(ranked.candidate);
      return { ...ranked, fullScore: full.score, result: full.result };
    })
    .sort((left, right) => right.fullScore - left.fullScore || left.candidate.id.localeCompare(right.candidate.id));
  return { coarse, evaluated, best: evaluated[0] };
}

function createStateForProbe(source: UnitState, target: UnitState): BattleState {
  const state = createBattleState({ units: [] });
  state.units = [cloneUnit(source), cloneUnit(target)];
  return state;
}

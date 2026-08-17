import { nextRandom } from './rng.js';
import { findUnit } from './state.js';
import type { BattleState, RngState, UnitId } from './types.js';

export type TargetingMode = 'highest_aggro' | 'lowest_hp' | 'weighted_random';

export interface TargetSelection {
  targetId?: UnitId;
  rng: RngState;
}

export function chooseTarget(state: BattleState, sourceId: UnitId, mode: TargetingMode = 'highest_aggro'): TargetSelection {
  const source = findUnit(state, sourceId);
  const candidates = state.units.filter((unit) => unit.alive && unit.faction !== source.faction);
  if (candidates.length === 0) return { rng: state.rng };
  if (mode === 'lowest_hp') {
    return { targetId: [...candidates].sort((left, right) => left.hp / left.maxHp - right.hp / right.maxHp || state.units.indexOf(left) - state.units.indexOf(right))[0]?.id, rng: state.rng };
  }
  if (mode === 'highest_aggro') {
    return { targetId: [...candidates].sort((left, right) => (right.baseAggro + right.taunt) - (left.baseAggro + left.taunt) || state.units.indexOf(left) - state.units.indexOf(right))[0]?.id, rng: state.rng };
  }
  const total = candidates.reduce((sum, unit) => sum + Math.max(0, unit.baseAggro + unit.taunt), 0);
  if (total <= 0) return { targetId: candidates[0]?.id, rng: state.rng };
  const roll = nextRandom(state.rng);
  let cursor = roll.value * total;
  for (const candidate of candidates) {
    cursor -= Math.max(0, candidate.baseAggro + candidate.taunt);
    if (cursor < 0) return { targetId: candidate.id, rng: roll.rng };
  }
  return { targetId: candidates[candidates.length - 1]?.id, rng: roll.rng };
}

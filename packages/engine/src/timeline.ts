import { effectiveStats, statValue } from './stats.js';
import { StatKey, type BattleState, type UnitId, type UnitState } from './types.js';

export const ACTION_GAUGE = 10_000;
/** Equal-AV tie window; order inside the window is formation/input order. */
export const AV_EPSILON = 1e-6;

export function actionInterval(unit: Pick<UnitState, 'stats'>, speed: number): number {
  if (speed <= 0) throw new Error(`Speed must be positive, got ${speed}`);
  return ACTION_GAUGE / speed;
}

export function scheduleAfterAction(state: BattleState, unit: UnitState): number {
  return state.clock + actionInterval(unit, statValue(effectiveStats(unit), StatKey.SPD));
}

export function advanceForward(nextActionAt: number, clock: number, ratio: number, speed: number): number {
  return Math.max(clock, nextActionAt - (ACTION_GAUGE * ratio) / speed);
}

export function delayAction(nextActionAt: number, ratio: number, speed: number): number {
  return nextActionAt + (ACTION_GAUGE * ratio) / speed;
}

export function chooseNextActor(state: BattleState): UnitId | undefined {
  return state.units
    .filter((unit) => unit.alive)
    .sort((left, right) => {
      const delta = left.nextActionAt - right.nextActionAt;
      if (Math.abs(delta) > AV_EPSILON) return delta;
      return state.units.indexOf(left) - state.units.indexOf(right);
    })[0]?.id;
}

export function preserveActionProgress(currentAv: number, currentSpeed: number, nextSpeed: number): number {
  if (currentSpeed <= 0 || nextSpeed <= 0) throw new Error('Speed must be positive');
  return currentAv * (currentSpeed / nextSpeed);
}

export function cyclesElapsed(totalAv: number): number {
  if (totalAv < 150) return 0;
  return Math.floor((totalAv - 150) / 100) + 1;
}

import { withSequence, type ReplayEvent, type ReplayEventInput } from './events.js';
import { cloneBattleState, createUnit } from './state.js';
import type { BattleState, CreateUnitInput } from './types.js';

export interface WaveTransition {
  state: BattleState;
  events: ReplayEvent[];
}

/** Replace defeated enemies while retaining the persistent party state. */
export function advanceBattleWave(
  input: BattleState,
  enemies: readonly CreateUnitInput[],
  options: { preserveTemporaryEffects?: boolean } = {},
): WaveTransition {
  if (input.wave >= input.totalWaves) throw new Error('Cannot advance beyond the final wave');
  const state = cloneBattleState(input);
  const events: ReplayEvent[] = [];
  const emit = (event: ReplayEventInput): void => {
    state.eventSequence += 1;
    events.push(withSequence(event as ReplayEvent, state.eventSequence));
  };
  emit({ type: 'WAVE_END', at: state.clock, wave: state.wave });
  state.units = state.units.filter((unit) => unit.faction === 'ally' && unit.alive);
  if (!options.preserveTemporaryEffects) {
    for (const unit of state.units) {
      unit.statuses = [];
      unit.modifiers = [];
      unit.dots = [];
      unit.shields = [];
      unit.nextActionAt = state.clock;
      unit.actionGeneration += 1;
    }
  }
  state.wave += 1;
  state.units.push(...enemies.map((enemy) => {
    const unit = createUnit(enemy);
    unit.nextActionAt = state.clock;
    return unit;
  }));
  emit({ type: 'WAVE_START', at: state.clock, wave: state.wave });
  return { state, events };
}

import { describe, expect, it } from 'vitest';
import { createBattleState, createStats, type ReplayEvent } from '@hsr-sim/engine';
import { scoreEndgameScenario, createParametricEndgameScenario } from '../src/index.js';

describe('parameterized endgame scoring adapters', () => {
  it('keeps cycle, break, kill and wave contributions separately observable', () => {
    const state = createBattleState({ units: [{ id: 'enemy', faction: 'enemy', hp: 0, stats: createStats({ hp: 1, atk: 1, def: 1, spd: 100 }) }], clock: 250, wave: 2 });
    state.units[0]!.alive = false;
    const events: ReplayEvent[] = [
      { type: 'DAMAGE_DEALT', at: 0, seq: 1, source: 'a', target: 'enemy', ability: 'basic', damageType: 'break', element: 'fire', amount: 100, rawAmount: 100, critical: false, toughnessDamage: 0 },
      { type: 'WEAKNESS_BREAK', at: 0, seq: 2, source: 'a', target: 'enemy', element: 'fire' },
      { type: 'UNIT_DEFEATED', at: 0, seq: 3, target: 'enemy' },
    ];
    const score = scoreEndgameScenario(state, events, { mode: 'apocalyptic_shadow', cycleBudget: 5, damageWeight: 1, breakWeight: 10, breakDamageWeight: 2, killWeight: 20, waveWeight: 3, clearBonus: 50 });

    expect(score).toMatchObject({ mode: 'apocalyptic_shadow', cycles: 2, totalDamage: 100, breakDamage: 100, breaks: 1, kills: 1, cleared: true, remainingEnemies: 0 });
    expect(score.value).toBe(50 + 3 + 100 + 10 + 200 + 20 + 6);
  });

  it('wraps a dated scenario definition without hard-coding live stage rules', () => {
    const scenario = createParametricEndgameScenario({
      id: 'moc_fixture',
      version: '4.4-fixture-1',
      mode: 'memory_of_chaos',
      createInitialState: () => createBattleState({ units: [] }),
      scoring: { cycleBudget: 3, clearBonus: 100 },
    });

    expect(scenario.mode).toBe('memory_of_chaos');
    expect(scenario.coverage).toBe('abstracted');
    expect(scenario.score(scenario.createInitialState(), [])).toMatchObject({ mode: 'memory_of_chaos', cleared: true, value: 103 });
  });
});

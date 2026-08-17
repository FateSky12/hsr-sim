import { describe, expect, it } from 'vitest';
import { advanceBattleWave, createBattleState, createStats, createUnit } from '../src/index.js';

describe('wave lifecycle events', () => {
  it('records the end and start of a wave while preserving persistent resources', () => {
    const ally = createUnit({ id: 'ally', faction: 'ally', hp: 50, maxHp: 100, energy: 40, maxEnergy: 100, stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }) });
    const state = createBattleState({ units: [ally], wave: 1, totalWaves: 2, clock: 50 });
    const next = advanceBattleWave(state, [{ id: 'enemy', faction: 'enemy', stats: createStats({ hp: 200, atk: 1, def: 1, spd: 100 }) }]);

    expect(next.events.map((event) => event.type)).toEqual(['WAVE_END', 'WAVE_START']);
    expect(next.state.wave).toBe(2);
    expect(next.state.units.find((unit) => unit.id === 'ally')).toMatchObject({ hp: 50, energy: 40, nextActionAt: 50 });
    expect(next.state.units.find((unit) => unit.id === 'enemy')).toMatchObject({ nextActionAt: 50 });
  });
});

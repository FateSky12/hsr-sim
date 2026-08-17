import { describe, expect, it } from 'vitest';
import { createStats, createUnit } from '@hsr-sim/engine';
import { advanceScenarioWave, createScenarioFromDefinition } from '../src/index.js';

describe('versioned scenario definition adapter', () => {
  it('keeps a four-person party as pure state across scenario construction', () => {
    const allies = Array.from({ length: 4 }, (_, index) => createUnit({
      id: `ally-${index + 1}`,
      faction: 'ally',
      stats: createStats({ hp: 100, atk: 10, def: 10, spd: 100 }),
    }));
    const scenario = createScenarioFromDefinition({
      id: 'four-person-fixture',
      mode: 'memory_of_chaos',
      version: 'fixture',
      enemies: [{ id: 'enemy', name: 'Enemy', level: 80, hp: 1000, atk: 1, defBase: 0, spd: 100, maxToughness: 10, weaknesses: [], resOverrides: {} }],
    }, allies);

    expect(scenario.createInitialState().units.filter((unit) => unit.faction === 'ally').map((unit) => unit.id)).toEqual(['ally-1', 'ally-2', 'ally-3', 'ally-4']);
  });

  it('builds an editable endgame scenario from JSON data', () => {
    const ally = createUnit({ id: 'ally', faction: 'ally', stats: createStats({ hp: 100, atk: 10, def: 10, spd: 100 }) });
    const scenario = createScenarioFromDefinition({
      id: 'moc-fixture-12-2',
      mode: 'memory_of_chaos',
      version: '4.4-fixture-1',
      totalWaves: 2,
      enemies: [{ id: 'boss', name: 'Boss', level: 95, hp: 1000, atk: 10, def: 1150, spd: 145, toughness: 540, weaknesses: ['fire'], resistance: { fire: 0.2 }, source: { kind: 'fixture', revision: 'enemy-4.4-1' }, coverage: 'abstracted' }],
      scoring: { cycleBudget: 5, clearBonus: 100 },
    }, [ally]);
    const state = scenario.createInitialState();

    expect(scenario).toMatchObject({ id: 'moc-fixture-12-2', mode: 'memory_of_chaos', version: '4.4-fixture-1', coverage: 'abstracted' });
    expect(state.totalWaves).toBe(2);
    expect(state.units.map((unit) => unit.id)).toEqual(['ally', 'boss']);
  });

  it('builds and advances data-defined multi-wave scenarios', () => {
    const ally = createUnit({ id: 'ally', faction: 'ally', stats: createStats({ hp: 100, atk: 10, def: 10, spd: 100 }) });
    const scenario = createScenarioFromDefinition({
      id: 'pure-fiction-waves',
      mode: 'pure_fiction',
      version: '4.4-wave-fixture',
      waves: [
        { id: 'wave-1', enemies: [{ id: 'first', name: 'First', level: 80, hp: 100, atk: 1, defBase: 0, spd: 100, maxToughness: 10, weaknesses: ['fire'], resOverrides: { fire: 0 } }] },
        { id: 'wave-2', enemies: [{ id: 'second', name: 'Second', level: 80, hp: 200, atk: 1, defBase: 0, spd: 100, maxToughness: 10, weaknesses: ['ice'], resOverrides: { ice: 0 } }] },
      ],
    }, [ally]);
    const initial = scenario.createInitialState();
    const next = advanceScenarioWave(scenario, initial);

    expect(initial.totalWaves).toBe(2);
    expect(initial.units.map((unit) => unit.id)).toEqual(['ally', 'first']);
    expect(next.state.units.map((unit) => unit.id)).toEqual(['ally', 'second']);
    expect(next.events.map((event) => event.type)).toEqual(['WAVE_END', 'WAVE_START']);
  });
});

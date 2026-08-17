import { describe, expect, it } from 'vitest';
import { createStats, createUnit } from '@hsr-sim/engine';
import { createScenarioFromDefinition } from '../src/index.js';

describe('scenario wave shorthand', () => {
  it('expands a repeated enemy template into explicit replayable waves', () => {
    const ally = createUnit({ id: 'ally', faction: 'ally', stats: createStats({ hp: 100, atk: 100, def: 1, spd: 100 }) });
    const scenario = createScenarioFromDefinition({
      id: 'repeat-waves', mode: 'pure_fiction', version: 'fixture-1', totalWaves: 2,
      enemies: [{ id: 'enemy', name: 'Enemy', level: 1, hp: 1, atk: 1, def: 0, spd: 1, toughness: 0, weaknesses: [], resistance: {}, source: { kind: 'fixture', revision: '1' }, coverage: 'abstracted' }],
    }, [ally]);

    expect(scenario.waves).toHaveLength(2);
    expect(scenario.definition.waves.map((wave) => wave.id)).toEqual(['wave-1', 'wave-2']);
  });
});

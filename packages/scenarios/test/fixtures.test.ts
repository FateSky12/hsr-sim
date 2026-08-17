import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createStats, createUnit } from '@hsr-sim/engine';
import { createScenarioFromDefinition } from '../src/index.js';

const fixtureNames = ['memory-of-chaos-4.4-abstracted', 'apocalyptic-shadow-4.4-abstracted', 'pure-fiction-4.4-abstracted'] as const;

describe('versioned endgame scenario fixtures', () => {
  it.each(fixtureNames)('parses %s through the shared scenario adapter', (name) => {
    const definition = JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8')) as unknown;
    const ally = createUnit({ id: 'fixture_ally', faction: 'ally', stats: createStats({ hp: 1000, atk: 100, def: 100, spd: 100 }) });
    const scenario = createScenarioFromDefinition(definition, [ally]);
    const state = scenario.createInitialState();

    expect(scenario.id).toBe(name);
    expect(scenario.coverage).toBe('abstracted');
    expect(state.units.some((unit) => unit.faction === 'enemy')).toBe(true);
    expect(scenario.score(state, [])).toMatchObject({ cleared: false, mode: expect.any(String) });
  });
});

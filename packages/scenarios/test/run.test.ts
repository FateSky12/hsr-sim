import { describe, expect, it } from 'vitest';
import { BattleKernel, StatKey, createRuleCatalog, createStats, createUnit } from '@hsr-sim/engine';
import { createScenarioFromDefinition, runScenario } from '../src/index.js';

describe('multi-wave scenario runner', () => {
  it('continues one policy and one replay across all defined waves', () => {
    const ally = createUnit({ id: 'ally', faction: 'ally', stats: createStats({ hp: 1000, atk: 100, def: 1, spd: 100 }) });
    const scenario = createScenarioFromDefinition({
      id: 'wave-run', mode: 'pure_fiction', version: 'fixture',
      waves: [
        { id: 'one', enemies: [{ id: 'one-enemy', name: 'One', level: 80, hp: 50, atk: 1, defBase: 0, spd: 100, maxToughness: 0, weaknesses: [], resOverrides: { physical: 0 } }] },
        { id: 'two', enemies: [{ id: 'two-enemy', name: 'Two', level: 80, hp: 50, atk: 1, defBase: 0, spd: 100, maxToughness: 0, weaknesses: [], resOverrides: { physical: 0 } }] },
      ],
    }, [ally]);
    const rules = createRuleCatalog({
      ally: { actions: { basic: { id: 'basic', actionType: 'basic', resolve: ({ actor, targetIds }) => [{ kind: 'damage', source: actor.id, target: targetIds[0]!, ability: 'basic', element: 'physical', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: 1 }] } } },
    });
    const policy = { next: (state: ReturnType<typeof scenario.createInitialState>) => {
      const target = state.units.find((unit) => unit.faction === 'enemy' && unit.alive);
      return target ? { actor: 'ally', ability: 'basic', targets: [target.id] } : undefined;
    } };
    const run = runScenario(new BattleKernel(rules), scenario, policy, { maxActions: 4 });

    expect(run.stoppedBecause).toBe('all_waves_cleared');
    expect(run.commands).toHaveLength(2);
    expect(run.events.map((event) => event.type)).toContain('WAVE_END');
    expect(run.events.map((event) => event.type)).toContain('WAVE_START');
    expect(run.scores).toHaveLength(2);
  });
});

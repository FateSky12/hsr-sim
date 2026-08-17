import { describe, expect, it } from 'vitest';
import { createBattleState, createStats, createUnit } from '@hsr-sim/engine';
import { FixedScriptPolicy, PriorityPolicy } from '../src/index.js';

describe('policy adapters', () => {
  it('keeps fixed scripts deterministic and does not mutate the script input', () => {
    const policy = new FixedScriptPolicy([{ actor: 'a', ability: 'basic', targets: ['b'] }]);
    const state = createBattleState({ units: [createUnit({ id: 'a', faction: 'ally', stats: createStats({ hp: 1, atk: 1, def: 1, spd: 1 }) })] });
    const first = policy.next(state);
    expect(first).toEqual({ actor: 'a', ability: 'basic', targets: ['b'] });
    expect(policy.next(state)).toBeUndefined();
  });

  it('selects the first matching APL rule for the next actor', () => {
    const state = createBattleState({ units: [createUnit({ id: 'a', faction: 'ally', stats: createStats({ hp: 1, atk: 1, def: 1, spd: 1 }), nextActionAt: 0 })] });
    const policy = new PriorityPolicy([
      { actor: 'a', ability: 'skill', targets: [], conditions: [{ kind: 'skill_points_at_least', value: 4 }] },
      { actor: 'a', ability: 'basic', targets: [] },
    ]);

    expect(policy.next(state)?.ability).toBe('basic');
  });
});

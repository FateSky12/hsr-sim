import { describe, expect, it } from 'vitest';
import { chooseTarget, createBattleState, createStats, createUnit } from '../src/index.js';

describe('enemy target selection', () => {
  it('prefers the highest effective aggro and breaks ties by formation order', () => {
    const state = createBattleState({
      units: [
        createUnit({ id: 'enemy', faction: 'enemy', stats: createStats({ hp: 1, atk: 1, def: 1, spd: 1 }) }),
        createUnit({ id: 'tank', faction: 'ally', baseAggro: 1, taunt: 3, stats: createStats({ hp: 100, atk: 1, def: 1, spd: 1 }) }),
        createUnit({ id: 'dps', faction: 'ally', baseAggro: 4, taunt: 0, stats: createStats({ hp: 100, atk: 1, def: 1, spd: 1 }) }),
      ],
    });

    expect(chooseTarget(state, 'enemy', 'highest_aggro')).toMatchObject({ targetId: 'tank' });
  });

  it('can select a weighted random target with a replayable RNG state', () => {
    const state = createBattleState({
      units: [
        createUnit({ id: 'enemy', faction: 'enemy', stats: createStats({ hp: 1, atk: 1, def: 1, spd: 1 }) }),
        createUnit({ id: 'a', faction: 'ally', baseAggro: 1, stats: createStats({ hp: 100, atk: 1, def: 1, spd: 1 }) }),
        createUnit({ id: 'b', faction: 'ally', baseAggro: 1, stats: createStats({ hp: 100, atk: 1, def: 1, spd: 1 }) }),
      ],
      rngSeed: 123,
    });
    const first = chooseTarget(state, 'enemy', 'weighted_random');
    const second = chooseTarget(state, 'enemy', 'weighted_random');

    expect(first).toEqual(second);
  });
});

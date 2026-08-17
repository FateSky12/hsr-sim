import { describe, expect, it } from 'vitest';
import { chooseNextActor, createBattleState, createStats, createUnit, preserveActionProgress } from '../src/index.js';

describe('absolute action timeline', () => {
  it('preserves progress when speed changes', () => {
    expect(preserveActionProgress(40, 100, 200)).toBe(20);
  });

  it('uses stable input order as the deterministic tie breaker', () => {
    const state = createBattleState({
      units: [
        createUnit({ id: 'second', faction: 'ally', stats: createStats({ hp: 1, atk: 1, def: 1, spd: 100 }), nextActionAt: 5 }),
        createUnit({ id: 'first', faction: 'enemy', stats: createStats({ hp: 1, atk: 1, def: 1, spd: 100 }), nextActionAt: 5 }),
      ],
    });

    expect(chooseNextActor(state)).toBe('second');
  });
});

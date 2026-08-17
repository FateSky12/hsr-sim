import { describe, expect, it } from 'vitest';
import { createBattleState, createStats, createUnit } from '@hsr-sim/engine';
import { ActorPatternPolicy, EnemyPolicy } from '../src/index.js';

describe('enemy policy adapter', () => {
  it('turns live aggro state into a target rather than replaying a prerecorded target', () => {
    const state = createBattleState({
      units: [
        createUnit({ id: 'enemy', faction: 'enemy', stats: createStats({ hp: 1, atk: 1, def: 1, spd: 100 }), nextActionAt: 0 }),
        createUnit({ id: 'tank', faction: 'ally', taunt: 5, stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }), nextActionAt: 10 }),
        createUnit({ id: 'dps', faction: 'ally', stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }), nextActionAt: 10 }),
      ],
    });
    const command = new EnemyPolicy([{ enemyId: 'enemy', ability: 'basic' }]).next(state);

    expect(command).toEqual({ actor: 'enemy', ability: 'basic', targets: ['tank'] });
  });

  it('commits weighted-target RNG advancement to the battle state', () => {
    const state = createBattleState({
      rngSeed: 123,
      units: [
        createUnit({ id: 'enemy', faction: 'enemy', stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }) }),
        createUnit({ id: 'ally-a', faction: 'ally', baseAggro: 1, stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }) }),
        createUnit({ id: 'ally-b', faction: 'ally', baseAggro: 3, stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }) }),
      ],
    });
    const before = { ...state.rng };
    const command = new EnemyPolicy([{ enemyId: 'enemy', ability: 'basic', targeting: 'weighted_random' }]).next(state);

    expect(command?.targets).toHaveLength(1);
    expect(state.rng.cursor).toBe(before.cursor + 1);
    expect(state.rng.seed).not.toBe(before.seed);
  });

  it('cycles through a versioned enemy action pattern', () => {
    const state = createBattleState({
      units: [
        createUnit({ id: 'enemy', faction: 'enemy', stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }) }),
        createUnit({ id: 'ally', faction: 'ally', stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }) }),
      ],
    });
    const policy = new EnemyPolicy([{ enemyId: 'enemy', pattern: ['skill_a', 'basic'] }]);

    expect(policy.next(state)?.ability).toBe('skill_a');
    expect(policy.next(state)?.ability).toBe('basic');
    expect(policy.next(state)?.ability).toBe('skill_a');
  });

  it('lets a summoned actor use its own action bar and pattern', () => {
    const state = createBattleState({
      units: [
        createUnit({ id: 'memory', faction: 'ally', stats: createStats({ hp: 100, atk: 1, def: 1, spd: 120 }), nextActionAt: 0 }),
        createUnit({ id: 'enemy', faction: 'enemy', stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }) }),
      ],
    });
    const policy = new ActorPatternPolicy([{ actorId: 'memory', pattern: ['basic'], targets: ['enemy'] }]);

    expect(policy.next(state)).toEqual({ actor: 'memory', ability: 'basic', targets: ['enemy'] });
  });
});

import { describe, expect, it } from 'vitest';
import {
  BattleKernel,
  StatKey,
  createBattleState,
  createRuleCatalog,
  createStats,
  createUnit,
  type EffectIntent,
} from '../src/index.js';

describe('DoT snapshot semantics', () => {
  it('freezes source scaling when the DoT is applied', () => {
    const rules = createRuleCatalog({
      dotter: {
        actions: {
          skill: {
            id: 'skill',
            actionType: 'skill',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{
              kind: 'apply_dot',
              source: actor.id,
              target: targetIds[0]!,
              ability: 'skill',
              dotId: 'burn',
              element: 'physical',
              scalingStat: StatKey.ATK,
              multiplier: 1,
              duration: 2,
            }],
          },
        },
      },
    });
    const state = createBattleState({
      units: [
        createUnit({ id: 'dotter', faction: 'ally', stats: createStats({ hp: 1000, atk: 100, def: 1, spd: 100, critRate: 0 }) }),
        createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['physical'], resistance: { physical: 0 }, toughness: { current: 1, max: 1, broken: true } }),
      ],
    });
    const kernel = new BattleKernel(rules);
    const applied = kernel.step(state, { actor: 'dotter', ability: 'skill', targets: ['target'], advanceTurn: false });
    const boostedSource = applied.state.units.find((unit) => unit.id === 'dotter')!;
    boostedSource.stats.percent[StatKey.ATK] = 1;

    const tick = kernel.tickDots(applied.state, 'target');
    expect(tick.events.find((event) => event.type === 'DOT_TICK')).toMatchObject({ amount: 100, remainingTurns: 1 });

    const reapplied = kernel.step(tick.state, { actor: 'dotter', ability: 'skill', targets: ['target'], advanceTurn: false });
    const secondTick = kernel.tickDots(reapplied.state, 'target');
    expect(secondTick.events.find((event) => event.type === 'DOT_TICK')).toMatchObject({ amount: 200 });
  });

  it('uses deterministic effect-hit rolls before creating a probabilistic DoT', () => {
    const rules = createRuleCatalog({
      dotter: {
        actions: {
          skill: {
            id: 'skill',
            actionType: 'skill',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{
              kind: 'apply_dot',
              source: actor.id,
              target: targetIds[0]!,
              ability: 'skill',
              dotId: 'burn',
              element: 'physical',
              scalingStat: StatKey.ATK,
              multiplier: 1,
              duration: 2,
              chance: 0,
            }],
          },
        },
      },
    });
    const state = createBattleState({
      rngSeed: 123,
      units: [
        createUnit({ id: 'dotter', faction: 'ally', stats: createStats({ hp: 1000, atk: 100, def: 1, spd: 100 }) }),
        createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100 }) }),
      ],
    });

    const result = new BattleKernel(rules).step(state, { actor: 'dotter', ability: 'skill', targets: ['target'], advanceTurn: false });

    expect(result.state.units.find((unit) => unit.id === 'target')?.dots).toEqual([]);
    expect(result.state.rng.cursor).toBe(0);
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'STATUS_RESISTED', id: 'burn', chance: 0 }));
  });

  it('uses probability-weighted DoT damage without consuming RNG in expected-value mode', () => {
    const rules = createRuleCatalog({
      dotter: {
        actions: {
          skill: {
            id: 'skill',
            actionType: 'skill',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{ kind: 'apply_dot', source: actor.id, target: targetIds[0]!, ability: 'skill', dotId: 'burn', element: 'physical', scalingStat: StatKey.ATK, multiplier: 1, duration: 2, chance: 0.5 }],
          },
        },
      },
    });
    const state = createBattleState({ rngSeed: 999, units: [
      createUnit({ id: 'dotter', faction: 'ally', stats: createStats({ hp: 1000, atk: 100, def: 1, spd: 100, critRate: 0 }) }),
      createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }), toughness: { current: 0, max: 1, broken: true }, resistance: { physical: 0 } }),
    ] });

    const applied = new BattleKernel(rules).step(state, { actor: 'dotter', ability: 'skill', targets: ['target'], advanceTurn: false });
    expect(applied.state.rng.cursor).toBe(0);
    expect(applied.state.units.find((unit) => unit.id === 'target')?.dots[0]?.multiplier).toBe(0.5);
  });
});

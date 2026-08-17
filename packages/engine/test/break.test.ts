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

describe('toughness and weakness break', () => {
  it('emits a break fact when a hit empties a weak target toughness bar', () => {
    const rules = createRuleCatalog({
      breaker: {
        actions: {
          skill: {
            id: 'skill',
            actionType: 'skill',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{
              kind: 'damage',
              source: actor.id,
              target: targetIds[0]!,
              ability: 'skill',
              element: 'fire',
              damageType: 'normal',
              scalingStat: StatKey.ATK,
              multiplier: 1,
              toughnessDamage: 10,
            }],
          },
        },
      },
    });
    const state = createBattleState({
      units: [
        createUnit({ id: 'breaker', faction: 'ally', stats: createStats({ hp: 1000, atk: 100, def: 100, spd: 100, critRate: 0 }) }),
        createUnit({
          id: 'weak_target',
          faction: 'enemy',
          stats: createStats({ hp: 5000, atk: 1, def: 0, spd: 100, critRate: 0 }),
          toughness: { current: 10, max: 10, broken: false },
          weaknesses: ['fire'],
          resistance: { fire: 0 },
        }),
      ],
    });

    const result = new BattleKernel(rules).step(state, {
      actor: 'breaker',
      ability: 'skill',
      targets: ['weak_target'],
    });

    expect(result.state.units.find((unit) => unit.id === 'weak_target')?.toughness).toEqual({
      current: 0,
      max: 10,
      broken: true,
    });
    expect(result.events.some((event) => event.type === 'WEAKNESS_BREAK')).toBe(true);
    expect(result.events.find((event) => event.type === 'DAMAGE_DEALT' && event.ability === 'break')).toMatchObject({
      amount: 4395,
      damageType: 'break',
    });
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'DOT_APPLIED', id: 'break:fire', target: 'weak_target' }));
    expect(result.state.units.find((unit) => unit.id === 'weak_target')?.dots).toEqual([expect.objectContaining({ id: 'break:fire', remainingTurns: 2 })]);
  });

  it('blocks exactly one turn after an ice weakness break', () => {
    const rules = createRuleCatalog({
      breaker: {
        actions: {
          skill: {
            id: 'skill',
            actionType: 'skill',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{ kind: 'damage', source: actor.id, target: targetIds[0]!, ability: 'skill', element: 'ice', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: 1, toughnessDamage: 10 }],
          },
          basic: { id: 'basic', actionType: 'basic', resolve: (): EffectIntent[] => [] },
        },
      },
    });
    const target = createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 5000, atk: 1, def: 0, spd: 100, critRate: 0 }), toughness: { current: 10, max: 10, broken: false }, weaknesses: ['ice'], resistance: { ice: 0 } });
    const breaker = createUnit({ id: 'breaker', faction: 'ally', stats: createStats({ hp: 1000, atk: 100, def: 1, spd: 100, critRate: 0 }) });
    const kernel = new BattleKernel(rules);
    const broken = kernel.step(createBattleState({ units: [breaker, target] }), { actor: breaker.id, ability: 'skill', targets: [target.id], advanceTurn: false });

    expect(broken.state.units.find((unit) => unit.id === target.id)?.statuses).toEqual([expect.objectContaining({ id: 'break:frozen', custom: { blocksAction: true } })]);
    const blocked = kernel.step(broken.state, { actor: target.id, ability: 'basic', targets: [breaker.id] });
    expect(blocked.events).toContainEqual(expect.objectContaining({ type: 'ACTION_BLOCKED', actor: target.id, status: 'break:frozen' }));
    expect(blocked.events).toContainEqual(expect.objectContaining({ type: 'STATUS_EXPIRED', target: target.id, id: 'break:frozen' }));
    expect(blocked.events).toContainEqual(expect.objectContaining({ type: 'TOUGHNESS_RECOVERED', target: target.id, amount: 10 }));
    expect(blocked.state.units.find((unit) => unit.id === target.id)?.toughness).toEqual({ current: 10, max: 10, broken: false });
  });
});

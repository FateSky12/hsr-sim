import { describe, expect, it } from 'vitest';
import { BattleKernel, StatKey, createBattleState, createRuleCatalog, createStats, createUnit, type EffectIntent } from '../src/index.js';

describe('bounce and multi-hit damage', () => {
  it('resolves each bounce as an independent deterministic damage instance', () => {
    const rules = createRuleCatalog({
      attacker: {
        actions: {
          skill: {
            id: 'skill',
            actionType: 'skill',
            resolve: ({ actor }): EffectIntent[] => [{
              kind: 'bounce_damage',
              source: actor.id,
              ability: 'skill',
              element: 'wind',
              damageType: 'normal',
              scalingStat: StatKey.ATK,
              multiplier: 1,
              hits: 3,
              candidateTargets: ['enemy-a', 'enemy-b'],
            }],
          },
        },
      },
    });
    const attacker = createUnit({ id: 'attacker', faction: 'ally', stats: createStats({ hp: 1000, atk: 100, def: 1, spd: 100, critRate: 0 }) });
    const enemyA = createUnit({ id: 'enemy-a', faction: 'enemy', stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['wind'], resistance: { wind: 0 }, toughness: { current: 0, max: 0, broken: true } });
    const enemyB = createUnit({ id: 'enemy-b', faction: 'enemy', stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['wind'], resistance: { wind: 0 }, toughness: { current: 0, max: 0, broken: true } });

    const result = new BattleKernel(rules, 'sampled').step(createBattleState({ rngSeed: 7, units: [attacker, enemyA, enemyB] }), {
      actor: attacker.id,
      ability: 'skill',
      targets: [enemyA.id],
      advanceTurn: false,
    });

    const damage = result.events.filter((event) => event.type === 'DAMAGE_DEALT');
    expect(damage).toHaveLength(3);
    expect(new Set(damage.map((event) => event.type === 'DAMAGE_DEALT' ? event.target : ''))).toEqual(new Set(['enemy-a', 'enemy-b']));
    expect(result.state.rng.cursor).toBe(3);
  });
});

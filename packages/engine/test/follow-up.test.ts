import { describe, expect, it } from 'vitest';
import { BattleKernel, StatKey, createBattleState, createRuleCatalog, createStats, createUnit, type EffectIntent } from '../src/index.js';

describe('follow-up action boundaries', () => {
  it('executes a triggered follow-up without consuming the actor turn', () => {
    const rules = createRuleCatalog({
      attacker: {
        actions: {
          basic: {
            id: 'basic',
            actionType: 'basic',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{ kind: 'trigger_action', source: actor.id, actor: actor.id, ability: 'follow', targets: [...targetIds] }],
          },
          follow: {
            id: 'follow',
            actionType: 'follow_up',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{ kind: 'damage', source: actor.id, target: targetIds[0]!, ability: 'follow', element: 'physical', damageType: 'additional', scalingStat: StatKey.ATK, multiplier: 1 }],
          },
        },
      },
    });
    const attacker = createUnit({ id: 'attacker', faction: 'ally', stats: createStats({ hp: 1000, atk: 100, def: 1, spd: 100, critRate: 0 }), nextActionAt: 25 });
    const target = createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }), toughness: { current: 0, max: 0, broken: true }, resistance: { physical: 0 } });

    const result = new BattleKernel(rules).step(createBattleState({ units: [attacker, target] }), { actor: attacker.id, ability: 'basic', targets: [target.id] });

    expect(result.state.units.find((unit) => unit.id === attacker.id)?.nextActionAt).toBe(125);
    expect(result.events.map((event) => event.type)).toContain('FOLLOW_UP_USED');
    expect(result.events.find((event) => event.type === 'DAMAGE_DEALT' && event.ability === 'follow')).toMatchObject({ damageType: 'additional' });
  });

  it('does not consume a turn or expire turn-scoped effects for a direct follow-up command', () => {
    const rules = createRuleCatalog({
      attacker: {
        actions: {
          follow: {
            id: 'follow',
            actionType: 'follow_up',
            resolve: ({ actor, targetIds }) => [{ kind: 'damage' as const, source: actor.id, target: targetIds[0]!, ability: 'follow', element: 'physical' as const, damageType: 'additional' as const, scalingStat: StatKey.ATK, multiplier: 1 }],
          },
        },
      },
    });
    const attacker = createUnit({ id: 'attacker', faction: 'ally', nextActionAt: 25, stats: createStats({ hp: 1000, atk: 100, def: 1, spd: 100, critRate: 0 }), modifiers: [{ id: 'scoped', stat: StatKey.ATK, percent: 0.2, remainingTurns: 1, stacking: 'replace' }] });
    const target = createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }), toughness: { current: 0, max: 0, broken: true }, resistance: { physical: 0 } });
    const result = new BattleKernel(rules).step(createBattleState({ units: [attacker, target] }), { actor: attacker.id, ability: 'follow', targets: [target.id] });
    expect(result.state.units.find((unit) => unit.id === attacker.id)?.nextActionAt).toBe(25);
    expect(result.state.units.find((unit) => unit.id === attacker.id)?.modifiers[0]?.remainingTurns).toBe(1);
    expect(result.events.some((event) => event.type === 'TURN_END')).toBe(false);
  });
});

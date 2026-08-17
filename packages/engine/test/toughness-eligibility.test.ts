import { describe, expect, it } from 'vitest';
import { BattleKernel, StatKey, createBattleState, createRuleCatalog, createStats, createUnit, type EffectIntent } from '../src/index.js';

describe('toughness eligibility and L3 primitives', () => {
  it('does not reduce toughness unless the element matches a weakness', () => {
    const rules = createRuleCatalog({
      attacker: {
        actions: {
          basic: {
            id: 'basic', actionType: 'basic',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{ kind: 'damage', source: actor.id, target: targetIds[0]!, ability: 'basic', element: 'fire', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: 1, toughnessDamage: 10 }],
          },
          ignore: {
            id: 'ignore', actionType: 'skill',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{ kind: 'damage', source: actor.id, target: targetIds[0]!, ability: 'ignore', element: 'fire', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: 1, toughnessDamage: 10, ignoresWeakness: true }],
          },
        },
      },
      target: {
        actions: { basic: { id: 'basic', actionType: 'basic', resolve: (): EffectIntent[] => [] } },
      },
    });
    const attacker = createUnit({ id: 'attacker', faction: 'ally', stats: createStats({ hp: 100, atk: 10, def: 1, spd: 100, critRate: 0 }) });
    const target = createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['ice'], resistance: { fire: 0 }, toughness: { current: 10, max: 10, broken: false } });
    const kernel = new BattleKernel(rules);

    const ordinary = kernel.step(createBattleState({ units: [attacker, target] }), { actor: 'attacker', ability: 'basic', targets: ['target'], advanceTurn: false });
    expect(ordinary.state.units.find((unit) => unit.id === 'target')?.toughness.current).toBe(10);
    expect(ordinary.events.find((event) => event.type === 'DAMAGE_DEALT')).toMatchObject({ toughnessDamage: 0 });

    const ignored = kernel.step(createBattleState({ units: [attacker, target] }), { actor: 'attacker', ability: 'ignore', targets: ['target'], advanceTurn: false });
    expect(ignored.state.units.find((unit) => unit.id === 'target')?.toughness.current).toBe(0);
  });

  it('applies Break Efficiency to eligible toughness damage', () => {
    const rules = createRuleCatalog({
      attacker: {
        actions: {
          basic: {
            id: 'basic', actionType: 'basic',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{ kind: 'damage', source: actor.id, target: targetIds[0]!, ability: 'basic', element: 'fire', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: 1, toughnessDamage: 10 }],
          },
        },
      },
      target: {
        actions: { basic: { id: 'basic', actionType: 'basic', resolve: (): EffectIntent[] => [] } },
      },
    });
    const attacker = createUnit({ id: 'attacker', faction: 'ally', stats: createStats({ hp: 100, atk: 10, def: 1, spd: 100, critRate: 0, breakEfficiency: 0.5 }) });
    const target = createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['fire'], resistance: { fire: 0 }, toughness: { current: 20, max: 20, broken: false } });
    const result = new BattleKernel(rules).step(createBattleState({ units: [attacker, target] }), { actor: 'attacker', ability: 'basic', targets: ['target'], advanceTurn: false });
    expect(result.state.units.find((unit) => unit.id === 'target')?.toughness.current).toBe(5);
    expect(result.events.find((event) => event.type === 'DAMAGE_DEALT')).toMatchObject({ toughnessDamage: 15 });
  });

  it('supports bounded self HP loss and temporary weakness implant', () => {
    const rules = createRuleCatalog({
      attacker: {
        actions: {
          skill: {
            id: 'skill', actionType: 'skill',
            resolve: ({ actor, targetIds }): EffectIntent[] => [
              { kind: 'lose_hp', source: actor.id, target: actor.id, amount: 80, minimumHp: 1 },
              { kind: 'implant_weakness', source: actor.id, target: targetIds[0]!, element: 'fire', duration: 1 },
            ],
          },
        },
      },
      target: {
        actions: { basic: { id: 'basic', actionType: 'basic', resolve: (): EffectIntent[] => [] } },
      },
    });
    const attacker = createUnit({ id: 'attacker', faction: 'ally', hp: 50, maxHp: 100, stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }) });
    const target = createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }), weaknesses: ['ice'] });
    const kernel = new BattleKernel(rules);
    const result = kernel.step(createBattleState({ units: [attacker, target] }), { actor: 'attacker', ability: 'skill', targets: ['target'], advanceTurn: false });
    expect(result.state.units.find((unit) => unit.id === 'attacker')?.hp).toBe(1);
    expect(result.state.units.find((unit) => unit.id === 'target')?.weaknesses).toContain('fire');
    const expired = kernel.step(result.state, { actor: 'target', ability: 'basic', targets: ['attacker'], advanceTurn: false });
    expect(expired.state.units.find((unit) => unit.id === 'target')?.weaknesses).toEqual(['ice']);
  });
});

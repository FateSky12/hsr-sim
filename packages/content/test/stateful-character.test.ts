import { describe, expect, it } from 'vitest';
import { CharacterDataSchema } from '@hsr-sim/data';
import { BattleKernel, createBattleState, createStats, createUnit } from '@hsr-sim/engine';
import { createContentCatalog, createUnitFromCharacter } from '../src/index.js';

describe('content L3 state machines', () => {
  it('runs Himeko charge from weakness breaks into a follow-up action', () => {
    const himeko = CharacterDataSchema.parse({
      id: '1003', name: 'Himeko fixture', path: 'erudition', element: 'fire', level: 80,
      baseStats: { hp: 1000, atk: 100, def: 100, spd: 100 }, maxEnergy: 120,
      abilities: [{ id: 'skill', actionType: 'skill', spCost: 1, effects: [
        { kind: 'dealDamage', multiplier: 1, scaling: 'ATK', element: 'fire', damageType: 'normal', toughnessDamage: 10, target: 'first_target' },
        { kind: 'dealDamage', multiplier: 1, scaling: 'ATK', element: 'fire', damageType: 'normal', toughnessDamage: 10, target: 'adjacent_targets' },
      ] }],
      source: { kind: 'fixture', revision: 'himeko-l3-test' }, coverage: 'abstracted',
    });
    const himekoUnit = createUnitFromCharacter(himeko);
    const enemyA = createUnit({ id: 'enemy-a', faction: 'enemy', stats: createStats({ hp: 5000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['fire'], resistance: { fire: 0 }, toughness: { current: 10, max: 10, broken: false } });
    const enemyB = createUnit({ id: 'enemy-b', faction: 'enemy', stats: createStats({ hp: 5000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['fire'], resistance: { fire: 0 }, toughness: { current: 10, max: 10, broken: false } });
    const kernel = new BattleKernel(createContentCatalog([himeko]));
    const state = createBattleState({ units: [himekoUnit, enemyA, enemyB] });
    const start = kernel.beginTurn(state, himekoUnit.id);
    const result = kernel.step(start.state, { actor: himekoUnit.id, ability: 'skill', targets: [enemyA.id, enemyB.id], advanceTurn: false });

    expect(result.events).toContainEqual(expect.objectContaining({ type: 'CUSTOM_CHANGED', target: himekoUnit.id, key: 'himeko_charge', value: 3 }));
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'FOLLOW_UP_USED', actor: himekoUnit.id, ability: 'himeko_follow_up' }));
    expect(result.events.filter((event) => event.type === 'DAMAGE_DEALT' && event.ability === 'himeko_follow_up')).toHaveLength(2);
    expect(result.state.units.find((unit) => unit.id === himekoUnit.id)?.custom.himeko_charge).toBe(0);
  });
});

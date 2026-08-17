import { describe, expect, it } from 'vitest';
import { createBattleState, createStats, createUnit, StatKey, type CreateBattleStateInput, type CreateUnitInput } from '../src/index.js';
import { advanceWave } from '../../scenarios/src/index.js';

describe('wave state transition', () => {
  it('preserves allied resources while replacing defeated enemies', () => {
    const ally = createUnit({ id: 'ally', faction: 'ally', hp: 50, maxHp: 100, energy: 40, maxEnergy: 100, stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }) });
    const firstEnemy = createUnit({ id: 'first', faction: 'enemy', hp: 0, stats: createStats({ hp: 1, atk: 1, def: 1, spd: 100 }) });
    const nextEnemy: CreateUnitInput = { id: 'second', faction: 'enemy', stats: createStats({ hp: 200, atk: 1, def: 1, spd: 100 }) };
    const state = createBattleState({ units: [ally, firstEnemy], wave: 1, totalWaves: 2 });
    const next = advanceWave(state, [nextEnemy]);

    expect(next.wave).toBe(2);
    expect(next.units.find((unit) => unit.id === 'ally')).toMatchObject({ hp: 50, energy: 40 });
    expect(next.units.find((unit) => unit.id === 'second')).toMatchObject({ hp: 200, alive: true });
    expect(next.units.some((unit) => unit.id === 'first')).toBe(false);
  });

  it('clears temporary combat effects between halves while retaining custom state', () => {
    const ally = createUnit({
      id: 'ally', faction: 'ally', hp: 50, maxHp: 100, energy: 40, maxEnergy: 100,
      stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }),
      statuses: [{ id: 'buff', remainingTurns: 3, stacks: 1 }],
      modifiers: [{ id: 'atk_up', stat: StatKey.ATK, percent: 1, remainingTurns: 2, stacking: 'replace' }],
      dots: [{ id: 'dot', source: 'ally', ability: 'skill', element: 'fire', scalingStat: StatKey.ATK, multiplier: 1, toughnessDamage: 0, remainingTurns: 2, snapshot: { sourceLevel: 80, scalingValue: 1, elementDamageBonus: 0, allDamageBonus: 0, resPen: 0, defIgnore: 0 } }],
      shields: [{ id: 'shield', source: 'ally', amount: 10, remainingTurns: 2 }],
      custom: { resonance: 2 },
    });
    const firstEnemy = createUnit({ id: 'first', faction: 'enemy', stats: createStats({ hp: 1, atk: 1, def: 1, spd: 100 }) });
    const nextEnemy: CreateUnitInput = { id: 'second', faction: 'enemy', stats: createStats({ hp: 200, atk: 1, def: 1, spd: 100 }) };
    const state = createBattleState({ units: [ally, firstEnemy], wave: 1, totalWaves: 2, clock: 50 });
    const next = advanceWave(state, [nextEnemy]);
    const retained = next.units.find((unit) => unit.id === 'ally')!;

    expect(retained).toMatchObject({ hp: 50, energy: 40, custom: { resonance: 2 }, nextActionAt: 50 });
    expect(retained.statuses).toEqual([]);
    expect(retained.modifiers).toEqual([]);
    expect(retained.dots).toEqual([]);
    expect(retained.shields).toEqual([]);
  });

  it('allows a scenario to explicitly preserve temporary effects', () => {
    const ally = createUnit({ id: 'ally', faction: 'ally', stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }), modifiers: [{ id: 'buff', stat: StatKey.ATK, percent: 1, stacking: 'replace' }] });
    const state = createBattleState({ units: [ally], wave: 1, totalWaves: 2 });
    const next = advanceWave(state, [{ id: 'enemy', faction: 'enemy', stats: createStats({ hp: 1, atk: 1, def: 1, spd: 100 }) }], { preserveTemporaryEffects: true });

    expect(next.units.find((unit) => unit.id === 'ally')?.modifiers).toHaveLength(1);
  });
});

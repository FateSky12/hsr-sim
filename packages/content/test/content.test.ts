import { describe, expect, it } from 'vitest';
import { CharacterDataSchema, trainingCharacters } from '@hsr-sim/data';
import { BattleKernel, StatKey, createBattleState, createUnit, createStats } from '@hsr-sim/engine';
import { createContentCatalog, createUnitFromCharacter } from '../src/index.js';

describe('content adapters', () => {
  it('turn serializable character data into executable rules without putting character logic in engine', () => {
    const catalog = createContentCatalog(trainingCharacters);
    const striker = createUnitFromCharacter(trainingCharacters[0]);
    striker.stats.base[StatKey.CritRate] = 0;
    const target = createUnit({
      id: 'target',
      faction: 'enemy',
      stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }),
      toughness: { current: 20, max: 20, broken: true },
      weaknesses: ['physical'],
      resistance: { physical: 0 },
    });
    const state = createBattleState({ units: [striker, target], skillPoints: 3 });
    const result = new BattleKernel(catalog).step(state, {
      actor: striker.id,
      ability: 'basic',
      targets: [target.id],
      advanceTurn: false,
    });

    expect(result.events.find((event) => event.type === 'DAMAGE_DEALT')).toMatchObject({ amount: 100 });
  });

  it('compiles action-bar effect blocks into timeline intents', () => {
    const character = CharacterDataSchema.parse({
      ...trainingCharacters[0],
      abilities: [{
        id: 'skill',
        actionType: 'skill',
        effects: [{ kind: 'advanceForward', ratio: 0.5, target: 'first_target' }],
      }],
    });
    const source = createUnitFromCharacter(character);
    const target = createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }), toughness: { current: 0, max: 0, broken: true } });
    target.nextActionAt = 100;
    const result = new BattleKernel(createContentCatalog([character])).step(createBattleState({ units: [source, target] }), {
      actor: source.id,
      ability: 'skill',
      targets: [target.id],
      advanceTurn: false,
    });

    expect(result.state.units.find((unit) => unit.id === target.id)?.nextActionAt).toBe(50);
    expect(result.events.some((event) => event.type === 'ACTION_SCHEDULED' && event.nextActionAt === 50)).toBe(true);
  });

  it('compiles status effect blocks into a serializable status application', () => {
    const character = CharacterDataSchema.parse({
      ...trainingCharacters[0],
      abilities: [{
        id: 'skill',
        actionType: 'skill',
        effects: [{ kind: 'applyStatus', id: 'marked', duration: 2, stacks: 1, category: 'debuff', target: 'first_target' }],
      }],
    });
    const source = createUnitFromCharacter(character);
    const target = createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }), toughness: { current: 0, max: 0, broken: true } });
    const result = new BattleKernel(createContentCatalog([character])).step(createBattleState({ units: [source, target] }), {
      actor: source.id,
      ability: 'skill',
      targets: [target.id],
      advanceTurn: false,
    });

    expect(result.state.units.find((unit) => unit.id === target.id)?.statuses).toEqual([expect.objectContaining({ id: 'marked', remainingTurns: 2, category: 'debuff' })]);
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'STATUS_APPLIED', id: 'marked', target: target.id }));
  });

  it('compiles a summon block into a pure-data unit insertion', () => {
    const character = CharacterDataSchema.parse({
      ...trainingCharacters[0],
      abilities: [{
        id: 'skill',
        actionType: 'skill',
        effects: [{ kind: 'summon', id: 'test_summon', name: '测试忆灵', hp: 500, atk: 20, def: 10, spd: 120, maxEnergy: 0 }],
      }],
    });
    const source = createUnitFromCharacter(character);
    const target = createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }), toughness: { current: 0, max: 0, broken: true } });
    const result = new BattleKernel(createContentCatalog([character])).step(createBattleState({ units: [source, target] }), {
      actor: source.id,
      ability: 'skill',
      targets: [target.id],
      advanceTurn: false,
    });

    expect(result.state.units.find((unit) => unit.id === 'test_summon')).toMatchObject({ name: '测试忆灵', maxHp: 500, faction: 'ally', custom: { summonId: 'test_summon' } });
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'UNIT_SUMMONED', target: 'test_summon' }));
  });
});

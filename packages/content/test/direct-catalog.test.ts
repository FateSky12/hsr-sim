import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCharacterData } from '@hsr-sim/data';
import { BattleKernel, StatKey, createBattleState, createStats, createUnit } from '@hsr-sim/engine';
import { createContentCatalog, createUnitFromCharacter } from '../src/index.js';

const revision = 'b95e75c7e1273d819d20c530c0b7e13a3ef19fb4';
const catalogUrl = new URL(`../../data/generated/starrailres/${revision}/en/direct-characters.json`, import.meta.url);

describe('compiled direct character catalog', () => {
  it('runs a converted Dan Heng skill through the content and engine seams', () => {
    const records = JSON.parse(readFileSync(catalogUrl, 'utf8')) as unknown[];
    const danHeng = parseCharacterData(records.find((record) => (record as { id?: string }).id === '1002'));
    const source = createUnitFromCharacter(danHeng);
    source.stats.base[4] = 0;
    const target = createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 5000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['wind'], resistance: { wind: 0 }, toughness: { current: 10, max: 10, broken: true } });
    const result = new BattleKernel(createContentCatalog([danHeng])).step(createBattleState({ units: [source, target] }), { actor: source.id, ability: 'skill', targets: [target.id], advanceTurn: false });

    expect(result.events.find((event) => event.type === 'DAMAGE_DEALT')).toMatchObject({ ability: 'skill', amount: expect.any(Number) });
  });

  it('runs a converted multi-target ultimate as an inserted action', () => {
    const records = JSON.parse(readFileSync(catalogUrl, 'utf8')) as unknown[];
    const march = parseCharacterData(records.find((record) => (record as { id?: string }).id === '1001'));
    const source = createUnitFromCharacter(march);
    source.stats.base[StatKey.CritRate] = 0;
    source.energy = source.maxEnergy;
    const targetOne = createUnit({ id: 'target-1', faction: 'enemy', stats: createStats({ hp: 5000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['ice'], resistance: { ice: 0 }, toughness: { current: 10, max: 10, broken: true } });
    const targetTwo = createUnit({ id: 'target-2', faction: 'enemy', stats: createStats({ hp: 5000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['ice'], resistance: { ice: 0 }, toughness: { current: 10, max: 10, broken: true } });
    const state = createBattleState({ units: [source, targetOne, targetTwo] });
    const actor = state.units.find((unit) => unit.id === source.id)!;
    actor.nextActionAt = 42;

    const result = new BattleKernel(createContentCatalog([march])).step(state, {
      actor: source.id,
      ability: 'ultimate',
      targets: [targetOne.id, targetTwo.id],
    });
    const damages = result.events.filter((event) => event.type === 'DAMAGE_DEALT' && event.ability === 'ultimate');

    expect(damages).toHaveLength(2);
    expect(result.state.units.find((unit) => unit.id === source.id)?.energy).toBe(5);
    expect(result.state.units.find((unit) => unit.id === source.id)?.nextActionAt).toBe(42);
  });

  it('runs a converted shield utility skill through the content and engine seams', () => {
    const records = JSON.parse(readFileSync(catalogUrl, 'utf8')) as unknown[];
    const march = parseCharacterData(records.find((record) => (record as { id?: string }).id === '1001'));
    const source = createUnitFromCharacter(march);
    const target = createUnit({ id: 'target', faction: 'ally', stats: createStats({ hp: 1000, atk: 1, def: 1, spd: 100, critRate: 0 }) });
    const result = new BattleKernel(createContentCatalog([march])).step(createBattleState({ units: [source, target] }), {
      actor: source.id,
      ability: 'skill',
      targets: [target.id],
      advanceTurn: false,
    });

    expect(result.events).toContainEqual(expect.objectContaining({ type: 'SHIELD_APPLIED', target: target.id, amount: 1354, duration: 3 }));
    expect(result.state.units.find((unit) => unit.id === target.id)?.shields[0]?.amount).toBe(1354);
  });

  it('runs a converted blast as separate primary and adjacent damage instances', () => {
    const records = JSON.parse(readFileSync(catalogUrl, 'utf8')) as unknown[];
    const himeko = parseCharacterData(records.find((record) => (record as { id?: string }).id === '1003'));
    const source = createUnitFromCharacter(himeko);
    source.stats.base[StatKey.CritRate] = 0;
    const primary = createUnit({ id: 'primary', faction: 'enemy', stats: createStats({ hp: 5000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['fire'], resistance: { fire: 0 }, toughness: { current: 10, max: 10, broken: true } });
    const adjacent = createUnit({ id: 'adjacent', faction: 'enemy', stats: createStats({ hp: 5000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['fire'], resistance: { fire: 0 }, toughness: { current: 10, max: 10, broken: true } });
    const result = new BattleKernel(createContentCatalog([himeko])).step(createBattleState({ units: [source, primary, adjacent] }), {
      actor: source.id,
      ability: 'skill',
      targets: [primary.id, adjacent.id],
      advanceTurn: false,
    });
    const damages = result.events.filter((event) => event.type === 'DAMAGE_DEALT' && event.ability === 'skill');

    expect(damages).toHaveLength(2);
    expect(damages.map((event) => event.type === 'DAMAGE_DEALT' ? event.target : '')).toEqual(['primary', 'adjacent']);
  });

  it('runs a converted probabilistic DoT through the effect-hit and snapshot seams', () => {
    const records = JSON.parse(readFileSync(catalogUrl, 'utf8')) as unknown[];
    const serval = parseCharacterData(records.find((record) => (record as { id?: string }).id === '1103'));
    const source = createUnitFromCharacter(serval);
    source.stats.base[StatKey.CritRate] = 0;
    const target = createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 5000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['lightning'], resistance: { lightning: 0 }, toughness: { current: 10, max: 10, broken: true } });
    const result = new BattleKernel(createContentCatalog([serval]), 'sampled').step(createBattleState({ units: [source, target], rngSeed: 1 }), {
      actor: source.id,
      ability: 'skill',
      targets: [target.id],
      advanceTurn: false,
    });

    expect(result.events).toContainEqual(expect.objectContaining({ type: 'DOT_APPLIED', id: '110302:dot', target: target.id, duration: 2 }));
    expect(result.state.units.find((unit) => unit.id === target.id)?.dots[0]).toMatchObject({ id: '110302:dot', multiplier: 1.3, remainingTurns: 2 });
  });

  it('runs Kafka detonation against an already snapshotted DoT', () => {
    const records = JSON.parse(readFileSync(catalogUrl, 'utf8')) as unknown[];
    const kafka = parseCharacterData(records.find((record) => (record as { id?: string }).id === '1005'));
    const source = createUnitFromCharacter(kafka);
    source.stats.base[StatKey.CritRate] = 0;
    const target = createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 5000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['lightning'], resistance: { lightning: 0 }, toughness: { current: 0, max: 10, broken: true } });
    const dotter = createUnit({ id: 'dotter', faction: 'ally', stats: createStats({ hp: 1000, atk: 100, def: 1, spd: 100, critRate: 0 }) });
    const dotRules = createContentCatalog([kafka]);
    const state = createBattleState({ units: [source, dotter, target] });
    state.units.find((unit) => unit.id === target.id)!.dots.push({ id: 'burn', source: dotter.id, ability: 'skill', element: 'fire', scalingStat: StatKey.ATK, multiplier: 1, toughnessDamage: 0, remainingTurns: 2, snapshot: { sourceLevel: 80, scalingValue: 100, elementDamageBonus: 0, allDamageBonus: 0, resPen: 0, defIgnore: 0 } });
    const result = new BattleKernel(dotRules).step(state, { actor: source.id, ability: 'skill', targets: [target.id], advanceTurn: false });

    expect(result.events).toContainEqual(expect.objectContaining({ type: 'DOT_DETONATED', id: 'burn', multiplier: 0.825 }));
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'DAMAGE_DEALT', ability: 'detonate_dots', damageType: 'dot', amount: 66 }));
  });

  it('executes a converted support skill through cleanse, action advance and the damage modifier seam', () => {
    const records = JSON.parse(readFileSync(catalogUrl, 'utf8')) as unknown[];
    const bronya = parseCharacterData(records.find((record) => (record as { id?: string }).id === '1101'));
    const source = createUnitFromCharacter(bronya);
    const ally = createUnit({
      id: 'ally',
      faction: 'ally',
      stats: createStats({ hp: 1000, atk: 100, def: 100, spd: 100 }),
      nextActionAt: 100,
      statuses: [{ id: 'debuff', remainingTurns: 2, stacks: 1, category: 'debuff' }],
    });
    const result = new BattleKernel(createContentCatalog([bronya])).step(createBattleState({ units: [source, ally], skillPoints: 3 }), {
      actor: source.id,
      ability: 'skill',
      targets: [ally.id],
      advanceTurn: false,
    });
    const updated = result.state.units.find((unit) => unit.id === ally.id)!;

    expect(updated.statuses).toEqual([]);
    expect(updated.nextActionAt).toBe(0);
    expect(updated.modifiers).toEqual([expect.objectContaining({
      stat: StatKey.DmgBoostAll,
      percent: 0.825,
      remainingTurns: 1,
    })]);
    expect(result.events.map((event) => event.type)).toContain('ACTION_SCHEDULED');
  });

  it('executes a converted Enhance ultimate as multiple stat modifiers', () => {
    const records = JSON.parse(readFileSync(catalogUrl, 'utf8')) as unknown[];
    const hanya = parseCharacterData(records.find((record) => (record as { id?: string }).id === '1215'));
    const source = createUnitFromCharacter(hanya);
    source.energy = source.maxEnergy;
    const ally = createUnit({ id: 'ally', faction: 'ally', stats: createStats({ hp: 1000, atk: 100, def: 100, spd: 100 }), nextActionAt: 100 });
    const result = new BattleKernel(createContentCatalog([hanya])).step(createBattleState({ units: [source, ally] }), {
      actor: source.id,
      ability: 'ultimate',
      targets: [ally.id],
      advanceTurn: false,
    });
    const modifiers = result.state.units.find((unit) => unit.id === ally.id)?.modifiers;

    expect(modifiers).toEqual(expect.arrayContaining([
      expect.objectContaining({ stat: StatKey.SPD, percent: 0.225, remainingTurns: 2 }),
      expect.objectContaining({ stat: StatKey.ATK, percent: 0.72, remainingTurns: 2 }),
    ]));
  });
});

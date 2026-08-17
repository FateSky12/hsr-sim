import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCharacterData } from '@hsr-sim/data';
import { BattleKernel, StatKey, createBattleState, createRuleCatalog, createStats, createUnit, mergeRuleCatalogs } from '@hsr-sim/engine';
import { createContentCatalog, createUnitFromCharacter } from '../src/index.js';

const revision = 'b95e75c7e1273d819d20c530c0b7e13a3ef19fb4';
const catalogUrl = new URL(`../../data/generated/starrailres/${revision}/en/direct-characters.json`, import.meta.url);
const records = JSON.parse(readFileSync(catalogUrl, 'utf8')) as unknown[];
const character = (id: string) => parseCharacterData(records.find((record) => (record as { id?: string }).id === id));

function enemy(id = 'enemy', weaknesses: Array<'fire' | 'ice' | 'lightning' | 'imaginary' | 'wind' | 'physical' | 'quantum'> = ['fire', 'ice', 'lightning', 'imaginary']) {
  return createUnit({ id, faction: 'enemy', level: 80, stats: createStats({ hp: 100000, atk: 1, def: 0, spd: 100, critRate: 0 }), hp: 100000, maxHp: 100000, toughness: { current: 30, max: 30, broken: false }, weaknesses, resistance: { fire: 0, ice: 0, lightning: 0, imaginary: 0, wind: 0, physical: 0, quantum: 0 } });
}

describe('L3 representative character modules', () => {
  it('models Firefly HP consumption, fire implant and combustion-enhanced action', () => {
    const firefly = character('1310');
    const source = createUnitFromCharacter(firefly);
    source.stats.base[StatKey.CritRate] = 0;
    source.energy = source.maxEnergy;
    const target = enemy('target', ['ice']);
    const kernel = new BattleKernel(createContentCatalog([firefly]));
    const ult = kernel.step(createBattleState({ units: [source, target] }), { actor: source.id, ability: 'ultimate', targets: [target.id], advanceTurn: false });
    const skill = kernel.step({ ...ult.state, units: ult.state.units.map((unit) => ({ ...unit, stats: { base: unit.stats.base.slice(), percent: unit.stats.percent.slice(), flat: unit.stats.flat.slice() } })) }, { actor: source.id, ability: 'skill', targets: [target.id], advanceTurn: false });

    expect(skill.events).toContainEqual(expect.objectContaining({ type: 'WEAKNESS_IMPLANTED', element: 'fire', target: target.id }));
    expect(skill.events.some((event) => event.type === 'HP_LOSS' && event.target === source.id)).toBe(true);
    expect(skill.events.some((event) => event.type === 'DAMAGE_DEALT' && event.ability === 'firefly_enhanced_skill')).toBe(true);
    expect(skill.state.units.find((unit) => unit.id === target.id)?.weaknesses).toContain('fire');
  });

  it('models Fugue prayer non-weakness toughness reduction and Super Break hook', () => {
    const fugue = character('1225');
    const ally = createUnitFromCharacter(fugue);
    ally.energy = ally.maxEnergy;
    const target = enemy('target', ['ice']);
    target.toughness.current = 10;
    const kernel = new BattleKernel(createContentCatalog([fugue]));
    const prayed = kernel.step(createBattleState({ units: [ally, target] }), { actor: ally.id, ability: 'skill', targets: [ally.id], advanceTurn: false });
    const hit = kernel.step(prayed.state, { actor: ally.id, ability: 'ultimate', targets: [target.id], advanceTurn: false });

    expect(hit.events).toContainEqual(expect.objectContaining({ type: 'DAMAGE_DEALT', damageType: 'normal', target: target.id }));
    expect(hit.events.some((event) => event.type === 'WEAKNESS_BREAK')).toBe(true);
    expect(hit.state.units.find((unit) => unit.id === target.id)?.toughness.broken).toBe(true);
  });

  it('models Harmony Trailblazer Backup Dancer as a reusable Super Break hook', () => {
    const trailblazer = character('8005');
    const source = createUnitFromCharacter(trailblazer);
    source.energy = source.maxEnergy;
    const target = enemy('target', ['imaginary']);
    target.toughness.broken = true;
    target.toughness.current = 0;
    const kernel = new BattleKernel(createContentCatalog([trailblazer]));
    const buffed = kernel.step(createBattleState({ units: [source, target] }), { actor: source.id, ability: 'ultimate', targets: [target.id], advanceTurn: false });
    const hit = kernel.step(buffed.state, { actor: source.id, ability: 'basic', targets: [target.id], advanceTurn: false });

    expect(hit.events.some((event) => event.type === 'DAMAGE_DEALT' && event.damageType === 'super_break')).toBe(true);
  });

  it('models Ruan Mei support modifiers and break follow-up', () => {
    const ruanMei = character('1303');
    const source = createUnitFromCharacter(ruanMei);
    const target = enemy('target', ['ice']);
    target.toughness.current = 10;
    const kernel = new BattleKernel(createContentCatalog([ruanMei]));
    const buffed = kernel.step(createBattleState({ units: [source, target] }), { actor: source.id, ability: 'skill', targets: [], advanceTurn: false });

    expect(buffed.state.units.find((unit) => unit.id === source.id)?.modifiers).toEqual(expect.arrayContaining([expect.objectContaining({ stat: StatKey.DmgBoostAll, percent: 0.4 }), expect.objectContaining({ stat: StatKey.BreakEfficiency, percent: 0.5 })]));
    const broken = kernel.step(buffed.state, { actor: source.id, ability: 'basic', targets: [target.id], advanceTurn: false });
    expect(broken.events.some((event) => event.type === 'BREAK_DMG_DEALT' && event.source === ruanMei.id)).toBe(true);
  });

  it('models Acheron stacks and an ultimate that ignores weakness', () => {
    const acheron = character('1308');
    const source = createUnitFromCharacter(acheron);
    source.energy = source.maxEnergy;
    const target = enemy('target', ['ice']);
    const kernel = new BattleKernel(createContentCatalog([acheron]));
    const skilled = kernel.step(createBattleState({ units: [source, target] }), { actor: source.id, ability: 'skill', targets: [target.id], advanceTurn: false });
    const ult = kernel.step(skilled.state, { actor: source.id, ability: 'ultimate', targets: [target.id], advanceTurn: false });

    expect(skilled.state.units.find((unit) => unit.id === target.id)?.custom.acheron_crimson_knot).toBe(1);
    expect(ult.events.some((event) => event.type === 'DAMAGE_DEALT' && event.ability === 'ultimate')).toBe(true);
    expect(ult.events.some((event) => event.type === 'TOUGHNESS_REDUCED')).toBe(true);
  });

  it('models Aventurine team shields and shield-triggered follow-up state', () => {
    const aventurine = character('1304');
    const source = createUnitFromCharacter(aventurine);
    const ally = createUnit({ id: 'ally', faction: 'ally', stats: createStats({ hp: 1000, atk: 1, def: 1, spd: 100, critRate: 0 }) });
    const attacker = createUnit({ id: 'attacker', faction: 'enemy', stats: createStats({ hp: 1000, atk: 100, def: 0, spd: 100, critRate: 0 }), weaknesses: ['imaginary'], resistance: { physical: 0 } });
    const enemyRules = createRuleCatalog({
      attacker: {
        actions: {
          basic: {
            id: 'basic', actionType: 'basic',
            resolve: ({ actor, targetIds }) => [{ kind: 'damage' as const, source: actor.id, target: targetIds[0]!, ability: 'basic', element: 'physical' as const, damageType: 'normal' as const, scalingStat: StatKey.ATK, multiplier: 1 }],
          },
        },
      },
    });
    const kernel = new BattleKernel(mergeRuleCatalogs(createContentCatalog([aventurine]), enemyRules));
    const shielded = kernel.step(createBattleState({ units: [source, ally, attacker] }), { actor: source.id, ability: 'skill', targets: [], advanceTurn: false });
    const state = shielded.state;
    state.units.find((unit) => unit.id === source.id)!.custom.aventurine_blind_bet = 6;
    const hit = kernel.step(state, { actor: attacker.id, ability: 'basic', targets: [ally.id], advanceTurn: false });

    expect(shielded.state.units.find((unit) => unit.id === ally.id)?.shields.length).toBe(1);
    expect(hit.events.some((event) => event.type === 'FOLLOW_UP_USED' && event.actor === source.id)).toBe(true);
  });

  it('creates a memory summon as a separate action-bar entity', () => {
    const memory = character('8007');
    const source = createUnitFromCharacter(memory);
    const target = enemy('target', ['ice']);
    const kernel = new BattleKernel(createContentCatalog([memory]));
    const summoned = kernel.step(createBattleState({ units: [source, target] }), { actor: source.id, ability: 'skill', targets: [target.id], advanceTurn: false });
    const mem = summoned.state.units.find((unit) => unit.custom.summonId === '8007:mem');
    expect(mem).toBeDefined();
    const acted = kernel.step(summoned.state, { actor: mem!.id, ability: 'basic', targets: [target.id], advanceTurn: false });
    expect(acted.events.some((event) => event.type === 'DAMAGE_DEALT' && event.source === mem!.id)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { LightConeDataSchema, trainingEnemy, trainingStriker } from '@hsr-sim/data';
import { BattleKernel, StatKey, createBattleState, createRuleCatalog, createStats, createUnit, mergeRuleCatalogs, statValue, type EffectIntent } from '@hsr-sim/engine';
import { createEquippedUnit, createEquippedUnitFromLoadout, createEquipmentCatalog, createEquipmentRules } from '../src/index.js';

describe('equipment adapter', () => {
  it('applies light-cone base stats, relic main/sub stats and set bonuses to a full battle action', () => {
    const catalog = createEquipmentCatalog();
    const equipped = createEquippedUnit(trainingStriker, 'training_build');
    const target = createUnit({
      id: 'target',
      faction: 'enemy',
      stats: createStats({ hp: 2000, atk: 1, def: 0, spd: 100, critRate: 0 }),
      toughness: { current: 10, max: 10, broken: true },
      weaknesses: ['physical'],
      resistance: { physical: 0 },
    });
    const state = createBattleState({ units: [equipped, target] });
    const result = new BattleKernel(mergeRuleCatalogs(createRuleCatalog({
      [equipped.id]: {
        actions: {
          basic: {
            id: 'basic',
            actionType: 'basic',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{
              kind: 'damage', source: actor.id, target: targetIds[0]!, ability: 'basic', element: 'physical', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: 1,
            }],
          },
        },
      },
    }), createEquipmentRules(catalog, [equipped]))).step(state, { actor: equipped.id, ability: 'basic', targets: [target.id], advanceTurn: false });

    expect(statValue(equipped.stats, StatKey.ATK)).toBe(280);
    expect(equipped.maxHp).toBe(1100);
    expect(equipped.hp).toBe(1100);
    expect(result.events.find((event) => event.type === 'DAMAGE_DEALT')).toMatchObject({ amount: 372 });
    expect(result.events.some((event) => event.type === 'MODIFIER_APPLIED' && event.id === 'equipment:training_light_cone:training_focus')).toBe(true);
    expect(equipped.equipment?.relicIds).toHaveLength(6);
    expect(trainingEnemy.id).toBe('training_enemy');
    expect(createEquipmentRules(catalog)).toBeDefined();
  });

  it('accepts versioned catalog records without changing the engine seam', () => {
    const external = LightConeDataSchema.parse({
      id: 'external_cone',
      name: 'External Cone',
      path: 'the_hunt',
      rarity: 3,
      level: 80,
      superimposition: 1,
      baseStats: { hp: 10, atk: 20, def: 30, spd: 0 },
      staticStats: [],
      source: { kind: 'StarRailRes', revision: 'fixed-revision' },
      coverage: 'unsupported',
    });
    const catalog = createEquipmentCatalog({ lightCones: [external] });

    expect(catalog.lightCones.get('external_cone')).toBe(external);
  });

  it('fires typed equipment passives on the corresponding action event', () => {
    const external = LightConeDataSchema.parse({
      id: 'skill_cone',
      name: 'Skill Cone',
      path: 'the_hunt',
      rarity: 5,
      level: 80,
      superimposition: 1,
      baseStats: { hp: 0, atk: 20, def: 0, spd: 0 },
      staticStats: [],
      passive: { id: 'skill_focus', trigger: 'SKILL_USED', modifier: { stat: 'CritDmg', value: 0.3 }, duration: 2, target: 'self' },
      source: { kind: 'fixture', revision: 'passive-test' },
      coverage: 'abstracted',
    });
    const catalog = createEquipmentCatalog({ lightCones: [external] });
    const equipped = createEquippedUnitFromLoadout(trainingStriker, { lightConeId: external.id, relicIds: [] }, catalog);
    const rules = mergeRuleCatalogs(createRuleCatalog({
      [equipped.id]: {
        actions: {
          skill: { id: 'skill', actionType: 'skill', resolve: (): EffectIntent[] => [] },
        },
      },
    }), createEquipmentRules(catalog, [equipped]));
    const result = new BattleKernel(rules).step(createBattleState({ units: [equipped] }), { actor: equipped.id, ability: 'skill', targets: [], advanceTurn: false });

    expect(result.events).toContainEqual(expect.objectContaining({ type: 'MODIFIER_APPLIED', id: 'equipment:skill_cone:skill_focus' }));
    expect(result.state.units[0]?.modifiers).toEqual(expect.arrayContaining([expect.objectContaining({ stat: StatKey.CritDmg, flat: 0.3 })]));
  });
});

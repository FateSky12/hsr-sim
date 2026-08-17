import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LightConeDataSchema, trainingStriker } from '@hsr-sim/data';
import { createContentCatalog } from '@hsr-sim/content';
import { BattleKernel, createBattleState, createRuleCatalog, createStats, StatKey } from '@hsr-sim/engine';
import { createEquippedUnitFromLoadout, createEquipmentCatalog, createEquipmentRules } from '../src/index.js';

const root = new URL('../../data/generated/starrailres/b95e75c7e1273d819d20c530c0b7e13a3ef19fb4/en/', import.meta.url);
const catalog = (JSON.parse(readFileSync(new URL('light-cone-catalog.json', root), 'utf8')) as unknown[]).map((item) => LightConeDataSchema.parse(item));

describe('compiled light-cone passive hooks', () => {
  it('applies an event-target vulnerability passive to the attacked enemy', () => {
    const lightCone = catalog.find((item) => item.id === '23029')!;
    const equipmentCatalog = createEquipmentCatalog({ lightCones: [lightCone] });
    const actor = createEquippedUnitFromLoadout(trainingStriker, { lightConeId: lightCone.id, relicIds: [] }, equipmentCatalog);
    const target = {
      id: 'target',
      faction: 'enemy' as const,
      stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }),
      resistance: { physical: 0 },
      toughness: { current: 0, max: 0, broken: true },
    };
    const state = createBattleState({ units: [actor, target], skillPoints: 3 });
    const rules = createContentCatalog([trainingStriker]);
    const kernel = new BattleKernel({
      getUnitRules: (id) => rules.getUnitRules(id) ?? createRuleCatalog({}).getUnitRules(id),
      getHooks: (event) => [...rules.getHooks(event), ...createEquipmentRules(equipmentCatalog, [actor]).getHooks(event)],
    });
    const result = kernel.step(state, { actor: actor.id, ability: 'basic', targets: [target.id], advanceTurn: false });
    const modified = result.state.units.find((unit) => unit.id === target.id)!.modifiers;
    expect(modified.some((item) => item.stat === StatKey.Vulnerability && item.flat === 0.1)).toBe(true);
    expect(modified.some((item) => item.stat === StatKey.DmgBoostAll)).toBe(false);
  });
});

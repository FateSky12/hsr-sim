import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EnemyDataSchema, parseStarRailResBasicCharacter } from '@hsr-sim/data';
import { BattleKernel, createBattleState, createRuleCatalog, createStats, createUnit, mergeRuleCatalogs, StatKey, type EffectIntent } from '@hsr-sim/engine';
import { createContentCatalog, createUnitFromCharacter, enemyToRules } from '../src/index.js';

const revision = 'b95e75c7e1273d819d20c530c0b7e13a3ef19fb4';
const root = new URL(`../../data/generated/starrailres/${revision}/en/`, import.meta.url);
function read(file: string): unknown { return JSON.parse(readFileSync(new URL(file, root), 'utf8')); }

describe('upstream character -> content -> engine seam', () => {
  it('runs the converted March 7th basic attack through BattleKernel', () => {
    const character = parseStarRailResBasicCharacter(
      (read('characters.json') as Record<string, unknown>)['1001'],
      (read('character_promotions.json') as Record<string, unknown>)['1001'],
      (read('character_skills.json') as Record<string, unknown>)['100101'],
      { revision, level: 80 },
    );
    const source = createUnitFromCharacter(character);
    source.stats.base[4] = 0;
    const target = createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 5000, atk: 1, def: 0, spd: 100, critRate: 0 }), weaknesses: ['ice'], resistance: { ice: 0 }, toughness: { current: 10, max: 10, broken: true } });
    const result = new BattleKernel(createContentCatalog([character])).step(createBattleState({ units: [source, target] }), { actor: source.id, ability: 'basic', targets: [target.id], advanceTurn: false });

    expect(result.events.find((event) => event.type === 'DAMAGE_DEALT')).toMatchObject({ amount: 716 });
  });

  it('applies a versioned enemy on-break action-delay rule through the hook seam', () => {
    const enemyData = EnemyDataSchema.parse({
      id: 'pattern_enemy',
      name: 'Pattern Enemy',
      level: 80,
      hp: 1000,
      atk: 10,
      def: 0,
      spd: 100,
      toughness: 10,
      weaknesses: ['fire'],
      resistance: { fire: 0 },
      behavior: { pattern: ['basic'], onBreak: { actionDelay: 0.25 }, phases: [{ hpThreshold: 0.95, onEnter: ['summon_adds'] }] },
      source: { kind: 'fixture', revision: 'enemy-fixture-1' },
      coverage: 'abstracted',
    });
    const ally = createUnit({ id: 'ally', faction: 'ally', stats: createStats({ hp: 1000, atk: 100, def: 1, spd: 100, critRate: 0 }) });
    const enemy = createUnitFromEnemyData(enemyData);
    enemy.nextActionAt = 100;
    const allyRules = createRuleCatalog({
      ally: {
        actions: {
          skill: {
            id: 'skill',
            actionType: 'skill',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{
              kind: 'damage', source: actor.id, target: targetIds[0]!, ability: 'skill', element: 'fire', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: 1, toughnessDamage: 10,
            }],
          },
        },
      },
    });
    const result = new BattleKernel(mergeRuleCatalogs(allyRules, createRuleCatalog({ [enemy.id]: enemyToRules(enemyData) }))).step(createBattleState({ units: [ally, enemy] }), {
      actor: ally.id,
      ability: 'skill',
      targets: [enemy.id],
      advanceTurn: false,
    });

    expect(result.state.units.find((unit) => unit.id === enemy.id)?.nextActionAt).toBe(125);
    expect(result.events.some((event) => event.type === 'ACTION_SCHEDULED' && event.actor === enemy.id && event.nextActionAt === 125)).toBe(true);
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'PHASE_ENTERED', target: enemy.id, phase: 1, actions: ['summon_adds'] }));
  });
});

function createUnitFromEnemyData(data: ReturnType<typeof EnemyDataSchema.parse>) {
  return createUnit({
    id: data.id,
    name: data.name,
    faction: 'enemy',
    level: data.level,
    stats: createStats({ hp: data.hp, atk: data.atk, def: data.def, spd: data.spd, critRate: 0 }),
    maxHp: data.hp,
    toughness: { current: data.toughness, max: data.toughness, broken: false },
    weaknesses: data.weaknesses,
    resistance: data.resistance,
  });
}

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseTurnBasedBreakDamageTable,
  parseTurnBasedLightConeCatalog,
  parseTurnBasedScenarioCatalog,
  resolveTurnBasedBreakDamage,
} from '../src/index.js';
import { parseStarRailResLightConeIndex } from '../src/upstream.js';

const revision = 'b95e75c7e1273d819d20c530c0b7e13a3ef19fb4';
const turnBasedRevision = '648b08fbdb2e49739ebbf1210c9a189fcfc5e2d7';
const starRailRoot = new URL(`../generated/starrailres/${revision}/en/`, import.meta.url);
const turnBasedRoot = new URL(`../generated/turnbasedgamedata/${turnBasedRevision}/en/`, import.meta.url);
function read(root: URL, file: string): unknown { return JSON.parse(readFileSync(new URL(file, root), 'utf8')); }

describe('TurnBasedGameData adapters', () => {
  it('keeps the client break table exact at the calibrated public levels', () => {
    const table = parseTurnBasedBreakDamageTable([
      { Level: 1, BreakBaseDamage: { Value: 54 } },
      { Level: 80, BreakBaseDamage: { Value: 3767.5535 } },
      { Level: 120, BreakBaseDamage: { Value: 9261.387 } },
    ], { revision: turnBasedRevision });
    expect(resolveTurnBasedBreakDamage(table, 1)).toBe(54);
    expect(resolveTurnBasedBreakDamage(table, 80)).toBe(3767.5535);
    expect(resolveTurnBasedBreakDamage(table, 95)).toBe(3767.5535);
    expect(table.source.revision).toBe(turnBasedRevision);
  });

  it('joins raw stage waves to named, source-pinned enemy instances', () => {
    const scenarios = read(turnBasedRoot, 'scenario-catalog.json') as Array<Record<string, any>>;
    expect(scenarios).toHaveLength(3);
    expect(scenarios[0]).toMatchObject({
      id: 'turnbased-stage-30124121',
      version: '4.4',
      totalWaves: 2,
      source: { kind: 'TurnBasedGameData', revision: turnBasedRevision },
      coverage: 'abstracted',
    });
    expect(scenarios[0].waves[0].enemies[0].sourceIds.monsterId).toBe('3013010');
    expect(scenarios[2].waves[1].enemies[0].name).toBe('Memory Zone Meme "Something Unto Death"');
  });

  it('parses executable light-cone hooks while preserving abstracted coverage', () => {
    const indexes = parseStarRailResLightConeIndex(read(starRailRoot, 'light_cones.json'), { revision });
    const catalog = parseTurnBasedLightConeCatalog({
      index: read(starRailRoot, 'light_cones.json'),
      promotions: read(starRailRoot, 'light_cone_promotions.json'),
      mechanics: read(turnBasedRoot, 'light-cone-mechanics.json'),
    }, { starRailResRevision: revision, turnBasedRevision, level: 80, superimposition: 1 });
    expect(indexes).toHaveLength(165);
    const flower = catalog.find((item) => item.id === '23038')!;
    expect(flower.staticStats).toEqual([{ stat: 'CritDmg', value: 0.36 }]);
    expect(flower.passives).toEqual([expect.objectContaining({ trigger: 'FOLLOW_UP_USED', modifier: { stat: 'CritDmg', value: 0.48 } })]);
    expect(flower.coverage).toBe('abstracted');
  });

  it('compiles the 4.4 avatar panel and skill parameter directory', () => {
    const catalog = read(turnBasedRoot, 'avatar-catalog.json') as Array<Record<string, any>>;
    const march = catalog.find((item) => item.id === '1001')!;
    const acheron = catalog.find((item) => item.id === '1308')!;
    expect(catalog).toHaveLength(91);
    expect(march).toMatchObject({ name: 'March 7th', level: 80, baseStats: { hp: 1058.4, atk: 511.56, def: 573.3, spd: 101 }, maxEnergy: 120 });
    expect(march.skills.find((skill: any) => skill.actionType === 'basic')).toMatchObject({ params: [1.4], toughness: [30, 0, 0] });
    expect(acheron).toMatchObject({ name: 'Acheron', maxEnergy: 9 });
  });

  it('can compile a tiny raw stage without depending on JavaScript-safe hashes', () => {
    const [scenario] = parseTurnBasedScenarioCatalog({
      monsters: [{ MonsterID: '7', MonsterTemplateID: '7', StanceWeakList: ['Thunder'], DamageTypeResistance: [{ DamageType: 'Physical', Value: { Value: 0.2 } }], SkillList: [7001] }],
      templates: [{ MonsterTemplateID: '7', MonsterName: { Hash: '18446744073709551615' }, Rank: 'Elite', HPBase: { Value: 100 }, AttackBase: { Value: 10 }, DefenceBase: { Value: 20 }, SpeedBase: { Value: 120 }, StanceBase: { Value: 30 } }],
      stages: [{ StageID: '9', StageName: { Hash: '18446744073709551615' }, Level: 80, MonsterList: [{ Monster0: '7' }] }],
      textMap: { '18446744073709551615': 'Hash-safe stage name' },
    }, { revision: turnBasedRevision, stageIds: ['9'], defaultMode: 'memory_of_chaos' });
    expect(scenario).toMatchObject({ name: 'Hash-safe stage name', waves: [{ enemies: [{ name: 'Hash-safe stage name', weaknesses: ['lightning'], resistance: { physical: 0.2 } }] }] });
  });
});

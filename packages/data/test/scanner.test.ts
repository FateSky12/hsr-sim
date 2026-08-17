import { describe, expect, it } from 'vitest';
import { parseScannerExport, parseScannerRelics } from '../src/index.js';

describe('HSR-Scanner style relic adapter', () => {
  it('normalizes common scanner field names into versioned relic instances', () => {
    const result = parseScannerRelics({
      relics: [{
        id: 'scanner-1',
        set: '训练遗器',
        slot: 'HEAD',
        level: 15,
        main: { key: 'HP', value: 705 },
        substats: [{ key: 'ATK%', value: 0.1 }, { key: 'CRIT Rate', value: 0.08 }],
      }],
    }, {
      setIdByName: { 训练遗器: 'training_set' },
      sourceRevision: 'scanner-fixture-1',
    });

    expect(result).toEqual([expect.objectContaining({
      id: 'scanner-1',
      setId: 'training_set',
      slot: 'head',
      mainStat: { stat: 'HP', value: 705 },
      subStats: [
        { stat: 'ATKPercent', value: 0.1 },
        { stat: 'CritRate', value: 0.08 },
      ],
      source: { kind: 'HSR-Scanner', revision: 'scanner-fixture-1' },
      coverage: 'abstracted',
    })]);
  });

  it('rejects duplicate relic IDs and unknown sets instead of silently corrupting a build', () => {
    expect(() => parseScannerRelics({ relics: [{ id: 'same', set: '未知', slot: 'HEAD', level: 0, main: { key: 'HP', value: 1 }, substats: [] }] }, {
      setIdByName: { 训练遗器: 'training_set' },
      sourceRevision: 'scanner-fixture-1',
    })).toThrow(/Unknown relic set/);
  });

  it('accepts common elemental, energy and healing scanner aliases', () => {
    const result = parseScannerRelics({
      relics: [{
        id: 'scanner-2',
        set: '训练遗器',
        slot: 'LINK ROPE',
        level: 15,
        mainStat: { stat: 'Energy Regeneration Rate', value: 0.1944 },
        subStats: [
          { stat: 'Fire DMG Boost', value: 0.06 },
          { stat: 'Outgoing Healing Boost', value: 0.1 },
        ],
      }],
    }, {
      setIdByName: { 训练遗器: 'training_set' },
      sourceRevision: 'scanner-fixture-1',
    });

    expect(result[0]?.mainStat).toEqual({ stat: 'EnergyRegen', value: 0.1944 });
    expect(result[0]?.subStats).toEqual([
      { stat: 'DmgBoostFire', value: 0.06 },
      { stat: 'HealBoost', value: 0.1 },
    ]);
  });

  it('accepts scanner exports that carry a stable set id instead of a localized set name', () => {
    const result = parseScannerRelics({
      relics: [{
        id: 'scanner-id-set',
        setId: '145',
        slot: 'BODY',
        level: 15,
        main: { key: 'CRIT DMG', value: 0.622 },
        substats: [],
      }],
    }, {
      setIdByName: {},
      sourceRevision: 'scanner-fixture-2',
    });

    expect(result[0]).toEqual(expect.objectContaining({
      setId: '145',
      slot: 'body',
      mainStat: { stat: 'CritDmg', value: 0.622 },
    }));
  });

  it('accepts object-shaped set fields while retaining the canonical set id', () => {
    const result = parseScannerRelics({
      relics: [{
        id: 'scanner-object-set',
        set: { id: '145', name: 'Some localized name' },
        slot: 'FEET',
        level: 15,
        main: { key: 'SPD', value: 25 },
        substats: [],
      }],
    }, {
      setIdByName: {},
      sourceRevision: 'scanner-fixture-3',
    });

    expect(result[0]?.setId).toBe('145');
  });

  it('accepts the official HSR-Scanner v4 relic shape with set_id, mainstat, underscore percent keys and _uid', () => {
    const result = parseScannerRelics({
      source: 'HSR-Scanner',
      version: 4,
      relics: [{
        set_id: '102',
        name: 'Musketeer of Wild Wheat',
        slot: 'Hands',
        rarity: 5,
        level: 15,
        mainstat: 'ATK',
        substats: [
          { key: 'DEF', value: 16 },
          { key: 'DEF_', value: 5.4 },
          { key: 'CRIT Rate_', value: 5.1 },
          { key: 'CRIT DMG_', value: 31.7 },
        ],
        preview_substats: [],
        location: '1101',
        _uid: 'relic_1',
      }],
    }, {
      setIdByName: {},
      sourceRevision: 'scanner-v4-fixture',
    });

    expect(result[0]).toEqual(expect.objectContaining({
      id: 'relic_1',
      setId: '102',
      slot: 'hands',
      mainStat: { stat: 'ATK', value: expect.closeTo(352.8, 5) },
      subStats: [
        { stat: 'DEF', value: 16 },
        { stat: 'DEFPercent', value: 0.054 },
        { stat: 'CritRate', value: 0.051 },
        { stat: 'CritDmg', value: 0.317 },
      ],
    }));
  });

  it('extracts character and light-cone IDs from the complete Scanner v4 export', () => {
    const result = parseScannerExport({
      source: 'HSR-Scanner',
      version: 4,
      metadata: { uid: 123456789, trailblazer: 'Stelle' },
      light_cones: [{ id: '23006', location: '1005', _uid: 'light_cone_1' }],
      characters: [{ id: '1005', name: 'Kafka', skills: { basic: 1 } }],
      relics: [{ set_id: '102', slot: 'Head', level: 15, mainstat: 'HP', substats: [], _uid: 'relic_1' }],
    }, { setIdByName: {}, sourceRevision: 'scanner-v4-complete' });

    expect(result).toMatchObject({ lightConeIds: ['23006'], characterIds: ['1005'], sourceRevision: 'scanner-v4-complete', metadata: { trailblazer: 'Stelle' } });
    expect(result.metadata).not.toHaveProperty('uid');
    expect(result.relics).toHaveLength(1);
  });
});

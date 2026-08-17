import { describe, expect, it } from 'vitest';
import { compareCalibrationDocument, parseCalibrationDocument } from '../src/index.js';

describe('JSON calibration document', () => {
  it('validates and compares a combined L0/L1/L2 capture', () => {
    const document = parseCalibrationDocument({
      schemaVersion: 1,
      name: 'fixture-capture',
      panel: {
        expected: { hp: 1, atk: 2, def: 3, spd: 100, critRate: 0, critDmg: 0.5, breakEffect: 0, effectHitRate: 0 },
        observed: { hp: 1, atk: 2, def: 3, spd: 101, critRate: 0, critDmg: 0.5, breakEffect: 0, effectHitRate: 0 },
      },
      damageTrace: [{ index: 0, expected: 100, observed: 100.4, tolerance: 0.005 }],
      actionTrace: [{ index: 0, expectedActor: 'a', observedActor: 'a', expectedAt: 10, observedAt: 10, expectedAbility: 'basic', observedAbility: 'basic' }],
    });

    expect(compareCalibrationDocument(document).passed).toBe(true);
  });
});

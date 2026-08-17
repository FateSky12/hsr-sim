import { describe, expect, it } from 'vitest';
import { createStats, createUnit } from '@hsr-sim/engine';
import { compareActionTrace, compareCalibration, compareDamageTrace, comparePanel, derivePanelSnapshot } from '../src/index.js';

describe('field-level calibration report', () => {
  it('separates a passing tolerance from a real client mismatch', () => {
    const report = compareCalibration([
      { field: 'damage.basic', expected: 100, observed: 100.4, tolerance: 0.5, source: 'recording-1' },
      { field: 'action.0.actor', expected: 'march7th', observed: 'march7th' },
      { field: 'energy.after_skill', expected: 30, observed: 20, tolerance: 0 },
    ]);

    expect(report.passed).toBe(false);
    expect(report.mismatches).toEqual([expect.objectContaining({ field: 'energy.after_skill', delta: 10 })]);
  });

  it('provides L0 panel comparison with an explicit speed tolerance', () => {
    const expected = { hp: 1000, atk: 200, def: 300, spd: 134, critRate: 0.7, critDmg: 1.5, breakEffect: 0.8, effectHitRate: 0.2 };
    expect(comparePanel(expected, { ...expected, spd: 135 }).passed).toBe(true);
    expect(comparePanel(expected, { ...expected, atk: 201 }).mismatches[0]?.field).toBe('panel.atk');
    const unit = createUnit({ id: 'a', faction: 'ally', stats: createStats({ hp: 1000, atk: 200, def: 300, spd: 134, critRate: 0.7, critDmg: 1.5, breakEffect: 0.8, effectHitRate: 0.2 }) });
    expect(derivePanelSnapshot(unit)).toEqual(expected);
  });

  it('compares L1 damage traces and L2 action traces by indexed observation', () => {
    expect(compareDamageTrace([{ index: 0, expected: 1000, observed: 1004, tolerance: 0.005 }]).passed).toBe(true);
    expect(compareDamageTrace([{ index: 0, expected: 1000, observed: 1010, tolerance: 0.005 }]).passed).toBe(false);
    expect(compareActionTrace([{ index: 0, expectedActor: 'a', observedActor: 'a', expectedAt: 10, observedAt: 10.0000001, expectedAbility: 'skill', observedAbility: 'skill' }]).passed).toBe(true);
  });
});

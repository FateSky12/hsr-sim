import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareCalibrationDocument, parseCalibrationDocument } from '../src/index.js';

const calibrationRoot = new URL('../../../tests/calibration/', import.meta.url);

describe('checked-in calibration fixtures', () => {
  it('treats every imported panel/damage/action observation as a regression gate', () => {
    const files = readdirSync(calibrationRoot).filter((file) => file.endsWith('.json')).sort();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const document = parseCalibrationDocument(JSON.parse(readFileSync(new URL(file, calibrationRoot), 'utf8')) as unknown);
      expect(compareCalibrationDocument(document), `${file} should remain within its recorded tolerances`).toMatchObject({ passed: true, mismatches: [] });
    }
  });
});

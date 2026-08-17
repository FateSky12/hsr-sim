import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const revision = 'b95e75c7e1273d819d20c530c0b7e13a3ef19fb4';
const reportUrl = new URL(`../generated/starrailres/${revision}/en/coverage-report.json`, import.meta.url);

describe('generated character coverage report', () => {
  it('makes direct conversion and unsupported mechanism gaps explicit', () => {
    const report = JSON.parse(readFileSync(reportUrl, 'utf8')) as {
      source: { revision: string };
      totalCharacters: number;
      basicCharacters: number;
      directSkillCharacters: number;
      directUltimateCharacters: number;
      compiledSkillCharacters: number;
      compiledUltimateCharacters: number;
      effectCounts: Record<string, number>;
      characters: Array<{ skill: string; ultimate: string }>;
    };

    expect(report.source.revision).toBe(revision);
    expect(report.totalCharacters).toBe(95);
    expect(report.basicCharacters).toBe(95);
    expect(report.directSkillCharacters).toBeGreaterThan(0);
    expect(report.directUltimateCharacters).toBeGreaterThan(0);
    expect(report.compiledSkillCharacters).toBeGreaterThanOrEqual(report.directSkillCharacters);
    expect(report.compiledUltimateCharacters).toBeGreaterThanOrEqual(report.directUltimateCharacters);
    expect(report.effectCounts.Blast).toBeGreaterThan(0);
    expect(report.effectCounts.Bounce).toBeGreaterThan(0);
    expect(report.characters.some((character) => character.skill === 'unsupported' || character.ultimate === 'unsupported')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { trainingRelics, trainingStriker } from '@hsr-sim/data';
import { createStats, createUnit } from '@hsr-sim/engine';
import { createEquipmentCatalog } from '@hsr-sim/equipment';
import { generateLoadoutCandidates, rankCandidates, scoreStaticCandidate, twoStageSearch } from '../src/index.js';

describe('two-stage loadout search', () => {
  it('enumerates one relic per slot with a deterministic candidate id', () => {
    const alternatives = [
      ...trainingRelics,
      { ...trainingRelics[1]!, id: 'training_hands_alt', mainStat: { stat: 'ATK', value: 10 } },
    ];
    const candidates = generateLoadoutCandidates({ lightConeIds: ['training_light_cone'], relics: alternatives });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.id).toContain('training_hands');
    expect(new Set(candidates.flatMap((candidate) => candidate.loadout.relicIds)).size).toBeGreaterThan(1);
  });

  it('coarse-ranks candidates and only fully simulates the retained slice', () => {
    const candidates = [{ id: 'a', loadout: { relicIds: [] } }, { id: 'b', loadout: { relicIds: [] } }];
    const visited: string[] = [];
    const result = twoStageSearch({
      candidates,
      coarseScore: (candidate) => candidate.id === 'b' ? 20 : 10,
      keep: 1,
      simulate: (candidate) => {
        visited.push(candidate.id);
        return { score: 42, result: { id: candidate.id } };
      },
    });

    expect(visited).toEqual(['b']);
    expect(result.best?.candidate.id).toBe('b');
  });

  it('scores an equipped candidate through the same damage pipeline used by battle simulation', () => {
    const catalog = createEquipmentCatalog();
    const candidate = generateLoadoutCandidates({ lightConeIds: ['training_light_cone'], relics: trainingRelics })[0]!;
    const target = createUnit({ id: 'target', faction: 'enemy', stats: createStats({ hp: 1000, atk: 1, def: 0, spd: 100, critRate: 0 }), toughness: { current: 0, max: 10, broken: true }, weaknesses: ['physical'], resistance: { physical: 0 } });

    expect(scoreStaticCandidate(trainingStriker, candidate, catalog, { target, element: 'physical' })).toBeGreaterThan(0);
    expect(rankCandidates([candidate], () => 123, 1)[0]?.score).toBe(123);
  });
});

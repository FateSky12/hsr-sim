import { describe, expect, it } from 'vitest';
import { parseEnemyConfig } from '../src/index.js';

describe('parameterized enemy config adapter', () => {
  it('accepts the plan-shaped aliases and preserves explicit overrides', () => {
    const enemy = parseEnemyConfig({
      id: 'boss-4-4',
      name: 'Versioned Boss',
      level: 95,
      hp: 4_500_000,
      defBase: 1150,
      spd: 145,
      maxToughness: 540,
      weaknesses: ['fire', 'lightning', 'imaginary'],
      resOverrides: { quantum: 0.4 },
      behavior: { pattern: ['skillA', 'basic'], onBreak: { actionDelay: 0.25 }, phases: [] },
    }, { sourceRevision: 'enemy-fixture-4.4' });

    expect(enemy).toMatchObject({ id: 'boss-4-4', def: 1150, toughness: 540, resistance: { quantum: 0.4, fire: 0.2 }, source: { revision: 'enemy-fixture-4.4' }, coverage: 'abstracted' });
  });
});

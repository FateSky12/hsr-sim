import { describe, expect, it } from 'vitest';
import { BattleKernel, createBattleState, createRuleCatalog, createStats, createUnit, type EffectIntent } from '../src/index.js';

describe('shield duration lifecycle', () => {
  it('decrements on the protected unit turn and emits expiration', () => {
    const rules = createRuleCatalog({
      unit: {
        actions: {
          basic: { id: 'basic', actionType: 'basic', resolve: (): EffectIntent[] => [] },
        },
      },
    });
    const unit = createUnit({
      id: 'unit', faction: 'ally', stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }),
      shields: [{ id: 'shield', source: 'unit', amount: 10, remainingTurns: 1 }],
    });
    const result = new BattleKernel(rules).step(createBattleState({ units: [unit] }), { actor: unit.id, ability: 'basic', targets: [], advanceTurn: false });

    expect(result.state.units[0]?.shields).toEqual([]);
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'SHIELD_EXPIRED', target: unit.id, id: 'shield' }));
  });
});

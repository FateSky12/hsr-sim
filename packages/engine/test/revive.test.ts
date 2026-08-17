import { describe, expect, it } from 'vitest';
import { BattleKernel, createBattleState, createRuleCatalog, createStats, createUnit, type EffectIntent } from '../src/index.js';

describe('revive and healing lifecycle', () => {
  it('revives a defeated ally without reviving merely from ordinary healing', () => {
    const rules = createRuleCatalog({
      healer: {
        actions: {
          revive: {
            id: 'revive',
            actionType: 'skill',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{ kind: 'revive', source: actor.id, target: targetIds[0]!, multiplier: 0.4 }],
          },
          heal: {
            id: 'heal',
            actionType: 'skill',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{ kind: 'heal', source: actor.id, target: targetIds[0]!, scalingStat: 0, multiplier: 1 }],
          },
        },
      },
    });
    const healer = createUnit({ id: 'healer', faction: 'ally', stats: createStats({ hp: 1000, atk: 100, def: 1, spd: 100 }) });
    const fallen = createUnit({ id: 'fallen', faction: 'ally', hp: 0, stats: createStats({ hp: 1000, atk: 1, def: 1, spd: 100 }) });
    const kernel = new BattleKernel(rules);
    const healed = kernel.step(createBattleState({ units: [healer, fallen] }), { actor: healer.id, ability: 'heal', targets: [fallen.id], advanceTurn: false });
    expect(healed.state.units.find((unit) => unit.id === fallen.id)).toMatchObject({ hp: 0, alive: false });

    const revived = kernel.step(healed.state, { actor: healer.id, ability: 'revive', targets: [fallen.id], advanceTurn: false });
    expect(revived.state.units.find((unit) => unit.id === fallen.id)).toMatchObject({ hp: 400, alive: true });
    expect(revived.events).toContainEqual(expect.objectContaining({ type: 'UNIT_REVIVED', target: fallen.id }));
  });
});

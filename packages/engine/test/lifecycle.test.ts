import { describe, expect, it } from 'vitest';
import { BattleKernel, createBattleState, createRuleCatalog, createStats, createUnit, type EffectIntent } from '../src/index.js';

describe('battle lifecycle events', () => {
  it('emits replayable battle, turn and action boundaries in order', () => {
    const rules = createRuleCatalog({
      striker: {
        actions: {
          basic: {
            id: 'basic',
            actionType: 'basic',
            resolve: (): EffectIntent[] => [],
          },
        },
      },
    });
    const state = createBattleState({ units: [
      createUnit({ id: 'striker', faction: 'ally', stats: createStats({ hp: 1000, atk: 1, def: 1, spd: 100 }) }),
    ] });
    const kernel = new BattleKernel(rules);

    const turnStart = kernel.beginTurn(state, 'striker');
    const transition = kernel.step(turnStart.state, { actor: 'striker', ability: 'basic', targets: [] });

    expect([...turnStart.events, ...transition.events].map((event) => event.type)).toEqual([
      'BATTLE_START',
      'WAVE_START',
      'TURN_BEGIN',
      'ACTION_STARTED',
      'BEFORE_ACTION',
      'BASIC_USED',
      'ACTION_SCHEDULED',
      'AFTER_ACTION',
      'TURN_END',
    ]);
  });
});

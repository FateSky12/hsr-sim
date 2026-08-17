import { describe, expect, it } from 'vitest';
import { BattleKernel, cloneBattleState, createBattleState, createRuleCatalog, createStats, createUnit, withSequence, type EffectIntent, type ReplayEvent } from '@hsr-sim/engine';
import { EnemyPolicy, runPolicy } from '@hsr-sim/policy';
import { decodeCompressedReplay, decodeCompressedShareableState, decodeReplay, decodeShareableState, encodeCompressedReplay, encodeCompressedShareableState, encodeReplay, encodeShareableState, stateHash, createReplayDocument, verifyReplay } from '../src/index.js';

describe('replay codec', () => {
  it('round-trips typed-array state through a shareable payload', () => {
    const state = createBattleState({ units: [createUnit({ id: 'a', faction: 'ally', stats: createStats({ hp: 1, atk: 2, def: 3, spd: 4 }) })] });
    const decoded = decodeShareableState(encodeShareableState(state));

    expect(stateHash(decoded)).toBe(stateHash(state));
    expect(decoded.units[0]?.stats.base[1]).toBe(2);
  });

  it('round-trips the compressed shareable payload and preserves the state hash', async () => {
    const state = createBattleState({ units: [createUnit({ id: 'a', faction: 'ally', stats: createStats({ hp: 1, atk: 2, def: 3, spd: 4 }) })] });
    const encoded = await encodeCompressedShareableState(state);
    const decoded = await decodeCompressedShareableState(encoded);

    expect(encoded.startsWith('gz.') || encoded.startsWith('raw.')).toBe(true);
    expect(stateHash(decoded)).toBe(stateHash(state));
  });

  it('stores ruleset, commands, event trace and final state hash', () => {
    const state = createBattleState({ units: [createUnit({ id: 'a', faction: 'ally', stats: createStats({ hp: 1, atk: 2, def: 3, spd: 4 }) })] });
    const document = createReplayDocument({
      rulesetVersion: 'rules-0.1',
      dataRevision: 'fixture-0.1',
      metadata: { characterId: '1002', characterIds: ['1002', '1003'], scenarioId: 'moc-fixture', enemyId: 'training_enemy' },
      initialState: state,
      commands: [{ actor: 'a', ability: 'basic', targets: [] }],
      events: [],
      finalState: state,
    });

    expect(decodeReplay(encodeReplay(document))).toMatchObject({
      schemaVersion: 1,
      rulesetVersion: 'rules-0.1',
      metadata: { characterId: '1002', characterIds: ['1002', '1003'], scenarioId: 'moc-fixture', enemyId: 'training_enemy' },
      finalStateHash: stateHash(state),
    });
  });

  it('round-trips a compressed replay document for shareable reproduction', async () => {
    const state = createBattleState({ units: [createUnit({ id: 'a', faction: 'ally', stats: createStats({ hp: 1, atk: 2, def: 3, spd: 4 }) })] });
    const document = createReplayDocument({ rulesetVersion: 'rules-0.1', dataRevision: 'fixture-0.1', initialState: state, commands: [], events: [], finalState: state });
    const decoded = await decodeCompressedReplay(await encodeCompressedReplay(document));

    expect(decoded).toMatchObject({ schemaVersion: 1, rulesetVersion: 'rules-0.1', dataRevision: 'fixture-0.1', finalStateHash: stateHash(state) });
  });

  it('replays commands and reports event or final-state divergence', () => {
    const rules = createRuleCatalog({
      a: {
        actions: {
          basic: {
            id: 'basic',
            actionType: 'basic',
            resolve: (): EffectIntent[] => [],
          },
        },
      },
    });
    const initialState = createBattleState({
      units: [createUnit({ id: 'a', faction: 'ally', stats: createStats({ hp: 1, atk: 2, def: 3, spd: 4 }) })],
    });
    const command = { actor: 'a', ability: 'basic', targets: [], advanceTurn: false } as const;
    const transition = new BattleKernel(rules).step(initialState, command);
    const document = createReplayDocument({
      rulesetVersion: 'rules-0.1',
      dataRevision: 'fixture-0.1',
      initialState,
      commands: [command],
      events: transition.events,
      finalState: transition.state,
    });

    const verified = verifyReplay(document, new BattleKernel(rules));
    expect(verified.passed).toBe(true);
    expect(verified.actualFinalStateHash).toBe(document.finalStateHash);
    expect(verified.firstEventMismatch).toBeUndefined();

    const divergent = verifyReplay({ ...document, events: [] }, new BattleKernel(rules));
    expect(divergent.passed).toBe(false);
    expect(divergent.firstEventMismatch).toBe(0);
  });

  it('commits policy-side target-selection RNG into commands so enemy replays remain deterministic', () => {
    const rules = createRuleCatalog({
      enemy: {
        actions: {
          basic: {
            id: 'basic',
            actionType: 'basic',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{ kind: 'damage', source: actor.id, target: targetIds[0]!, ability: 'basic', element: 'physical', damageType: 'normal', scalingStat: 1, multiplier: 1 }],
          },
        },
      },
    });
    const initialState = createBattleState({ rngSeed: 123, units: [
      createUnit({ id: 'enemy', faction: 'enemy', stats: createStats({ hp: 1000, atk: 100, def: 1, spd: 100, critRate: 0 }) }),
      createUnit({ id: 'ally-a', faction: 'ally', baseAggro: 1, stats: createStats({ hp: 1000, atk: 1, def: 1, spd: 100, critRate: 0 }) }),
      createUnit({ id: 'ally-b', faction: 'ally', baseAggro: 3, stats: createStats({ hp: 1000, atk: 1, def: 1, spd: 100, critRate: 0 }) }),
    ] });
    const kernel = new BattleKernel(rules);
    const run = runPolicy(kernel, initialState, new EnemyPolicy([{ enemyId: 'enemy', ability: 'basic', targeting: 'weighted_random' }]), { maxActions: 1 });
    const replay = createReplayDocument({ rulesetVersion: 'rules-test', dataRevision: 'fixture-test', initialState, commands: run.commands, events: run.events, finalState: run.finalState });

    expect(run.commands[0]?.rngState?.cursor).toBe(1);
    expect(verifyReplay(replay, new BattleKernel(rules)).passed).toBe(true);
  });

  it('replays a multi-wave command stream when the host supplies the wave transition', () => {
    const rules = createRuleCatalog({
      ally: {
        actions: {
          basic: {
            id: 'basic',
            actionType: 'basic',
            resolve: ({ actor, targetIds }): EffectIntent[] => [{ kind: 'damage', source: actor.id, target: targetIds[0]!, ability: 'basic', element: 'physical', damageType: 'normal', scalingStat: 1, multiplier: 1, canCrit: false }],
          },
        },
      },
    });
    const ally = createUnit({ id: 'ally', faction: 'ally', stats: createStats({ hp: 1000, atk: 100, def: 1, spd: 100, critRate: 0 }) });
    const firstEnemy = createUnit({ id: 'enemy-one', faction: 'enemy', stats: createStats({ hp: 50, atk: 1, def: 0, spd: 100, critRate: 0 }), resistance: { physical: 0 } });
    const secondEnemy = createUnit({ id: 'enemy-two', faction: 'enemy', stats: createStats({ hp: 50, atk: 1, def: 0, spd: 100, critRate: 0 }), resistance: { physical: 0 } });
    const initialState = createBattleState({ units: [ally, firstEnemy], totalWaves: 2 });
    const kernel = new BattleKernel(rules);
    const first = kernel.step(initialState, { actor: 'ally', ability: 'basic', targets: ['enemy-one'], advanceTurn: false });
    const transition = (input: ReturnType<typeof cloneBattleState>) => {
      const state = cloneBattleState(input);
      state.wave = 2;
      state.units = state.units.filter((unit) => unit.faction === 'ally' && unit.alive);
      state.units.push(secondEnemy);
      const events: ReplayEvent[] = [
        withSequence({ type: 'WAVE_END', at: state.clock, wave: 1 }, state.eventSequence + 1),
        withSequence({ type: 'WAVE_START', at: state.clock, wave: 2 }, state.eventSequence + 2),
      ];
      state.eventSequence += events.length;
      return { state, events };
    };
    const wave = transition(first.state);
    const second = kernel.step(wave.state, { actor: 'ally', ability: 'basic', targets: ['enemy-two'], advanceTurn: false });
    const replay = createReplayDocument({
      rulesetVersion: 'rules-test',
      dataRevision: 'fixture-test',
      initialState,
      commands: [
        { actor: 'ally', ability: 'basic', targets: ['enemy-one'], advanceTurn: false },
        { actor: 'ally', ability: 'basic', targets: ['enemy-two'], advanceTurn: false },
      ],
      events: [...first.events, ...wave.events, ...second.events],
      finalState: second.state,
    });

    expect(verifyReplay(replay, new BattleKernel(rules), { advanceWave: transition }).passed).toBe(true);
  });
});

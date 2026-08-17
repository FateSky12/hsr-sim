import { describe, expect, it } from 'vitest';
import { BattleKernel, StatKey, createBattleState, createRuleCatalog, createStats, createUnit, type EffectIntent } from '../src/index.js';

describe('action resource accounting', () => {
  it('applies declared energy gain and skill-point gain through the same transition', () => {
    const rules = createRuleCatalog({
      unit: {
        actions: {
          basic: {
            id: 'basic',
            actionType: 'basic',
            spGain: 1,
            energyGain: 30,
            resolve: (): EffectIntent[] => [],
          },
        },
      },
    });
    const unit = createUnit({ id: 'unit', faction: 'ally', stats: createStats({ hp: 1, atk: 1, def: 1, spd: 100 }), maxEnergy: 100 });
    const result = new BattleKernel(rules).step(createBattleState({ units: [unit], skillPoints: 2 }), { actor: 'unit', ability: 'basic', targets: [], advanceTurn: false });

    expect(result.state.skillPoints).toBe(3);
    expect(result.state.units[0]?.energy).toBe(30);
    expect(result.events.map((event) => event.type)).toEqual(['ACTION_STARTED', 'BEFORE_ACTION', 'SP_CHANGED', 'ENERGY_CHANGED', 'ENERGY_GAINED', 'BASIC_USED', 'AFTER_ACTION', 'TURN_END']);
  });

  it('applies energy regeneration to positive energy gains and healing boost to heals', () => {
    const rules = createRuleCatalog({
      unit: {
        actions: {
          restore: {
            id: 'restore',
            actionType: 'skill',
            energyGain: 20,
            resolve: ({ actor }): EffectIntent[] => [{ kind: 'heal', source: actor.id, target: actor.id, scalingStat: StatKey.ATK, multiplier: 1 }],
          },
        },
      },
    });
    const unit = createUnit({ id: 'unit', faction: 'ally', hp: 50, maxHp: 100, energy: 0, maxEnergy: 100, stats: createStats({ hp: 100, atk: 10, def: 1, spd: 100, energyRegen: 1.5, healBoost: 0.2 }) });
    const result = new BattleKernel(rules).step(createBattleState({ units: [unit] }), { actor: 'unit', ability: 'restore', targets: [], advanceTurn: false });

    expect(result.state.units[0]?.energy).toBe(30);
    expect(result.state.units[0]?.hp).toBe(62);
  });

  it('routes received-hit energy through a versioned calibration callback', () => {
    const rules = createRuleCatalog({
      attacker: {
        actions: {
          basic: {
            id: 'basic',
            actionType: 'basic',
            resolve: ({ actor }): EffectIntent[] => [{
              kind: 'damage',
              source: actor.id,
              target: 'target',
              ability: 'basic',
              element: 'physical',
              damageType: 'normal',
              scalingStat: StatKey.ATK,
              multiplier: 1,
              canCrit: false,
            }],
          },
        },
      },
    });
    const target = createUnit({
      id: 'target',
      faction: 'enemy',
      energy: 0,
      maxEnergy: 100,
      stats: createStats({ hp: 100, atk: 1, def: 0, spd: 100 }),
    });
    const result = new BattleKernel(rules, 'expected', {
      energyGainOnDamage: ({ intent, hpDamage }) => intent.damageType === 'normal' && hpDamage > 0 ? 7 : 0,
    }).step(createBattleState({
      units: [
        createUnit({ id: 'attacker', faction: 'ally', stats: createStats({ hp: 100, atk: 10, def: 1, spd: 100, critRate: 0 }) }),
        target,
      ],
    }), { actor: 'attacker', ability: 'basic', targets: [target.id], advanceTurn: false });

    expect(result.state.units.find((unit) => unit.id === target.id)?.energy).toBe(7);
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'ENERGY_GAINED', target: target.id, amount: 7 }));
  });
});

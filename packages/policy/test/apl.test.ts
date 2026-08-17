import { describe, expect, it } from 'vitest';
import { createBattleState, createStats, createUnit } from '@hsr-sim/engine';
import { parseApl, PriorityPolicy } from '../src/index.js';

describe('APL text adapter', () => {
  it('parses a small editable priority list into executable conditions', () => {
    const rules = parseApl(`
      ult if=target.toughness_broken
      skill if=skill_points>=2
      basic
    `, { actor: 'a', targets: ['b'] });
    const state = createBattleState({ skillPoints: 2, units: [
      createUnit({ id: 'a', faction: 'ally', stats: createStats({ hp: 1, atk: 1, def: 1, spd: 100 }) }),
      createUnit({ id: 'b', faction: 'enemy', toughness: { current: 0, max: 10, broken: true }, stats: createStats({ hp: 1, atk: 1, def: 1, spd: 100 }) }),
    ] });

    expect(rules).toHaveLength(3);
    expect(new PriorityPolicy(rules).next(state)?.ability).toBe('ult');
  });

  it('supports energy, HP and negated status conditions used by team APLs', () => {
    const rules = parseApl(`
      ult if=actor.energy >= 120 & !buff.self.spd_up
      skill if=actor.hp < 50% & target.alive
      basic
    `, { actor: 'a', targets: ['b'] });
    const state = createBattleState({ units: [
      createUnit({ id: 'a', faction: 'ally', energy: 120, maxEnergy: 120, hp: 80, maxHp: 100, stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }), statuses: [] }),
      createUnit({ id: 'b', faction: 'enemy', hp: 100, stats: createStats({ hp: 100, atk: 1, def: 1, spd: 100 }) }),
    ] });

    expect(new PriorityPolicy(rules).next(state)?.ability).toBe('ult');
    state.units[0]!.statuses.push({ id: 'spd_up', remainingTurns: 1, stacks: 1, category: 'buff' });
    expect(new PriorityPolicy(rules).next(state)?.ability).toBe('basic');
  });
});

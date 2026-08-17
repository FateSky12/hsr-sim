import {
  breakBaseDamage,
  createRuleCatalog,
  createStats,
  createUnit,
  defaultBreakToughnessFactor,
  effectiveStats,
  StatKey,
  statValue,
  type ActionDefinition,
  type ActionResolveContext,
  type EffectIntent,
  type RuleCatalog,
  type UnitRules,
  type UnitState,
} from '@hsr-sim/engine';
import type { AbilityData, CharacterData } from '@hsr-sim/data';
import type { EnemyData } from '@hsr-sim/data';
import { compileEffectBlocks } from './blocks.js';

export function characterToRules(data: CharacterData): UnitRules {
  const actions = actionsFromAbilities(data.abilities);
  const hooks: NonNullable<UnitRules['hooks']> = [];
  if (data.id === '1003') addHimekoStateMachine(actions, hooks);
  if (data.id === '1001') addMarchStateMachine(actions, hooks);
  if (data.id === '1101') addBronyaStateMachine(actions, hooks);
  if (data.id === '1303') addRuanMeiStateMachine(actions, hooks);
  if (data.id === '1310') addFireflyStateMachine(actions, hooks);
  if (data.id === '1225') addFugueStateMachine(actions, hooks);
  if (data.id === '8005' || data.id === '8006') addHarmonyTrailblazerStateMachine(actions, hooks, data.id);
  if (data.id === '1308') addAcheronStateMachine(actions, hooks);
  if (data.id === '1304') addAventurineStateMachine(actions, hooks);
  if (data.id === '8007' || data.id === '8008') addMemoryTrailblazerStateMachine(actions, hooks, data.id);
  if (data.id === '1402') addAglaeaStateMachine(actions, hooks);
  return { actions, hooks };
}

function actionsFromAbilities(abilities: readonly AbilityData[]): Record<string, ActionDefinition> {
  const actions: Record<string, ActionDefinition> = {};
  for (const ability of abilities) {
    actions[ability.id] = {
      id: ability.id,
      actionType: ability.actionType,
      spCost: ability.spCost,
      energyCost: ability.energyCost,
      spGain: ability.spGain,
      energyGain: ability.energyGain,
      resolve: (context) => compileEffectBlocks(ability.effects, context).map((intent) => (
        intent.kind === 'damage' || intent.kind === 'bounce_damage' || intent.kind === 'apply_dot'
          ? { ...intent, ability: ability.id }
          : intent
      )),
    };
  }
  return actions;
}

/**
 * L3 example: Himeko's Charge is state, not a stat modifier. Keep the
 * implementation in content so the engine only knows custom-data intents and
 * action hooks.
 */
function addHimekoStateMachine(
  actions: Record<string, ActionDefinition>,
  hooks: NonNullable<UnitRules['hooks']>,
): void {
  actions.himeko_follow_up = {
    id: 'himeko_follow_up',
    actionType: 'follow_up',
    resolve: ({ actor, targetIds }) => targetIds.map((target) => ({
      kind: 'damage' as const,
      source: actor.id,
      target,
      ability: 'himeko_follow_up',
      element: 'fire' as const,
      damageType: 'additional' as const,
      scalingStat: StatKey.ATK,
      multiplier: 1.75,
      toughnessDamage: 10,
    })),
  };
  hooks.push({
    id: 'character:1003:battle_start_charge',
    owner: '1003',
    on: 'BATTLE_START',
    priority: 100,
    maxTriggersPerStep: 1,
    resolve: () => [{ kind: 'modify_custom', target: '1003', key: 'himeko_charge', value: 1, min: 0, max: 3 }],
  });
  hooks.push({
    id: 'character:1003:break_charge',
    owner: '1003',
    on: 'WEAKNESS_BREAK',
    priority: 100,
    maxTriggersPerStep: 100,
    resolve: ({ event }) => event.type === 'WEAKNESS_BREAK'
      ? [{ kind: 'modify_custom', target: '1003', key: 'himeko_charge', delta: 1, min: 0, max: 3 }]
      : [],
  });
  hooks.push({
    id: 'character:1003:charge_follow_up',
    owner: '1003',
    on: 'AFTER_ACTION',
    priority: 200,
    maxTriggersPerStep: 1,
    resolve: ({ event, state }) => {
      if (event.type !== 'AFTER_ACTION') return [];
      const owner = state.units.find((unit) => unit.id === '1003');
      const actor = state.units.find((unit) => unit.id === event.actor);
      if (!owner?.alive || actor?.faction !== 'ally' || event.ability === 'himeko_follow_up' || owner.custom.himeko_charge !== 3) return [];
      const targets = state.units.filter((unit) => unit.alive && unit.faction === 'enemy').map((unit) => unit.id);
      return [
        { kind: 'modify_custom' as const, target: owner.id, key: 'himeko_charge', value: 0, min: 0, max: 3 },
        { kind: 'trigger_action' as const, source: owner.id, actor: owner.id, ability: 'himeko_follow_up', targets },
      ];
    },
  });
}

function replaceAction(
  actions: Record<string, ActionDefinition>,
  id: string,
  resolve: (context: ActionResolveContext) => EffectIntent[],
): void {
  const action = actions[id];
  if (!action) return;
  actions[id] = { ...action, resolve };
}

function targetContext(context: ActionResolveContext, targetIds: readonly string[]): ActionResolveContext {
  return { ...context, targetIds };
}

function enemyIds(context: ActionResolveContext): string[] {
  return context.state.units.filter((unit) => unit.alive && unit.faction !== context.actor.faction).map((unit) => unit.id);
}

function allyIds(context: ActionResolveContext, includeSelf = true): string[] {
  return context.state.units.filter((unit) => unit.alive && unit.faction === context.actor.faction && (includeSelf || unit.id !== context.actor.id)).map((unit) => unit.id);
}

function firstFriendlyTarget(context: ActionResolveContext): string | undefined {
  const explicit = context.targetIds.find((id) => context.state.units.find((unit) => unit.id === id)?.faction === context.actor.faction);
  return explicit ?? allyIds(context, false)[0] ?? context.actor.id;
}

function firstEnemyTarget(context: ActionResolveContext): string | undefined {
  const explicit = context.targetIds.find((id) => context.state.units.find((unit) => unit.id === id)?.faction !== context.actor.faction);
  return explicit ?? enemyIds(context)[0];
}

function adjacentEnemies(context: ActionResolveContext, primary: string): string[] {
  return enemyIds(context).filter((id) => id !== primary).slice(0, 2);
}

function hasStatus(unit: UnitState | undefined, id: string): boolean {
  return unit?.statuses.some((status) => status.id === id) === true;
}

function addMarchStateMachine(actions: Record<string, ActionDefinition>, hooks: NonNullable<UnitRules['hooks']>): void {
  const baseSkill = actions.skill;
  const baseUltimate = actions.ultimate;
  replaceAction(actions, 'skill', (context) => {
    const target = firstFriendlyTarget(context);
    if (!target) return [];
    const base = baseSkill ? baseSkill.resolve(targetContext(context, [target])) : [];
    const targetUnit = context.getUnit(target);
    if (targetUnit.hp / targetUnit.maxHp >= 0.3) base.push({ kind: 'taunt', source: context.actor.id, target, bonus: 3, duration: 3 });
    return base;
  });
  replaceAction(actions, 'ultimate', (context) => {
    const targets = enemyIds(context);
    const base = baseUltimate ? baseUltimate.resolve(targetContext(context, targets)) : [];
    return [
      ...base,
      ...targets.map((target) => ({ kind: 'apply_status' as const, source: context.actor.id, target, status: { id: 'march:frozen', source: context.actor.id, remainingTurns: 1, stacks: 1, category: 'debuff' as const, custom: { blocksAction: true } }, chance: 0.5 })),
    ];
  });
  actions.march_counter = {
    id: 'march_counter',
    actionType: 'follow_up',
    resolve: (context) => {
      const target = firstEnemyTarget(context);
      return target ? [{ kind: 'damage', source: context.actor.id, target, ability: 'march_counter', element: 'ice', damageType: 'additional', actionType: 'follow_up', scalingStat: StatKey.ATK, multiplier: 1, canCrit: true }] : [];
    },
  };
  hooks.push({
    id: 'character:1001:shield_counter', owner: '1001', on: 'SHIELD_ABSORBED', priority: 200, maxTriggersPerStep: 2,
    resolve: ({ event, state }) => {
      if (event.type !== 'SHIELD_ABSORBED') return [];
      const attacked = state.units.find((unit) => unit.id === event.target);
      const source = event.source ? state.units.find((unit) => unit.id === event.source) : undefined;
      if (!attacked || attacked.faction !== 'ally' || source?.faction !== 'enemy') return [];
      const owner = state.units.find((unit) => unit.id === '1001');
      const count = typeof owner?.custom.march_counter_count === 'number' ? owner.custom.march_counter_count : 0;
      if (!owner?.alive || count >= 2) return [];
      return [
        { kind: 'modify_custom' as const, target: owner.id, key: 'march_counter_count', value: count + 1, min: 0, max: 2 },
        { kind: 'trigger_action' as const, source: owner.id, actor: owner.id, ability: 'march_counter', targets: [source.id] },
      ];
    },
  });
  hooks.push({
    id: 'character:1001:reset_counter', owner: '1001', on: 'TURN_END', priority: 300, maxTriggersPerStep: 1,
    resolve: ({ event, owner }) => event.type === 'TURN_END' && event.actor === owner ? [{ kind: 'modify_custom', target: owner, key: 'march_counter_count', value: 0, min: 0, max: 2 }] : [],
  });
}

function addBronyaStateMachine(actions: Record<string, ActionDefinition>, hooks: NonNullable<UnitRules['hooks']>): void {
  const baseSkill = actions.skill;
  const baseUltimate = actions.ultimate;
  replaceAction(actions, 'skill', (context) => {
    const target = firstFriendlyTarget(context);
    if (!target) return [];
    return (baseSkill ? baseSkill.resolve(targetContext(context, [target])) : []).filter((intent) => !(intent.kind === 'advance_forward' && target === context.actor.id));
  });
  replaceAction(actions, 'ultimate', (context) => {
    const targets = allyIds(context);
    const critDmg = statValue(effectiveStats(context.actor), StatKey.CritDmg) * 0.2 + 0.24;
    return [
      ...(baseUltimate ? baseUltimate.resolve(targetContext(context, targets)) : []),
      ...targets.map((target) => ({ kind: 'modify_stat' as const, source: context.actor.id, target, modifier: { id: 'bronya:crit_dmg', stat: StatKey.CritDmg, flat: critDmg, remainingTurns: 2, stacking: 'replace' as const } })),
    ];
  });
  hooks.push({
    id: 'character:1101:basic_advance', owner: '1101', on: 'BASIC_USED', priority: 200, maxTriggersPerStep: 1,
    resolve: ({ event, owner }) => event.type === 'BASIC_USED' && event.actor === owner ? [{ kind: 'advance_forward', target: owner, ratio: 0.3 }] : [],
  });
}

function addRuanMeiStateMachine(actions: Record<string, ActionDefinition>, hooks: NonNullable<UnitRules['hooks']>): void {
  actions.skill = {
    id: 'skill', actionType: 'skill', spCost: 1,
    resolve: ({ actor, state }) => [
      { kind: 'apply_status', source: actor.id, target: actor.id, status: { id: 'ruanmei:overtone', source: actor.id, remainingTurns: 3, stacks: 1, category: 'buff' } },
      ...state.units.filter((unit) => unit.alive && unit.faction === actor.faction).map((unit) => ({ kind: 'modify_stat' as const, source: actor.id, target: unit.id, modifier: { id: 'ruanmei:dmg', stat: StatKey.DmgBoostAll, percent: 0.4, remainingTurns: 3, stacking: 'replace' as const } })),
      ...state.units.filter((unit) => unit.alive && unit.faction === actor.faction).map((unit) => ({ kind: 'modify_stat' as const, source: actor.id, target: unit.id, modifier: { id: 'ruanmei:break_efficiency', stat: StatKey.BreakEfficiency, percent: 0.5, remainingTurns: 3, stacking: 'replace' as const } })),
    ],
  };
  actions.ultimate = {
    id: 'ultimate', actionType: 'ultimate', energyCost: 130,
    resolve: ({ actor, state }) => [
      { kind: 'apply_status', source: actor.id, target: actor.id, status: { id: 'ruanmei:zone', source: actor.id, remainingTurns: 2, stacks: 1, category: 'buff' } },
      ...state.units.filter((unit) => unit.alive && unit.faction === actor.faction).map((unit) => ({ kind: 'modify_stat' as const, source: actor.id, target: unit.id, modifier: { id: 'ruanmei:res_pen', stat: StatKey.ResPen, percent: 0.3, remainingTurns: 2, stacking: 'replace' as const } })),
    ],
  };
  hooks.push({
    id: 'character:1303:team_speed', owner: '1303', on: 'BATTLE_START', priority: 100, maxTriggersPerStep: 1,
    resolve: ({ state, owner }) => state.units.filter((unit) => unit.alive && unit.faction === 'ally' && unit.id !== owner).map((unit) => ({ kind: 'modify_stat' as const, source: owner, target: unit.id, modifier: { id: 'ruanmei:team_speed', stat: StatKey.SPD, percent: 0.11, stacking: 'replace' as const } })),
  });
  hooks.push({
    id: 'character:1303:break_followup', owner: '1303', on: 'WEAKNESS_BREAK', priority: 200, maxTriggersPerStep: 10,
    resolve: ({ event, state, owner }) => {
      if (event.type !== 'WEAKNESS_BREAK') return [];
      const source = state.units.find((unit) => unit.id === owner);
      const target = state.units.find((unit) => unit.id === event.target);
      if (!source || !target) return [];
      const amount = breakBaseDamage(source.level, 'ice') * defaultBreakToughnessFactor(target.toughness.max) * (1 + statValue(effectiveStats(source), StatKey.BreakEffect)) * 1.5;
      const intents: EffectIntent[] = [{ kind: 'damage', source: owner, target: target.id, ability: 'ruanmei_break', element: 'ice', damageType: 'break', scalingStat: StatKey.ATK, multiplier: 0, extraFlatDamage: amount, canCrit: false }];
      if (hasStatus(source, 'ruanmei:zone')) intents.push({ kind: 'modify_custom', target: target.id, key: 'break_recovery_turns', value: 2, min: 1, max: 2 });
      return intents;
    },
  });
}

function addFireflyStateMachine(actions: Record<string, ActionDefinition>, hooks: NonNullable<UnitRules['hooks']>): void {
  actions.skill = {
    id: 'skill', actionType: 'skill', spCost: 1,
    resolve: ({ actor, state, targetIds }) => {
      const primary = firstEnemyTarget({ actor, state, targetIds, getUnit: (id) => state.units.find((unit) => unit.id === id)! });
      if (!primary) return [];
      const combustion = actor.custom.firefly_combustion === true;
      const targets = combustion ? [primary, ...adjacentEnemies({ actor, state, targetIds, getUnit: (id) => state.units.find((unit) => unit.id === id)! }, primary)] : [primary];
      const stats = effectiveStats(actor);
      const breakEffect = statValue(stats, StatKey.BreakEffect);
      return [
        { kind: 'lose_hp', source: actor.id, target: actor.id, amount: actor.maxHp * 0.4, minimumHp: 1 },
        { kind: 'energy', target: actor.id, amount: actor.maxEnergy * 0.65 },
        ...targets.map((target) => ({ kind: 'implant_weakness' as const, source: actor.id, target, element: 'fire' as const, duration: 2 })),
        ...(combustion ? [{ kind: 'modify_stat' as const, source: actor.id, target: actor.id, modifier: { id: 'firefly:break_dmg', stat: StatKey.BreakDmgBoost, percent: 0.2, stacking: 'replace' as const } }] : []),
        { kind: 'damage', source: actor.id, target: primary, ability: combustion ? 'firefly_enhanced_skill' : 'skill', element: 'fire', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: combustion ? 2.5 : 2.5, extraFlatDamage: combustion ? statValue(stats, StatKey.ATK) * breakEffect * 0.2 : 0, toughnessDamage: 20, breakElement: 'fire' },
        ...combustion ? targets.slice(1).map((target) => ({ kind: 'damage' as const, source: actor.id, target, ability: 'firefly_enhanced_skill', element: 'fire' as const, damageType: 'normal' as const, scalingStat: StatKey.ATK, multiplier: 1.25, extraFlatDamage: statValue(stats, StatKey.ATK) * breakEffect * 0.1, toughnessDamage: 10, breakElement: 'fire' as const })) : [],
        ...(combustion ? [{ kind: 'heal' as const, source: actor.id, target: actor.id, scalingStat: StatKey.HP, multiplier: 0.25 }] : []),
      ];
    },
  };
  actions.basic = {
    ...(actions.basic ?? { id: 'basic', actionType: 'basic', spGain: 1, energyGain: 20 }),
    id: 'basic', actionType: 'basic',
    resolve: ({ actor, targetIds }) => {
      const target = targetIds[0];
      if (!target) return [];
      const combustion = actor.custom.firefly_combustion === true;
      return [
        { kind: 'damage', source: actor.id, target, ability: combustion ? 'firefly_enhanced_basic' : 'basic', element: 'fire', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: combustion ? 2.8 : 1.4, toughnessDamage: combustion ? 10 : 10, breakElement: 'fire' },
        ...(combustion ? [{ kind: 'heal' as const, source: actor.id, target: actor.id, scalingStat: StatKey.HP, multiplier: 0.2 }] : []),
      ];
    },
  };
  actions.ultimate = {
    ...(actions.ultimate ?? { id: 'ultimate', actionType: 'ultimate' }),
    id: 'ultimate', actionType: 'ultimate', energyCost: 240,
    resolve: ({ actor }) => [
      { kind: 'modify_custom', target: actor.id, key: 'firefly_combustion', value: true },
      { kind: 'modify_custom', target: actor.id, key: 'firefly_combustion_turns', value: 4, min: 0, max: 4 },
      { kind: 'modify_stat', source: actor.id, target: actor.id, modifier: { id: 'firefly:combustion_spd', stat: StatKey.SPD, flat: 60, stacking: 'replace' as const } },
      { kind: 'advance_forward', target: actor.id, ratio: 1 },
    ],
  };
  hooks.push({
    id: 'character:1310:combustion_end', owner: '1310', on: 'TURN_END', priority: 300, maxTriggersPerStep: 1,
    resolve: ({ event, owner, state }) => {
      if (event.type !== 'TURN_END' || event.actor !== owner) return [];
      const actor = state.units.find((unit) => unit.id === owner);
      const turns = typeof actor?.custom.firefly_combustion_turns === 'number' ? actor.custom.firefly_combustion_turns : 0;
      if (!actor || actor.custom.firefly_combustion !== true) return [];
      if (turns <= 1) return [
        { kind: 'modify_custom' as const, target: owner, key: 'firefly_combustion', value: false },
        { kind: 'modify_custom' as const, target: owner, key: 'firefly_combustion_turns', value: 0, min: 0, max: 4 },
        { kind: 'remove_modifier' as const, target: owner, id: 'firefly:combustion_spd' },
      ];
      return [{ kind: 'modify_custom' as const, target: owner, key: 'firefly_combustion_turns', delta: -1, min: 0, max: 4 }];
    },
  });
}

function addFugueStateMachine(actions: Record<string, ActionDefinition>, hooks: NonNullable<UnitRules['hooks']>): void {
  actions.skill = {
    id: 'skill', actionType: 'skill', spCost: 1,
    resolve: ({ actor, targetIds }) => {
      const target = firstFriendlyTarget({ actor, state: undefined as never, targetIds, getUnit: () => actor });
      if (!target) return [];
      return [
        { kind: 'modify_custom', target: actor.id, key: 'fugue_prayer_target', value: target },
        { kind: 'apply_status', source: actor.id, target, status: { id: 'fugue:prayer', source: actor.id, remainingTurns: 3, stacks: 1, category: 'buff' } },
        { kind: 'modify_stat', source: actor.id, target, modifier: { id: 'fugue:break_effect', stat: StatKey.BreakEffect, percent: 0.375, remainingTurns: 3, stacking: 'replace' as const } },
        { kind: 'modify_custom', target: actor.id, key: 'fugue_torrid_scorch', value: true },
      ];
    },
  };
  actions.skill.resolve = ({ actor, state, targetIds }) => {
    const target = targetIds.find((id) => state.units.find((unit) => unit.id === id)?.faction === actor.faction) ?? state.units.find((unit) => unit.alive && unit.faction === actor.faction && unit.id !== actor.id)?.id;
    return target ? [
      { kind: 'modify_custom', target: actor.id, key: 'fugue_prayer_target', value: target },
      { kind: 'apply_status', source: actor.id, target, status: { id: 'fugue:prayer', source: actor.id, remainingTurns: 3, stacks: 1, category: 'buff' } },
      { kind: 'modify_stat', source: actor.id, target, modifier: { id: 'fugue:break_effect', stat: StatKey.BreakEffect, percent: 0.375, remainingTurns: 3, stacking: 'replace' as const } },
      { kind: 'modify_custom', target: actor.id, key: 'fugue_torrid_scorch', value: true },
    ] : [];
  };
  actions.ultimate = {
    id: 'ultimate', actionType: 'ultimate', energyCost: 130,
    resolve: ({ actor, state }) => enemyIds({ actor, state, targetIds: [], getUnit: (id) => state.units.find((unit) => unit.id === id)! }).map((target) => ({ kind: 'damage' as const, source: actor.id, target, ability: 'ultimate', element: 'fire' as const, damageType: 'normal' as const, scalingStat: StatKey.ATK, multiplier: 2.5, toughnessDamage: 20, ignoresWeakness: true, offWeaknessToughnessMultiplier: 0.5, breakElement: 'fire' as const })),
  };
  hooks.push({
    id: 'character:1225:prayer_debuff', owner: '1225', on: 'AFTER_DAMAGE', priority: 200, maxTriggersPerStep: 100,
    resolve: ({ event, state, owner }) => {
      if (event.type !== 'AFTER_DAMAGE' || event.damageType === 'super_break') return [];
      const fugue = state.units.find((unit) => unit.id === owner);
      if (fugue?.custom.fugue_prayer_target !== event.source) return [];
      const target = state.units.find((unit) => unit.id === event.target);
      if (!target || target.faction === 'ally') return [];
      const intents: EffectIntent[] = [{ kind: 'modify_stat', source: owner, target: target.id, modifier: { id: 'fugue:def_down', stat: StatKey.DefReduction, percent: 0.18, remainingTurns: 2, stacking: 'replace' } }];
      if (event.targetBrokenBefore && event.toughnessDamage > 0) intents.push({ kind: 'damage', source: owner, target: target.id, ability: 'fugue_super_break', element: 'fire', damageType: 'super_break', scalingStat: StatKey.ATK, multiplier: 1.25, toughnessDamage: event.toughnessDamage });
      return intents;
    },
  });
}

function addHarmonyTrailblazerStateMachine(actions: Record<string, ActionDefinition>, hooks: NonNullable<UnitRules['hooks']>, characterId: string): void {
  actions.ultimate = {
    ...(actions.ultimate ?? { id: 'ultimate', actionType: 'ultimate' }),
    id: 'ultimate', actionType: 'ultimate', energyCost: 110,
    resolve: ({ actor, state }) => [
      { kind: 'apply_status' as const, source: actor.id, target: actor.id, status: { id: 'hmc:backup_dancer', source: actor.id, remainingTurns: 3, stacks: 1, category: 'buff' as const } },
      ...state.units.filter((unit) => unit.alive && unit.faction === actor.faction).map((unit) => ({ kind: 'modify_stat' as const, source: actor.id, target: unit.id, modifier: { id: 'hmc:break_effect', stat: StatKey.BreakEffect, percent: 0.375, remainingTurns: 3, stacking: 'replace' as const } })),
    ],
  };
  hooks.push({
    id: `character:${characterId}:super_break`, owner: characterId, on: 'AFTER_DAMAGE', priority: 200, maxTriggersPerStep: 100,
    resolve: ({ event, state, owner }) => {
      if (event.type !== 'AFTER_DAMAGE' || event.damageType === 'super_break' || !event.targetBrokenBefore || event.toughnessDamage <= 0) return [];
      const trailblazer = state.units.find((unit) => unit.id === owner);
      if (!trailblazer || !hasStatus(trailblazer, 'hmc:backup_dancer')) return [];
      const source = state.units.find((unit) => unit.id === event.source);
      if (!source || source.faction !== 'ally') return [];
      return [{ kind: 'damage', source: source.id, target: event.target, ability: 'hmc_super_break', element: source.custom.element === 'fire' ? 'fire' : 'imaginary', damageType: 'super_break', scalingStat: StatKey.ATK, multiplier: 1, toughnessDamage: event.toughnessDamage }];
    },
  });
  hooks.push({
    id: `character:${characterId}:break_energy`, owner: characterId, on: 'WEAKNESS_BREAK', priority: 250, maxTriggersPerStep: 100,
    resolve: ({ event, owner }) => event.type === 'WEAKNESS_BREAK' ? [{ kind: 'energy', target: owner, amount: 12.5 }] : [],
  });
}

function addAcheronStateMachine(actions: Record<string, ActionDefinition>, hooks: NonNullable<UnitRules['hooks']>): void {
  replaceAction(actions, 'skill', (context) => {
    const target = firstEnemyTarget(context);
    if (!target) return [];
    const adjacent = adjacentEnemies(context, target);
    return [
      { kind: 'modify_custom', target: context.actor.id, key: 'acheron_slash_dream', delta: 1, min: 0, max: 9 },
      { kind: 'modify_custom', target, key: 'acheron_crimson_knot', delta: 1, min: 0, max: 3 },
      { kind: 'damage', source: context.actor.id, target, ability: 'skill', element: 'lightning', damageType: 'normal', scalingStat: StatKey.ATK, multiplier: 2, toughnessDamage: 20 },
      ...adjacent.map((id) => ({ kind: 'damage' as const, source: context.actor.id, target: id, ability: 'skill', element: 'lightning' as const, damageType: 'normal' as const, scalingStat: StatKey.ATK, multiplier: 0.75, toughnessDamage: 10 })),
    ];
  });
  actions.ultimate = {
    id: 'ultimate', actionType: 'ultimate', energyCost: 9,
    resolve: ({ actor, state, targetIds }) => {
      const primary = targetIds.find((id) => state.units.find((unit) => unit.id === id)?.faction !== actor.faction) ?? enemyIds({ actor, state, targetIds, getUnit: (id) => state.units.find((unit) => unit.id === id)! })[0];
      if (!primary) return [];
      const primaryUnit = state.units.find((unit) => unit.id === primary)!;
      const stacks = Math.min(3, typeof primaryUnit.custom.acheron_crimson_knot === 'number' ? primaryUnit.custom.acheron_crimson_knot : 0);
      const enemies = enemyIds({ actor, state, targetIds, getUnit: (id) => state.units.find((unit) => unit.id === id)! });
      return [
        { kind: 'modify_custom' as const, target: actor.id, key: 'acheron_slash_dream', value: 0, min: 0, max: 9 },
        { kind: 'modify_custom' as const, target: primary, key: 'acheron_crimson_knot', value: 0, min: 0, max: 3 },
        { kind: 'damage' as const, source: actor.id, target: primary, ability: 'ultimate', element: 'lightning' as const, damageType: 'normal' as const, scalingStat: StatKey.ATK, multiplier: 0.288 * (stacks + 3), toughnessDamage: 20, ignoresWeakness: true, breakElement: 'lightning' as const },
        ...enemies.map((target) => ({ kind: 'damage' as const, source: actor.id, target, ability: 'ultimate', element: 'lightning' as const, damageType: 'normal' as const, scalingStat: StatKey.ATK, multiplier: target === primary ? 1.44 + stacks * 0.18 : 1.44 + stacks * 0.18, toughnessDamage: 10, ignoresWeakness: true, breakElement: 'lightning' as const })),
      ];
    },
  };
}

function addAventurineStateMachine(actions: Record<string, ActionDefinition>, hooks: NonNullable<UnitRules['hooks']>): void {
  actions.skill = {
    id: 'skill', actionType: 'skill', spCost: 1,
    resolve: ({ actor, state }) => state.units.filter((unit) => unit.alive && unit.faction === actor.faction).map((target) => ({ kind: 'shield' as const, source: actor.id, target: target.id, id: 'aventurine:shield', scalingStat: StatKey.DEF, multiplier: 0.28, flatAmount: 410, duration: 3 })),
  };
  actions.ultimate = {
    id: 'ultimate', actionType: 'ultimate', energyCost: 110,
    resolve: ({ actor, targetIds }) => {
      const target = targetIds[0];
      return target ? [
        { kind: 'modify_custom' as const, target: actor.id, key: 'aventurine_blind_bet', delta: 1, min: 0, max: 10 },
        { kind: 'apply_status' as const, source: actor.id, target, status: { id: 'aventurine:unnerved', source: actor.id, remainingTurns: 3, stacks: 1, category: 'debuff' as const } },
        { kind: 'damage' as const, source: actor.id, target, ability: 'ultimate', element: 'imaginary' as const, damageType: 'normal' as const, scalingStat: StatKey.DEF, multiplier: 3.24, toughnessDamage: 20 },
      ] : [];
    },
  };
  actions.aventurine_follow_up = {
    id: 'aventurine_follow_up', actionType: 'follow_up',
    resolve: ({ actor, state }) => [{ kind: 'bounce_damage', source: actor.id, ability: 'aventurine_follow_up', element: 'imaginary', damageType: 'additional', scalingStat: StatKey.DEF, multiplier: 0.3125, hits: 7, candidateTargets: enemyIds({ actor, state, targetIds: [], getUnit: (id) => state.units.find((unit) => unit.id === id)! }), toughnessDamage: 7, canCrit: true, actionType: 'follow_up' }],
  };
  hooks.push({
    id: 'character:1304:blind_bet', owner: '1304', on: 'SHIELD_ABSORBED', priority: 200, maxTriggersPerStep: 100,
    resolve: ({ event, state, owner }) => {
      if (event.type !== 'SHIELD_ABSORBED') return [];
      const ownerUnit = state.units.find((unit) => unit.id === owner);
      const target = state.units.find((unit) => unit.id === event.target);
      if (!ownerUnit?.alive || !target || target.faction !== 'ally') return [];
      const bet = typeof ownerUnit.custom.aventurine_blind_bet === 'number' ? ownerUnit.custom.aventurine_blind_bet : 0;
      if (bet + 1 < 7) return [{ kind: 'modify_custom' as const, target: owner, key: 'aventurine_blind_bet', value: bet + 1, min: 0, max: 10 }];
      return [
        { kind: 'modify_custom' as const, target: owner, key: 'aventurine_blind_bet', value: 0, min: 0, max: 10 },
        { kind: 'trigger_action' as const, source: owner, actor: owner, ability: 'aventurine_follow_up', targets: enemyIds({ actor: ownerUnit, state, targetIds: [], getUnit: (id) => state.units.find((unit) => unit.id === id)! }) },
      ];
    },
  });
}

function addFugueAndMemoryPlaceholder(): void {
  // Kept as a named seam for future version-specific memory/summon rules.
}

function addMemoryTrailblazerStateMachine(actions: Record<string, ActionDefinition>, _hooks: NonNullable<UnitRules['hooks']>, characterId: string): void {
  const summonId = `${characterId}:mem`;
  actions.skill = {
    id: 'skill', actionType: 'skill', spCost: 1,
    resolve: ({ actor, state }) => {
      const existing = state.units.find((unit) => unit.id === summonId);
      if (existing) return [{ kind: 'heal' as const, source: actor.id, target: existing.id, scalingStat: StatKey.HP, multiplier: 0, flatAmount: existing.maxHp * 0.75 }, { kind: 'modify_custom' as const, target: existing.id, key: 'memory_charge', delta: 0.1, min: 0, max: 1 }];
      return [{ kind: 'summon' as const, source: actor.id, unit: { id: summonId, name: 'Mem', faction: 'ally', level: actor.level, stats: createStats({ hp: statValue(effectiveStats(actor), StatKey.HP) * 0.95 + 760, atk: statValue(effectiveStats(actor), StatKey.ATK), def: 0, spd: 130 }), maxHp: statValue(effectiveStats(actor), StatKey.HP) * 0.95 + 760, custom: { summonId, summonAbility: 'basic', memory_charge: 0 } } }];
    },
  };
  actions.basic = {
    ...(actions.basic ?? { id: 'basic', actionType: 'basic' }),
    id: 'basic', actionType: 'basic',
    resolve: ({ actor, state }) => enemyIds({ actor, state, targetIds: [], getUnit: (id) => state.units.find((unit) => unit.id === id)! }).map((target) => ({ kind: 'damage' as const, source: actor.id, target, ability: 'basic', element: 'ice' as const, damageType: 'normal' as const, scalingStat: StatKey.ATK, multiplier: 3, toughnessDamage: 10 })),
  };
  actions.ultimate = {
    ...(actions.ultimate ?? { id: 'ultimate', actionType: 'ultimate' }),
    id: 'ultimate', actionType: 'ultimate', energyCost: 120,
    resolve: ({ actor, state }) => [
      ...actions.skill!.resolve({ actor, state, targetIds: [], getUnit: (id) => state.units.find((unit) => unit.id === id)! }),
      { kind: 'trigger_action' as const, source: actor.id, actor: summonId, ability: 'basic', targets: enemyIds({ actor, state, targetIds: [], getUnit: (id) => state.units.find((unit) => unit.id === id)! }) },
    ],
  };
}

function addAglaeaStateMachine(actions: Record<string, ActionDefinition>, _hooks: NonNullable<UnitRules['hooks']>): void {
  const summonId = '1402:garmentmaker';
  const summon = (actor: UnitState): EffectIntent => ({ kind: 'summon', source: actor.id, unit: { id: summonId, name: 'Garmentmaker', faction: 'ally', level: actor.level, stats: createStats({ hp: actor.maxHp * 0.77 + 990, atk: statValue(effectiveStats(actor), StatKey.ATK), def: 0, spd: statValue(effectiveStats(actor), StatKey.SPD) * 0.35 }), maxHp: actor.maxHp * 0.77 + 990, custom: { summonId, summonAbility: 'basic' } } });
  actions.skill = { id: 'skill', actionType: 'skill', spCost: 1, resolve: ({ actor, state }) => state.units.some((unit) => unit.id === summonId) ? [] : [summon(actor)] };
  actions.basic = { ...(actions.basic ?? { id: 'basic', actionType: 'basic', resolve: () => [] }), id: 'basic', actionType: 'basic' };
  actions.ultimate = { id: 'ultimate', actionType: 'ultimate', energyCost: 350, resolve: ({ actor, state }) => [
    ...(state.units.some((unit) => unit.id === summonId) ? [] : [summon(actor)]),
    { kind: 'advance_forward' as const, target: actor.id, ratio: 1 },
  ] };
}

export function createContentCatalog(characters: readonly CharacterData[]): RuleCatalog {
  const definitions: Record<string, UnitRules> = Object.fromEntries(characters.map((character) => [character.id, characterToRules(character)]));
  for (const character of characters) {
    if (character.id === '8007' || character.id === '8008') definitions[`${character.id}:mem`] = memorySummonRules(character.id);
    if (character.id === '1402') definitions['1402:garmentmaker'] = aglaeaSummonRules();
  }
  return createRuleCatalog(definitions);
}

function memorySummonRules(characterId: string): UnitRules {
  return {
    actions: {
      basic: {
        id: 'basic', actionType: 'follow_up',
        resolve: ({ actor, state }) => enemyIds({ actor, state, targetIds: [], getUnit: (id) => state.units.find((unit) => unit.id === id)! }).map((target) => ({ kind: 'damage' as const, source: actor.id, target, ability: 'basic', element: 'ice' as const, damageType: 'additional' as const, scalingStat: StatKey.ATK, multiplier: 3, toughnessDamage: 10, actionType: 'follow_up' })),
      },
    },
  };
}

function aglaeaSummonRules(): UnitRules {
  return {
    actions: {
      basic: {
        id: 'basic', actionType: 'follow_up',
        resolve: ({ actor, state }) => enemyIds({ actor, state, targetIds: [], getUnit: (id) => state.units.find((unit) => unit.id === id)! }).map((target) => ({ kind: 'damage' as const, source: actor.id, target, ability: 'basic', element: 'lightning' as const, damageType: 'additional' as const, scalingStat: StatKey.ATK, multiplier: 1, toughnessDamage: 10, actionType: 'follow_up' })),
      },
    },
  };
}

export function createUnitFromCharacter(data: CharacterData, faction: 'ally' | 'enemy' = 'ally') {
  return createUnit({
    id: data.id,
    name: data.name,
    faction,
    level: data.level,
    stats: createStats(data.baseStats),
    maxEnergy: data.maxEnergy ?? 100,
    custom: { element: data.element },
  });
}

export function createUnitFromEnemy(data: EnemyData) {
  return createUnit({
    id: data.id,
    name: data.name,
    faction: 'enemy',
    level: data.level,
    stats: createStats({ hp: data.hp, atk: data.atk, def: data.def, spd: data.spd, critRate: 0 }),
    maxHp: data.hp,
    toughness: { current: data.toughness, max: data.toughness, broken: false },
    weaknesses: data.weaknesses,
    resistance: data.resistance,
    custom: { enemyRank: data.rank ?? 'normal', sourceIds: data.sourceIds ?? {} },
  });
}

export function enemyToRules(data: EnemyData): UnitRules {
  const actions = actionsFromAbilities(data.abilities ?? [{
    id: 'basic',
    actionType: 'basic',
    effects: [{
      kind: 'dealDamage',
      multiplier: 1,
      scaling: 'ATK',
      element: 'physical',
      damageType: 'normal',
      toughnessDamage: 10,
      target: 'first_target',
    }],
  }]);
  const delayRatio = data.behavior?.onBreak?.actionDelay;
  const phases = [...(data.behavior?.phases ?? [])].sort((left, right) => right.hpThreshold - left.hpThreshold);
  const phaseHook = phases.length === 0 ? undefined : {
    id: `enemy:${data.id}:phases`,
    owner: data.id,
    on: 'HP_CHANGED' as const,
    priority: 50,
    // A hit can emit one HP_CHANGED event before the break and another for
    // break damage in the same step. The phase state itself prevents repeats;
    // the hook limit only guards pathological re-entry.
    maxTriggersPerStep: 100,
    resolve: ({ event, owner, state }: import('@hsr-sim/engine').RuleHookContext) => {
      if (event.type !== 'HP_CHANGED' || event.target !== owner) return [];
      const target = state.units.find((unit) => unit.id === owner);
      if (!target) return [];
      const currentPhase = typeof target.custom.enemy_phase === 'number' ? target.custom.enemy_phase : 0;
      return phases.flatMap((phase, index) => target.hp / target.maxHp <= phase.hpThreshold && currentPhase < index + 1
        ? [{ kind: 'enter_phase' as const, target: owner, phase: index + 1, actions: [...phase.onEnter] }]
        : []);
    },
  };
  const hooks: NonNullable<UnitRules['hooks']> = [];
  if (delayRatio !== undefined) {
    hooks.push({
      id: `enemy:${data.id}:break_delay`,
      owner: data.id,
      on: 'WEAKNESS_BREAK',
      priority: 100,
      maxTriggersPerStep: 1,
      resolve: ({ event, owner }: import('@hsr-sim/engine').RuleHookContext) => event.type === 'WEAKNESS_BREAK' && event.target === owner
        ? [{ kind: 'delay_action', target: owner, ratio: delayRatio }]
        : [],
    });
  }
  if (phaseHook) hooks.push(phaseHook);
  return {
    actions,
    hooks,
  };
}

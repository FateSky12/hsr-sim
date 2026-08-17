import type {
  ActionResolveContext,
  EffectIntent,
  UnitId,
} from '@hsr-sim/engine';
import { StatKey, createStats } from '@hsr-sim/engine';
import type { EffectBlockData } from '@hsr-sim/data';

const STAT_BY_NAME: Record<string, StatKey> = {
  HP: StatKey.HP,
  ATK: StatKey.ATK,
  DEF: StatKey.DEF,
  SPD: StatKey.SPD,
  CritRate: StatKey.CritRate,
  CritDmg: StatKey.CritDmg,
  BreakEffect: StatKey.BreakEffect,
  DmgBoostAll: StatKey.DmgBoostAll,
  ResPen: StatKey.ResPen,
  DmgReduction: StatKey.DmgReduction,
  BreakDmgBoost: StatKey.BreakDmgBoost,
  SuperBreakDmgBoost: StatKey.SuperBreakDmgBoost,
};

const SCALING_BY_NAME: Record<string, StatKey> = {
  HP: StatKey.HP,
  ATK: StatKey.ATK,
  DEF: StatKey.DEF,
};

export function compileEffectBlocks(blocks: readonly EffectBlockData[], context: ActionResolveContext): EffectIntent[] {
  const intents: EffectIntent[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case 'dealDamage': {
        const targets = block.target === 'adjacent_targets'
          ? context.targetIds.slice(1, 3)
          : resolveTargets(block.target, context);
        for (const target of targets) {
          if (!target) continue;
          intents.push({
            kind: 'damage',
            source: context.actor.id,
            target,
            ability: 'compiled',
            element: block.element,
            damageType: block.damageType,
            scalingStat: SCALING_BY_NAME[block.scaling]!,
            multiplier: block.multiplier,
            toughnessDamage: block.toughnessDamage,
            ignoresWeakness: block.ignoresWeakness,
            breakElement: block.breakElement,
          });
        }
        break;
      }
      case 'bounceDamage': {
        const candidateTargets = context.state.units
          .filter((unit) => unit.alive && unit.faction !== context.actor.faction)
          .map((unit) => unit.id);
        intents.push({
          kind: 'bounce_damage',
          source: context.actor.id,
          ability: 'compiled',
          element: block.element,
          damageType: block.damageType,
          scalingStat: SCALING_BY_NAME[block.scaling]!,
          multiplier: block.multiplier,
          toughnessDamage: block.toughnessDamage,
          ignoresWeakness: block.ignoresWeakness,
          breakElement: block.breakElement,
          hits: block.hits,
          candidateTargets,
        });
        break;
      }
      case 'modifyStat': {
        const targets = resolveTargets(block.target, context);
        for (const target of targets) {
          if (!target) continue;
          intents.push({
            kind: 'modify_stat',
            source: context.actor.id,
            target,
            modifier: {
              id: block.id,
              stat: STAT_BY_NAME[block.stat]!,
              percent: block.percent,
              flat: block.flat,
              remainingTurns: block.duration,
              stacking: 'replace',
            },
          });
        }
        break;
      }
      case 'gainEnergy':
        for (const target of resolveTargets(block.target, context)) {
          const unit = context.getUnit(target);
          intents.push({
            kind: 'energy',
            target,
            amount: block.ratio !== undefined ? unit.maxEnergy * block.ratio : block.amount!,
          });
        }
        break;
      case 'gainSkillPoints':
        intents.push({ kind: 'skill_points', amount: block.amount });
        break;
      case 'modifyStack': {
        const target = block.target === 'self' ? context.actor.id : context.targetIds[0];
        if (!target) break;
        intents.push({ kind: 'modify_custom', target, key: block.key, delta: block.delta, min: block.min, max: block.max });
        break;
      }
      case 'applyDot': {
        const targets = resolveTargets(block.target, context);
        for (const target of targets) {
          if (!target) continue;
          intents.push({
            kind: 'apply_dot',
            source: context.actor.id,
            target,
            ability: 'compiled',
            dotId: block.id,
            element: block.element,
            scalingStat: SCALING_BY_NAME[block.scaling]!,
            multiplier: block.multiplier,
            duration: block.duration,
            toughnessDamage: block.toughnessDamage,
            chance: block.chance,
          });
        }
        break;
      }
      case 'detonateDots': {
        const targets = resolveTargets(block.target, context);
        for (const target of targets) {
          if (!target) continue;
          intents.push({ kind: 'detonate_dots', source: context.actor.id, target, ability: 'detonate_dots', multiplier: block.multiplier });
        }
        break;
      }
      case 'shield': {
        const targets = resolveTargets(block.target, context);
        for (const target of targets) {
          if (!target) continue;
          intents.push({
            kind: 'shield',
            source: context.actor.id,
            target,
            id: block.id,
            scalingStat: SCALING_BY_NAME[block.scaling]!,
            multiplier: block.multiplier,
            flatAmount: block.flatAmount,
            duration: block.duration,
          });
        }
        break;
      }
      case 'heal': {
        const targets = resolveTargets(block.target, context);
        for (const target of targets) {
          if (!target) continue;
          intents.push({ kind: 'heal', source: context.actor.id, target, scalingStat: SCALING_BY_NAME[block.scaling]!, multiplier: block.multiplier, flatAmount: block.flatAmount });
        }
        break;
      }
      case 'revive': {
        const target = block.target === 'self' ? context.actor.id : context.targetIds[0];
        if (!target) break;
        intents.push({ kind: 'revive', source: context.actor.id, target, scalingStat: SCALING_BY_NAME[block.scaling]!, multiplier: block.multiplier, flatAmount: block.flatAmount });
        break;
      }
      case 'cleanse': {
        const target = block.target === 'self' ? context.actor.id : context.targetIds[0];
        if (!target) break;
        intents.push({ kind: 'cleanse', source: context.actor.id, target, count: block.count });
        break;
      }
      case 'advanceForward': {
        for (const target of resolveTargets(block.target, context)) {
          intents.push({ kind: 'advance_forward', target, ratio: block.ratio });
        }
        break;
      }
      case 'delayAction': {
        for (const target of resolveTargets(block.target, context)) {
          intents.push({ kind: 'delay_action', target, ratio: block.ratio });
        }
        break;
      }
      case 'applyStatus': {
        const target = block.target === 'self' ? context.actor.id : context.targetIds[0];
        if (!target) break;
        intents.push({
          kind: 'apply_status',
          source: context.actor.id,
          target,
          status: {
            id: block.id,
            source: context.actor.id,
            remainingTurns: block.duration,
            stacks: block.stacks,
            category: block.category,
            stacking: block.stacking,
            maxStacks: block.maxStacks,
          },
          chance: block.chance,
        });
        break;
      }
      case 'triggerAction': {
        const targets = block.target === 'all_targets' ? [...context.targetIds] : context.targetIds[0] ? [context.targetIds[0]] : [];
        if (targets.length === 0) break;
        intents.push({ kind: 'trigger_action', source: context.actor.id, actor: context.actor.id, ability: block.ability, targets });
        break;
      }
      case 'summon':
        intents.push({
          kind: 'summon',
          source: context.actor.id,
          unit: {
            id: block.id,
            name: block.name,
            faction: 'ally',
            level: context.actor.level,
            stats: createStats({ hp: block.hp, atk: block.atk, def: block.def, spd: block.spd }),
            maxEnergy: block.maxEnergy,
            custom: { summonId: block.id },
          },
        });
        break;
    }
  }
  return intents;
}

function resolveTargets(
  target: 'self' | 'first_target' | 'all_targets' | 'all_allies' | 'all_enemies',
  context: ActionResolveContext,
): UnitId[] {
  if (target === 'self') return [context.actor.id];
  if (target === 'all_targets') return [...context.targetIds].filter((id): id is UnitId => Boolean(id));
  if (target === 'all_allies') return context.state.units.filter((unit) => unit.alive && unit.faction === context.actor.faction).map((unit) => unit.id);
  if (target === 'all_enemies') return context.state.units.filter((unit) => unit.alive && unit.faction !== context.actor.faction).map((unit) => unit.id);
  return context.targetIds[0] ? [context.targetIds[0]] : [];
}

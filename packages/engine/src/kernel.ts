import { breakBaseDamage, breakLevelMultiplier, calculateDamage, createDamageContext, defaultBreakToughnessFactor } from './damage.js';
import { withSequence, type ReplayEvent, type ReplayEventInput } from './events.js';
import { nextRandom, rollChance } from './rng.js';
import { cloneBattleState, createUnit, findUnit } from './state.js';
import { advanceForward, cyclesElapsed, delayAction, preserveActionProgress, scheduleAfterAction } from './timeline.js';
import { effectiveStats, elementDamageStat, statValue } from './stats.js';
import {
  StatKey,
  type ActionCommand,
  type BattleState,
  type DamageContext,
  type DamageEnergyContext,
  type DamageIntent,
  type EffectIntent,
  type DamageMode,
  type RuleCatalog,
  type UnitId,
  type UnitState,
} from './types.js';
import { resolveAction } from './rules.js';

export interface Transition {
  state: BattleState;
  events: ReplayEvent[];
}

export interface BattleKernelOptions {
  /** Level/element break base table for a pinned game/data revision. */
  breakBaseDamage?: (level: number, element: import('./types.js').Element) => number;
  /** Optional universal level multiplier used by Super Break. */
  breakLevelMultiplier?: (level: number) => number;
  /** Optional max-toughness coefficient used by that revision's break formula. */
  breakToughnessFactor?: (maxToughness: number) => number;
  /** Optional base value for a Break DoT before its intent multiplier. */
  breakDotBaseDamage?: (level: number, element: import('./types.js').Element, maxToughness: number) => number;
  /** Versioned rule for energy gained by the unit receiving a hit. */
  energyGainOnDamage?: (context: DamageEnergyContext) => number;
}

function defaultBreakDotBaseDamage(level: number, element: import('./types.js').Element, target: UnitState): number {
  const levelBase = breakLevelMultiplier(level);
  if (element === 'physical') {
    const rank = target.custom.enemyRank;
    const hpRatio = rank === 'normal' ? 0.16 : 0.07;
    const cap = 2 * levelBase * defaultBreakToughnessFactor(target.toughness.max);
    return Math.min(target.maxHp * hpRatio, cap);
  }
  if (element === 'lightning') return 2 * levelBase;
  return levelBase;
}

function defaultBreakDotMultiplier(element: import('./types.js').Element, target: UnitState): number {
  if (element !== 'wind') return 1;
  return target.custom.enemyRank === 'elite' || target.custom.enemyRank === 'boss' ? 3 : 1;
}

export class BattleKernel {
  private readonly activeDamageContexts: DamageContext[] = [];

  public constructor(
    private readonly rules: RuleCatalog,
    private readonly damageMode: DamageMode = 'expected',
    private readonly options: BattleKernelOptions = {},
  ) {}

  public step(input: BattleState, command: ActionCommand): Transition {
    const state = cloneBattleState(input);
    if (command.rngState) state.rng = { ...command.rngState };
    const actor = findUnit(state, command.actor);
    if (!actor.alive) throw new Error(`Cannot act with defeated unit: ${command.actor}`);
    // A direct script may choose a particular actor, but its action still occurs
    // no earlier than that actor's scheduled timestamp.
    state.clock = Math.max(state.clock, actor.nextActionAt);
    state.cycle = cyclesElapsed(state.clock);

    const blockedStatus = actor.statuses.find((status) => status.custom?.blocksAction === true);
    if (blockedStatus) {
      const events: ReplayEvent[] = [];
      const emit = this.createEmitter(state, events);
      emit({ type: 'ACTION_BLOCKED', at: state.clock, actor: actor.id, status: blockedStatus.id });
      if (command.advanceTurn !== false) {
        actor.nextActionAt = scheduleAfterAction(state, actor);
        actor.actionGeneration += 1;
        emit({ type: 'ACTION_SCHEDULED', at: state.clock, actor: actor.id, nextActionAt: actor.nextActionAt });
        this.decrementModifiersAtTurnEnd(state, actor.id, emit);
        this.decrementStatusesAtTurnEnd(state, actor.id, emit);
        this.decrementShieldsAtTurnEnd(state, actor.id, emit);
        this.recoverToughnessAtTurnEnd(state, actor.id, emit);
        emit({ type: 'TURN_END', at: state.clock, actor: actor.id });
      }
      return { state, events };
    }

    const unitRules = this.rules.getUnitRules(command.actor);
    const action = unitRules?.actions[command.ability];
    if (!action) throw new Error(`Unknown ability ${command.ability} for ${command.actor}`);
    const spCost = action.spCost ?? (action.actionType === 'skill' ? 1 : 0);
    const energyCost = action.energyCost ?? (action.actionType === 'ultimate' ? actor.maxEnergy : 0);
    if (state.skillPoints < spCost) throw new Error(`Not enough skill points for ${command.ability}`);
    if (actor.energy < energyCost) throw new Error(`Not enough energy for ${command.ability}`);

    const events: ReplayEvent[] = [];
    const emit = this.createEmitter(state, events);

    emit({ type: 'ACTION_STARTED', at: state.clock, actor: actor.id, ability: command.ability });
    if (action.actionType === 'insert') emit({ type: 'INSERT_ACTION_START', at: state.clock, actor: actor.id, ability: command.ability });
    emit({ type: 'BEFORE_ACTION', at: state.clock, actor: actor.id, ability: command.ability, actionType: action.actionType });
    if (spCost !== 0) {
      state.skillPoints -= spCost;
      emit({ type: 'SP_CHANGED', at: state.clock, amount: -spCost, value: state.skillPoints });
    }
    if (energyCost !== 0) {
      actor.energy -= energyCost;
      emit({ type: 'ENERGY_CHANGED', at: state.clock, target: actor.id, amount: -energyCost, value: actor.energy });
      emit({ type: 'ENERGY_SPENT', at: state.clock, target: actor.id, amount: energyCost, value: actor.energy });
    }

    const intents = resolveAction(state, actor.id, action, command.targets).map((intent) => (
      (intent.kind === 'damage' || intent.kind === 'bounce_damage') && intent.actionType === undefined
        ? { ...intent, actionType: action.actionType }
        : intent
    ));
    for (const intent of intents) this.applyIntent(state, intent, emit);
    if (action.spGain) this.applyIntent(state, { kind: 'skill_points', amount: action.spGain }, emit);
    if (action.energyGain) this.applyIntent(state, { kind: 'energy', target: actor.id, amount: action.energyGain }, emit);
    this.emitActionUsed(action.actionType, state.clock, actor.id, command.ability, command.targets, emit);
    if (actor.faction === 'enemy') emit({ type: 'ENEMY_ATTACK', at: state.clock, actor: actor.id, ability: command.ability });

    // Ultimates are inserted actions in HSR: they spend energy but do not
    // consume/reset the actor's ordinary action-bar position. Explicit insert
    // actions follow the same rule.
    const consumesTurn = BattleKernel.actionConsumesTurn(action.actionType);
    if (command.advanceTurn !== false && consumesTurn && actor.alive) {
      actor.nextActionAt = scheduleAfterAction(state, actor);
      actor.actionGeneration += 1;
      emit({ type: 'ACTION_SCHEDULED', at: state.clock, actor: actor.id, nextActionAt: actor.nextActionAt });
    }
    emit({ type: 'AFTER_ACTION', at: state.clock, actor: actor.id, ability: command.ability, actionType: action.actionType });
    if (action.actionType === 'insert') emit({ type: 'INSERT_ACTION_END', at: state.clock, actor: actor.id, ability: command.ability });
    if (consumesTurn) {
      this.decrementModifiersAtTurnEnd(state, actor.id, emit);
      this.decrementStatusesAtTurnEnd(state, actor.id, emit);
      this.decrementShieldsAtTurnEnd(state, actor.id, emit);
      this.recoverToughnessAtTurnEnd(state, actor.id, emit);
      emit({ type: 'TURN_END', at: state.clock, actor: actor.id });
    }

    return { state, events };
  }

  public tickDots(input: BattleState, targetId: UnitId): Transition {
    const state = cloneBattleState(input);
    const target = findUnit(state, targetId);
    const events: ReplayEvent[] = [];
    const emit = this.createEmitter(state, events);
    this.tickDotsInPlace(state, target.id, emit, events);
    return { state, events };
  }

  private tickDotsInPlace(
    state: BattleState,
    targetId: UnitId,
    emit: (event: ReplayEventInput) => void,
    events: ReplayEvent[],
  ): void {
    const target = findUnit(state, targetId);
    const dots = [...target.dots];
    target.dots = [];
    for (const dot of dots) {
      const eventStart = events.length;
      this.applyIntent(state, {
        kind: 'damage',
        source: dot.source,
        target: target.id,
        ability: dot.ability,
        element: dot.element,
        damageType: dot.damageType ?? 'dot',
        scalingStat: dot.scalingStat,
        multiplier: dot.multiplier,
        toughnessDamage: dot.toughnessDamage,
        canCrit: false,
        snapshot: dot.snapshot,
      }, emit);
      const damageEvent = events.slice(eventStart).find((event): event is Extract<ReplayEvent, { type: 'DAMAGE_DEALT' }> => event.type === 'DAMAGE_DEALT');
      const remainingTurns = dot.remainingTurns - 1;
      if (remainingTurns > 0 && target.alive) {
        target.dots.push({ ...dot, remainingTurns });
      } else {
        emit({ type: 'DOT_EXPIRED', at: state.clock, source: dot.source, target: target.id, id: dot.id });
      }
      emit({ type: 'DOT_TICK', at: state.clock, source: dot.source, target: target.id, id: dot.id, amount: damageEvent?.amount ?? 0, remainingTurns: Math.max(0, remainingTurns) });
    }
  }

  /** Prepare the selected actor's turn without consuming the action itself. */
  public beginTurn(input: BattleState, actorId: UnitId): Transition {
    const state = cloneBattleState(input);
    const actor = findUnit(state, actorId);
    const events: ReplayEvent[] = [];
    const emit = this.createEmitter(state, events);
    const previousCycle = state.cycle;
    state.clock = Math.max(state.clock, actor.nextActionAt);
    state.cycle = cyclesElapsed(state.clock);
    if (!state.battleStarted) {
      state.battleStarted = true;
      emit({ type: 'BATTLE_START', at: state.clock });
      emit({ type: 'WAVE_START', at: state.clock, wave: state.wave });
    }
    for (let cycle = previousCycle + 1; cycle <= state.cycle; cycle += 1) {
      emit({ type: 'CYCLE_START', at: state.clock, cycle });
    }
    emit({ type: 'TURN_BEGIN', at: state.clock, actor: actor.id });
    if (actor.faction === 'enemy') emit({ type: 'ENEMY_TURN_BEGIN', at: state.clock, actor: actor.id });
    this.tickDotsInPlace(state, actorId, emit, events);
    return { state, events };
  }

  private applyIntent(
    state: BattleState,
    intent: EffectIntent,
    emit: (event: ReplayEventInput) => void,
  ): void {
    switch (intent.kind) {
      case 'damage': {
        const wasAlive = findUnit(state, intent.target).alive;
        const formulaIntent = intent.damageType === 'super_break' && intent.toughnessDamage !== undefined && intent.breakBaseDamage === undefined && this.options.breakLevelMultiplier
          ? { ...intent, breakBaseDamage: this.options.breakLevelMultiplier(findUnit(state, intent.source).level) }
          : intent;
        const damageContext = createDamageContext(state, formulaIntent);
        this.activeDamageContexts.push(damageContext);
        emit({
          type: 'BEFORE_HIT',
          at: state.clock,
          source: intent.source,
          target: intent.target,
          ability: intent.ability,
          damageType: intent.damageType,
          element: intent.element,
          actionType: intent.actionType,
          multiplier: intent.multiplier,
        });
        emit({
          type: 'BEFORE_DAMAGE',
          at: state.clock,
          source: intent.source,
          target: intent.target,
          ability: intent.ability,
          damageType: intent.damageType,
          element: intent.element,
          actionType: intent.actionType,
          multiplier: intent.multiplier,
        });
        let result: ReturnType<typeof calculateDamage>;
        try {
          result = calculateDamage(state, formulaIntent, { mode: this.damageMode, context: damageContext });
        } finally {
          this.activeDamageContexts.pop();
        }
        state.rng = result.rng;
        const target = findUnit(state, intent.target);
        const targetBrokenBefore = target.toughness.broken;
        const sourceForToughness = findUnit(state, intent.source);
        const matchingWeakness = target.weaknesses.includes(intent.element);
        const appliedToughnessDamage = matchingWeakness
          ? result.toughnessDamage * (1 + statValue(effectiveStats(sourceForToughness), StatKey.BreakEfficiency))
          : intent.ignoresWeakness
            ? result.toughnessDamage * (intent.offWeaknessToughnessMultiplier ?? 1) * (1 + statValue(effectiveStats(sourceForToughness), StatKey.BreakEfficiency))
            : 0;
        emit({
          type: 'DAMAGE_DEALT',
          at: state.clock,
          source: intent.source,
          target: intent.target,
          ability: intent.ability,
          damageType: intent.damageType,
          element: intent.element,
          amount: result.amount,
          rawAmount: result.rawAmount,
          critical: result.critical,
          expected: result.expected,
          rngDraw: result.rngDraw,
          toughnessDamage: appliedToughnessDamage,
        });
        if (result.critical) {
          emit({ type: 'CRIT_OCCURRED', at: state.clock, source: intent.source, target: intent.target, ability: intent.ability, amount: result.amount });
        }
        let remainingDamage = result.amount;
        const remainingShields = [] as typeof target.shields;
        for (const shield of target.shields) {
          if (remainingDamage <= 0) {
            remainingShields.push(shield);
            continue;
          }
          const absorbed = Math.min(remainingDamage, shield.amount);
          shield.amount -= absorbed;
          remainingDamage -= absorbed;
          if (absorbed > 0) emit({ type: 'SHIELD_ABSORBED', at: state.clock, source: intent.source, target: target.id, id: shield.id, amount: absorbed, remaining: shield.amount });
          if (shield.amount <= 0) {
            emit({ type: 'SHIELD_BROKEN', at: state.clock, target: target.id, id: shield.id });
          } else {
            remainingShields.push(shield);
          }
        }
        target.shields = remainingShields;
        const beforeHp = target.hp;
        target.hp = Math.max(0, target.hp - remainingDamage);
        const hpDamage = Math.max(0, beforeHp - target.hp);
        const shieldDamage = Math.max(0, result.amount - remainingDamage);
        if (target.hp !== beforeHp) {
          emit({ type: 'HP_CHANGED', at: state.clock, target: target.id, amount: target.hp - beforeHp, value: target.hp });
          if (target.hp < beforeHp) emit({ type: 'HP_LOSS', at: state.clock, target: target.id, amount: beforeHp - target.hp, source: intent.source });
        }
        const energyGain = Math.max(0, this.options.energyGainOnDamage?.({
          intent: intent as DamageIntent,
          damage: result.amount,
          hpDamage,
          shieldDamage,
          critical: result.critical,
        }) ?? 0);
        if (energyGain > 0) this.applyIntent(state, { kind: 'energy', target: target.id, amount: energyGain }, emit);
        if (target.hp === 0) target.alive = false;
        if (appliedToughnessDamage > 0) {
          this.applyToughness(state, {
            kind: 'toughness',
            source: intent.source,
            target: intent.target,
            amount: appliedToughnessDamage,
          }, emit, intent.breakElement ?? intent.element);
        }
        if (wasAlive && !target.alive) {
          emit({ type: 'UNIT_DEFEATED', at: state.clock, target: target.id });
          emit({ type: target.faction === 'enemy' ? 'ENEMY_DEFEATED' : 'ALLY_DOWNED', at: state.clock, target: target.id });
          emit({ type: 'KILL', at: state.clock, source: intent.source, target: target.id });
          this.maybeEmitBattleEnd(state, emit);
        }
        emit({ type: 'AFTER_DAMAGE', at: state.clock, source: intent.source, target: intent.target, ability: intent.ability, damageType: intent.damageType, element: intent.element, amount: result.amount, critical: result.critical, toughnessDamage: appliedToughnessDamage, targetBrokenBefore });
        emit({ type: 'AFTER_HIT', at: state.clock, source: intent.source, target: intent.target, ability: intent.ability, damageType: intent.damageType, element: intent.element, amount: result.amount, critical: result.critical });
        return;
      }
      case 'bounce_damage': {
        for (let hit = 0; hit < Math.max(0, Math.floor(intent.hits)); hit += 1) {
          const candidates = intent.candidateTargets.filter((id) => state.units.some((unit) => unit.id === id && unit.alive));
          if (candidates.length === 0) break;
          let targetId = candidates[0]!;
          if (this.damageMode === 'sampled' && candidates.length > 1) {
            const roll = nextRandom(state.rng);
            state.rng = roll.rng;
            targetId = candidates[Math.min(candidates.length - 1, Math.floor(roll.value * candidates.length))]!;
          }
          this.applyIntent(state, {
            kind: 'damage',
            source: intent.source,
            target: targetId,
            ability: intent.ability,
            actionType: intent.actionType,
            element: intent.element,
            damageType: intent.damageType,
            scalingStat: intent.scalingStat,
            multiplier: intent.multiplier,
            toughnessDamage: intent.toughnessDamage,
            ignoresWeakness: intent.ignoresWeakness,
            offWeaknessToughnessMultiplier: intent.offWeaknessToughnessMultiplier,
            breakElement: intent.breakElement,
            canCrit: intent.canCrit,
          }, emit);
        }
        return;
      }
      case 'toughness': {
        const target = findUnit(state, intent.target);
        const wasAlive = target.alive;
        this.applyToughness(state, intent, emit);
        if (wasAlive && !target.alive) emit({ type: 'UNIT_DEFEATED', at: state.clock, target: target.id });
        return;
      }
      case 'lose_hp': {
        const source = findUnit(state, intent.source);
        const target = findUnit(state, intent.target);
        if (!target.alive) return;
        const beforeHp = target.hp;
        target.hp = Math.max(intent.minimumHp ?? 0, target.hp - Math.max(0, intent.amount));
        const amount = beforeHp - target.hp;
        if (amount <= 0) return;
        emit({ type: 'HP_CHANGED', at: state.clock, target: target.id, amount: -amount, value: target.hp });
        emit({ type: 'HP_LOSS', at: state.clock, target: target.id, amount, source: source.id });
        if (target.hp === 0) {
          target.alive = false;
          emit({ type: 'UNIT_DEFEATED', at: state.clock, target: target.id });
          emit({ type: target.faction === 'enemy' ? 'ENEMY_DEFEATED' : 'ALLY_DOWNED', at: state.clock, target: target.id });
          emit({ type: 'KILL', at: state.clock, source: source.id, target: target.id });
          this.maybeEmitBattleEnd(state, emit);
        }
        return;
      }
      case 'implant_weakness': {
        const target = findUnit(state, intent.target);
        const alreadyPresent = target.weaknesses.includes(intent.element);
        if (!alreadyPresent) target.weaknesses.push(intent.element);
        emit({ type: 'WEAKNESS_IMPLANTED', at: state.clock, source: intent.source, target: target.id, element: intent.element, duration: intent.duration });
        if (intent.duration !== undefined && intent.duration > 0) {
          target.statuses = target.statuses.filter((status) => status.id !== `weakness:${intent.element}`);
          target.statuses.push({ id: `weakness:${intent.element}`, source: intent.source, remainingTurns: intent.duration, stacks: 1, category: 'debuff', custom: { implantedWeakness: intent.element, preexisting: alreadyPresent } });
        }
        return;
      }
      case 'taunt': {
        const target = findUnit(state, intent.target);
        const statusId = `taunt:${intent.source}`;
        const existing = target.statuses.find((status) => status.id === statusId);
        if (existing && typeof existing.custom?.previousTaunt === 'number') target.taunt = existing.custom.previousTaunt;
        target.statuses = target.statuses.filter((status) => status.id !== statusId);
        const previousTaunt = target.taunt;
        target.taunt += intent.bonus;
        target.statuses.push({ id: statusId, source: intent.source, remainingTurns: intent.duration, stacks: 1, category: 'buff', custom: { tauntBonus: intent.bonus, previousTaunt } });
        return;
      }
      case 'remove_modifier': {
        const target = findUnit(state, intent.target);
        const before = target.modifiers.length;
        target.modifiers = target.modifiers.filter((modifier) => modifier.id !== intent.id);
        if (target.modifiers.length !== before) {
          emit({ type: 'MODIFIER_REMOVED', at: state.clock, target: target.id, id: intent.id });
          emit({ type: 'MODIFIER_EXPIRED', at: state.clock, target: target.id, id: intent.id });
        }
        return;
      }
      case 'heal': {
        const source = findUnit(state, intent.source);
        const target = findUnit(state, intent.target);
        emit({ type: 'BEFORE_HEAL', at: state.clock, source: source.id, target: target.id });
        const sourceStats = effectiveStats(source);
        const amount = Math.max(0, Math.floor((statValue(sourceStats, intent.scalingStat) * intent.multiplier + (intent.flatAmount ?? 0)) * (1 + statValue(sourceStats, StatKey.HealBoost))));
        const actual = target.alive ? Math.min(amount, target.maxHp - target.hp) : 0;
        const beforeHp = target.hp;
        target.hp += actual;
        if (target.hp !== beforeHp) emit({ type: 'HP_CHANGED', at: state.clock, target: target.id, amount: target.hp - beforeHp, value: target.hp });
        emit({ type: 'HEAL_APPLIED', at: state.clock, source: source.id, target: target.id, amount: actual });
        emit({ type: 'AFTER_HEAL', at: state.clock, source: source.id, target: target.id, amount: actual });
        return;
      }
      case 'revive': {
        const source = findUnit(state, intent.source);
        const target = findUnit(state, intent.target);
        if (target.alive) return;
        const amount = Math.max(1, Math.floor(target.maxHp * intent.multiplier + (intent.flatAmount ?? 0)));
        target.hp = Math.min(target.maxHp, amount);
        target.alive = true;
        emit({ type: 'HP_CHANGED', at: state.clock, target: target.id, amount: target.hp, value: target.hp });
        emit({ type: 'UNIT_REVIVED', at: state.clock, source: source.id, target: target.id, amount: target.hp });
        return;
      }
      case 'modify_custom': {
        const target = findUnit(state, intent.target);
        const current = target.custom[intent.key];
        const next = intent.value !== undefined
          ? intent.value
          : (() => {
              const numeric = typeof current === 'number' ? current : 0;
              const value = numeric + (intent.delta ?? 0);
              return Math.min(intent.max ?? Number.POSITIVE_INFINITY, Math.max(intent.min ?? Number.NEGATIVE_INFINITY, value));
            })();
        target.custom[intent.key] = next;
        emit({ type: 'CUSTOM_CHANGED', at: state.clock, target: target.id, key: intent.key, value: next });
        return;
      }
      case 'modify_damage': {
        const context = this.activeDamageContexts[this.activeDamageContexts.length - 1];
        if (!context) return;
        context.damageBoost += intent.damageBoost ?? 0;
        context.defReduction += intent.defReduction ?? 0;
        context.defIgnore += intent.defIgnore ?? 0;
        context.resPen += intent.resPen ?? 0;
        context.vulnerability += intent.vulnerability ?? 0;
        if (intent.damageReduction !== undefined) context.damageReductions.push(intent.damageReduction);
        context.critRateBonus += intent.critRateBonus ?? 0;
        context.critDmgBonus += intent.critDmgBonus ?? 0;
        context.multiplierBonus += intent.multiplierBonus ?? 0;
        context.flatDamageBonus += intent.flatDamageBonus ?? 0;
        context.breakDamageBoost += intent.breakDamageBoost ?? 0;
        context.superBreakDamageBoost += intent.superBreakDamageBoost ?? 0;
        return;
      }
      case 'energy': {
        if (!intent.target) throw new Error('Energy intent requires a target');
        const target = findUnit(state, intent.target);
        const before = target.energy;
        const regen = intent.amount > 0 ? statValue(effectiveStats(target), StatKey.EnergyRegen) : 1;
        target.energy = Math.min(target.maxEnergy, Math.max(0, target.energy + intent.amount * regen));
        const change = target.energy - before;
        emit({ type: 'ENERGY_CHANGED', at: state.clock, target: target.id, amount: change, value: target.energy });
        if (change > 0) emit({ type: 'ENERGY_GAINED', at: state.clock, target: target.id, amount: change, value: target.energy });
        if (change < 0) emit({ type: 'ENERGY_SPENT', at: state.clock, target: target.id, amount: -change, value: target.energy });
        return;
      }
      case 'skill_points': {
        const before = state.skillPoints;
        state.skillPoints = Math.min(state.maxSkillPoints, Math.max(0, state.skillPoints + intent.amount));
        emit({ type: 'SP_CHANGED', at: state.clock, amount: state.skillPoints - before, value: state.skillPoints });
        return;
      }
      case 'advance_forward': {
        const target = findUnit(state, intent.target);
        const speed = statValue(effectiveStats(target), StatKey.SPD);
        target.nextActionAt = advanceForward(target.nextActionAt, state.clock, intent.ratio, speed);
        target.actionGeneration += 1;
        emit({ type: 'ACTION_ADVANCED', at: state.clock, actor: target.id, ratio: intent.ratio, nextActionAt: target.nextActionAt });
        emit({ type: 'ACTION_SCHEDULED', at: state.clock, actor: target.id, nextActionAt: target.nextActionAt });
        return;
      }
      case 'delay_action': {
        const target = findUnit(state, intent.target);
        const speed = statValue(effectiveStats(target), StatKey.SPD);
        target.nextActionAt = delayAction(target.nextActionAt, intent.ratio, speed);
        target.actionGeneration += 1;
        emit({ type: 'ACTION_DELAYED', at: state.clock, actor: target.id, ratio: intent.ratio, nextActionAt: target.nextActionAt });
        emit({ type: 'ACTION_SCHEDULED', at: state.clock, actor: target.id, nextActionAt: target.nextActionAt });
        return;
      }
      case 'modify_stat': {
        const target = findUnit(state, intent.target);
        const previousSpeed = statValue(effectiveStats(target), StatKey.SPD);
        if (intent.modifier.stacking === 'replace') {
          target.modifiers = target.modifiers.filter((modifier) => modifier.id !== intent.modifier.id);
        }
        target.modifiers.push({ ...intent.modifier, source: intent.source });
        emit({ type: 'MODIFIER_APPLIED', at: state.clock, source: intent.source, target: target.id, id: intent.modifier.id, stat: intent.modifier.stat });
        if (intent.modifier.stat === StatKey.SPD) {
          const nextSpeed = statValue(effectiveStats(target), StatKey.SPD);
          if (nextSpeed !== previousSpeed) {
            if (target.nextActionAt > state.clock) {
              const remaining = target.nextActionAt - state.clock;
              target.nextActionAt = state.clock + preserveActionProgress(remaining, previousSpeed, nextSpeed);
            }
            target.actionGeneration += 1;
            emit({ type: 'SPD_CHANGED', at: state.clock, target: target.id });
            emit({ type: 'ACTION_SCHEDULED', at: state.clock, actor: target.id, nextActionAt: target.nextActionAt });
          }
        }
        return;
      }
      case 'apply_dot': {
        const source = findUnit(state, intent.source);
        const target = findUnit(state, intent.target);
        const sourceStats = effectiveStats(source);
        const isBreakDot = intent.damageType === 'break';
        const baseChance = Math.min(1, Math.max(0, intent.chance ?? 1));
        const chance = Math.min(1, Math.max(0, baseChance * (1 + statValue(sourceStats, StatKey.EffectHitRate)) * (1 - statValue(effectiveStats(target), StatKey.EffectRes))));
        const roll = this.damageMode === 'expected'
          ? { rng: state.rng, success: chance > 0, roll: undefined }
          : rollChance(state.rng, chance);
        state.rng = roll.rng;
        if (!roll.success) {
          emit({ type: 'STATUS_RESISTED', at: state.clock, source: source.id, target: target.id, id: intent.dotId, chance, rngDraw: roll.roll });
          return;
        }
        const dot = {
          id: intent.dotId,
          source: source.id,
          ability: intent.ability,
          element: intent.element,
          damageType: intent.damageType ?? 'dot',
          scalingStat: intent.scalingStat,
          multiplier: this.damageMode === 'expected' ? intent.multiplier * chance : intent.multiplier,
          toughnessDamage: intent.toughnessDamage ?? 0,
          remainingTurns: intent.duration,
          snapshot: {
            sourceLevel: source.level,
            scalingValue: isBreakDot
              ? (intent.breakBaseDamage ?? breakBaseDamage(source.level, intent.element)) * (1 + statValue(sourceStats, StatKey.BreakEffect))
              : statValue(sourceStats, intent.scalingStat),
            elementDamageBonus: isBreakDot ? 0 : statValue(sourceStats, elementDamageStat(intent.element)),
            allDamageBonus: isBreakDot ? 0 : statValue(sourceStats, StatKey.DmgBoostAll),
            resPen: statValue(sourceStats, StatKey.ResPen),
            defIgnore: statValue(sourceStats, StatKey.DefIgnore),
            dotDamageBonus: isBreakDot ? 0 : statValue(sourceStats, StatKey.DmgBoostDot),
            vulnerability: statValue(effectiveStats(target), StatKey.Vulnerability),
          },
        };
        target.dots = target.dots.filter((existing) => existing.id !== dot.id);
        target.dots.push(dot);
        emit({ type: 'DOT_APPLIED', at: state.clock, source: source.id, target: target.id, id: dot.id, duration: dot.remainingTurns, probability: chance, rngDraw: roll.roll });
        return;
      }
      case 'detonate_dots': {
        const target = findUnit(state, intent.target);
        const dots = [...target.dots];
        for (const dot of dots) {
          if (!target.alive) break;
          emit({ type: 'DOT_DETONATED', at: state.clock, source: intent.source, target: target.id, id: dot.id, multiplier: intent.multiplier });
          this.applyIntent(state, {
            kind: 'damage',
            source: dot.source,
            target: target.id,
            ability: intent.ability,
            element: dot.element,
            damageType: dot.damageType ?? 'dot',
            scalingStat: dot.scalingStat,
            multiplier: dot.multiplier * intent.multiplier,
            toughnessDamage: 0,
            canCrit: false,
            snapshot: dot.snapshot,
          }, emit);
        }
        return;
      }
      case 'shield': {
        const source = findUnit(state, intent.source);
        const target = findUnit(state, intent.target);
        const amount = Math.max(0, Math.floor(statValue(effectiveStats(source), intent.scalingStat) * intent.multiplier + (intent.flatAmount ?? 0)));
        target.shields = target.shields.filter((shield) => shield.id !== intent.id);
        target.shields.push({ id: intent.id, source: source.id, amount, remainingTurns: intent.duration });
        emit({ type: 'SHIELD_APPLIED', at: state.clock, source: source.id, target: target.id, id: intent.id, amount, duration: intent.duration });
        return;
      }
      case 'cleanse': {
        const target = findUnit(state, intent.target);
        const removed: typeof target.statuses = [];
        const retained: typeof target.statuses = [];
        for (const status of target.statuses) {
          if (removed.length < Math.max(0, intent.count) && (status.category === undefined || status.category === 'debuff')) removed.push(status);
          else retained.push(status);
        }
        target.statuses = retained;
        for (const status of removed) emit({ type: 'STATUS_REMOVED', at: state.clock, target: target.id, id: status.id });
        return;
      }
      case 'apply_status': {
        const source = findUnit(state, intent.source);
        const target = findUnit(state, intent.target);
        const baseChance = Math.min(1, Math.max(0, intent.chance ?? 1));
        const chance = Math.min(1, Math.max(0, baseChance * (1 + statValue(effectiveStats(source), StatKey.EffectHitRate)) * (1 - statValue(effectiveStats(target), StatKey.EffectRes))));
        const roll = this.damageMode === 'expected'
          ? { rng: state.rng, success: chance > 0, roll: undefined }
          : rollChance(state.rng, chance);
        state.rng = roll.rng;
        if (!roll.success) {
          emit({ type: 'STATUS_RESISTED', at: state.clock, source: source.id, target: target.id, id: intent.status.id, chance, rngDraw: roll.roll });
          if (intent.status.category === 'debuff') emit({ type: 'DEBUFF_RESISTED', at: state.clock, source: source.id, target: target.id, id: intent.status.id, chance, rngDraw: roll.roll });
          return;
        }
        const status = {
          ...intent.status,
          source: intent.status.source ?? intent.source,
          custom: intent.status.custom ? { ...intent.status.custom } : undefined,
        };
        const existingIndex = target.statuses.findIndex((existing) => existing.id === status.id);
        const existing = existingIndex >= 0 ? target.statuses[existingIndex] : undefined;
        if (existing && status.stacking === 'add') {
          const maxStacks = status.maxStacks ?? existing.maxStacks ?? Number.POSITIVE_INFINITY;
          const merged = {
            ...existing,
            ...status,
            remainingTurns: Math.max(existing.remainingTurns, status.remainingTurns),
            stacks: Math.min(maxStacks, existing.stacks + status.stacks),
            maxStacks: Number.isFinite(maxStacks) ? maxStacks : undefined,
          };
          target.statuses[existingIndex] = merged;
          emit({ type: 'STATUS_APPLIED', at: state.clock, source: intent.source, target: target.id, id: merged.id, duration: merged.remainingTurns, stacks: merged.stacks });
        } else {
          if (existingIndex >= 0) target.statuses.splice(existingIndex, 1);
          target.statuses.push(status);
          emit({ type: 'STATUS_APPLIED', at: state.clock, source: intent.source, target: target.id, id: status.id, duration: status.remainingTurns, stacks: status.stacks });
        }
        return;
      }
      case 'trigger_action': {
        const actor = findUnit(state, intent.actor);
        if (!actor.alive) return;
        const action = this.rules.getUnitRules(actor.id)?.actions[intent.ability];
        if (!action) throw new Error(`Unknown triggered ability ${intent.ability} for ${actor.id}`);
        emit({ type: 'ACTION_STARTED', at: state.clock, actor: actor.id, ability: intent.ability });
        if (action.actionType === 'insert') emit({ type: 'INSERT_ACTION_START', at: state.clock, actor: actor.id, ability: intent.ability });
        emit({ type: 'BEFORE_ACTION', at: state.clock, actor: actor.id, ability: intent.ability, actionType: action.actionType });
        const intents = resolveAction(state, actor.id, action, intent.targets).map((nested) => (
          (nested.kind === 'damage' || nested.kind === 'bounce_damage') && nested.actionType === undefined
            ? { ...nested, actionType: action.actionType }
            : nested
        ));
        for (const nested of intents) this.applyIntent(state, nested, emit);
        this.emitActionUsed(action.actionType, state.clock, actor.id, intent.ability, intent.targets, emit);
        if (actor.faction === 'enemy') emit({ type: 'ENEMY_ATTACK', at: state.clock, actor: actor.id, ability: intent.ability });
        emit({ type: 'AFTER_ACTION', at: state.clock, actor: actor.id, ability: intent.ability, actionType: action.actionType });
        if (action.actionType === 'insert') emit({ type: 'INSERT_ACTION_END', at: state.clock, actor: actor.id, ability: intent.ability });
        return;
      }
      case 'summon': {
        if (state.units.some((unit) => unit.id === intent.unit.id)) throw new Error(`Duplicate summoned unit: ${intent.unit.id}`);
        const summoned = createUnit(intent.unit);
        summoned.nextActionAt = Math.max(state.clock, summoned.nextActionAt);
        state.units.push(summoned);
        emit({ type: 'UNIT_SUMMONED', at: state.clock, source: intent.source, target: summoned.id, name: summoned.name });
        if (summoned.faction === 'enemy') emit({ type: 'ENEMY_SUMMONED', at: state.clock, source: intent.source, target: summoned.id, name: summoned.name });
        return;
      }
      case 'enter_phase': {
        const target = findUnit(state, intent.target);
        target.custom.enemy_phase = intent.phase;
        emit({ type: 'PHASE_ENTERED', at: state.clock, target: target.id, phase: intent.phase, actions: [...intent.actions] });
        const rules = this.rules.getUnitRules(target.id);
        const targets = state.units.filter((unit) => unit.alive && unit.faction !== target.faction).map((unit) => unit.id);
        for (const ability of intent.actions) {
          if (rules?.actions[ability]) {
            this.applyIntent(state, { kind: 'trigger_action', source: target.id, actor: target.id, ability, targets }, emit);
          }
        }
        return;
      }
    }
  }

  private emitActionUsed(
    actionType: import('./types.js').ActionType,
    at: number,
    actor: UnitId,
    ability: string,
    targets: readonly UnitId[],
    emit: (event: ReplayEventInput) => void,
  ): void {
    switch (actionType) {
      case 'basic': emit({ type: 'BASIC_USED', at, actor, ability, targets: [...targets] }); return;
      case 'skill': emit({ type: 'SKILL_USED', at, actor, ability, targets: [...targets] }); return;
      case 'ultimate': emit({ type: 'ULT_USED', at, actor, ability, targets: [...targets] }); return;
      case 'follow_up': emit({ type: 'FOLLOW_UP_USED', at, actor, ability, targets: [...targets] }); return;
      case 'technique': emit({ type: 'TECHNIQUE_USED', at, actor, ability, targets: [...targets] }); return;
      case 'insert': return;
    }
  }

  /** Ordinary Basic/Skill turns consume AV; ultimates and insert actions do not. */
  private static actionConsumesTurn(actionType: import('./types.js').ActionType): boolean {
    return actionType === 'basic' || actionType === 'skill';
  }

  private maybeEmitBattleEnd(
    state: BattleState,
    emit: (event: ReplayEventInput) => void,
  ): void {
    if (state.wave >= state.totalWaves && state.units.filter((unit) => unit.faction === 'enemy').every((unit) => !unit.alive)) {
      emit({ type: 'BATTLE_END', at: state.clock, reason: 'all_enemies_defeated' });
    }
  }

  private createEmitter(state: BattleState, events: ReplayEvent[]): (event: ReplayEventInput) => void {
    const triggerCounts = new Map<string, number>();
    let depth = 0;
    const emit = (event: ReplayEventInput): void => {
      state.eventSequence += 1;
      const replayEvent = withSequence(event as ReplayEvent, state.eventSequence);
      events.push(replayEvent);
      if (depth >= 64) throw new Error(`Rule hook recursion limit exceeded at ${replayEvent.type}`);
      for (const hook of this.rules.getHooks(replayEvent.type)) {
        const key = `${hook.id}:${replayEvent.type}`;
        const count = triggerCounts.get(key) ?? 0;
        depth += 1;
        const intents = hook.resolve({ state, event: replayEvent, owner: hook.owner, depth });
        depth -= 1;
        if (intents.length === 0) continue;
        if (count >= (hook.maxTriggersPerStep ?? 100)) {
          throw new Error(`Rule hook trigger limit exceeded: ${hook.id}`);
        }
        triggerCounts.set(key, count + 1);
        depth += 1;
        for (const intent of intents) this.applyIntent(state, intent, emit);
        depth -= 1;
      }
    };
    return emit;
  }

  private applyToughness(
    state: BattleState,
    intent: Extract<EffectIntent, { kind: 'toughness' }>,
    emit: (event: ReplayEventInput) => void,
    element?: import('./types.js').Element,
  ): void {
    const target = findUnit(state, intent.target);
    if (target.toughness.max <= 0) return;
    const before = target.toughness.current;
    target.toughness.current = Math.max(0, before - intent.amount);
    emit({ type: 'TOUGHNESS_REDUCED', at: state.clock, source: intent.source, target: target.id, amount: before - target.toughness.current, remaining: target.toughness.current });
    if (before > 0 && target.toughness.current === 0 && !target.toughness.broken) {
      target.toughness.broken = true;
      target.custom.break_recovery_turns = 1;
      if (element) {
        emit({ type: 'WEAKNESS_BREAK', at: state.clock, source: intent.source, target: target.id, element });
        const source = findUnit(state, intent.source);
        const sourceStats = effectiveStats(source);
        const calibratedBreakBase = this.options.breakBaseDamage?.(source.level, element) ?? breakBaseDamage(source.level, element);
        const calibratedToughnessFactor = this.options.breakToughnessFactor?.(target.toughness.max) ?? defaultBreakToughnessFactor(target.toughness.max);
        const breakResult = calculateDamage(state, {
          kind: 'damage',
          source: source.id,
          target: target.id,
          ability: 'break',
          element,
          damageType: 'break',
          scalingStat: StatKey.ATK,
          multiplier: 0,
          extraFlatDamage: calibratedBreakBase * calibratedToughnessFactor * (1 + statValue(sourceStats, StatKey.BreakEffect)),
          canCrit: false,
        }, { mode: this.damageMode });
        state.rng = breakResult.rng;
        const beforeHp = target.hp;
        target.hp = Math.max(0, target.hp - breakResult.amount);
        if (target.hp !== beforeHp) emit({ type: 'HP_CHANGED', at: state.clock, target: target.id, amount: target.hp - beforeHp, value: target.hp });
        if (target.hp === 0) target.alive = false;
        emit({ type: 'DAMAGE_DEALT', at: state.clock, source: source.id, target: target.id, ability: 'break', damageType: 'break', element, amount: breakResult.amount, rawAmount: breakResult.rawAmount, critical: false, expected: breakResult.expected, toughnessDamage: 0 });
        emit({ type: 'BREAK_DMG_DEALT', at: state.clock, source: source.id, target: target.id, element, amount: breakResult.amount });
        if (target.alive) this.applyWeaknessBreakEffect(state, source.id, target.id, element, emit);
      }
    }
  }

  private applyWeaknessBreakEffect(
    state: BattleState,
    sourceId: UnitId,
    targetId: UnitId,
    element: import('./types.js').Element,
    emit: (event: ReplayEventInput) => void,
  ): void {
    const source = findUnit(state, sourceId);
    const target = findUnit(state, targetId);
    const breakEffect = statValue(effectiveStats(source), StatKey.BreakEffect);
    const dotElements = new Set<import('./types.js').Element>(['physical', 'fire', 'lightning', 'wind']);
    if (dotElements.has(element)) {
      const baseDamage = this.options.breakDotBaseDamage?.(source.level, element, target.toughness.max)
        ?? defaultBreakDotBaseDamage(source.level, element, target);
      this.applyIntent(state, {
        kind: 'apply_dot',
        source: sourceId,
        target: targetId,
        ability: 'break',
        dotId: `break:${element}`,
        element,
        damageType: 'break',
        breakBaseDamage: baseDamage,
        scalingStat: StatKey.ATK,
        multiplier: defaultBreakDotMultiplier(element, target),
        duration: 2,
        chance: 1,
      }, emit);
      return;
    }
    if (element === 'ice') {
      this.applyIntent(state, {
        kind: 'apply_status',
        source: sourceId,
        target: targetId,
        status: { id: 'break:frozen', source: sourceId, remainingTurns: 1, stacks: 1, category: 'debuff', custom: { blocksAction: true } },
      }, emit);
      return;
    }
    const statusId = element === 'quantum' ? 'break:entangled' : 'break:imprisoned';
    this.applyIntent(state, {
      kind: 'apply_status',
      source: sourceId,
      target: targetId,
      status: { id: statusId, source: sourceId, remainingTurns: 1, stacks: 1, category: 'debuff' },
    }, emit);
    this.applyIntent(state, { kind: 'delay_action', target: targetId, ratio: (element === 'quantum' ? 0.2 : 0.3) * (1 + breakEffect) }, emit);
    if (element === 'imaginary') {
      this.applyIntent(state, {
        kind: 'modify_stat',
        source: sourceId,
        target: targetId,
        modifier: { id: 'break:imprisoned_spd', stat: StatKey.SPD, percent: -0.1, remainingTurns: 1, stacking: 'replace' },
      }, emit);
    }
  }

  private decrementModifiersAtTurnEnd(
    state: BattleState,
    unitId: UnitId,
    emit: (event: ReplayEventInput) => void,
  ): void {
    const unit = findUnit(state, unitId);
    const retained = [] as typeof unit.modifiers;
    for (const modifier of unit.modifiers) {
      if (modifier.remainingTurns === undefined) {
        retained.push(modifier);
        continue;
      }
      const remaining = modifier.remainingTurns - 1;
        if (remaining > 0) {
          retained.push({ ...modifier, remainingTurns: remaining });
        } else {
          emit({ type: 'MODIFIER_REMOVED', at: state.clock, target: unit.id, id: modifier.id });
          emit({ type: 'MODIFIER_EXPIRED', at: state.clock, target: unit.id, id: modifier.id });
      }
    }
    unit.modifiers = retained;
  }

  private decrementStatusesAtTurnEnd(
    state: BattleState,
    unitId: UnitId,
    emit: (event: ReplayEventInput) => void,
  ): void {
    const unit = findUnit(state, unitId);
    const retained = [] as typeof unit.statuses;
    for (const status of unit.statuses) {
      const remaining = status.remainingTurns - 1;
      if (remaining > 0) retained.push({ ...status, remainingTurns: remaining });
      else {
        const implantedWeakness = status.custom?.implantedWeakness;
        if (typeof implantedWeakness === 'string' && status.custom?.preexisting !== true) {
          unit.weaknesses = unit.weaknesses.filter((element) => element !== implantedWeakness);
        }
        if (typeof status.custom?.previousTaunt === 'number') unit.taunt = status.custom.previousTaunt;
        emit({ type: 'STATUS_EXPIRED', at: state.clock, target: unit.id, id: status.id });
      }
    }
    unit.statuses = retained;
  }

  private decrementShieldsAtTurnEnd(
    state: BattleState,
    unitId: UnitId,
    emit: (event: ReplayEventInput) => void,
  ): void {
    const unit = findUnit(state, unitId);
    const retained = [] as typeof unit.shields;
    for (const shield of unit.shields) {
      const remaining = shield.remainingTurns - 1;
      if (remaining > 0) retained.push({ ...shield, remainingTurns: remaining });
      else emit({ type: 'SHIELD_EXPIRED', at: state.clock, target: unit.id, id: shield.id });
    }
    unit.shields = retained;
  }

  private recoverToughnessAtTurnEnd(
    state: BattleState,
    unitId: UnitId,
    emit: (event: ReplayEventInput) => void,
  ): void {
    const unit = findUnit(state, unitId);
    if (!unit.toughness.broken) return;
    const remaining = typeof unit.custom.break_recovery_turns === 'number' ? unit.custom.break_recovery_turns : undefined;
    if (remaining === undefined) return;
    if (remaining > 1) {
      unit.custom.break_recovery_turns = remaining - 1;
      return;
    }
    unit.toughness.broken = false;
    unit.toughness.current = unit.toughness.max;
    delete unit.custom.break_recovery_turns;
    emit({ type: 'TOUGHNESS_RECOVERED', at: state.clock, target: unit.id, amount: unit.toughness.max });
    emit({ type: 'BREAK_RECOVERED', at: state.clock, target: unit.id, amount: unit.toughness.max });
  }
}

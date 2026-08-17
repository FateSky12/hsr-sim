import { chooseNextActor, chooseTarget, type ActionCommand, type BattleState, type BattleKernel, type TargetingMode, type UnitId } from '@hsr-sim/engine';

export interface Policy {
  next(state: BattleState): ActionCommand | undefined;
}

export class FixedScriptPolicy implements Policy {
  private cursor = 0;

  public constructor(
    private readonly commands: readonly ActionCommand[],
    private readonly options: { waitForActor?: boolean } = {},
  ) {}

  public next(state?: BattleState): ActionCommand | undefined {
    const command = this.commands[this.cursor];
    if (command && this.options.waitForActor && state && chooseNextActor(state) !== command.actor) return undefined;
    if (command) this.cursor += 1;
    return command ? { ...command, targets: [...command.targets] } : undefined;
  }
}

export interface AplCondition {
  kind:
    | 'skill_points_at_least'
    | 'target_toughness_broken'
    | 'target_hp_below'
    | 'actor_energy_at_least'
    | 'actor_energy_full'
    | 'actor_hp_below'
    | 'target_alive'
    | 'has_status';
  value?: number;
  target?: UnitId;
  statusId?: string;
  negated?: boolean;
}

export interface AplRule {
  actor: UnitId;
  ability: string;
  targets: UnitId[];
  conditions?: AplCondition[];
}

export class PriorityPolicy implements Policy {
  public constructor(private readonly rules: readonly AplRule[]) {}

  public next(state: BattleState): ActionCommand | undefined {
    const actor = chooseNextActor(state);
    if (!actor) return undefined;
    const candidate = this.rules.find((rule) => rule.actor === actor && conditionsPass(state, actor, rule.conditions ?? []));
    return candidate ? { actor: candidate.actor, ability: candidate.ability, targets: [...candidate.targets] } : undefined;
  }
}

export function parseApl(text: string, defaults: { actor: UnitId; targets: UnitId[] }): AplRule[] {
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line, index) => {
      const [abilityPart, conditionPart] = line.split(/\s+if=/, 2);
      const ability = abilityPart?.trim();
      if (!ability) throw new Error(`APL line ${index + 1} has no ability`);
      const conditions = conditionPart ? conditionPart.split('&').map((expression) => parseAplCondition(expression.trim(), defaults.targets[0])) : [];
      return { actor: defaults.actor, ability, targets: [...defaults.targets], conditions };
    });
}

function parseAplCondition(expression: string, target?: UnitId): AplCondition {
  const negated = expression.startsWith('!');
  const valueExpression = negated ? expression.slice(1).trim() : expression;
  const skillPoints = /^skill_points\s*>=\s*(\d+)$/.exec(valueExpression);
  if (skillPoints) return { kind: 'skill_points_at_least', value: Number(skillPoints[1]), negated };
  const actorEnergy = /^actor\.energy\s*>=\s*(\d+(?:\.\d+)?)$/.exec(valueExpression);
  if (actorEnergy) return { kind: 'actor_energy_at_least', value: Number(actorEnergy[1]), negated };
  if (valueExpression === 'actor.energy_full') return { kind: 'actor_energy_full', negated };
  if (valueExpression === 'target.toughness_broken') return { kind: 'target_toughness_broken', target, negated };
  if (valueExpression === 'target.alive') return { kind: 'target_alive', target, negated };
  const targetHp = /^target\.hp\s*<\s*(\d+(?:\.\d+)?)%$/.exec(valueExpression);
  if (targetHp) return { kind: 'target_hp_below', target, value: Number(targetHp[1]) / 100, negated };
  const actorHp = /^actor\.hp\s*<\s*(\d+(?:\.\d+)?)%$/.exec(valueExpression);
  if (actorHp) return { kind: 'actor_hp_below', value: Number(actorHp[1]) / 100, negated };
  const status = /^(?:buff|debuff|status)\.(actor|self|target)\.([\w:.-]+)$/.exec(valueExpression);
  if (status) return { kind: 'has_status', target: status[1] === 'target' ? target : undefined, statusId: status[2], negated };
  throw new Error(`Unsupported APL condition: ${expression}`);
}

export interface EnemyActionRule {
  enemyId: UnitId;
  ability?: string;
  pattern?: readonly string[];
  targeting?: TargetingMode;
}

export interface ActorPatternRule {
  actorId: UnitId;
  pattern: readonly string[];
  targets?: readonly UnitId[];
  targeting?: TargetingMode;
}

/** Drives any unit with an independent action bar, including summons. */
export class ActorPatternPolicy implements Policy {
  private readonly cursors = new Map<UnitId, number>();

  public constructor(private readonly rules: readonly ActorPatternRule[]) {}

  public next(state: BattleState): ActionCommand | undefined {
    const actorId = chooseNextActor(state);
    if (!actorId) return undefined;
    const actor = state.units.find((unit) => unit.id === actorId);
    const rule = this.rules.find((candidate) => candidate.actorId === actorId);
    if (!rule && typeof actor?.custom.summonAbility !== 'string') return undefined;
    const pattern = rule?.pattern.length ? rule.pattern : [actor?.custom.summonAbility as string];
    const explicit = rule?.targets?.find((id) => state.units.some((unit) => unit.id === id && unit.alive));
    const selection = explicit ? { targetId: explicit, rng: state.rng } : chooseTarget(state, actorId, rule?.targeting ?? 'highest_aggro');
    state.rng = selection.rng;
    if (!selection.targetId) return undefined;
    const cursor = this.cursors.get(actorId) ?? 0;
    const ability = pattern[cursor % pattern.length]!;
    this.cursors.set(actorId, cursor + 1);
    return { actor: actorId, ability, targets: [selection.targetId] };
  }
}

export class EnemyPolicy implements Policy {
  private readonly cursors = new Map<UnitId, number>();

  public constructor(private readonly rules: readonly EnemyActionRule[]) {}

  public next(state: BattleState): ActionCommand | undefined {
    const actorId = chooseNextActor(state);
    if (!actorId || state.units.find((unit) => unit.id === actorId)?.faction !== 'enemy') return undefined;
    const rule = this.rules.find((candidate) => candidate.enemyId === actorId);
    if (!rule) return undefined;
    const selection = chooseTarget(state, actorId, rule.targeting ?? 'highest_aggro');
    // Weighted targeting consumes a deterministic RNG draw. Commit it to the
    // state so the next enemy decision does not repeat the same roll.
    state.rng = selection.rng;
    if (!selection.targetId) return undefined;
    const pattern = rule.pattern?.length ? rule.pattern : rule.ability ? [rule.ability] : [];
    if (pattern.length === 0) return undefined;
    const cursor = this.cursors.get(actorId) ?? 0;
    const ability = pattern[cursor % pattern.length]!;
    this.cursors.set(actorId, cursor + 1);
    return { actor: actorId, ability, targets: [selection.targetId] };
  }
}

export class CompositePolicy implements Policy {
  public constructor(private readonly policies: readonly Policy[]) {}

  public next(state: BattleState): ActionCommand | undefined {
    for (const policy of this.policies) {
      const command = policy.next(state);
      if (command) return command;
    }
    return undefined;
  }
}

export interface SimulationRun {
  finalState: BattleState;
  commands: ActionCommand[];
  events: import('@hsr-sim/engine').ReplayEvent[];
  stoppedBecause: 'policy_exhausted' | 'max_actions' | 'all_enemies_defeated' | 'no_command';
}

export function runPolicy(
  kernel: BattleKernel,
  initialState: BattleState,
  policy: Policy,
  options: { maxActions?: number } = {},
): SimulationRun {
  let state = initialState;
  const commands: ActionCommand[] = [];
  const events: import('@hsr-sim/engine').ReplayEvent[] = [];
  const maxActions = options.maxActions ?? 100;
  for (let index = 0; index < maxActions; index += 1) {
    if (state.units.every((unit) => unit.faction !== 'enemy' || !unit.alive)) {
      return { finalState: state, commands, events, stoppedBecause: 'all_enemies_defeated' };
    }
    const command = policy.next(state);
    if (!command) {
      return { finalState: state, commands, events, stoppedBecause: index === 0 ? 'no_command' : 'policy_exhausted' };
    }
    const turnStart = kernel.beginTurn(state, command.actor);
    state = turnStart.state;
    events.push(...turnStart.events);
    const committedCommand = { ...command, rngState: { ...state.rng } };
    const transition = kernel.step(state, committedCommand);
    state = transition.state;
    commands.push(committedCommand);
    events.push(...transition.events);
  }
  return { finalState: state, commands, events, stoppedBecause: 'max_actions' };
}

function conditionsPass(state: BattleState, actorId: UnitId, conditions: readonly AplCondition[]): boolean {
  return conditions.every((condition) => {
    const actor = state.units.find((unit) => unit.id === actorId);
    const target = condition.target ? state.units.find((unit) => unit.id === condition.target) : undefined;
    const pass = (() => {
    switch (condition.kind) {
      case 'skill_points_at_least':
        return state.skillPoints >= (condition.value ?? 0);
      case 'target_toughness_broken':
        return target?.toughness.broken === true;
      case 'target_hp_below': {
        return target ? target.hp / target.maxHp < (condition.value ?? 1) : false;
      }
      case 'actor_energy_at_least':
        return actor ? actor.energy >= (condition.value ?? 0) : false;
      case 'actor_energy_full':
        return actor ? actor.energy >= actor.maxEnergy : false;
      case 'actor_hp_below':
        return actor ? actor.hp / actor.maxHp < (condition.value ?? 1) : false;
      case 'target_alive':
        return target?.alive === true;
      case 'has_status': {
        const owner = condition.target ? target : actor;
        return owner?.statuses.some((status) => status.id === condition.statusId) === true;
      }
    }
    })();
    return condition.negated ? !pass : pass;
  });
}

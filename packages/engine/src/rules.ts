import type {
  ActionDefinition,
  ActionResolveContext,
  BattleState,
  RuleCatalog,
  UnitId,
  UnitRules,
} from './types.js';
import { findUnit } from './state.js';

export function createRuleCatalog(definitions: Record<UnitId, UnitRules>): RuleCatalog {
  const actions = new Map(Object.entries(definitions));
  const hooks = [...actions.values()]
    .flatMap((rules) => rules.hooks ?? [])
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  return {
    getUnitRules(unitId: UnitId): UnitRules | undefined {
      return actions.get(unitId);
    },
    getHooks(eventType) {
      return hooks.filter((hook) => hook.on === eventType);
    },
  };
}

export function mergeRuleCatalogs(...catalogs: readonly RuleCatalog[]): RuleCatalog {
  return {
    getUnitRules(unitId: UnitId): UnitRules | undefined {
      for (const catalog of catalogs) {
        const rules = catalog.getUnitRules(unitId);
        if (rules) return rules;
      }
      return undefined;
    },
    getHooks(eventType) {
      return catalogs.flatMap((catalog) => catalog.getHooks(eventType)).sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
    },
  };
}

export function resolveAction(
  state: BattleState,
  actorId: UnitId,
  action: ActionDefinition,
  targetIds: readonly UnitId[],
) {
  const actor = findUnit(state, actorId);
  const context: ActionResolveContext = {
    state,
    actor,
    targetIds,
    getUnit: (id) => findUnit(state, id),
  };
  return action.resolve(context);
}

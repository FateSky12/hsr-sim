export interface CalibrationObservation {
  field: string;
  expected: number | string | boolean;
  observed: number | string | boolean;
  tolerance?: number;
  source?: string;
}

export interface CalibrationReport {
  passed: boolean;
  mismatches: Array<CalibrationObservation & { delta?: number }>;
}

export interface PanelSnapshot {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  critRate: number;
  critDmg: number;
  breakEffect: number;
  effectHitRate: number;
}

export interface DamageTraceObservation {
  index: number;
  expected: number;
  observed: number;
  tolerance: number;
  source?: string;
}

export interface ActionTraceObservation {
  index: number;
  expectedActor: string;
  observedActor: string;
  expectedAt: number;
  observedAt: number;
  atTolerance?: number;
  expectedAbility?: string;
  observedAbility?: string;
}

/** JSON-safe capture file used to bring real client observations into CI. */
export interface CalibrationDocument {
  schemaVersion: 1;
  name: string;
  source?: string;
  panel?: {
    expected: PanelSnapshot;
    observed: PanelSnapshot;
    speedTolerance?: number;
  };
  damageTrace?: DamageTraceObservation[];
  actionTrace?: ActionTraceObservation[];
}

export function parseCalibrationDocument(value: unknown): CalibrationDocument {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.name !== 'string' || value.name.length === 0) {
    throw new Error('Calibration document must have schemaVersion 1 and a non-empty name');
  }
  const panel = value.panel === undefined ? undefined : parsePanelDocument(value.panel);
  const damageTrace = value.damageTrace === undefined ? undefined : parseDamageTrace(value.damageTrace);
  const actionTrace = value.actionTrace === undefined ? undefined : parseActionTrace(value.actionTrace);
  if (panel === undefined && damageTrace === undefined && actionTrace === undefined) throw new Error('Calibration document contains no observations');
  return {
    schemaVersion: 1,
    name: value.name,
    source: typeof value.source === 'string' ? value.source : undefined,
    panel,
    damageTrace,
    actionTrace,
  };
}

export function compareCalibrationDocument(document: CalibrationDocument): CalibrationReport {
  const reports: CalibrationReport[] = [];
  if (document.panel) reports.push(comparePanel(document.panel.expected, document.panel.observed, { speedTolerance: document.panel.speedTolerance }));
  if (document.damageTrace) reports.push(compareDamageTrace(document.damageTrace));
  if (document.actionTrace) reports.push(compareActionTrace(document.actionTrace));
  return {
    passed: reports.every((report) => report.passed),
    mismatches: reports.flatMap((report) => report.mismatches),
  };
}

export function extractDamageTrace(events: readonly import('@hsr-sim/engine').ReplayEvent[]): number[] {
  return events.flatMap((event) => event.type === 'DAMAGE_DEALT' ? [event.amount] : []);
}

export function extractActionTrace(events: readonly import('@hsr-sim/engine').ReplayEvent[]): Array<{ actor: string; ability: string; at: number }> {
  return events.flatMap((event) => event.type === 'ACTION_STARTED' ? [{ actor: event.actor, ability: event.ability, at: event.at }] : []);
}

export function derivePanelSnapshot(unit: UnitState): PanelSnapshot {
  const stats = effectiveStats(unit);
  return {
    hp: statValue(stats, StatKey.HP),
    atk: statValue(stats, StatKey.ATK),
    def: statValue(stats, StatKey.DEF),
    spd: statValue(stats, StatKey.SPD),
    critRate: statValue(stats, StatKey.CritRate),
    critDmg: statValue(stats, StatKey.CritDmg),
    breakEffect: statValue(stats, StatKey.BreakEffect),
    effectHitRate: statValue(stats, StatKey.EffectHitRate),
  };
}

export function compareCalibration(observations: readonly CalibrationObservation[]): CalibrationReport {
  const mismatches = observations.flatMap((observation) => {
    if (typeof observation.expected === 'number' && typeof observation.observed === 'number') {
      const delta = Math.abs(observation.expected - observation.observed);
      return delta <= (observation.tolerance ?? 0) ? [] : [{ ...observation, delta }];
    }
    return observation.expected === observation.observed ? [] : [observation];
  });
  return { passed: mismatches.length === 0, mismatches };
}

/** L0: compare a captured in-game panel against the calculated panel. */
export function comparePanel(
  expected: PanelSnapshot,
  observed: PanelSnapshot,
  options: { speedTolerance?: number } = {},
): CalibrationReport {
  const speedTolerance = options.speedTolerance ?? 1;
  return compareCalibration([
    { field: 'panel.hp', expected: expected.hp, observed: observed.hp },
    { field: 'panel.atk', expected: expected.atk, observed: observed.atk },
    { field: 'panel.def', expected: expected.def, observed: observed.def },
    { field: 'panel.spd', expected: expected.spd, observed: observed.spd, tolerance: speedTolerance },
    { field: 'panel.critRate', expected: expected.critRate, observed: observed.critRate },
    { field: 'panel.critDmg', expected: expected.critDmg, observed: observed.critDmg },
    { field: 'panel.breakEffect', expected: expected.breakEffect, observed: observed.breakEffect },
    { field: 'panel.effectHitRate', expected: expected.effectHitRate, observed: observed.effectHitRate },
  ]);
}

/** L1: compare single-hit or per-instance damage observations. */
export function compareDamageTrace(observations: readonly DamageTraceObservation[]): CalibrationReport {
  return compareCalibration(observations.map((observation) => ({
    field: `damage[${observation.index}]${observation.source ? `:${observation.source}` : ''}`,
    expected: observation.expected,
    observed: observation.observed,
    // Damage tolerances are recorded as relative error (0.005 = 0.5%).
    tolerance: Math.abs(observation.expected) * observation.tolerance,
    source: observation.source,
  })));
}

/** L2: compare actor/ability order and absolute action timestamps. */
export function compareActionTrace(observations: readonly ActionTraceObservation[]): CalibrationReport {
  return compareCalibration(observations.flatMap((observation) => [
    {
      field: `action[${observation.index}].actor`,
      expected: observation.expectedActor,
      observed: observation.observedActor,
    },
    ...(observation.expectedAbility === undefined || observation.observedAbility === undefined ? [] : [{
      field: `action[${observation.index}].ability`,
      expected: observation.expectedAbility,
      observed: observation.observedAbility,
    }]),
    {
      field: `action[${observation.index}].at`,
      expected: observation.expectedAt,
      observed: observation.observedAt,
      tolerance: observation.atTolerance ?? 1e-6,
    },
  ]));
}

function parsePanelDocument(value: unknown): CalibrationDocument['panel'] {
  if (!isRecord(value)) throw new Error('Calibration panel must be an object');
  return {
    expected: parsePanelSnapshot(value.expected, 'panel.expected'),
    observed: parsePanelSnapshot(value.observed, 'panel.observed'),
    speedTolerance: value.speedTolerance === undefined ? undefined : readFiniteNumber(value.speedTolerance, 'panel.speedTolerance'),
  };
}

function parsePanelSnapshot(value: unknown, field: string): PanelSnapshot {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  return {
    hp: readFiniteNumber(value.hp, `${field}.hp`),
    atk: readFiniteNumber(value.atk, `${field}.atk`),
    def: readFiniteNumber(value.def, `${field}.def`),
    spd: readFiniteNumber(value.spd, `${field}.spd`),
    critRate: readFiniteNumber(value.critRate, `${field}.critRate`),
    critDmg: readFiniteNumber(value.critDmg, `${field}.critDmg`),
    breakEffect: readFiniteNumber(value.breakEffect, `${field}.breakEffect`),
    effectHitRate: readFiniteNumber(value.effectHitRate, `${field}.effectHitRate`),
  };
}

function parseDamageTrace(value: unknown): DamageTraceObservation[] {
  if (!Array.isArray(value)) throw new Error('Calibration damageTrace must be an array');
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`damageTrace[${index}] must be an object`);
    return {
      index: readInteger(item.index ?? index, `damageTrace[${index}].index`),
      expected: readFiniteNumber(item.expected, `damageTrace[${index}].expected`),
      observed: readFiniteNumber(item.observed, `damageTrace[${index}].observed`),
      tolerance: readFiniteNumber(item.tolerance, `damageTrace[${index}].tolerance`),
      source: typeof item.source === 'string' ? item.source : undefined,
    };
  });
}

function parseActionTrace(value: unknown): ActionTraceObservation[] {
  if (!Array.isArray(value)) throw new Error('Calibration actionTrace must be an array');
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`actionTrace[${index}] must be an object`);
    return {
      index: readInteger(item.index ?? index, `actionTrace[${index}].index`),
      expectedActor: readString(item.expectedActor, `actionTrace[${index}].expectedActor`),
      observedActor: readString(item.observedActor, `actionTrace[${index}].observedActor`),
      expectedAt: readFiniteNumber(item.expectedAt, `actionTrace[${index}].expectedAt`),
      observedAt: readFiniteNumber(item.observedAt, `actionTrace[${index}].observedAt`),
      atTolerance: item.atTolerance === undefined ? undefined : readFiniteNumber(item.atTolerance, `actionTrace[${index}].atTolerance`),
      expectedAbility: typeof item.expectedAbility === 'string' ? item.expectedAbility : undefined,
      observedAbility: typeof item.observedAbility === 'string' ? item.observedAbility : undefined,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${field} must be a finite number`);
  return value;
}

function readInteger(value: unknown, field: string): number {
  const number = readFiniteNumber(value, field);
  if (!Number.isInteger(number)) throw new Error(`${field} must be an integer`);
  return number;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}
import { effectiveStats, statValue, StatKey, type UnitState } from '@hsr-sim/engine';

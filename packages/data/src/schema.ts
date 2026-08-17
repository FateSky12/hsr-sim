import { z } from 'zod';

export const CoverageSchema = z.enum(['verified', 'abstracted', 'unsupported']);
export type Coverage = z.infer<typeof CoverageSchema>;

export const ElementSchema = z.enum([
  'physical',
  'fire',
  'ice',
  'lightning',
  'wind',
  'quantum',
  'imaginary',
]);
export type Element = z.infer<typeof ElementSchema>;

export const ActionTypeSchema = z.enum(['basic', 'skill', 'ultimate', 'follow_up', 'technique', 'insert']);

export const StatBlockSchema = z.object({
  hp: z.number().nonnegative(),
  atk: z.number().nonnegative(),
  def: z.number().nonnegative(),
  spd: z.number().positive(),
});

export const EquipmentBaseStatBlockSchema = z.object({
  hp: z.number().nonnegative(),
  atk: z.number().nonnegative(),
  def: z.number().nonnegative(),
  spd: z.number().nonnegative(),
});

export const EquipmentStatSchema = z.enum([
  'HP',
  'HPPercent',
  'ATK',
  'ATKPercent',
  'DEF',
  'DEFPercent',
  'SPD',
  'SPDPercent',
  'CritRate',
  'CritDmg',
  'BreakEffect',
  'EffectHitRate',
  'EffectRes',
  'EnergyRegen',
  'HealBoost',
  'DmgBoostAll',
  'DmgBoostPhysical',
  'DmgBoostFire',
  'DmgBoostIce',
  'DmgBoostLightning',
  'DmgBoostWind',
  'DmgBoostQuantum',
  'DmgBoostImaginary',
  'ResPen',
  'DefReduction',
  'Vulnerability',
  'DmgBoostBasic',
  'DmgBoostSkill',
  'DmgBoostUltimate',
  'DmgBoostFollowUp',
  'DmgBoostTechnique',
  'DmgBoostAdditional',
  'DmgBoostDot',
  'BreakDmgBoost',
  'SuperBreakDmgBoost',
]);

export const EquipmentStatValueSchema = z.object({
  stat: EquipmentStatSchema,
  value: z.number(),
});

export const EquipmentPassiveTriggerSchema = z.enum([
  'BATTLE_START',
  'ACTION_STARTED',
  'BASIC_USED',
  'SKILL_USED',
  'ULT_USED',
  'FOLLOW_UP_USED',
  'WEAKNESS_BREAK',
  'HP_LOSS',
  'KILL',
]);

export const EquipmentPassiveSchema = z.object({
  id: z.string(),
  trigger: EquipmentPassiveTriggerSchema,
  modifier: EquipmentStatValueSchema,
  duration: z.number().int().positive(),
  target: z.enum(['self', 'all_targets', 'event_target']).default('self'),
  stacking: z.enum(['replace', 'add']).default('replace'),
  maxTriggersPerStep: z.number().int().positive().optional(),
});

export const LightConeDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  rarity: z.number().int().min(3).max(5),
  level: z.number().int().positive(),
  superimposition: z.number().int().min(1).max(5),
  baseStats: EquipmentBaseStatBlockSchema,
  staticStats: z.array(EquipmentStatValueSchema),
  passive: EquipmentPassiveSchema.optional(),
  passives: z.array(EquipmentPassiveSchema).optional(),
  source: z.object({ kind: z.string(), revision: z.string() }),
  coverage: CoverageSchema,
});

export const RelicSlotSchema = z.enum(['head', 'hands', 'body', 'feet', 'planar_sphere', 'link_rope']);

export const RelicInstanceDataSchema = z.object({
  id: z.string(),
  slot: RelicSlotSchema,
  setId: z.string(),
  mainStat: EquipmentStatValueSchema,
  subStats: z.array(EquipmentStatValueSchema),
  level: z.number().int().min(0).max(15),
  source: z.object({ kind: z.string(), revision: z.string() }),
  coverage: CoverageSchema,
});

export const RelicSetDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  twoPiece: z.array(EquipmentStatValueSchema),
  fourPiece: z.array(EquipmentStatValueSchema),
  passives: z.array(EquipmentPassiveSchema).default([]),
  source: z.object({ kind: z.string(), revision: z.string() }),
  coverage: CoverageSchema,
});

export const EquipmentLoadoutSchema = z.object({
  lightConeId: z.string().optional(),
  relicIds: z.array(z.string()).max(6),
});

export type EquipmentStat = z.infer<typeof EquipmentStatSchema>;
export type EquipmentStatValue = z.infer<typeof EquipmentStatValueSchema>;
export type EquipmentPassive = z.infer<typeof EquipmentPassiveSchema>;
export type LightConeData = z.infer<typeof LightConeDataSchema>;
export type RelicSlot = z.infer<typeof RelicSlotSchema>;
export type RelicInstanceData = z.infer<typeof RelicInstanceDataSchema>;
export type RelicSetData = z.infer<typeof RelicSetDataSchema>;
export type EquipmentLoadout = z.infer<typeof EquipmentLoadoutSchema>;

export const EffectBlockSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('dealDamage'),
    multiplier: z.number(),
    scaling: z.enum(['HP', 'ATK', 'DEF']),
    element: ElementSchema,
    damageType: z.enum(['normal', 'break', 'super_break', 'dot', 'additional']),
    toughnessDamage: z.number().nonnegative().optional(),
    ignoresWeakness: z.boolean().optional(),
    breakElement: ElementSchema.optional(),
    target: z.enum(['first_target', 'all_targets', 'all_allies', 'all_enemies', 'adjacent_targets']),
  }),
  z.object({
    kind: z.literal('bounceDamage'),
    multiplier: z.number(),
    scaling: z.enum(['HP', 'ATK', 'DEF']),
    element: ElementSchema,
    damageType: z.enum(['normal', 'break', 'super_break', 'dot', 'additional']),
    toughnessDamage: z.number().nonnegative().optional(),
    hits: z.number().int().positive(),
    ignoresWeakness: z.boolean().optional(),
    breakElement: ElementSchema.optional(),
    target: z.literal('random_enemy'),
  }),
  z.object({
    kind: z.literal('modifyStat'),
    stat: z.enum([
      'ATK',
      'DEF',
      'SPD',
      'CritRate',
      'CritDmg',
      'BreakEffect',
      'DmgBoostAll',
      'ResPen',
      'DmgReduction',
      'BreakDmgBoost',
      'SuperBreakDmgBoost',
    ]),
    percent: z.number().optional(),
    flat: z.number().optional(),
    duration: z.number().int().positive().optional(),
    target: z.enum(['self', 'first_target', 'all_targets', 'all_allies', 'all_enemies']),
    id: z.string(),
  }),
  z.object({
    kind: z.literal('gainEnergy'),
    amount: z.number().optional(),
    ratio: z.number().nonnegative().optional(),
    target: z.enum(['self', 'first_target', 'all_targets', 'all_allies', 'all_enemies']).default('self'),
  }),
  z.object({
    kind: z.literal('gainSkillPoints'),
    amount: z.number().int(),
  }),
  z.object({
    kind: z.literal('modifyStack'),
    key: z.string(),
    delta: z.number(),
    max: z.number().optional(),
    min: z.number().optional(),
    target: z.enum(['self', 'first_target']),
  }),
  z.object({
    kind: z.literal('applyDot'),
    id: z.string(),
    multiplier: z.number(),
    scaling: z.enum(['HP', 'ATK', 'DEF']),
    element: ElementSchema,
    duration: z.number().int().positive(),
    toughnessDamage: z.number().nonnegative().optional(),
    chance: z.number().min(0).max(1).optional(),
    target: z.enum(['first_target', 'all_targets', 'all_enemies']),
  }),
  z.object({
    kind: z.literal('detonateDots'),
    multiplier: z.number().nonnegative(),
    target: z.enum(['first_target', 'all_targets', 'all_enemies']),
  }),
  z.object({
    kind: z.literal('shield'),
    id: z.string(),
    multiplier: z.number(),
    flatAmount: z.number().optional(),
    scaling: z.enum(['HP', 'ATK', 'DEF']),
    duration: z.number().int().positive(),
    target: z.enum(['self', 'first_target', 'all_targets', 'all_allies', 'all_enemies']),
  }),
  z.object({
    kind: z.literal('heal'),
    multiplier: z.number(),
    flatAmount: z.number().optional(),
    scaling: z.enum(['HP', 'ATK', 'DEF']),
    target: z.enum(['self', 'first_target', 'all_targets', 'all_allies', 'all_enemies']),
  }),
  z.object({
    kind: z.literal('revive'),
    multiplier: z.number().nonnegative(),
    flatAmount: z.number().optional(),
    scaling: z.enum(['HP', 'ATK', 'DEF']),
    target: z.enum(['self', 'first_target']),
  }),
  z.object({
    kind: z.literal('cleanse'),
    count: z.number().int().positive(),
    target: z.enum(['self', 'first_target']),
  }),
  z.object({
    kind: z.literal('advanceForward'),
    ratio: z.number().nonnegative(),
    target: z.enum(['self', 'first_target', 'all_targets', 'all_allies', 'all_enemies']),
  }),
  z.object({
    kind: z.literal('delayAction'),
    ratio: z.number().nonnegative(),
    target: z.enum(['self', 'first_target', 'all_targets', 'all_allies', 'all_enemies']),
  }),
  z.object({
    kind: z.literal('applyStatus'),
    id: z.string(),
    duration: z.number().int().positive(),
    stacks: z.number().int().positive().default(1),
    category: z.enum(['buff', 'debuff', 'neutral']).default('debuff'),
    chance: z.number().min(0).max(1).optional(),
    target: z.enum(['self', 'first_target']),
    stacking: z.enum(['replace', 'add']).default('replace'),
    maxStacks: z.number().int().positive().optional(),
  }),
  z.object({
    kind: z.literal('triggerAction'),
    ability: z.string(),
    target: z.enum(['first_target', 'all_targets']),
  }),
  z.object({
    kind: z.literal('summon'),
    id: z.string(),
    name: z.string(),
    hp: z.number().positive(),
    atk: z.number().nonnegative(),
    def: z.number().nonnegative(),
    spd: z.number().positive(),
    maxEnergy: z.number().nonnegative().default(0),
  }),
]);

export const AbilityDataSchema = z.object({
  id: z.string(),
  actionType: ActionTypeSchema,
  spCost: z.number().int().nonnegative().optional(),
  energyCost: z.number().nonnegative().optional(),
  spGain: z.number().int().optional(),
  energyGain: z.number().nonnegative().optional(),
  effects: z.array(EffectBlockSchema),
});

export const CharacterDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  element: ElementSchema,
  level: z.number().int().positive(),
  baseStats: StatBlockSchema,
  maxEnergy: z.number().positive().optional(),
  abilities: z.array(AbilityDataSchema),
  source: z.object({ kind: z.string(), revision: z.string() }),
  coverage: CoverageSchema,
});

export type EffectBlockData = z.infer<typeof EffectBlockSchema>;
export type AbilityData = z.infer<typeof AbilityDataSchema>;
export type CharacterData = z.infer<typeof CharacterDataSchema>;

export const EnemyBehaviorSchema = z.object({
  pattern: z.array(z.string()).default([]),
  onBreak: z.object({ actionDelay: z.number().nonnegative() }).optional(),
  phases: z.array(z.object({
    hpThreshold: z.number().min(0).max(1),
    onEnter: z.array(z.string()).default([]),
  })).default([]),
});

export type EnemyBehavior = z.infer<typeof EnemyBehaviorSchema>;

export const EnemyDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.number().int().positive(),
  rank: z.enum(['normal', 'elite', 'boss']).optional(),
  hp: z.number().positive(),
  atk: z.number().nonnegative(),
  def: z.number().nonnegative(),
  spd: z.number().positive(),
  toughness: z.number().nonnegative(),
  weaknesses: z.array(ElementSchema),
  resistance: z.record(ElementSchema, z.number()),
  abilities: z.array(AbilityDataSchema).optional(),
  behavior: EnemyBehaviorSchema.optional(),
  sourceIds: z.object({
    monsterId: z.string(),
    monsterTemplateId: z.string().optional(),
    skillIds: z.array(z.string()).optional(),
  }).optional(),
  source: z.object({ kind: z.string(), revision: z.string() }),
  coverage: CoverageSchema,
});

export type EnemyData = z.infer<typeof EnemyDataSchema>;

export const ScenarioModeSchema = z.enum(['memory_of_chaos', 'apocalyptic_shadow', 'pure_fiction']);
export const ScenarioWaveSchema = z.object({
  id: z.string(),
  enemies: z.array(EnemyDataSchema),
});
export type ScenarioWave = z.infer<typeof ScenarioWaveSchema>;

export const ScenarioDefinitionSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  mode: ScenarioModeSchema,
  version: z.string(),
  totalWaves: z.number().int().positive().default(1),
  enemies: z.array(EnemyDataSchema).default([]),
  waves: z.array(ScenarioWaveSchema).default([]),
  scoring: z.object({
    cycleBudget: z.number().nonnegative().optional(),
    damageWeight: z.number().optional(),
    breakWeight: z.number().optional(),
    breakDamageWeight: z.number().optional(),
    killWeight: z.number().optional(),
    waveWeight: z.number().optional(),
    clearBonus: z.number().optional(),
  }).default({}),
  source: z.object({ kind: z.string(), revision: z.string() }).optional(),
  coverage: CoverageSchema.default('abstracted'),
});

export type ScenarioMode = z.infer<typeof ScenarioModeSchema>;
export type ScenarioDefinition = z.infer<typeof ScenarioDefinitionSchema>;

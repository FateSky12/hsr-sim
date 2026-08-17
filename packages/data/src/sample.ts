import { CharacterDataSchema, EnemyDataSchema, EquipmentLoadoutSchema, LightConeDataSchema, RelicInstanceDataSchema, RelicSetDataSchema, type CharacterData, type EnemyData } from './schema.js';

export const trainingStriker: CharacterData = CharacterDataSchema.parse({
  id: 'training_striker',
  name: '巡猎测试角色',
  path: 'the_hunt',
  element: 'physical',
  level: 80,
  baseStats: { hp: 1000, atk: 100, def: 100, spd: 100 },
  abilities: [
    {
      id: 'basic',
      actionType: 'basic',
      spGain: 1,
      energyGain: 20,
      effects: [{ kind: 'dealDamage', multiplier: 1, scaling: 'ATK', element: 'physical', damageType: 'normal', toughnessDamage: 10, target: 'first_target' }],
    },
    {
      id: 'skill',
      actionType: 'skill',
      spCost: 1,
      effects: [{ kind: 'dealDamage', multiplier: 1.5, scaling: 'ATK', element: 'physical', damageType: 'normal', toughnessDamage: 20, target: 'first_target' }],
    },
  ],
  source: { kind: 'fixture', revision: 'hsr-sim-0.1' },
  coverage: 'abstracted',
});

export const trainingSupport: CharacterData = CharacterDataSchema.parse({
  id: 'training_support',
  name: '同谐测试角色',
  path: 'harmony',
  element: 'wind',
  level: 80,
  baseStats: { hp: 900, atk: 80, def: 90, spd: 110 },
  abilities: [
    {
      id: 'basic',
      actionType: 'basic',
      spGain: 1,
      energyGain: 20,
      effects: [{ kind: 'dealDamage', multiplier: 0.8, scaling: 'ATK', element: 'wind', damageType: 'normal', toughnessDamage: 10, target: 'first_target' }],
    },
    {
      id: 'skill',
      actionType: 'skill',
      spCost: 1,
      effects: [{ kind: 'modifyStat', id: 'support_atk', stat: 'ATK', percent: 0.5, duration: 2, target: 'first_target' }],
    },
  ],
  source: { kind: 'fixture', revision: 'hsr-sim-0.1' },
  coverage: 'abstracted',
});

export const trainingEnemy: EnemyData = EnemyDataSchema.parse({
  id: 'training_enemy',
  name: '模拟训练假人',
  level: 80,
  hp: 10000,
  atk: 50,
  def: 0,
  spd: 100,
  toughness: 30,
  weaknesses: ['physical', 'fire', 'wind'],
  resistance: {
    physical: 0,
    fire: 0,
    ice: 0.2,
    lightning: 0.2,
    wind: 0,
    quantum: 0.2,
    imaginary: 0.2,
  },
  source: { kind: 'fixture', revision: 'hsr-sim-0.1' },
  coverage: 'abstracted',
});

export const trainingLightCone = LightConeDataSchema.parse({
  id: 'training_light_cone',
  name: '训练用光锥',
  path: 'the_hunt',
  rarity: 5,
  level: 80,
  superimposition: 1,
  baseStats: { hp: 0, atk: 50, def: 0, spd: 0 },
  staticStats: [{ stat: 'CritRate', value: 0.05 }],
  passive: {
    id: 'training_focus',
    trigger: 'ACTION_STARTED',
    modifier: { stat: 'DmgBoostAll', value: 0.1 },
    duration: 1,
    target: 'self',
  },
  source: { kind: 'fixture', revision: 'hsr-sim-0.1' },
  coverage: 'abstracted',
});

export const trainingRelicSet = RelicSetDataSchema.parse({
  id: 'training_set',
  name: '训练遗器套装',
  twoPiece: [{ stat: 'CritRate', value: 0.1 }],
  fourPiece: [{ stat: 'CritDmg', value: 0.2 }],
  source: { kind: 'fixture', revision: 'hsr-sim-0.1' },
  coverage: 'abstracted',
});

export const trainingRelics = [
  { id: 'training_head', slot: 'head', setId: 'training_set', mainStat: { stat: 'HP', value: 100 }, subStats: [], level: 15 },
  { id: 'training_hands', slot: 'hands', setId: 'training_set', mainStat: { stat: 'ATK', value: 50 }, subStats: [], level: 15 },
  { id: 'training_body', slot: 'body', setId: 'training_set', mainStat: { stat: 'CritRate', value: 0.1 }, subStats: [], level: 15 },
  { id: 'training_feet', slot: 'feet', setId: 'training_set', mainStat: { stat: 'SPD', value: 5 }, subStats: [], level: 15 },
  { id: 'training_sphere', slot: 'planar_sphere', setId: 'training_set', mainStat: { stat: 'ATKPercent', value: 0.1 }, subStats: [{ stat: 'ATK', value: 35 }], level: 15 },
  { id: 'training_rope', slot: 'link_rope', setId: 'training_set', mainStat: { stat: 'ATKPercent', value: 0.1 }, subStats: [{ stat: 'ATK', value: 15 }], level: 15 },
].map((relic) => RelicInstanceDataSchema.parse({
  ...relic,
  source: { kind: 'fixture', revision: 'hsr-sim-0.1' },
  coverage: 'abstracted',
}));

export const trainingEquipmentLoadouts = {
  training_build: EquipmentLoadoutSchema.parse({
    lightConeId: trainingLightCone.id,
    relicIds: trainingRelics.map((relic) => relic.id),
  }),
} as const;

export const trainingCharacters = [trainingStriker, trainingSupport] as const;

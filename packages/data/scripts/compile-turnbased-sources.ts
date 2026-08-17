import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  parseTurnBasedBreakDamageTable,
  parseTurnBasedEnemyCatalog,
  parseTurnBasedScenarioCatalog,
  type ScenarioMode,
} from '../src/index.js';

const [revision, monsterPath, templatePath, stagePath, textMapPath, breakPath, outputDir, ...stageSpecs] = process.argv.slice(2);
if (!revision || !monsterPath || !templatePath || !stagePath || !textMapPath || !breakPath || !outputDir) {
  console.error('Usage: npm run data:compile:turnbased -- <revision> <MonsterConfig.json> <MonsterTemplateConfig.json> <StageConfig.json> <TextMapEN.json> <AvatarBreakDamage.json> <output-dir> [stageId:mode ...]');
  process.exit(1);
}

const specs = stageSpecs.length > 0 ? stageSpecs : [
  '30124121:memory_of_chaos',
  '30501011:apocalyptic_shadow',
  '30501012:pure_fiction',
];
const parsedSpecs = specs.map(parseStageSpec);
const [monsters, templates, stages, textMap, breakDamage] = await Promise.all([
  readJson(monsterPath),
  readJson(templatePath),
  readJson(stagePath),
  readJson(textMapPath),
  readJson(breakPath),
]);
const scenarioCatalog = parseTurnBasedScenarioCatalog({ monsters, templates, stages, textMap }, {
  revision,
  stageIds: parsedSpecs.map((spec) => spec.id),
  modeByStage: Object.fromEntries(parsedSpecs.map((spec) => [spec.id, spec.mode])),
  version: '4.4',
});
const referencedMonsterIds = scenarioCatalog.flatMap((scenario) => scenario.waves.flatMap((wave) => wave.enemies.flatMap((enemy) => enemy.sourceIds?.monsterId ?? [])));
const enemyCatalog = parseTurnBasedEnemyCatalog({ monsters, templates, textMap }, {
  revision,
  level: 95,
  includeMonsterIds: [...new Set(referencedMonsterIds)],
});
const breakTable = parseTurnBasedBreakDamageTable(breakDamage, { revision });

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeJson(`${outputDir}/enemy-catalog.json`, enemyCatalog),
  writeJson(`${outputDir}/scenario-catalog.json`, scenarioCatalog),
  writeJson(`${outputDir}/break-damage.json`, breakTable),
  writeJson(`${outputDir}/manifest.json`, {
    schemaVersion: 1,
    sourceKind: 'TurnBasedGameData',
    revision,
    clientVersion: '4.4',
    stageIds: parsedSpecs.map((spec) => spec.id),
    stageModeOverrides: Object.fromEntries(parsedSpecs.map((spec) => [spec.id, spec.mode])),
  }),
]);
console.log(`saved ${outputDir}: ${enemyCatalog.length} enemies, ${scenarioCatalog.length} scenarios, ${breakTable.levels.length - 1} break levels`);

function parseStageSpec(value: string): { id: string; mode: ScenarioMode } {
  const [id, mode] = value.split(':', 2);
  if (!id || mode !== 'memory_of_chaos' && mode !== 'apocalyptic_shadow' && mode !== 'pure_fiction') {
    throw new Error(`Invalid stage spec ${value}; expected <stageId>:memory_of_chaos|apocalyptic_shadow|pure_fiction`);
  }
  return { id, mode };
}

async function readJson(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8');
  return JSON.parse(quoteLongIntegersOutsideStrings(text)) as unknown;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function quoteLongIntegersOutsideStrings(text: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length;) {
    const character = text[index]!;
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      index += 1;
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      index += 1;
      continue;
    }
    if (character === '-' || /\d/.test(character)) {
      const start = index;
      if (character === '-') index += 1;
      while (index < text.length && /\d/.test(text[index]!)) index += 1;
      const token = text.slice(start, index);
      result += /^-?\d{16,}$/.test(token) ? `"${token}"` : token;
      continue;
    }
    result += character;
    index += 1;
  }
  return result;
}

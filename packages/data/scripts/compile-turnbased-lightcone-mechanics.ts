import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const [revision, equipmentSkillPath, equipmentConfigPath, textMapPath, outputPath] = process.argv.slice(2);
if (!revision || !equipmentSkillPath || !equipmentConfigPath || !textMapPath || !outputPath) {
  console.error('Usage: npm run data:compile:turnbased-lightcones -- <revision> <EquipmentSkillConfig.json> <EquipmentConfig.json> <TextMapEN.json> <output.json>');
  process.exit(1);
}

const skills = await readJson(equipmentSkillPath) as Array<Record<string, unknown>>;
const configs = await readJson(equipmentConfigPath) as Array<Record<string, unknown>>;
const textMap = await readJson(textMapPath) as Record<string, unknown>;
const known = new Map(configs.map((record) => [String(record.EquipmentID), record]));
const grouped = new Map<string, Array<{ level: number; description: string; params: number[]; properties: unknown[] }>>();

for (const skill of skills) {
  const id = String(skill.SkillID ?? '');
  if (!known.has(id)) continue;
  const hash = readHash(skill.SkillDesc);
  const description = typeof textMap[hash] === 'string' ? textMap[hash] as string : undefined;
  if (!description || typeof skill.Level !== 'number') continue;
  const params = Array.isArray(skill.ParamList)
    ? skill.ParamList.flatMap((value) => value !== null && typeof value === 'object' && typeof (value as Record<string, unknown>).Value === 'number' ? [(value as Record<string, number>).Value] : [])
    : [];
  const properties = Array.isArray(skill.AbilityProperty) ? skill.AbilityProperty : [];
  const values = grouped.get(id) ?? [];
  values.push({ level: skill.Level, description, params, properties });
  grouped.set(id, values);
}

const output = [...known.entries()].map(([id, config]) => ({
  id,
  skillId: typeof config.SkillID === 'number' ? config.SkillID : id,
  path: typeof config.AvatarBaseType === 'string' ? config.AvatarBaseType : undefined,
  source: { kind: 'TurnBasedGameData', revision },
  ranks: (grouped.get(id) ?? []).sort((left, right) => left.level - right.level),
}));

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(`saved ${outputPath} (${output.length} light cones, ${output.reduce((count, item) => count + item.ranks.length, 0)} ranks)`);

async function readJson(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8');
  // Hashes in the client dump are uint64 values. Quote long integer tokens
  // before parsing so JavaScript does not round them past Number.MAX_SAFE_INTEGER.
  return JSON.parse(quoteLongIntegersOutsideStrings(text)) as unknown;
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
      if (/^-?\d{16,}$/.test(token)) result += `"${token}"`;
      else result += token;
      continue;
    }
    result += character;
    index += 1;
  }
  return result;
}

function readHash(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return '';
  const hash = (value as Record<string, unknown>).Hash;
  return typeof hash === 'string' || typeof hash === 'number' ? String(hash) : '';
}

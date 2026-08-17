import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseTurnBasedAvatarCatalog } from '../src/index.js';

const [revision, avatarPath, promotionPath, skillPath, textMapPath, outputPath] = process.argv.slice(2);
if (!revision || !avatarPath || !promotionPath || !skillPath || !textMapPath || !outputPath) {
  console.error('Usage: npm run data:compile:turnbased-avatars -- <revision> <AvatarConfig.json> <AvatarPromotionConfig.json> <AvatarSkillConfig.json> <TextMapEN.json> <output.json>');
  process.exit(1);
}
const [avatars, promotions, skills, textMap] = await Promise.all([avatarPath, promotionPath, skillPath, textMapPath].map(readJson));
const catalog = parseTurnBasedAvatarCatalog({ avatars, promotions, skills, textMap }, { revision, level: 80 });
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
console.log(`saved ${outputPath} (${catalog.length} avatars, ${catalog.reduce((count, avatar) => count + avatar.skills.length, 0)} skills)`);

async function readJson(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8');
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
      result += /^-?\d{16,}$/.test(token) ? `"${token}"` : token;
      continue;
    }
    result += character;
    index += 1;
  }
  return result;
}

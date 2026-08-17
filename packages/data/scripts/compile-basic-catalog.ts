import { readFile, writeFile } from 'node:fs/promises';
import { parseStarRailResBasicCharacterCatalog } from '../src/upstream.js';

const revision = process.argv[2];
const language = process.argv[3] ?? 'en';
const root = process.argv[4] ?? 'packages/data/generated/starrailres';
if (!revision) {
  console.error('Usage: npm run data:compile -- <git-revision> [language] [generated-root]');
  process.exit(1);
}

const directory = `${root}/${revision}/${language}`;
const readJson = async (file: string) => JSON.parse(await readFile(`${directory}/${file}`, 'utf8')) as unknown;
const characters = parseStarRailResBasicCharacterCatalog({
  characters: await readJson('characters.json'),
  promotions: await readJson('character_promotions.json'),
  skills: await readJson('character_skills.json'),
}, { revision, level: 80 });
await writeFile(`${directory}/basic-characters.json`, JSON.stringify(characters, null, 2) + '\n', 'utf8');
console.log(`saved ${directory}/basic-characters.json (${characters.length} characters)`);

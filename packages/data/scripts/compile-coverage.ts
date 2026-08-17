import { readFile, writeFile } from 'node:fs/promises';
import { parseStarRailResCharacterCoverageReport } from '../src/upstream.js';

const revision = process.argv[2];
const language = process.argv[3] ?? 'en';
const root = process.argv[4] ?? 'packages/data/generated/starrailres';
if (!revision) {
  console.error('Usage: npm run data:coverage -- <git-revision> [language] [generated-root]');
  process.exit(1);
}

const directory = `${root}/${revision}/${language}`;
const readJson = async (file: string) => JSON.parse(await readFile(`${directory}/${file}`, 'utf8')) as unknown;
const report = parseStarRailResCharacterCoverageReport({
  characters: await readJson('characters.json'),
  skills: await readJson('character_skills.json'),
}, { revision });
await writeFile(`${directory}/coverage-report.json`, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(`saved ${directory}/coverage-report.json (${report.totalCharacters} characters)`);

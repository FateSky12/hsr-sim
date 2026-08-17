import { mkdir, writeFile } from 'node:fs/promises';
import { createStarRailResIndexUrl } from '../src/upstream.js';

const revision = process.argv[2];
const language = process.argv[3] ?? 'en';
const outputRoot = process.argv[4] ?? 'packages/data/generated/starrailres';

if (!revision) {
  console.error('Usage: npm run data:fetch -- <git-revision> [language] [output-root]');
  process.exit(1);
}

const files = [
  'characters.json',
  'character_promotions.json',
  'character_skills.json',
  'character_skill_trees.json',
  'light_cones.json',
  'light_cone_promotions.json',
  'relics.json',
  'relic_sets.json',
  'relic_main_affixes.json',
  'relic_sub_affixes.json',
];
const outputDir = `${outputRoot}/${revision}/${language}`;
await mkdir(outputDir, { recursive: true });

for (const file of files) {
  const response = await fetch(createStarRailResIndexUrl(revision, language, file));
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  await writeFile(`${outputDir}/${file}`, JSON.stringify(await response.json(), null, 2) + '\n', 'utf8');
  console.log(`saved ${outputDir}/${file}`);
}

await writeFile(`${outputRoot}/${revision}/manifest.json`, JSON.stringify({
  schemaVersion: 1,
  sourceKind: 'StarRailRes',
  revision,
  language,
  files,
  fetchedAt: new Date().toISOString(),
  coverage: 'unsupported',
}, null, 2) + '\n', 'utf8');

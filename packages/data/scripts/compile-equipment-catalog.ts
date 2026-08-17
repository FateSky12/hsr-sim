import { readFile, writeFile } from 'node:fs/promises';
import { parseStarRailResLightConeCatalog, parseStarRailResRelicSetCatalog } from '../src/upstream.js';
import { parseTurnBasedLightConeCatalog } from '../src/lightcone.js';

const revision = process.argv[2];
const language = process.argv[3] ?? 'en';
const root = process.argv[4] ?? 'packages/data/generated/starrailres';
const mechanicsPath = process.argv[5];
const turnBasedRevision = process.argv[6] ?? 'unknown';
if (!revision) {
  console.error('Usage: npm run data:compile:equipment -- <git-revision> [language] [generated-root] [turnbased-lightcone-mechanics.json] [turnbased-revision]');
  process.exit(1);
}

const directory = `${root}/${revision}/${language}`;
const readJson = async (file: string) => JSON.parse(await readFile(`${directory}/${file}`, 'utf8')) as unknown;
const lightCones = mechanicsPath
  ? parseTurnBasedLightConeCatalog({
      index: await readJson('light_cones.json'),
      promotions: await readJson('light_cone_promotions.json'),
      mechanics: JSON.parse(await readFile(mechanicsPath, 'utf8')) as unknown,
    }, { starRailResRevision: revision, turnBasedRevision, level: 80 })
  : parseStarRailResLightConeCatalog({
      index: await readJson('light_cones.json'),
      promotions: await readJson('light_cone_promotions.json'),
    }, { revision, level: 80 });
const relicSets = parseStarRailResRelicSetCatalog(await readJson('relic_sets.json'), { revision });

await writeFile(`${directory}/light-cone-catalog.json`, JSON.stringify(lightCones, null, 2) + '\n', 'utf8');
await writeFile(`${directory}/relic-set-catalog.json`, JSON.stringify(relicSets, null, 2) + '\n', 'utf8');
console.log(`saved ${directory}/light-cone-catalog.json (${lightCones.length} light cones)`);
console.log(`saved ${directory}/relic-set-catalog.json (${relicSets.length} relic sets)`);

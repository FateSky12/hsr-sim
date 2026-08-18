import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const revision = 'b95e75c7e1273d819d20c530c0b7e13a3ef19fb4';
const turnBasedRevision = '648b08fbdb2e49739ebbf1210c9a189fcfc5e2d7';
const source = fileURLToPath(new URL(`../../../packages/data/generated/starrailres/${revision}/en/`, import.meta.url));
const localizedSource = fileURLToPath(new URL(`../../../packages/data/generated/starrailres/${revision}/cn/`, import.meta.url));
const manifest = fileURLToPath(new URL(`../../../packages/data/generated/starrailres/${revision}/manifest.json`, import.meta.url));
const turnBasedSource = fileURLToPath(new URL(`../../../packages/data/generated/turnbasedgamedata/${turnBasedRevision}/en/`, import.meta.url));
const turnBasedCatalogI18n = fileURLToPath(new URL(`../../../packages/data/generated/turnbasedgamedata/${turnBasedRevision}/catalog-i18n.json`, import.meta.url));
const destination = fileURLToPath(new URL('../public/data/', import.meta.url));
const scenarioSource = fileURLToPath(new URL('../../../packages/scenarios/fixtures/', import.meta.url));
const scenarioDestination = `${destination}/scenarios`;
const turnBasedDestination = `${destination}/turnbased`;
const turnBasedFiles = [
  'manifest.json',
  'enemy-catalog.json',
  'scenario-catalog.json',
  'break-damage.json',
  'avatar-catalog.json',
];
const files = [
  'direct-characters.json',
  'light-cone-catalog.json',
  'relic-set-catalog.json',
  'coverage-report.json',
];

await mkdir(destination, { recursive: true });
await mkdir(scenarioDestination, { recursive: true });
await mkdir(turnBasedDestination, { recursive: true });
await Promise.all(files.map((file) => copyFile(`${source}/${file}`, `${destination}/${file}`)));
await Promise.all([
  copyFile(`${source}/direct-characters.json`, `${destination}/direct-characters.en.json`),
  copyFile(`${localizedSource}/direct-characters.json`, `${destination}/direct-characters.zh-CN.json`),
]);
await Promise.all(turnBasedFiles.map((file) => copyFile(`${turnBasedSource}/${file}`, `${turnBasedDestination}/${file}`)));
await copyFile(turnBasedCatalogI18n, `${destination}/catalog-i18n.json`);
await Promise.all([
  ['memory-of-chaos-4.4-abstracted.json', 'memory-of-chaos-4.4-abstracted.json'],
  ['apocalyptic-shadow-4.4-abstracted.json', 'apocalyptic-shadow-4.4-abstracted.json'],
  ['pure-fiction-4.4-abstracted.json', 'pure-fiction-4.4-abstracted.json'],
].map(([file, target]) => copyFile(`${scenarioSource}/${file}`, `${scenarioDestination}/${target}`)));
await copyFile(manifest, `${destination}/manifest.json`);
console.log(`prepared ${files.length + 1} StarRailRes assets, ${turnBasedFiles.length} TurnBasedGameData assets and 3 abstract fixtures`);

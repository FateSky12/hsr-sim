import './style.css';
import { parseScannerExport, type RelicInstanceData } from '@hsr-sim/data';
import { SimulationWorkerPool, type SimulationResult } from './worker-pool.js';
import {
  LOCALES,
  UI_TEXT,
  type Locale,
  type UiStringKey,
  computeControlAvailability,
  localizeEventLines,
  localizeManifestLanguage,
  localizeStopReason,
  persistLocale,
  retainOptionValue,
  readLocale,
  translate,
} from './i18n.js';
import { FALLBACK_NAME_CATALOG, SCENARIO_ENEMY_IDS, type LocalizedNameCatalog } from './name-catalog.js';

interface CharacterCatalogRecord {
  id: string;
  name: string;
  abilities: Array<{ id: string }>;
}

const pool = new SimulationWorkerPool();
const button = document.querySelector<HTMLButtonElement>('#run')!;
const languageSelect = document.querySelector<HTMLSelectElement>('#language-select')!;
const scenarioSelect = document.querySelector<HTMLSelectElement>('#scenario-select')!;
const scenarioButton = document.querySelector<HTMLButtonElement>('#run-scenario')!;
const characterSelect = document.querySelector<HTMLSelectElement>('#character-select')!;
const characterButton = document.querySelector<HTMLButtonElement>('#run-character')!;
const teamSelects = [1, 2, 3, 4].map((index) => document.querySelector<HTMLSelectElement>(`#team-${index}`)!);
const searchButton = document.querySelector<HTMLButtonElement>('#search')!;
const aplButton = document.querySelector<HTMLButtonElement>('#run-apl')!;
const shareButton = document.querySelector<HTMLButtonElement>('#share')!;
const enemyButton = document.querySelector<HTMLButtonElement>('#run-enemy')!;
const relicImport = document.querySelector<HTMLInputElement>('#relic-import')!;
const relicJson = document.querySelector<HTMLTextAreaElement>('#relic-json')!;
const importRelicJson = document.querySelector<HTMLButtonElement>('#import-relic-json')!;
const enemyJson = document.querySelector<HTMLTextAreaElement>('#enemy-json')!;
const aplInput = document.querySelector<HTMLTextAreaElement>('#apl')!;
const status = document.querySelector<HTMLSpanElement>('#status')!;
const manifestNote = document.querySelector<HTMLElement>('#manifest-note')!;
const scenarioRoster = document.querySelector<HTMLElement>('#scenario-roster')!;
const enemyHp = document.querySelector<HTMLElement>('#enemy-hp')!;
const actions = document.querySelector<HTMLElement>('#actions')!;
const events = document.querySelector<HTMLElement>('#events')!;
const hash = document.querySelector<HTMLElement>('#hash')!;
const log = document.querySelector<HTMLElement>('#log')!;
const searchResult = document.querySelector<HTMLElement>('#search-result')!;
const importStatus = document.querySelector<HTMLElement>('#import-status')!;
const shareLink = document.querySelector<HTMLElement>('#share-link')!;
const metrics = document.querySelector<HTMLElement>('.metrics')!;
const teamGrid = document.querySelector<HTMLElement>('.team-grid')!;

const scenarioIds = [
  'memory-of-chaos-4.4-abstracted',
  'apocalyptic-shadow-4.4-abstracted',
  'pure-fiction-4.4-abstracted',
  'turnbased-stage-30124121',
  'turnbased-stage-30501011',
  'turnbased-stage-30501012',
] as const;

let locale: Locale = readLocale();
let latestShareToken: string | undefined;
let importedRelics: readonly RelicInstanceData[] = [];
let importedLightConeIds: readonly string[] = [];
let characterCatalogs: Partial<Record<Locale, readonly CharacterCatalogRecord[]>> = {};
let nameCatalog = FALLBACK_NAME_CATALOG;
let manifestMeta: { revision?: string; language?: string } = {};
let latestResult: SimulationResult | undefined;
let latestLogLines: readonly string[] = [];
let busy = false;
let statusKey: UiStringKey = 'statusIdle';
let statusArgs: Record<string, string | number> = {};
let importStatusKey: UiStringKey = 'relicEmpty';
let importStatusArgs: Record<string, string | number> = {};
let enemyTemplateName = '可编辑训练敌人';

button.addEventListener('click', () => run({ kind: 'run_training_fixture' }, 'runTrainingBusy'));
scenarioButton.addEventListener('click', () => run({ kind: 'run_scenario', scenarioId: scenarioSelect.value, characterIds: teamSelects.map((select) => select.value).filter(Boolean) }, 'scenarioBusy'));
scenarioSelect.addEventListener('change', () => renderScenarioRoster());
characterButton.addEventListener('click', () => run({ kind: 'run_pinned_character', characterId: characterSelect.value }, 'characterBusy'));
searchButton.addEventListener('click', () => run({ kind: 'search_training_loadouts', relics: importedRelics, lightConeIds: importedLightConeIds }, importedRelics.length > 0 ? 'searchImportedBusy' : 'searchTrainingBusy'));
aplButton.addEventListener('click', () => run({ kind: 'run_apl', text: aplInput.value }, 'aplBusy'));
enemyButton.addEventListener('click', () => run({ kind: 'run_custom_enemy', text: enemyJson.value }, 'enemyBusy'));
languageSelect.addEventListener('change', () => {
  const next = languageSelect.value;
  if (!LOCALES.includes(next as Locale)) return;
  locale = next as Locale;
  persistLocale(locale);
  applyLocale();
});

relicImport.addEventListener('change', () => void importRelicsFromFile());
importRelicJson.addEventListener('click', () => importRelicsText(relicJson.value, '粘贴内容'));

void loadPinnedCharacterOptions();
void loadPinnedManifest();
void loadLocalizedNameCatalog();
applyLocale();

async function loadPinnedManifest(): Promise<void> {
  try {
    const response = await fetch('/data/manifest.json');
    if (!response.ok) return;
    manifestMeta = await response.json() as { revision?: string; language?: string };
    renderManifestNote();
  } catch {
    // The simulator remains usable with bundled fixture behavior if metadata is unavailable.
  }
}

async function loadLocalizedNameCatalog(): Promise<void> {
  try {
    const response = await fetch('/data/catalog-i18n.json');
    if (!response.ok) throw new Error(`catalog request failed: ${response.status}`);
    const parsed = await response.json() as LocalizedNameCatalog;
    if (!parsed.locales || typeof parsed.locales !== 'object') throw new Error('catalog has no locales');
    nameCatalog = parsed;
  } catch {
    nameCatalog = FALLBACK_NAME_CATALOG;
  }
  renderScenarioOptions();
  applyLocale();
}

async function loadPinnedCharacterOptions(): Promise<void> {
  try {
    const english = await fetchCharacterCatalog('/data/direct-characters.en.json');
    let chinese = english;
    try {
      chinese = await fetchCharacterCatalog('/data/direct-characters.zh-CN.json');
    } catch {
      // Keep the English fallback if an older prepared bundle has no cn sibling.
    }
    characterCatalogs = { en: english, 'zh-CN': chinese };
    renderCharacterOptions();
  } catch (error) {
    characterSelect.replaceChildren(new Option(error instanceof Error ? error.message : translate(locale, 'catalogUnavailable')));
    characterSelect.disabled = true;
    characterButton.disabled = true;
    teamSelects.forEach((select) => { select.disabled = true; });
    applyControlAvailability();
  }
}

async function fetchCharacterCatalog(url: string): Promise<readonly CharacterCatalogRecord[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${translate(locale, 'catalogUnavailable')}: ${response.status}`);
  const records = await response.json() as unknown;
  if (!Array.isArray(records)) throw new Error(translate(locale, 'catalogUnavailable'));
  return records.filter(isCharacterCatalogRecord);
}

function renderScenarioOptions(): void {
  const previous = scenarioSelect.value;
  const labels = nameCatalog.locales[locale]?.scenarios ?? nameCatalog.locales.en?.scenarios ?? {};
  const options = scenarioIds.map((id) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = labels[id] ?? id;
    return option;
  });
  scenarioSelect.replaceChildren(...options);
  scenarioSelect.value = retainOptionValue(previous, scenarioIds, scenarioIds[0]);
  setAriaLabels();
  renderScenarioRoster();
  applyControlAvailability();
}

function renderCharacterOptions(): void {
  const records = characterCatalogs[locale] ?? characterCatalogs.en ?? [];
  const previousCharacter = characterSelect.value;
  const previousTeam = teamSelects.map((select) => select.value);
  const createOption = (record: CharacterCatalogRecord): HTMLOptionElement => {
    const option = document.createElement('option');
    option.value = record.id;
    option.textContent = `${record.name} · ${record.id}`;
    return option;
  };
  characterSelect.replaceChildren(...records.map(createOption));
  for (const [index, select] of teamSelects.entries()) select.replaceChildren(...records.map(createOption));
  const firstIds = records.slice(0, 4).map((record) => record.id);
  const characterIds = records.map((record) => record.id);
  const preferredCharacterId = records.find((record) => record.id === '1002')?.id ?? records[0]?.id ?? '';
  characterSelect.value = retainOptionValue(previousCharacter, characterIds, preferredCharacterId);
  teamSelects.forEach((select, index) => {
    const previous = previousTeam[index];
    select.value = retainOptionValue(previous ?? '', characterIds, firstIds[index] ?? firstIds[0] ?? '');
  });
  setAriaLabels();
  applyControlAvailability();
}

function applyLocale(): void {
  document.documentElement.lang = locale;
  languageSelect.value = locale;
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = node.dataset.i18n as UiStringKey | undefined;
    if (!key || !(key in UI_TEXT.en)) continue;
    node.textContent = translate(locale, key, readDataReplacements(node));
  }
  document.title = locale === 'zh-CN' ? 'HSR Sim · 可验证战斗模拟器' : 'HSR Sim · Verifiable battle simulator';
  relicJson.placeholder = translate(locale, 'relicPlaceholder');
  setAriaLabels();
  renderScenarioOptions();
  renderScenarioRoster();
  if (Object.keys(characterCatalogs).length > 0) renderCharacterOptions();
  renderManifestNote();
  renderImportStatus();
  setStatus(statusKey, statusArgs);
  renderLog();
  renderLocalizedSummary();
  updateEnemyTemplateName();
}

function readDataReplacements(node: HTMLElement): Record<string, string> {
  const replacements: Record<string, string> = {};
  for (const [name, value] of Object.entries(node.dataset)) {
    if (!name.startsWith('i18nParam')) continue;
    const replacement = name.slice('i18nParam'.length);
    if (replacement.length > 0) replacements[replacement[0]!.toLowerCase() + replacement.slice(1)] = value ?? '';
  }
  return replacements;
}

function setAriaLabels(): void {
  languageSelect.setAttribute('aria-label', translate(locale, 'localeLabel'));
  scenarioSelect.setAttribute('aria-label', translate(locale, 'scenarioField'));
  characterSelect.setAttribute('aria-label', translate(locale, 'characterField'));
  teamGrid.setAttribute('aria-label', translate(locale, 'teamSection'));
  teamSelects.forEach((select, index) => select.setAttribute('aria-label', translate(locale, 'teamPosition', { position: index + 1 })));
  metrics.setAttribute('aria-label', translate(locale, 'metricsLabel'));
}

function renderScenarioRoster(): void {
  const enemyIds = SCENARIO_ENEMY_IDS[scenarioSelect.value] ?? [];
  const labels = nameCatalog.locales[locale]?.enemies ?? nameCatalog.locales.en?.enemies ?? {};
  if (enemyIds.length === 0) {
    scenarioRoster.textContent = translate(locale, 'enemyRosterEmpty');
    return;
  }
  const names = enemyIds.map((id) => `${labels[id] ?? id} · ${id}`);
  scenarioRoster.textContent = translate(locale, 'enemyRoster', {
    names: names.join(locale === 'zh-CN' ? '、' : ', '),
  });
}

function renderManifestNote(): void {
  if (!manifestMeta.revision) return;
  manifestNote.textContent = translate(locale, 'manifestNote', {
    revision: manifestMeta.revision.slice(0, 12),
    language: localizeManifestLanguage(locale, manifestMeta.language ?? 'en'),
  });
}

async function importRelicsFromFile(): Promise<void> {
  const file = relicImport.files?.[0];
  if (!file) return;
  setImportStatus('readingFile');
  importRelicsText(await file.text(), file.name);
}

function importRelicsText(text: string, label: string): void {
  setImportStatus('parsingRelics');
  try {
    const parsed: unknown = JSON.parse(text);
    const imported = parseScannerExport(parsed, {
      setIdByName: {},
      sourceRevision: `HSR-Scanner:${label}`,
    });
    importedRelics = imported.relics;
    importedLightConeIds = imported.lightConeIds;
    setImportStatus('relicImported', { relics: importedRelics.length, lightCones: importedLightConeIds.length });
  } catch (error) {
    importedRelics = [];
    importedLightConeIds = [];
    setImportStatus(error instanceof Error ? 'importFailed' : 'importFailedShort', error instanceof Error ? { message: error.message } : {});
  }
}

function setImportStatus(key: UiStringKey, args: Record<string, string | number> = {}): void {
  importStatusKey = key;
  importStatusArgs = args;
  renderImportStatus();
}

function renderImportStatus(): void {
  importStatus.textContent = translate(locale, importStatusKey, importStatusArgs);
}

async function run(request: Parameters<SimulationWorkerPool['run']>[0], labelKey: UiStringKey): Promise<void> {
  setBusy(true);
  setStatus(labelKey);
  try {
    const result = await pool.run(request);
    renderResult(result);
    setStatus(result.replayVerified === undefined ? 'done' : result.replayVerified ? 'doneVerified' : 'doneMismatch');
  } catch (error) {
    setStatus('failed', { message: error instanceof Error ? error.message : translate(locale, 'failed', { message: 'unknown error' }) });
  } finally {
    setBusy(false);
  }
}

function renderResult(result: SimulationResult): void {
  latestResult = result;
  latestLogLines = result.lines;
  enemyHp.textContent = String(result.enemyHp);
  actions.textContent = String(result.actions);
  events.textContent = String(result.events);
  hash.textContent = result.hash;
  latestShareToken = result.shareToken;
  shareLink.textContent = latestShareToken ? `${location.origin}${location.pathname}#state=${latestShareToken}` : '';
  renderLog();
  renderLocalizedSummary();
}

function renderLog(): void {
  log.textContent = latestLogLines.length > 0 ? localizeEventLines(locale, latestLogLines).join('\n') : translate(locale, 'logEmpty');
}

function renderLocalizedSummary(): void {
  if (!latestResult) {
    searchResult.textContent = '';
    return;
  }
  if (latestResult.scenario) {
    const score = latestResult.scenario.score === undefined
      ? ''
      : translate(locale, 'scoreSuffix', { score: latestResult.scenario.score });
    searchResult.textContent = translate(locale, 'resultScenario', {
      mode: localizedScenarioMode(latestResult.scenario.mode),
      version: latestResult.scenario.version,
      waves: latestResult.scenario.waves,
      stoppedBecause: localizeStopReason(locale, latestResult.scenario.stoppedBecause),
      score,
    });
    return;
  }
  if (latestResult.search) {
    const imported = latestResult.search.usedImportedRelics
      ? translate(locale, 'importedRelics', { count: latestResult.search.usedImportedRelics })
      : '';
    searchResult.textContent = translate(locale, 'resultSearch', {
      candidates: latestResult.search.candidates,
      retained: latestResult.search.retained,
      bestId: latestResult.search.bestId ?? '·',
      bestScore: latestResult.search.bestScore ?? '·',
      bestEnemyHp: latestResult.search.bestEnemyHp ?? latestResult.enemyHp,
      imported,
    });
    return;
  }
  searchResult.textContent = '';
}

function localizedScenarioMode(mode: string): string {
  switch (mode) {
    case 'memory_of_chaos': return translate(locale, 'memoryOfChaos');
    case 'apocalyptic_shadow': return translate(locale, 'apocalypticShadow');
    case 'pure_fiction': return translate(locale, 'pureFiction');
    default: return translate(locale, 'abstractedMode');
  }
}

function setStatus(key: UiStringKey, args: Record<string, string | number> = {}): void {
  statusKey = key;
  statusArgs = args;
  status.textContent = translate(locale, key, args);
}

function setBusy(nextBusy: boolean): void {
  busy = nextBusy;
  applyControlAvailability();
}

function applyControlAvailability(): void {
  const availableCharacters = characterCatalogs[locale]?.length ?? characterCatalogs.en?.length ?? 0;
  const availability = computeControlAvailability({
    busy,
    scenarioCount: scenarioSelect.options.length,
    characterCount: availableCharacters,
    hasShareToken: Boolean(latestShareToken),
  });
  button.disabled = !availability.actionsEnabled;
  languageSelect.disabled = !availability.actionsEnabled;
  scenarioSelect.disabled = !availability.scenarioEnabled;
  scenarioButton.disabled = !availability.scenarioButtonEnabled;
  teamSelects.forEach((select) => { select.disabled = !availability.teamEnabled || select.options.length === 0; });
  characterSelect.disabled = !availability.characterEnabled;
  characterButton.disabled = !availability.characterButtonEnabled;
  searchButton.disabled = !availability.actionsEnabled;
  aplButton.disabled = !availability.actionsEnabled;
  enemyButton.disabled = !availability.actionsEnabled;
  shareButton.disabled = !availability.shareEnabled;
}

shareButton.addEventListener('click', async () => {
  if (!latestShareToken) return;
  const url = `${location.origin}${location.pathname}#state=${latestShareToken}`;
  try {
    await navigator.clipboard.writeText(url);
    setStatus('copied');
  } catch {
    setStatus('copyManually');
  }
});

void loadShareableReplay();
window.addEventListener('hashchange', () => void loadShareableReplay());

async function loadShareableReplay(): Promise<void> {
  const prefix = '#state=';
  if (!location.hash.startsWith(prefix)) return;
  const token = location.hash.slice(prefix.length);
  if (!token) return;
  setBusy(true);
  setStatus('shareChecking');
  try {
    const result = await pool.run({ kind: 'verify_share', shareToken: token });
    renderResult(result);
    latestShareToken = token;
    shareLink.textContent = `${location.origin}${location.pathname}#state=${token}`;
    setStatus(result.replayVerified ? 'shareVerified' : 'shareMismatch');
  } catch (error) {
    setStatus('shareFailed', { message: error instanceof Error ? error.message : 'unknown error' });
  } finally {
    setBusy(false);
  }
}

function updateEnemyTemplateName(): void {
  try {
    const value = JSON.parse(enemyJson.value) as { id?: string; name?: string };
    if (value.id !== 'web_enemy' || (value.name !== enemyTemplateName && value.name !== 'Editable training enemy')) return;
    value.name = locale === 'zh-CN' ? '可编辑训练敌人' : 'Editable training enemy';
    enemyTemplateName = value.name;
    enemyJson.value = JSON.stringify(value, null, 2);
  } catch {
    // An invalid user draft must stay untouched while the interface language changes.
  }
}

function isCharacterCatalogRecord(value: unknown): value is CharacterCatalogRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && typeof (value as { id?: unknown }).id === 'string'
    && typeof (value as { name?: unknown }).name === 'string'
    && Array.isArray((value as { abilities?: unknown }).abilities);
}

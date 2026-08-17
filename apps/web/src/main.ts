import './style.css';
import { parseScannerExport, type RelicInstanceData } from '@hsr-sim/data';
import { SimulationWorkerPool, type SimulationResult } from './worker-pool.js';

const pool = new SimulationWorkerPool();
const button = document.querySelector<HTMLButtonElement>('#run')!;
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
const enemyHp = document.querySelector<HTMLElement>('#enemy-hp')!;
const actions = document.querySelector<HTMLElement>('#actions')!;
const events = document.querySelector<HTMLElement>('#events')!;
const hash = document.querySelector<HTMLElement>('#hash')!;
const log = document.querySelector<HTMLElement>('#log')!;
const searchResult = document.querySelector<HTMLElement>('#search-result')!;
const importStatus = document.querySelector<HTMLElement>('#import-status')!;
const shareLink = document.querySelector<HTMLElement>('#share-link')!;
let latestShareToken: string | undefined;
let importedRelics: readonly RelicInstanceData[] = [];
let importedLightConeIds: readonly string[] = [];

button.addEventListener('click', () => run({ kind: 'run_training_fixture' }, 'Worker 池运行中…'));
scenarioButton.addEventListener('click', () => run({ kind: 'run_scenario', scenarioId: scenarioSelect.value, characterIds: teamSelects.map((select) => select.value).filter(Boolean) }, '四人队场景波次运行中…'));
characterButton.addEventListener('click', () => run({ kind: 'run_pinned_character', characterId: characterSelect.value }, '固定数据角色运行中…'));
searchButton.addEventListener('click', () => run({ kind: 'search_training_loadouts', relics: importedRelics, lightConeIds: importedLightConeIds }, importedRelics.length > 0 ? '搜索导入配装中…' : '搜索训练配装中…'));
aplButton.addEventListener('click', () => run({ kind: 'run_apl', text: aplInput.value }, 'APL 运行中…'));
enemyButton.addEventListener('click', () => run({ kind: 'run_custom_enemy', text: enemyJson.value }, '自定义敌人运行中…'));

void loadPinnedCharacterOptions();
void loadPinnedManifest();

async function loadPinnedManifest(): Promise<void> {
  try {
    const response = await fetch('/data/manifest.json');
    if (!response.ok) return;
    const manifest = await response.json() as { revision?: string; language?: string };
    const lede = document.querySelector<HTMLElement>('.lede');
    if (lede && manifest.revision) lede.textContent = `固定数据 ${manifest.revision.slice(0, 12)} · ${manifest.language ?? 'en'}；抽象规则纵向切片，确定性 RNG、事件回放和 Worker 执行。`;
  } catch {
    // The simulator remains usable with bundled fixture behavior if metadata is unavailable.
  }
}

async function loadPinnedCharacterOptions(): Promise<void> {
  try {
    const response = await fetch(new URL(/* @vite-ignore */ '../data/direct-characters.json', import.meta.url));
    if (!response.ok) throw new Error(`固定角色目录加载失败：${response.status}`);
    const records = await response.json() as Array<{ id: string; name: string; abilities: Array<{ id: string }> }>;
    const options = records.map((record) => {
      const option = document.createElement('option');
      option.value = record.id;
      option.textContent = `${record.name} · ${record.id}`;
      return option;
    });
    characterSelect.replaceChildren(...options.map((option) => option.cloneNode(true)));
    for (const select of teamSelects) select.replaceChildren(...options.map((option) => option.cloneNode(true)));
    characterSelect.value = records.find((record) => record.id === '1002')?.id ?? records[0]?.id ?? '';
    const defaults = records.slice(0, 4).map((record) => record.id);
    teamSelects.forEach((select, index) => { select.value = defaults[index] ?? defaults[0] ?? ''; });
    characterSelect.disabled = records.length === 0;
    characterButton.disabled = records.length === 0;
    teamSelects.forEach((select) => { select.disabled = records.length === 0; });
  } catch (error) {
    characterSelect.replaceChildren(new Option(error instanceof Error ? error.message : '固定角色目录不可用'));
  }
}

relicImport.addEventListener('change', () => void importRelicsFromFile());
importRelicJson.addEventListener('click', () => importRelicsText(relicJson.value, '粘贴内容'));

async function importRelicsFromFile(): Promise<void> {
  const file = relicImport.files?.[0];
  if (!file) return;
  importStatus.textContent = '读取中…';
  importRelicsText(await file.text(), file.name);
}

function importRelicsText(text: string, label: string): void {
  importStatus.textContent = '解析中…';
  try {
    const parsed: unknown = JSON.parse(text);
    const imported = parseScannerExport(parsed, {
      // HSR-Scanner exports with stable set IDs are accepted directly. A
      // localized-name map can be supplied later without changing the model.
      setIdByName: {},
      sourceRevision: `HSR-Scanner:${label}`,
    });
    importedRelics = imported.relics;
    importedLightConeIds = imported.lightConeIds;
    importStatus.textContent = `已导入 ${importedRelics.length} 件遗器、${importedLightConeIds.length} 个光锥；搜索会使用这些数据`;
  } catch (error) {
    importedRelics = [];
    importedLightConeIds = [];
    importStatus.textContent = error instanceof Error ? `导入失败：${error.message}` : '导入失败';
  }
}

async function run(request: Parameters<SimulationWorkerPool['run']>[0], label: string): Promise<void> {
  setBusy(true);
  status.textContent = label;
  try {
    const result = await pool.run(request);
    renderResult(result);
    status.textContent = result.replayVerified === undefined ? '完成' : result.replayVerified ? '完成（回放已验证）' : '完成（回放不一致）';
  } catch (error) {
    status.textContent = error instanceof Error ? `失败：${error.message}` : '失败';
  } finally {
    setBusy(false);
  }
}

function renderResult(result: SimulationResult): void {
  enemyHp.textContent = String(result.enemyHp);
  actions.textContent = String(result.actions);
  events.textContent = String(result.events);
  hash.textContent = result.hash;
  latestShareToken = result.shareToken;
  shareButton.disabled = !latestShareToken;
  shareLink.textContent = latestShareToken ? `${location.origin}${location.pathname}#state=${latestShareToken}` : '';
  log.textContent = result.lines.join('\n');
  searchResult.textContent = result.search
    ? `粗筛 ${result.search.candidates} 个候选，精算 ${result.search.retained} 个；最佳候选 ${result.search.bestId ?? '—'}，完整战斗分数 ${result.search.bestScore ?? '—'}，模拟后敌方 HP ${result.search.bestEnemyHp ?? result.enemyHp}${result.search.usedImportedRelics ? `（使用 ${result.search.usedImportedRelics} 件导入遗器）` : ''}`
    : '';
  if (result.scenario) {
    searchResult.textContent = `${result.scenario.mode} · ${result.scenario.version} · ${result.scenario.waves} 波次 · ${result.scenario.stoppedBecause}${result.scenario.score === undefined ? '' : ` · 分数 ${result.scenario.score}`}`;
  }
}

function setBusy(busy: boolean): void {
  button.disabled = busy;
  scenarioSelect.disabled = busy;
  scenarioButton.disabled = busy;
  teamSelects.forEach((select) => { select.disabled = busy || select.options.length === 0; });
  characterSelect.disabled = busy || characterSelect.options.length === 0;
  characterButton.disabled = busy || characterSelect.options.length === 0;
  searchButton.disabled = busy;
  aplButton.disabled = busy;
  enemyButton.disabled = busy;
  shareButton.disabled = busy || !latestShareToken;
}

shareButton.addEventListener('click', async () => {
  if (!latestShareToken) return;
  const url = `${location.origin}${location.pathname}#state=${latestShareToken}`;
  try {
    await navigator.clipboard.writeText(url);
    status.textContent = '状态链接已复制';
  } catch {
    status.textContent = '链接已生成，请手动复制';
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
  status.textContent = '分享回放校验中…';
  try {
    const result = await pool.run({ kind: 'verify_share', shareToken: token });
    renderResult(result);
    latestShareToken = token;
    shareButton.disabled = false;
    shareLink.textContent = `${location.origin}${location.pathname}#state=${token}`;
    status.textContent = result.replayVerified ? '分享回放已验证' : '分享回放不一致';
  } catch (error) {
    status.textContent = error instanceof Error ? `分享回放失败：${error.message}` : '分享回放失败';
  } finally {
    setBusy(false);
    shareButton.disabled = !latestShareToken;
  }
}

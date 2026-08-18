export type Locale = 'zh-CN' | 'en';

export const LOCALE_STORAGE_KEY = 'hsr-sim.ui-locale';

export const LOCALES: readonly Locale[] = ['zh-CN', 'en'];

export const UI_TEXT = {
  'zh-CN': {
    eyebrow: 'HSR SIM / 规则集 0.1',
    title: '可验证的战斗模拟器',
    lede: '固定数据、抽象规则纵向切片、确定性 RNG、事件回放和 Worker 执行。',
    localeLabel: '界面语言',
    localeZh: '简体中文',
    localeEn: 'English',
    workbenchKicker: 'SIMULATION WORKBENCH',
    workbenchTitle: '配置一次，复现每次',
    workbenchDescription: '选择场景和角色，运行同一套固定数据与规则。所有内部 ID 保持不变，名称按界面语言显示。',
    trainingSection: '训练场景',
    scenarioField: '运行场景',
    scenarioPlaceholder: '加载场景目录…',
    enemyRoster: '敌人编队：{names}',
    enemyRosterEmpty: '敌人编队：由场景定义提供',
    runTraining: '运行训练场景',
    runScenario: '运行场景',
    characterField: '固定数据角色',
    characterPlaceholder: '加载固定角色目录…',
    runCharacter: '运行固定数据角色',
    searchLoadouts: '搜索训练配装',
    copyLink: '复制状态链接',
    statusIdle: '等待运行',
    aplSection: '动作优先级脚本',
    aplLabel: 'APL 优先级脚本',
    runApl: '运行 APL',
    teamSection: '四人队伍配置',
    teamHint: '场景运行',
    teamPosition: '队伍位置 {position}',
    loading: '加载中…',
    relicSection: '遗器与配装导入',
    relicFileLabel: '导入 HSR-Scanner 遗器 JSON',
    relicPasteLabel: '也可以直接粘贴 JSON',
    relicPlaceholder: '{"relics":[…]}',
    parseRelics: '解析粘贴的遗器',
    relicEmpty: '未导入遗器',
    relicImported: '已导入 {relics} 件遗器、{lightCones} 个光锥；搜索会使用这些数据',
    readingFile: '读取中…',
    parsingRelics: '解析中…',
    importFailed: '导入失败：{message}',
    importFailedShort: '导入失败',
    catalogUnavailable: '固定角色目录不可用',
    enemySection: '参数化敌人',
    enemyJsonLabel: '参数化敌人 JSON',
    runEnemy: '运行自定义敌人',
    metricsEnemyHp: '敌方剩余 HP',
    metricsActions: '动作数',
    metricsEvents: '事件数',
    metricsHash: '状态 Hash',
    metricsLabel: '模拟指标',
    logEmpty: '点击按钮开始。',
    footer: '本项目当前标记为 abstracted，不宣称与游戏客户端 1:1 一致。',
    runTrainingBusy: 'Worker 池运行中…',
    scenarioBusy: '四人队场景波次运行中…',
    characterBusy: '固定数据角色运行中…',
    searchImportedBusy: '搜索导入配装中…',
    searchTrainingBusy: '搜索训练配装中…',
    aplBusy: 'APL 运行中…',
    enemyBusy: '自定义敌人运行中…',
    done: '完成',
    doneVerified: '完成（回放已验证）',
    doneMismatch: '完成（回放不一致）',
    failed: '失败：{message}',
    copied: '状态链接已复制',
    copyManually: '链接已生成，请手动复制',
    shareChecking: '分享回放校验中…',
    shareVerified: '分享回放已验证',
    shareMismatch: '分享回放不一致',
    shareFailed: '分享回放失败：{message}',
    manifestNote: '固定数据 {revision} · {language}；抽象规则纵向切片、确定性 RNG、事件回放和 Worker 执行。',
    resultSearch: '粗筛 {candidates} 个候选，精算 {retained} 个；最佳候选 {bestId}，完整战斗分数 {bestScore}，模拟后敌方 HP {bestEnemyHp}{imported}',
    resultScenario: '{mode} · {version} · {waves} 波次 · {stoppedBecause}{score}',
    importedRelics: '（使用 {count} 件导入遗器）',
    scoreSuffix: ' · 分数 {score}',
    abstractedMode: '抽象规则',
    memoryOfChaos: '忘却之庭',
    apocalypticShadow: '末日幻影',
    pureFiction: '虚构叙事',
    runStatusComplete: '完成',
    runStatusStopped: '已停止',
    runStatusDefeat: '战斗失败',
    noCommand: '没有可执行指令',
    policyExhausted: '策略已耗尽',
    maxActionsReached: '达到动作上限',
    unknownStopReason: '未知停止原因：{reason}',
  },
  en: {
    eyebrow: 'HSR SIM / RULESET 0.1',
    title: 'A verifiable battle simulator',
    lede: 'Pinned data, an abstracted vertical slice, deterministic RNG, event replay, and Worker execution.',
    localeLabel: 'Interface language',
    localeZh: '简体中文',
    localeEn: 'English',
    workbenchKicker: 'SIMULATION WORKBENCH',
    workbenchTitle: 'Configure once, reproduce every run',
    workbenchDescription: 'Choose a scenario and team, then run the same pinned data and rules. Internal IDs stay stable while names follow the interface language.',
    trainingSection: 'Training scenarios',
    scenarioField: 'Run scenario',
    scenarioPlaceholder: 'Loading scenario catalog…',
    enemyRoster: 'Enemy roster: {names}',
    enemyRosterEmpty: 'Enemy roster: supplied by the scenario definition',
    runTraining: 'Run training scene',
    runScenario: 'Run scenario',
    characterField: 'Pinned character',
    characterPlaceholder: 'Loading character catalog…',
    runCharacter: 'Run pinned character',
    searchLoadouts: 'Search training builds',
    copyLink: 'Copy state link',
    statusIdle: 'Ready',
    aplSection: 'Action priority script',
    aplLabel: 'APL priority script',
    runApl: 'Run APL',
    teamSection: 'Four-person team',
    teamHint: 'used for scenario runs',
    teamPosition: 'Team slot {position}',
    loading: 'Loading…',
    relicSection: 'Relic and build import',
    relicFileLabel: 'Import HSR-Scanner relic JSON',
    relicPasteLabel: 'Or paste JSON directly',
    relicPlaceholder: '{"relics":[…]}',
    parseRelics: 'Parse pasted relics',
    relicEmpty: 'No relics imported',
    relicImported: '{relics} relics and {lightCones} light cones imported; searches will use this data',
    readingFile: 'Reading…',
    parsingRelics: 'Parsing…',
    importFailed: 'Import failed: {message}',
    importFailedShort: 'Import failed',
    catalogUnavailable: 'Pinned character catalog unavailable',
    enemySection: 'Parameterized enemy',
    enemyJsonLabel: 'Parameterized enemy JSON',
    runEnemy: 'Run custom enemy',
    metricsEnemyHp: 'Enemy HP remaining',
    metricsActions: 'Actions',
    metricsEvents: 'Events',
    metricsHash: 'State hash',
    metricsLabel: 'Simulation metrics',
    logEmpty: 'Click a button to start.',
    footer: 'This project is currently marked abstracted and does not claim 1:1 parity with the game client.',
    runTrainingBusy: 'Worker pool running…',
    scenarioBusy: 'Running four-person scenario waves…',
    characterBusy: 'Running pinned character…',
    searchImportedBusy: 'Searching imported builds…',
    searchTrainingBusy: 'Searching training builds…',
    aplBusy: 'Running APL…',
    enemyBusy: 'Running custom enemy…',
    done: 'Done',
    doneVerified: 'Done (replay verified)',
    doneMismatch: 'Done (replay mismatch)',
    failed: 'Failed: {message}',
    copied: 'State link copied',
    copyManually: 'Link generated. Copy it manually.',
    shareChecking: 'Checking shared replay…',
    shareVerified: 'Shared replay verified',
    shareMismatch: 'Shared replay mismatch',
    shareFailed: 'Shared replay failed: {message}',
    manifestNote: 'Pinned data {revision} · {language}; abstracted vertical slice, deterministic RNG, event replay, and Worker execution.',
    resultSearch: 'Coarse scan {candidates} candidates, exact simulation {retained}; best candidate {bestId}, full-run score {bestScore}, simulated enemy HP {bestEnemyHp}{imported}',
    resultScenario: '{mode} · {version} · {waves} waves · {stoppedBecause}{score}',
    importedRelics: ' ({count} imported relics)',
    scoreSuffix: ' · score {score}',
    abstractedMode: 'Abstracted rules',
    memoryOfChaos: 'Memory of Chaos',
    apocalypticShadow: 'Apocalyptic Shadow',
    pureFiction: 'Pure Fiction',
    runStatusComplete: 'Complete',
    runStatusStopped: 'Stopped',
    runStatusDefeat: 'Defeat',
    noCommand: 'No command',
    policyExhausted: 'Policy exhausted',
    maxActionsReached: 'Action limit reached',
    unknownStopReason: 'Unknown stop reason: {reason}',
  },
} as const;

export type UiStringKey = keyof typeof UI_TEXT.en;

export function translate(locale: Locale, key: UiStringKey, replacements: Record<string, string | number> = {}): string {
  const template = UI_TEXT[locale][key] ?? UI_TEXT.en[key];
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(replacements[name] ?? `{${name}}`));
}

export function readLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return stored === 'en' || stored === 'zh-CN' ? stored : 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

export function persistLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private browsing and embedded preview contexts can deny storage access.
  }
}

const SOURCE_LANGUAGE_LABELS: Record<Locale, Record<string, string>> = {
  'zh-CN': {
    en: '英文数据源',
    cn: '中文数据源',
    'zh-CN': '中文数据源',
    zh: '中文数据源',
  },
  en: {
    en: 'English source',
    cn: 'Chinese source',
    'zh-CN': 'Chinese source',
    zh: 'Chinese source',
  },
};

export function localizeManifestLanguage(locale: Locale, language: string): string {
  const normalized = language.trim();
  return SOURCE_LANGUAGE_LABELS[locale][normalized] ?? (locale === 'zh-CN' ? `${normalized} 数据源` : `${normalized} source`);
}

const EVENT_LABELS: Record<string, readonly [string, string]> = {
  BATTLE_START: ['战斗开始', 'Battle started'],
  WAVE_START: ['波次开始', 'Wave started'],
  WAVE_END: ['波次结束', 'Wave ended'],
  CYCLE_START: ['周期开始', 'Cycle started'],
  TURN_BEGIN: ['回合开始', 'Turn began'],
  ENEMY_TURN_BEGIN: ['敌方回合开始', 'Enemy turn began'],
  ACTION_STARTED: ['动作开始', 'Action started'],
  BEFORE_ACTION: ['动作前', 'Before action'],
  BASIC_USED: ['使用普攻', 'Basic used'],
  SKILL_USED: ['使用战技', 'Skill used'],
  ULT_USED: ['使用终结技', 'Ultimate used'],
  FOLLOW_UP_USED: ['使用追加攻击', 'Follow-up used'],
  TECHNIQUE_USED: ['使用秘技', 'Technique used'],
  ENEMY_ATTACK: ['敌方攻击', 'Enemy attack'],
  INSERT_ACTION_START: ['插入动作开始', 'Inserted action started'],
  INSERT_ACTION_END: ['插入动作结束', 'Inserted action ended'],
  AFTER_ACTION: ['动作后', 'After action'],
  TURN_END: ['回合结束', 'Turn ended'],
  BATTLE_END: ['战斗结束', 'Battle ended'],
  ACTION_BLOCKED: ['动作被阻止', 'Action blocked'],
  BEFORE_HIT: ['命中前', 'Before hit'],
  AFTER_HIT: ['命中后', 'After hit'],
  BEFORE_DAMAGE: ['伤害前', 'Before damage'],
  DAMAGE_DEALT: ['造成伤害', 'Damage dealt'],
  AFTER_DAMAGE: ['伤害后', 'After damage'],
  CRIT_OCCURRED: ['暴击发生', 'Critical hit'],
  SHIELD_APPLIED: ['施加护盾', 'Shield applied'],
  SHIELD_ABSORBED: ['护盾吸收', 'Shield absorbed'],
  SHIELD_BROKEN: ['护盾破裂', 'Shield broken'],
  SHIELD_EXPIRED: ['护盾失效', 'Shield expired'],
  STATUS_REMOVED: ['移除状态', 'Status removed'],
  STATUS_APPLIED: ['施加状态', 'Status applied'],
  STATUS_RESISTED: ['状态抵抗', 'Status resisted'],
  STATUS_EXPIRED: ['状态失效', 'Status expired'],
  TOUGHNESS_REDUCED: ['削减韧性', 'Toughness reduced'],
  TOUGHNESS_RECOVERED: ['恢复韧性', 'Toughness recovered'],
  WEAKNESS_IMPLANTED: ['植入弱点', 'Weakness implanted'],
  WEAKNESS_BREAK: ['弱点击破', 'Weakness break'],
  BREAK_DMG_DEALT: ['击破伤害', 'Break damage'],
  BREAK_RECOVERED: ['击破恢复', 'Break recovered'],
  KILL: ['击杀', 'Kill'],
  BEFORE_HEAL: ['治疗前', 'Before heal'],
  HEAL_APPLIED: ['施加治疗', 'Heal applied'],
  AFTER_HEAL: ['治疗后', 'After heal'],
  UNIT_REVIVED: ['单位复活', 'Unit revived'],
  HP_CHANGED: ['生命值变化', 'HP changed'],
  HP_LOSS: ['生命值减少', 'HP lost'],
  ENERGY_CHANGED: ['能量变化', 'Energy changed'],
  ENERGY_GAINED: ['获得能量', 'Energy gained'],
  ENERGY_SPENT: ['消耗能量', 'Energy spent'],
  SP_CHANGED: ['战技点变化', 'Skill points changed'],
  MODIFIER_APPLIED: ['施加增益', 'Modifier applied'],
  CUSTOM_CHANGED: ['自定义状态变化', 'Custom state changed'],
  MODIFIER_REMOVED: ['移除增益', 'Modifier removed'],
  MODIFIER_EXPIRED: ['增益失效', 'Modifier expired'],
  DOT_APPLIED: ['施加持续伤害', 'DoT applied'],
  DOT_TICK: ['持续伤害触发', 'DoT tick'],
  DOT_DETONATED: ['持续伤害引爆', 'DoT detonated'],
  DOT_EXPIRED: ['持续伤害失效', 'DoT expired'],
  DEBUFF_RESISTED: ['减益抵抗', 'Debuff resisted'],
  ACTION_SCHEDULED: ['安排动作', 'Action scheduled'],
  ACTION_ADVANCED: ['行动提前', 'Action advanced'],
  ACTION_DELAYED: ['行动延后', 'Action delayed'],
  SPD_CHANGED: ['速度变化', 'Speed changed'],
  UNIT_DEFEATED: ['单位被击败', 'Unit defeated'],
  ALLY_DOWNED: ['我方倒下', 'Ally downed'],
  ENEMY_DEFEATED: ['敌方被击败', 'Enemy defeated'],
  PHASE_ENTERED: ['进入阶段', 'Phase entered'],
  UNIT_SUMMONED: ['召唤单位', 'Unit summoned'],
  ENEMY_SUMMONED: ['召唤敌人', 'Enemy summoned'],
};

function humanizeToken(value: string, locale: Locale): string {
  const human = value
    .trim()
    .replace(/^[`']|[`']$/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
  return locale === 'zh-CN' ? human : human;
}

function localizeLogFields(locale: Locale, value: string): string {
  const labels: Record<Locale, Record<string, string>> = {
    'zh-CN': {
      source: '来源', target: '目标', actor: '行动者', ability: '能力', amount: '数值', value: '数值',
      status: '状态', id: 'ID', wave: '波次', cycle: '周期', element: '属性', damageType: '伤害类型',
      duration: '持续', stacks: '层数', reason: '原因', critical: '暴击',
    },
    en: {
      source: 'Source', target: 'Target', actor: 'Actor', ability: 'Ability', amount: 'Amount', value: 'Value',
      status: 'Status', id: 'ID', wave: 'Wave', cycle: 'Cycle', element: 'Element', damageType: 'Damage type',
      duration: 'Duration', stacks: 'Stacks', reason: 'Reason', critical: 'Critical',
    },
  };
  return value.replace(/\b(source|target|actor|ability|amount|value|status|id|wave|cycle|element|damageType|duration|stacks|reason|critical)\b/g, (token) => labels[locale][token] ?? token);
}

export function localizeStopReason(locale: Locale, reason: string | undefined): string {
  switch (reason) {
    case 'all_waves_cleared':
    case 'all_enemies_defeated': return translate(locale, 'runStatusComplete');
    case 'no_command': return translate(locale, 'noCommand');
    case 'policy_exhausted': return translate(locale, 'policyExhausted');
    case 'max_actions': return translate(locale, 'maxActionsReached');
    default: return translate(locale, 'unknownStopReason', { reason: humanizeToken(reason || 'unknown', locale) });
  }
}

export function localizeEventLine(locale: Locale, line: string): string {
  const match = /^(\s*\d+)\s+(.+)$/.exec(line);
  if (!match) return line;
  const sequence = match[1]!.trim();
  const body = match[2]!.trim();
  const eventMatch = /^([A-Z][A-Z0-9_]+)(.*)$/.exec(body);
  if (eventMatch) {
    const [, type, suffix] = eventMatch;
    const label = EVENT_LABELS[type!]?.[locale === 'zh-CN' ? 0 : 1]
      ?? (locale === 'zh-CN' ? `事件：${humanizeToken(type!, locale)}` : `Event: ${humanizeToken(type!, locale)}`);
    const localizedSuffix = suffix?.trim() ? localizeLogFields(locale, suffix.trim()) : '';
    return `${sequence} ${label}${localizedSuffix ? ` ${localizedSuffix}` : ''}`;
  }
  const prefix = /^(伤害|增益|击破)(?:\s+|$)/.exec(body);
  if (prefix) {
    const labels = locale === 'zh-CN'
      ? { 伤害: '伤害', 增益: '增益', 击破: '击破' }
      : { 伤害: 'Damage', 增益: 'Modifier applied', 击破: 'Weakness break' };
    const remainder = localizeLogFields(locale, body.slice(prefix[0].length));
    return `${sequence} ${labels[prefix[1] as keyof typeof labels]}${remainder ? ` ${remainder}` : ''}`;
  }
  return `${sequence} ${body}`;
}

export function localizeEventLines(locale: Locale, lines: readonly string[]): string[] {
  return lines.map((line) => localizeEventLine(locale, line));
}

export interface ControlAvailability {
  scenarioEnabled: boolean;
  scenarioButtonEnabled: boolean;
  characterEnabled: boolean;
  characterButtonEnabled: boolean;
  teamEnabled: boolean;
  actionsEnabled: boolean;
  shareEnabled: boolean;
}

export function computeControlAvailability(input: { busy: boolean; scenarioCount: number; characterCount: number; hasShareToken: boolean }): ControlAvailability {
  const scenarioReady = input.scenarioCount > 0;
  const characterReady = input.characterCount > 0;
  return {
    scenarioEnabled: !input.busy && scenarioReady,
    scenarioButtonEnabled: !input.busy && scenarioReady,
    characterEnabled: !input.busy && characterReady,
    characterButtonEnabled: !input.busy && characterReady,
    teamEnabled: !input.busy && characterReady,
    actionsEnabled: !input.busy,
    shareEnabled: !input.busy && input.hasShareToken,
  };
}

export function retainOptionValue(previous: string, availableIds: readonly string[], fallback: string): string {
  return availableIds.includes(previous) ? previous : fallback;
}

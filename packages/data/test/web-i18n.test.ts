import { afterEach, describe, expect, test } from 'vitest';
import {
  computeControlAvailability,
  localizeEventLine,
  localizeEventLines,
  localizeManifestLanguage,
  localizeStopReason,
  persistLocale,
  readLocale,
  retainOptionValue,
  translate,
} from '../../../apps/web/src/i18n.js';

interface MockWindow {
  localStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
}

const originalWindow = (globalThis as typeof globalThis & { window?: MockWindow }).window;

afterEach(() => {
  if (originalWindow === undefined) delete (globalThis as typeof globalThis & { window?: MockWindow }).window;
  else (globalThis as typeof globalThis & { window?: MockWindow }).window = originalWindow;
});

describe('web locale and presentation helpers', () => {
  test('defaults to Simplified Chinese and persists a selected locale', () => {
    const values = new Map<string, string>();
    (globalThis as typeof globalThis & { window?: MockWindow }).window = {
      localStorage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value); },
      },
    };
    expect(readLocale()).toBe('zh-CN');
    persistLocale('en');
    expect(readLocale()).toBe('en');
    values.set('hsr-sim.ui-locale', 'invalid');
    expect(readLocale()).toBe('zh-CN');
  });

  test('retains internal select IDs across localized option labels', () => {
    expect(retainOptionValue('1002', ['1001', '1002'], '1001')).toBe('1002');
    expect(retainOptionValue('Dan Heng', ['1001', '1002'], '1001')).toBe('1001');
  });

  test('localizes event names, common training prefixes, and unknown event fallback', () => {
    expect(localizeEventLine('zh-CN', '01 ACTION_STARTED')).toBe('01 动作开始');
    expect(localizeEventLine('zh-CN', '02 DAMAGE_DEALT')).toBe('02 造成伤害');
    expect(localizeEventLine('zh-CN', '03 DAMAGE_DEALT source=alice target=bob')).toBe('03 造成伤害 来源=alice 目标=bob');
    expect(localizeEventLine('en', '03 伤害 striker -> enemy: 42')).toBe('03 Damage striker -> enemy: 42');
    expect(localizeEventLine('zh-CN', '04 FUTURE_EVENT_KIND')).toBe('04 事件：Future Event Kind');
    expect(localizeEventLines('en', ['01 BATTLE_START', '02 ACTION_STARTED'])).toEqual(['01 Battle started', '02 Action started']);
  });

  test('renders readable localized stop and manifest source labels', () => {
    expect(localizeStopReason('zh-CN', 'future_reason')).toBe('未知停止原因：Future Reason');
    expect(localizeStopReason('en', 'future_reason')).toBe('Unknown stop reason: Future Reason');
    expect(localizeManifestLanguage('zh-CN', 'en')).toBe('英文数据源');
    expect(localizeManifestLanguage('en', 'cn')).toBe('Chinese source');
    expect(localizeManifestLanguage('en', 'future')).toBe('future source');
    expect(translate('zh-CN', 'manifestNote', { revision: 'abc', language: localizeManifestLanguage('zh-CN', 'en') })).toContain('· 英文数据源；');
    expect(translate('en', 'manifestNote', { revision: 'abc', language: localizeManifestLanguage('en', 'en') })).toContain('· English source;');
  });

  test('keeps every control disabled while a run is busy', () => {
    expect(computeControlAvailability({ busy: true, scenarioCount: 6, characterCount: 95, hasShareToken: true })).toEqual({
      scenarioEnabled: false,
      scenarioButtonEnabled: false,
      characterEnabled: false,
      characterButtonEnabled: false,
      teamEnabled: false,
      actionsEnabled: false,
      shareEnabled: false,
    });
    expect(computeControlAvailability({ busy: false, scenarioCount: 6, characterCount: 95, hasShareToken: true }).shareEnabled).toBe(true);
  });
});

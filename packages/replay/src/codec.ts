import { cloneBattleState } from '@hsr-sim/engine';
import type {
  BattleState,
  JsonValue,
  StatSheet,
} from '@hsr-sim/engine';

export interface EncodedStatSheet {
  base: number[];
  percent: number[];
  flat: number[];
}

export interface EncodedBattleState extends Omit<BattleState, 'units'> {
  units: Array<Omit<BattleState['units'][number], 'stats'> & { stats: EncodedStatSheet }>;
}

export function encodeState(state: BattleState): EncodedBattleState {
  return {
    ...cloneBattleState(state),
    units: state.units.map((unit) => ({
      ...unit,
      stats: encodeStats(unit.stats),
    })),
  };
}

export function decodeState(encoded: EncodedBattleState): BattleState {
  return {
    ...encoded,
    units: encoded.units.map((unit) => ({
      ...unit,
      stats: decodeStats(unit.stats),
    })),
  };
}

function encodeStats(stats: StatSheet): EncodedStatSheet {
  return {
    base: Array.from(stats.base),
    percent: Array.from(stats.percent),
    flat: Array.from(stats.flat),
  };
}

function decodeStats(stats: EncodedStatSheet): StatSheet {
  return {
    base: Float64Array.from(stats.base),
    percent: Float64Array.from(stats.percent),
    flat: Float64Array.from(stats.flat),
  };
}

export function canonicalJson(value: JsonValue | unknown): string {
  return JSON.stringify(sortValue(value));
}

export function stateHash(state: BattleState): string {
  return fnv1a(canonicalJson(encodeState(state)));
}

export function encodeShareableState(state: BattleState): string {
  const json = JSON.stringify(encodeState(state));
  return toBase64Url(json);
}

/** Prefer gzip for URL payloads; the raw form remains usable on older hosts. */
export async function encodeCompressedShareableState(state: BattleState): Promise<string> {
  return encodeCompressedJson(encodeState(state));
}

export function decodeShareableState(value: string): BattleState {
  const parsed = JSON.parse(fromBase64Url(value)) as EncodedBattleState;
  return decodeState(parsed);
}

export async function decodeCompressedShareableState(value: string): Promise<BattleState> {
  return decodeState(await decodeCompressedJson<EncodedBattleState>(value));
}

export async function encodeCompressedJson(value: unknown): Promise<string> {
  const json = JSON.stringify(value);
  if (typeof CompressionStream === 'undefined' || typeof Blob === 'undefined' || typeof Response === 'undefined') {
    return `raw.${toBase64UrlBytes(new TextEncoder().encode(json))}`;
  }
  const compressed = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
  return `gz.${toBase64UrlBytes(bytes)}`;
}

export async function decodeCompressedJson<T>(value: string): Promise<T> {
  if (value.startsWith('raw.')) {
    return JSON.parse(new TextDecoder().decode(fromBase64UrlBytes(value.slice(4)))) as T;
  }
  if (!value.startsWith('gz.')) throw new Error('Unsupported compressed encoding');
  if (typeof DecompressionStream === 'undefined' || typeof Blob === 'undefined' || typeof Response === 'undefined') {
    throw new Error('Gzip compressed payload is not supported in this host');
  }
  const compressed = new Blob([toArrayBuffer(fromBase64UrlBytes(value.slice(3)))]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(compressed).text()) as T;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sortValue(child)]));
  }
  return value;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function toBase64Url(value: string): string {
  return toBase64UrlBytes(new TextEncoder().encode(value));
}

function toBase64UrlBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64Url(value: string): string {
  return new TextDecoder().decode(fromBase64UrlBytes(value));
}

function fromBase64UrlBytes(value: string): Uint8Array {
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

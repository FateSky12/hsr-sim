import type { RngState } from './types.js';

export function createRng(seed: number): RngState {
  const normalized = (seed >>> 0) || 0x9e3779b9;
  return { algorithm: 'xorshift32', seed: normalized, cursor: 0 };
}

export function nextRandom(rng: RngState): { rng: RngState; value: number } {
  let x = rng.seed >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  return {
    rng: { algorithm: rng.algorithm, seed: x, cursor: rng.cursor + 1 },
    value: x / 0x100000000,
  };
}

export function rollChance(rng: RngState, probability: number): {
  rng: RngState;
  success: boolean;
  roll?: number;
} {
  if (probability <= 0) return { rng, success: false };
  if (probability >= 1) return { rng, success: true, roll: 0 };
  const result = nextRandom(rng);
  return { rng: result.rng, success: result.value < probability, roll: result.value };
}

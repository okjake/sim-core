/**
 * Deterministic, seedable RNG.
 *
 * Driver logic (and every chaos decision that needs a coin flip) MUST use this
 * instead of `Math.random()` so a run can be replayed exactly from its seed.
 */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  float(min: number, max: number): number;
  /** True with probability `p` (0..1). */
  chance(p: number): boolean;
  /** Uniform pick. Throws on an empty list. */
  pick<T>(items: readonly T[]): T;
  /** Weighted pick. Items with weight <= 0 are never selected. */
  weightedPick<T>(items: readonly T[], weightOf: (item: T) => number): T;
  /** A fresh independent stream derived from this one's seed + `label`. */
  derive(label: string): Rng;
  /** The seed this stream was created with. */
  readonly seed: number;
}

/** FNV-1a — used to turn a string label into a 32-bit seed. */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough for traffic shaping. */
export function createRng(seed: number | string = 1): Rng {
  const numericSeed = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
  let state = numericSeed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    seed: numericSeed,
    next,
    float: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) {
        throw new Error('rng.pick called with an empty list');
      }
      return items[Math.floor(next() * items.length)] as T;
    },
    weightedPick: <T>(items: readonly T[], weightOf: (item: T) => number): T => {
      if (items.length === 0) {
        throw new Error('rng.weightedPick called with an empty list');
      }
      const weights = items.map((item) => Math.max(0, weightOf(item)));
      const total = weights.reduce((sum, w) => sum + w, 0);
      if (total <= 0) {
        return items[0] as T;
      }
      let roll = next() * total;
      for (let i = 0; i < items.length; i += 1) {
        roll -= weights[i] as number;
        if (roll <= 0) {
          return items[i] as T;
        }
      }
      return items[items.length - 1] as T;
    },
    derive: (label: string) => createRng((numericSeed ^ hashSeed(label)) >>> 0),
  };

  return rng;
}

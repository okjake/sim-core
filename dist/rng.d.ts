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
export declare function hashSeed(input: string): number;
/** mulberry32 — small, fast, good enough for traffic shaping. */
export declare function createRng(seed?: number | string): Rng;

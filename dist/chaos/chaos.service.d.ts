import type { ActiveChaosRule, ChaosControl, ChaosRule } from './chaos.types';
/**
 * In-memory chaos state.
 *
 * Baseline is "no rules". Rules are only ever installed by an active scenario,
 * which always carries a TTL, so the service self-heals even if nobody calls
 * `POST /__control/reset`.
 */
export declare class ChaosService implements ChaosControl {
    private readonly ruleMap;
    private counter;
    private rng;
    constructor(seed?: number | string);
    apply(rule: ChaosRule): () => void;
    clear(): void;
    rules(): ActiveChaosRule[];
    isBaseline(): boolean;
    /** Reset the decision stream — used by tests wanting reproducible chaos. */
    reseed(seed: number | string): void;
    /** Seeded coin flip. Never `Math.random()`. */
    chance(p: number): boolean;
    jitter(baseMs: number, jitterMs: number): number;
    /** Rules whose `pathPrefix` matches (or that are global). */
    rulesFor(path: string): ActiveChaosRule[];
    /**
     * Collapse all matching rules into the effective set of primitives.
     * Later rules win per-primitive; latency accumulates.
     */
    resolve(path: string): ChaosRule;
}

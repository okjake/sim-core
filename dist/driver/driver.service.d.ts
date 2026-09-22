import { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { DriverConfig, DriverControl, DriverMode, DriverStatus, FlowResponse, RequestMutator } from './driver.types';
/**
 * Declarative traffic driver.
 *
 * The loop is a single sequential pipeline: one HTTP request per tick, pulled
 * from the flow currently in progress (or a freshly weighted-picked flow).
 * That makes the hard cap trivially enforceable — it is checked immediately
 * before every single request, so no mode, multiplier, rhythm value or
 * scenario can push the service past `maxRequestsPerMinute`.
 *
 * Every random decision comes from a seeded RNG; there is no unseeded
 * randomness and no wall-clock-derived entropy anywhere in this file. A test
 * asserts that literally, so keep it that way.
 */
export declare class DriverService implements DriverControl, OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger;
    private readonly config;
    private readonly rng;
    private readonly selectionRng;
    private readonly jitterRng;
    private mode;
    private multiplier;
    private running;
    private timer;
    private run;
    private readonly window;
    private readonly mutators;
    private mutatorSeq;
    private totalRequests;
    private totalFailures;
    private capHits;
    /** Request-less flow steps walked past inside ticks (see `tick`). */
    private emptySteps;
    private lastRequestAt;
    private readonly flowStats;
    private readonly memory;
    /** Resolves after the next tick completes — test hook. */
    private tickWaiters;
    constructor(config?: DriverConfig);
    isConfigured(): boolean;
    start(): void;
    stop(): void;
    onApplicationBootstrap(): void;
    onModuleDestroy(): void;
    getMode(): DriverMode;
    getMultiplier(): number;
    setMode(mode: DriverMode, multiplier?: number): void;
    resetMode(): void;
    addRequestMutator(mutator: RequestMutator): () => void;
    clearRequestMutators(): void;
    /** Full baseline restore: default mode, no mutators, no in-flight flow run. */
    reset(): void;
    /** Rhythm multiplier for a given instant. Pure function of the clock, not random. */
    rhythmMultiplier(at?: Date): number;
    /** Target rate after mode, multiplier and rhythm — already clamped to the hard cap. */
    effectiveRequestsPerMinute(at?: Date): number;
    private pruneWindow;
    /** Requests issued in the trailing 60s. */
    requestsLastMinute(now?: number): number;
    /** THE hard cap check. Called immediately before every request. */
    private withinCap;
    private nextDelayMs;
    private schedule;
    /**
     * One loop iteration: at most one HTTP request. Exposed for tests so the
     * pipeline can be driven without wall-clock scheduling.
     *
     * A flow step is allowed to build no request (nothing to modify, nothing to
     * cancel, no next page) — that is how flows stay honest about state they do
     * not have. It must NOT cost a scheduling slot, though: the loop sleeps a
     * full `60_000 / rpm` interval between ticks, so a tick that advances past
     * an empty step and returns would silently halve or third the delivered
     * rate whenever the ledger is thin (fresh boot, cancel-heavy mix). So a
     * tick walks past empty steps — across flow boundaries — until a step
     * produces a request, bounded so a flow set that is empty end to end still
     * terminates. Paused, unconfigured and cap-hit ticks still return
     * immediately; the cap is checked once per HTTP request, not per attempt.
     */
    tick(now?: number): Promise<FlowResponse | null>;
    /**
     * How many request-less steps one tick may walk past before giving up.
     * Larger than any flow's step count so a tick can cross at least one flow
     * boundary; small enough that a pathological flow set cannot spin.
     */
    private static readonly MAX_EMPTY_STEPS_PER_TICK;
    private tickOnce;
    private advance;
    private statsFor;
    private baseHeaders;
    private send;
    status(now?: number): DriverStatus;
    /** Test hook: resolves after the next scheduled tick has completed. */
    nextTick(): Promise<void>;
    private notifyTick;
}

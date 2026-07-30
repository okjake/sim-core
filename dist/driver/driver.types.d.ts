import type { Rng } from '../rng';
export type DriverMode = 'baseline' | 'burst' | 'paused';
/** A single HTTP call a flow step wants to make. */
export interface FlowRequest {
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    /** Path relative to `driver.baseUrl`, e.g. `/v2/listings`. */
    path: string;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    headers?: Record<string, string>;
}
export interface FlowResponse {
    status: number;
    ok: boolean;
    body: unknown;
    headers: Record<string, string>;
    latencyMs: number;
    /** Set when the call never produced a response (DNS failure, connection refused…). */
    error?: string;
}
/** Mutable per-run scratchpad — how step 2 reads an id created by step 1. */
export type FlowState = Record<string, unknown>;
export interface FlowContext {
    /** Seeded — never use `Math.random()` in a flow. */
    rng: Rng;
    flowId: string;
    /** Long-lived per-driver store (e.g. a partner's ledger of created bookings). */
    memory: Record<string, unknown>;
}
export interface FlowStep {
    name: string;
    /** Return `null` to skip this step (e.g. nothing in the ledger to cancel). */
    request(state: FlowState, ctx: FlowContext): FlowRequest | null;
    onResponse?(res: FlowResponse, state: FlowState, ctx: FlowContext): void | Promise<void>;
}
export interface FlowDefinition {
    id: string;
    description?: string;
    /** Relative weight for flow selection. */
    weight: number;
    steps: FlowStep[];
}
/**
 * Multiplier table applied to the baseline rate, indexed by local hour (0-23).
 * Arrays shorter than 24 entries fall back to 1 for missing hours.
 */
export interface RhythmCurve {
    weekday: number[];
    weekend: number[];
}
export type FetchLike = (url: string, init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
}) => Promise<{
    status: number;
    ok: boolean;
    headers: {
        forEach(cb: (value: string, key: string) => void): void;
    };
    text(): Promise<string>;
}>;
/** Mutates an outgoing request. Driver-level scenario hook. */
export type RequestMutator = (req: FlowRequest, ctx: {
    flowId: string;
    stepName: string;
}) => FlowRequest;
export interface DriverConfig {
    /** Base URL every flow request is resolved against. */
    baseUrl: string;
    flows: FlowDefinition[];
    /** Target HTTP requests/minute at multiplier 1 and rhythm 1. */
    baselineRequestsPerMinute: number;
    /** HARD CAP. Enforced in the loop regardless of mode, multiplier or rhythm. */
    maxRequestsPerMinute: number;
    /** Seed for flow selection, jitter and every in-flow random choice. */
    seed?: number | string;
    /** 0..1 — inter-request interval is jittered by ±(interval * jitterRatio). Default 0.35. */
    jitterRatio?: number;
    rhythm?: RhythmCurve;
    /** Mode the driver returns to on reset / TTL expiry. Default 'baseline'. */
    defaultMode?: DriverMode;
    /** Start the loop on module init. Default true (false under NODE_ENV=test). */
    autoStart?: boolean;
    /** Headers added to every request (e.g. the partner API key). */
    headers?: Record<string, string> | (() => Record<string, string>);
    /** Per-request timeout in ms. Default 10000. */
    timeoutMs?: number;
    /** Injection point for tests — defaults to global `fetch`. */
    fetchImpl?: FetchLike;
}
export interface DriverFlowStats {
    runs: number;
    requests: number;
    failures: number;
}
export interface DriverStatus {
    configured: boolean;
    running: boolean;
    mode: DriverMode;
    multiplier: number;
    defaultMode: DriverMode;
    baselineRequestsPerMinute: number;
    maxRequestsPerMinute: number;
    effectiveRequestsPerMinute: number;
    requestsLastMinute: number;
    capHits: number;
    totalRequests: number;
    totalFailures: number;
    seed: number | null;
    lastRequestAt: string | null;
    currentFlow: string | null;
    flows: Record<string, DriverFlowStats>;
    requestMutators: number;
}
/** Handle handed to scenarios so they can retune the driver and get a revert fn. */
export interface DriverControl {
    isConfigured(): boolean;
    getMode(): DriverMode;
    getMultiplier(): number;
    /** `multiplier` only applies to `burst`; ignored otherwise. */
    setMode(mode: DriverMode, multiplier?: number): void;
    /** Back to `defaultMode` at multiplier 1. */
    resetMode(): void;
    /** Install a request mutator. The returned function removes exactly that one. */
    addRequestMutator(mutator: RequestMutator): () => void;
    status(): DriverStatus;
}

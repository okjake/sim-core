"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var DriverService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriverService = void 0;
const common_1 = require("@nestjs/common");
const rng_1 = require("../rng");
const FLAT_CURVE = {
    weekday: new Array(24).fill(1),
    weekend: new Array(24).fill(1),
};
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
let DriverService = class DriverService {
    static { DriverService_1 = this; }
    logger = new common_1.Logger('SimDriver');
    config;
    rng;
    selectionRng;
    jitterRng;
    mode;
    multiplier = 1;
    running = false;
    timer = null;
    run = null;
    window = [];
    mutators = new Map();
    mutatorSeq = 0;
    totalRequests = 0;
    totalFailures = 0;
    capHits = 0;
    /** Request-less flow steps walked past inside ticks (see `tick`). */
    emptySteps = 0;
    lastRequestAt = null;
    flowStats = new Map();
    memory = {};
    /** Resolves after the next tick completes — test hook. */
    tickWaiters = [];
    constructor(config) {
        this.config = config ?? null;
        const seed = config?.seed ?? 'sim-core-driver';
        this.rng = (0, rng_1.createRng)(seed);
        this.selectionRng = this.rng.derive('flow-selection');
        this.jitterRng = this.rng.derive('schedule-jitter');
        this.mode = config?.defaultMode ?? 'baseline';
    }
    // ---------------------------------------------------------------- lifecycle
    isConfigured() {
        return this.config !== null && this.config.flows.length > 0;
    }
    start() {
        if (!this.isConfigured() || this.running) {
            return;
        }
        this.running = true;
        this.schedule();
    }
    stop() {
        this.running = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
    onApplicationBootstrap() {
        if (!this.isConfigured())
            return;
        const autoStart = this.config?.autoStart ?? process.env.NODE_ENV !== 'test';
        if (autoStart) {
            this.start();
            this.logger.log(`driver started -> ${this.config?.baseUrl} ` +
                `(baseline ${this.config?.baselineRequestsPerMinute}/min, cap ${this.config?.maxRequestsPerMinute}/min, seed ${this.rng.seed})`);
        }
    }
    onModuleDestroy() {
        this.stop();
    }
    // ------------------------------------------------------------------ control
    getMode() {
        return this.mode;
    }
    getMultiplier() {
        return this.multiplier;
    }
    setMode(mode, multiplier = 1) {
        this.mode = mode;
        this.multiplier = mode === 'burst' ? Math.max(1, multiplier) : 1;
    }
    resetMode() {
        this.mode = this.config?.defaultMode ?? 'baseline';
        this.multiplier = 1;
    }
    addRequestMutator(mutator) {
        this.mutatorSeq += 1;
        const id = this.mutatorSeq;
        this.mutators.set(id, mutator);
        return () => {
            this.mutators.delete(id);
        };
    }
    clearRequestMutators() {
        this.mutators.clear();
    }
    /** Full baseline restore: default mode, no mutators, no in-flight flow run. */
    reset() {
        this.resetMode();
        this.clearRequestMutators();
        this.run = null;
    }
    // -------------------------------------------------------------------- rates
    /** Rhythm multiplier for a given instant. Pure function of the clock, not random. */
    rhythmMultiplier(at = new Date()) {
        const curve = this.config?.rhythm ?? FLAT_CURVE;
        const day = at.getDay();
        const table = day === 0 || day === 6 ? curve.weekend : curve.weekday;
        const value = table[at.getHours()];
        return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 1;
    }
    /** Target rate after mode, multiplier and rhythm — already clamped to the hard cap. */
    effectiveRequestsPerMinute(at = new Date()) {
        if (!this.config || this.mode === 'paused') {
            return 0;
        }
        const raw = this.config.baselineRequestsPerMinute *
            this.multiplier *
            this.rhythmMultiplier(at);
        return Math.max(0, Math.min(raw, this.config.maxRequestsPerMinute));
    }
    pruneWindow(now) {
        const cutoff = now - 60_000;
        while (this.window.length > 0 && this.window[0] <= cutoff) {
            this.window.shift();
        }
    }
    /** Requests issued in the trailing 60s. */
    requestsLastMinute(now = Date.now()) {
        this.pruneWindow(now);
        return this.window.length;
    }
    /** THE hard cap check. Called immediately before every request. */
    withinCap(now) {
        if (!this.config)
            return false;
        return this.requestsLastMinute(now) < this.config.maxRequestsPerMinute;
    }
    nextDelayMs(at) {
        const rpm = this.effectiveRequestsPerMinute(at);
        if (rpm <= 0) {
            // Paused (or rhythm zeroed) — idle-poll so a mode change is picked up fast.
            return 1_000;
        }
        const interval = 60_000 / rpm;
        const ratio = this.config?.jitterRatio ?? 0.35;
        const jittered = interval * (1 + this.jitterRng.float(-ratio, ratio));
        return Math.max(1, Math.round(jittered));
    }
    // --------------------------------------------------------------------- loop
    schedule() {
        if (!this.running)
            return;
        const delay = this.nextDelayMs(new Date());
        this.timer = setTimeout(() => {
            void this.tick().finally(() => {
                this.notifyTick();
                this.schedule();
            });
        }, delay);
        if (typeof this.timer.unref === 'function') {
            this.timer.unref();
        }
    }
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
    async tick(now = Date.now()) {
        for (let attempt = 0; attempt < DriverService_1.MAX_EMPTY_STEPS_PER_TICK; attempt += 1) {
            const outcome = await this.tickOnce(now);
            if (outcome.kind === 'sent')
                return outcome.response;
            if (outcome.kind === 'idle')
                return null;
            this.emptySteps += 1;
        }
        return null;
    }
    /**
     * How many request-less steps one tick may walk past before giving up.
     * Larger than any flow's step count so a tick can cross at least one flow
     * boundary; small enough that a pathological flow set cannot spin.
     */
    static MAX_EMPTY_STEPS_PER_TICK = 16;
    async tickOnce(now) {
        if (!this.config || !this.isConfigured())
            return { kind: 'idle' };
        if (this.mode === 'paused')
            return { kind: 'idle' };
        if (!this.withinCap(now)) {
            this.capHits += 1;
            return { kind: 'idle' };
        }
        if (!this.run) {
            const flow = this.selectionRng.weightedPick(this.config.flows, (f) => f.weight);
            this.run = { flow, stepIndex: 0, state: {} };
            const stats = this.statsFor(flow.id);
            stats.runs += 1;
        }
        const { flow, stepIndex, state } = this.run;
        const step = flow.steps[stepIndex];
        if (!step) {
            this.run = null;
            return { kind: 'empty' };
        }
        const ctx = {
            rng: this.rng.derive(`${flow.id}:${step.name}:${this.totalRequests}`),
            flowId: flow.id,
            memory: this.memory,
        };
        let request;
        try {
            request = step.request(state, ctx);
        }
        catch (error) {
            this.logger.warn(`flow ${flow.id} step ${step.name} failed to build a request: ${String(error)}`);
            this.run = null;
            return { kind: 'empty' };
        }
        this.advance();
        if (!request) {
            return { kind: 'empty' };
        }
        for (const mutator of this.mutators.values()) {
            request = mutator(request, { flowId: flow.id, stepName: step.name });
        }
        this.window.push(now);
        this.totalRequests += 1;
        this.lastRequestAt = now;
        const stats = this.statsFor(flow.id);
        stats.requests += 1;
        const response = await this.send(request);
        if (!response.ok) {
            this.totalFailures += 1;
            stats.failures += 1;
        }
        if (step.onResponse) {
            try {
                await step.onResponse(response, state, ctx);
            }
            catch (error) {
                this.logger.warn(`flow ${flow.id} step ${step.name} onResponse threw: ${String(error)}`);
            }
        }
        return { kind: 'sent', response };
    }
    advance() {
        if (!this.run)
            return;
        this.run.stepIndex += 1;
        if (this.run.stepIndex >= this.run.flow.steps.length) {
            this.run = null;
        }
    }
    statsFor(flowId) {
        let stats = this.flowStats.get(flowId);
        if (!stats) {
            stats = { runs: 0, requests: 0, failures: 0 };
            this.flowStats.set(flowId, stats);
        }
        return stats;
    }
    baseHeaders() {
        const configured = this.config?.headers;
        if (!configured)
            return {};
        return typeof configured === 'function' ? configured() : { ...configured };
    }
    async send(request) {
        const config = this.config;
        const doFetch = config.fetchImpl ?? globalThis.fetch;
        const startedAt = Date.now();
        const query = Object.entries(request.query ?? {})
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
            .join('&');
        const url = `${config.baseUrl.replace(/\/$/, '')}${request.path}${query ? `?${query}` : ''}`;
        const headers = {
            accept: 'application/json',
            ...this.baseHeaders(),
            ...(request.headers ?? {}),
        };
        let body;
        if (request.body !== undefined) {
            body = JSON.stringify(request.body);
            headers['content-type'] = headers['content-type'] ?? 'application/json';
        }
        if (!doFetch) {
            return {
                status: 0,
                ok: false,
                body: null,
                headers: {},
                latencyMs: 0,
                error: 'no fetch implementation available',
            };
        }
        const timeoutMs = config.timeoutMs ?? 10_000;
        const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined;
        try {
            const res = await doFetch(url, { method: request.method, headers, body, signal });
            const raw = await res.text();
            let parsed = raw;
            try {
                parsed = raw.length > 0 ? JSON.parse(raw) : null;
            }
            catch {
                /* leave the raw string — malformed responses are a feature here */
            }
            const responseHeaders = {};
            res.headers.forEach((value, key) => {
                responseHeaders[key.toLowerCase()] = value;
            });
            return {
                status: res.status,
                ok: res.ok,
                body: parsed,
                headers: responseHeaders,
                latencyMs: Date.now() - startedAt,
            };
        }
        catch (error) {
            return {
                status: 0,
                ok: false,
                body: null,
                headers: {},
                latencyMs: Date.now() - startedAt,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    // ------------------------------------------------------------------- status
    status(now = Date.now()) {
        const flows = {};
        for (const [id, stats] of this.flowStats) {
            flows[id] = { ...stats };
        }
        return {
            configured: this.isConfigured(),
            running: this.running,
            mode: this.mode,
            multiplier: this.multiplier,
            defaultMode: this.config?.defaultMode ?? 'baseline',
            baselineRequestsPerMinute: this.config?.baselineRequestsPerMinute ?? 0,
            maxRequestsPerMinute: this.config?.maxRequestsPerMinute ?? 0,
            effectiveRequestsPerMinute: Math.round(this.effectiveRequestsPerMinute() * 100) / 100,
            requestsLastMinute: this.requestsLastMinute(now),
            capHits: this.capHits,
            emptySteps: this.emptySteps,
            totalRequests: this.totalRequests,
            totalFailures: this.totalFailures,
            seed: this.config ? this.rng.seed : null,
            lastRequestAt: this.lastRequestAt ? new Date(this.lastRequestAt).toISOString() : null,
            currentFlow: this.run?.flow.id ?? null,
            flows,
            requestMutators: this.mutators.size,
        };
    }
    /** Test hook: resolves after the next scheduled tick has completed. */
    nextTick() {
        return new Promise((resolve) => {
            this.tickWaiters.push(resolve);
        });
    }
    notifyTick() {
        const waiters = this.tickWaiters;
        this.tickWaiters = [];
        for (const resolve of waiters)
            resolve();
    }
};
exports.DriverService = DriverService;
exports.DriverService = DriverService = DriverService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [Object])
], DriverService);

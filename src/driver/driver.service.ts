import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';

import { createRng, type Rng } from '../rng';
import type {
  DriverConfig,
  DriverControl,
  DriverFlowStats,
  DriverMode,
  DriverStatus,
  FlowContext,
  FlowDefinition,
  FlowRequest,
  FlowResponse,
  FlowState,
  RequestMutator,
  RhythmCurve,
} from './driver.types';

const FLAT_CURVE: RhythmCurve = {
  weekday: new Array<number>(24).fill(1),
  weekend: new Array<number>(24).fill(1),
};

interface ActiveRun {
  flow: FlowDefinition;
  stepIndex: number;
  state: FlowState;
}

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
@Injectable()
export class DriverService
  implements DriverControl, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger('SimDriver');
  private readonly config: DriverConfig | null;
  private readonly rng: Rng;
  private readonly selectionRng: Rng;
  private readonly jitterRng: Rng;

  private mode: DriverMode;
  private multiplier = 1;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private run: ActiveRun | null = null;

  private readonly window: number[] = [];
  private readonly mutators = new Map<number, RequestMutator>();
  private mutatorSeq = 0;

  private totalRequests = 0;
  private totalFailures = 0;
  private capHits = 0;
  private lastRequestAt: number | null = null;
  private readonly flowStats = new Map<string, DriverFlowStats>();
  private readonly memory: Record<string, unknown> = {};

  /** Resolves after the next tick completes — test hook. */
  private tickWaiters: Array<() => void> = [];

  constructor(config?: DriverConfig) {
    this.config = config ?? null;
    const seed = config?.seed ?? 'sim-core-driver';
    this.rng = createRng(seed);
    this.selectionRng = this.rng.derive('flow-selection');
    this.jitterRng = this.rng.derive('schedule-jitter');
    this.mode = config?.defaultMode ?? 'baseline';
  }

  // ---------------------------------------------------------------- lifecycle

  isConfigured(): boolean {
    return this.config !== null && this.config.flows.length > 0;
  }

  start(): void {
    if (!this.isConfigured() || this.running) {
      return;
    }
    this.running = true;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  onApplicationBootstrap(): void {
    if (!this.isConfigured()) return;
    const autoStart = this.config?.autoStart ?? process.env.NODE_ENV !== 'test';
    if (autoStart) {
      this.start();
      this.logger.log(
        `driver started -> ${this.config?.baseUrl} ` +
          `(baseline ${this.config?.baselineRequestsPerMinute}/min, cap ${this.config?.maxRequestsPerMinute}/min, seed ${this.rng.seed})`,
      );
    }
  }

  onModuleDestroy(): void {
    this.stop();
  }

  // ------------------------------------------------------------------ control

  getMode(): DriverMode {
    return this.mode;
  }

  getMultiplier(): number {
    return this.multiplier;
  }

  setMode(mode: DriverMode, multiplier = 1): void {
    this.mode = mode;
    this.multiplier = mode === 'burst' ? Math.max(1, multiplier) : 1;
  }

  resetMode(): void {
    this.mode = this.config?.defaultMode ?? 'baseline';
    this.multiplier = 1;
  }

  addRequestMutator(mutator: RequestMutator): () => void {
    this.mutatorSeq += 1;
    const id = this.mutatorSeq;
    this.mutators.set(id, mutator);
    return () => {
      this.mutators.delete(id);
    };
  }

  clearRequestMutators(): void {
    this.mutators.clear();
  }

  /** Full baseline restore: default mode, no mutators, no in-flight flow run. */
  reset(): void {
    this.resetMode();
    this.clearRequestMutators();
    this.run = null;
  }

  // -------------------------------------------------------------------- rates

  /** Rhythm multiplier for a given instant. Pure function of the clock, not random. */
  rhythmMultiplier(at: Date = new Date()): number {
    const curve = this.config?.rhythm ?? FLAT_CURVE;
    const day = at.getDay();
    const table = day === 0 || day === 6 ? curve.weekend : curve.weekday;
    const value = table[at.getHours()];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 1;
  }

  /** Target rate after mode, multiplier and rhythm — already clamped to the hard cap. */
  effectiveRequestsPerMinute(at: Date = new Date()): number {
    if (!this.config || this.mode === 'paused') {
      return 0;
    }
    const raw =
      this.config.baselineRequestsPerMinute *
      this.multiplier *
      this.rhythmMultiplier(at);
    return Math.max(0, Math.min(raw, this.config.maxRequestsPerMinute));
  }

  private pruneWindow(now: number): void {
    const cutoff = now - 60_000;
    while (this.window.length > 0 && (this.window[0] as number) <= cutoff) {
      this.window.shift();
    }
  }

  /** Requests issued in the trailing 60s. */
  requestsLastMinute(now: number = Date.now()): number {
    this.pruneWindow(now);
    return this.window.length;
  }

  /** THE hard cap check. Called immediately before every request. */
  private withinCap(now: number): boolean {
    if (!this.config) return false;
    return this.requestsLastMinute(now) < this.config.maxRequestsPerMinute;
  }

  private nextDelayMs(at: Date): number {
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

  private schedule(): void {
    if (!this.running) return;
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
   */
  async tick(now: number = Date.now()): Promise<FlowResponse | null> {
    if (!this.config || !this.isConfigured()) return null;
    if (this.mode === 'paused') return null;
    if (!this.withinCap(now)) {
      this.capHits += 1;
      return null;
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
      return null;
    }

    const ctx: FlowContext = {
      rng: this.rng.derive(`${flow.id}:${step.name}:${this.totalRequests}`),
      flowId: flow.id,
      memory: this.memory,
    };

    let request: FlowRequest | null;
    try {
      request = step.request(state, ctx);
    } catch (error) {
      this.logger.warn(
        `flow ${flow.id} step ${step.name} failed to build a request: ${String(error)}`,
      );
      this.run = null;
      return null;
    }

    this.advance();

    if (!request) {
      return null;
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
      } catch (error) {
        this.logger.warn(
          `flow ${flow.id} step ${step.name} onResponse threw: ${String(error)}`,
        );
      }
    }

    return response;
  }

  private advance(): void {
    if (!this.run) return;
    this.run.stepIndex += 1;
    if (this.run.stepIndex >= this.run.flow.steps.length) {
      this.run = null;
    }
  }

  private statsFor(flowId: string): DriverFlowStats {
    let stats = this.flowStats.get(flowId);
    if (!stats) {
      stats = { runs: 0, requests: 0, failures: 0 };
      this.flowStats.set(flowId, stats);
    }
    return stats;
  }

  private baseHeaders(): Record<string, string> {
    const configured = this.config?.headers;
    if (!configured) return {};
    return typeof configured === 'function' ? configured() : { ...configured };
  }

  private async send(request: FlowRequest): Promise<FlowResponse> {
    const config = this.config as DriverConfig;
    const doFetch = config.fetchImpl ?? (globalThis.fetch as unknown as DriverConfig['fetchImpl']);
    const startedAt = Date.now();

    const query = Object.entries(request.query ?? {})
      .filter(([, value]) => value !== undefined)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
      )
      .join('&');

    const url = `${config.baseUrl.replace(/\/$/, '')}${request.path}${query ? `?${query}` : ''}`;
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...this.baseHeaders(),
      ...(request.headers ?? {}),
    };
    let body: string | undefined;
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
    const signal =
      typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined;

    try {
      const res = await doFetch(url, { method: request.method, headers, body, signal });
      const raw = await res.text();
      let parsed: unknown = raw;
      try {
        parsed = raw.length > 0 ? JSON.parse(raw) : null;
      } catch {
        /* leave the raw string — malformed responses are a feature here */
      }
      const responseHeaders: Record<string, string> = {};
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
    } catch (error) {
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

  status(now: number = Date.now()): DriverStatus {
    const flows: Record<string, DriverFlowStats> = {};
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
  nextTick(): Promise<void> {
    return new Promise((resolve) => {
      this.tickWaiters.push(resolve);
    });
  }

  private notifyTick(): void {
    const waiters = this.tickWaiters;
    this.tickWaiters = [];
    for (const resolve of waiters) resolve();
  }
}

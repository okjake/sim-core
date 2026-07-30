import { p } from '../params';
import type { Scenario } from './scenario.types';

/** `latency` — add a fixed + jittered delay to every domain response. */
export const latencyScenario: Scenario<{
  baseMs: number;
  jitterMs: number;
  pathPrefix?: string;
}> = {
  id: 'latency',
  description: 'Adds baseMs (± jitterMs) of latency to every matching response.',
  params: p.object({
    baseMs: p.number({ min: 0, max: 60_000 }).default(750).describedAs('Base delay in ms'),
    jitterMs: p
      .number({ min: 0, max: 60_000 })
      .default(250)
      .describedAs('Total jitter window in ms'),
    pathPrefix: p
      .string()
      .optional()
      .describedAs('Restrict to a path prefix, e.g. /v2/reservations'),
  }),
  apply(ctx, params) {
    return ctx.chaos.apply({
      pathPrefix: params.pathPrefix,
      latency: { baseMs: params.baseMs, jitterMs: params.jitterMs },
    });
  },
};

/** `error-spike` — fail a fraction of requests. */
export const errorSpikeScenario: Scenario<{
  rate: number;
  status: number;
  pathPrefix?: string;
}> = {
  id: 'error-spike',
  description: 'Fails a fraction of matching requests with the given status code.',
  params: p.object({
    rate: p.number({ min: 0, max: 1 }).default(0.25).describedAs('Failure rate, 0..1'),
    status: p.number({ min: 400, max: 599 }).default(500).describedAs('HTTP status'),
    pathPrefix: p.string().optional().describedAs('Restrict to a path prefix'),
  }),
  apply(ctx, params) {
    return ctx.chaos.apply({
      pathPrefix: params.pathPrefix,
      errorRate: { rate: params.rate, status: params.status },
    });
  },
};

/** `outage` — reject everything with 503. */
export const outageScenario: Scenario<{ status: number; pathPrefix?: string }> = {
  id: 'outage',
  description: 'Hard outage — rejects every matching request with 503.',
  params: p.object({
    status: p.number({ min: 400, max: 599 }).default(503).describedAs('HTTP status'),
    pathPrefix: p.string().optional().describedAs('Restrict to a path prefix'),
  }),
  apply(ctx, params) {
    return ctx.chaos.apply({
      pathPrefix: params.pathPrefix,
      reject: { status: params.status, message: 'Service temporarily unavailable' },
    });
  },
};

/** `auth-failure` — reject everything with 401. */
export const authFailureScenario: Scenario<{ status: number; pathPrefix?: string }> = {
  id: 'auth-failure',
  description: 'Rejects every matching request with 401, as if credentials had expired.',
  params: p.object({
    status: p.number({ min: 400, max: 599 }).default(401).describedAs('HTTP status'),
    pathPrefix: p.string().optional().describedAs('Restrict to a path prefix'),
  }),
  apply(ctx, params) {
    return ctx.chaos.apply({
      pathPrefix: params.pathPrefix,
      reject: { status: params.status, message: 'Invalid or expired credentials' },
    });
  },
};

/**
 * Generic scenarios every sim service gets for free. Consumers append their
 * own via `SimCoreConfig.scenarios`; same-id entries override these.
 */
export const BUILTIN_SCENARIOS: Scenario<any>[] = [
  latencyScenario,
  errorSpikeScenario,
  outageScenario,
  authFailureScenario,
];

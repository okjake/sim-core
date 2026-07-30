import type { Scenario } from './scenario.types';
/** `latency` — add a fixed + jittered delay to every domain response. */
export declare const latencyScenario: Scenario<{
    baseMs: number;
    jitterMs: number;
    pathPrefix?: string;
}>;
/** `error-spike` — fail a fraction of requests. */
export declare const errorSpikeScenario: Scenario<{
    rate: number;
    status: number;
    pathPrefix?: string;
}>;
/** `outage` — reject everything with 503. */
export declare const outageScenario: Scenario<{
    status: number;
    pathPrefix?: string;
}>;
/** `auth-failure` — reject everything with 401. */
export declare const authFailureScenario: Scenario<{
    status: number;
    pathPrefix?: string;
}>;
/**
 * Generic scenarios every sim service gets for free. Consumers append their
 * own via `SimCoreConfig.scenarios`; same-id entries override these.
 */
export declare const BUILTIN_SCENARIOS: Scenario<any>[];

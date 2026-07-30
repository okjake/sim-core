import type { DriverMode } from '../driver/driver.types';
export declare const TTL_MIN_SECONDS = 1;
export declare const TTL_MAX_SECONDS = 86400;
export interface ActivateScenarioBody {
    scenario: string;
    params?: unknown;
    ttlSeconds: number;
}
export interface DriverOverrideBody {
    mode: DriverMode;
    multiplier?: number;
    ttlSeconds: number;
}
/**
 * TTL is MANDATORY on every activation. A sim service that can be left broken
 * forever is worse than no sim service, so there is no "until I say stop" mode.
 */
export declare function parseTtlSeconds(value: unknown, errors: Record<string, string>): number;
export declare function parseActivateScenarioBody(body: unknown): ActivateScenarioBody;
export declare function parseDriverOverrideBody(body: unknown): DriverOverrideBody;

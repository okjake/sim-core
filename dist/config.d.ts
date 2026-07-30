import type { DriverConfig } from './driver/driver.types';
import type { Scenario } from './scenarios/scenario.types';
/** DI token for the resolved {@link SimCoreConfig}. */
export declare const SIM_CORE_CONFIG = "SIM_CORE_CONFIG";
export interface SimBrand {
    /** Human-readable company name shown in the admin SPA. */
    displayName: string;
    /** CSS colour, e.g. `#2f6f4f`. Themes the admin SPA. */
    color: string;
    /** Optional one-line tagline shown under the title. */
    tagline?: string;
}
/**
 * An OpenAPI document, served verbatim at `GET /openapi.json`.
 * sim-core strips any `/__control` paths before serving — the control plane is
 * never part of a sim company's published contract.
 */
export interface OpenApiDocument {
    openapi: string;
    info: {
        title: string;
        version: string;
        description?: string;
    } & Record<string, unknown>;
    paths?: Record<string, unknown>;
    [key: string]: unknown;
}
export interface SimCoreConfig {
    /** Machine name, e.g. `staybase`. Used in logs and the health payload. */
    name: string;
    brand: SimBrand;
    /** Served at GET /openapi.json with ETag + Last-Modified. */
    openapi: OpenApiDocument;
    /** Consumer scenarios, appended to (and able to override) the built-ins. */
    scenarios?: Scenario<any>[];
    /** Omit entirely for services that only receive traffic (e.g. a tenant API). */
    driver?: DriverConfig;
    /** Bearer token for every `/__control/*` route. Read from env by the consumer. */
    controlToken: string;
    /** Reported by GET /health. Defaults to the consumer package version if resolvable. */
    version?: string;
    /** Seed for chaos decisions. Defaults to `${name}-chaos`. */
    seed?: number | string;
    /** Request-tail ring buffer size. Default 200. */
    requestTailSize?: number;
    /** Serve the bundled admin SPA at /admin. Default true. */
    admin?: boolean;
    /** Port used by `bootstrapSimService`. Default `process.env.PORT` or 3000. */
    port?: number;
}
/** Applies defaults and fails fast on an unusable config. */
export declare function normalizeSimCoreConfig(config: SimCoreConfig): Required<Pick<SimCoreConfig, 'name' | 'brand' | 'openapi' | 'controlToken' | 'version' | 'seed' | 'requestTailSize' | 'admin'>> & SimCoreConfig;

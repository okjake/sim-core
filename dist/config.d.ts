import { type AdminAction } from './control/admin-actions';
import type { AdminAuthConfig } from './admin-auth/admin-auth.types';
import type { DocsAuthCheck, DocsConfig } from './docs/docs.types';
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
    /**
     * Docs engine (SQLite-backed spec versions, guides and changelog).
     * **Disabled by default** — omit it and the service behaves exactly as it did
     * on v0.1.0, with no data directory and no `/docs` routes.
     */
    docs?: DocsConfig;
    /**
     * Credential check for `docs.authMode: 'required'`. sim-core deliberately has
     * no opinion about the scheme — sim-pebblepay switches between bearer, basic
     * and a custom header, and needs to be able to fail all of them on command.
     */
    docsAuthCheck?: DocsAuthCheck;
    /**
     * Let chaos scenarios hit `/docs` and `/openapi.json`. **Default false**, and
     * that default is load-bearing: an outage scenario that also broke the spec
     * endpoint would look to the platform like the upstream deleted its API.
     * sim-pebblepay turns this on deliberately to exercise docs-fetch failures.
     */
    docsChaosOptIn?: boolean;
    /** Size of the received-webhook ring buffer behind `GET /__control/webhooks`. Default 50. */
    webhookHistorySize?: number;
    /**
     * Optional Google-OIDC sign-in gate for the admin SPA at `/admin`.
     *
     * **Disabled by default, and it gates the human surface only.** Omit it (or
     * set `enabled: false`) and the service behaves exactly as it did on v0.2.0.
     * Enabled, it still leaves every machine surface alone: domain routes,
     * `/docs`, `/openapi.json`, `/health`, webhook receivers and the
     * bearer-authenticated `/__control` plane keep the auth they already had,
     * because the platform polls the first three and automation drives the last.
     */
    adminAuth?: AdminAuthConfig;
    /**
     * Buttons for this sim's own `/__control/*` routes, rendered on `/admin`
     * under "Manual controls". Optional and purely presentational: the routes
     * themselves are registered by the consumer as before, and omitting this
     * leaves them working exactly as they did (curl-only). See
     * {@link AdminAction}; every `path` must sit under `/__control/`.
     */
    adminActions?: AdminAction[];
}
/** Applies defaults and fails fast on an unusable config. */
export declare function normalizeSimCoreConfig(config: SimCoreConfig): Required<Pick<SimCoreConfig, 'name' | 'brand' | 'openapi' | 'controlToken' | 'version' | 'seed' | 'requestTailSize' | 'admin'>> & SimCoreConfig;

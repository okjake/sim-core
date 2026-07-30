import type { DriverConfig } from './driver/driver.types';
import type { Scenario } from './scenarios/scenario.types';

/** DI token for the resolved {@link SimCoreConfig}. */
export const SIM_CORE_CONFIG = 'SIM_CORE_CONFIG';

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
  info: { title: string; version: string; description?: string } & Record<string, unknown>;
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

const TOKEN_MIN_LENGTH = 16;

/** Applies defaults and fails fast on an unusable config. */
export function normalizeSimCoreConfig(config: SimCoreConfig): Required<
  Pick<
    SimCoreConfig,
    'name' | 'brand' | 'openapi' | 'controlToken' | 'version' | 'seed' | 'requestTailSize' | 'admin'
  >
> &
  SimCoreConfig {
  if (!config?.name) {
    throw new Error('SimCoreConfig.name is required');
  }
  if (!config.controlToken || config.controlToken.length < TOKEN_MIN_LENGTH) {
    throw new Error(
      `SimCoreConfig.controlToken is required and must be at least ${TOKEN_MIN_LENGTH} characters (set CONTROL_TOKEN)`,
    );
  }
  if (!config.openapi?.openapi || !config.openapi.info) {
    throw new Error('SimCoreConfig.openapi must be an OpenAPI document with `openapi` and `info`');
  }
  if (config.driver) {
    const { baselineRequestsPerMinute, maxRequestsPerMinute, baseUrl } = config.driver;
    if (!baseUrl) {
      throw new Error('SimCoreConfig.driver.baseUrl is required');
    }
    if (!(maxRequestsPerMinute > 0)) {
      throw new Error('SimCoreConfig.driver.maxRequestsPerMinute must be > 0');
    }
    if (!(baselineRequestsPerMinute >= 0)) {
      throw new Error('SimCoreConfig.driver.baselineRequestsPerMinute must be >= 0');
    }
  }

  return {
    ...config,
    version: config.version ?? '0.0.0',
    seed: config.seed ?? `${config.name}-chaos`,
    requestTailSize: config.requestTailSize ?? 200,
    admin: config.admin ?? true,
    brand: config.brand ?? { displayName: config.name, color: '#3b6ea5' },
  };
}

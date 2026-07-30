import { resolve } from 'node:path';

import {
  p,
  type AdminAuthConfig,
  type DocsConfig,
  type FlowDefinition,
  type OpenApiDocument,
  type Scenario,
  type SimCoreConfig,
} from '../../src';

/** Baseline docs content shipped with the example — see `examples/demo/content`. */
export const DEMO_CONTENT_DIR = resolve(__dirname, 'content');

export const DEMO_CONTROL_TOKEN = 'demo-control-token-0123456789';

const openapi: OpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Demo Widgets API',
    version: '1.0.0',
    description: 'Example domain API used by the sim-core test suite.',
  },
  paths: {
    '/widgets': { get: { summary: 'List widgets', responses: { '200': { description: 'ok' } } } },
    '/widgets/{id}': {
      get: { summary: 'Get a widget', responses: { '200': { description: 'ok' } } },
    },
    '/widgets/orders': {
      post: { summary: 'Create an order', responses: { '201': { description: 'created' } } },
    },
    // Present on purpose: sim-core must strip it before serving.
    '/__control/state': { get: { summary: 'should never be published' } },
  },
};

/**
 * A consumer-defined scenario that mutates DRIVER request construction rather
 * than installing chaos middleware — the pattern sim-bookbridge's
 * `malformed-payloads` / `expired-api-key` scenarios use.
 */
export const badPayloadsScenario: Scenario<{ header: string; value: string }> = {
  id: 'bad-payloads',
  description: 'Driver sends a bogus auth header, so every call it makes is rejected upstream.',
  params: p.object({
    header: p.string().default('authorization').describedAs('Header to poison'),
    value: p.string().default('Bearer expired-key').describedAs('Value to send'),
  }),
  apply(ctx, params) {
    return ctx.driver.addRequestMutator((req) => ({
      ...req,
      headers: { ...(req.headers ?? {}), [params.header]: params.value },
    }));
  },
};

export const demoFlows: FlowDefinition[] = [
  {
    id: 'browse',
    weight: 70,
    steps: [
      {
        name: 'list-widgets',
        request: () => ({ method: 'GET', path: '/widgets' }),
        onResponse: (res, state) => {
          const body = res.body as { widgets?: Array<{ id: string }> } | null;
          state.widgetId = body?.widgets?.[0]?.id ?? 'w-1';
        },
      },
      {
        name: 'get-widget',
        request: (state) => ({ method: 'GET', path: `/widgets/${String(state.widgetId ?? 'w-1')}` }),
      },
    ],
  },
  {
    id: 'order',
    weight: 30,
    steps: [
      {
        name: 'create-order',
        request: (_state, ctx) => ({
          method: 'POST',
          path: '/widgets/orders',
          body: { widgetId: `w-${ctx.rng.int(1, 3)}`, quantity: ctx.rng.int(1, 4) },
        }),
      },
    ],
  },
];

export interface DemoConfigOverrides {
  controlToken?: string;
  driverBaseUrl?: string;
  driver?: Partial<SimCoreConfig['driver']>;
  /** Model a receive-only service (like sim-staybase) with no traffic driver. */
  noDriver?: boolean;
  admin?: boolean;
  /**
   * Turn on the docs engine. Off by default, which is exactly what the
   * backcompat suite asserts: a v0.1-style config must behave as it did.
   * Defaults to an in-memory database seeded from `examples/demo/content`.
   */
  docs?: Partial<DocsConfig> | boolean;
  docsAuthCheck?: SimCoreConfig['docsAuthCheck'];
  docsChaosOptIn?: boolean;
  /**
   * Turn on the Google gate in front of `/admin`. Off by default — the
   * backcompat suite depends on that, and so does `pnpm example`, which has to
   * stay usable offline.
   */
  adminAuth?: Partial<AdminAuthConfig> | boolean;
}

/** Long enough to satisfy the >= 32 character rule, obviously not a secret. */
export const DEMO_SESSION_SECRET = 'demo-admin-session-secret-0123456789abcdef';

export function createDemoConfig(overrides: DemoConfigOverrides = {}): SimCoreConfig {
  const docsOverrides =
    overrides.docs === undefined || overrides.docs === false
      ? null
      : overrides.docs === true
        ? {}
        : overrides.docs;

  const adminAuthOverrides =
    overrides.adminAuth === undefined || overrides.adminAuth === false
      ? null
      : overrides.adminAuth === true
        ? {}
        : overrides.adminAuth;

  const config: SimCoreConfig = {
    name: 'demo',
    version: '0.1.0',
    brand: { displayName: 'Demo Widgets Co.', color: '#4f46e5', tagline: 'Widgets, sincerely' },
    controlToken: overrides.controlToken ?? DEMO_CONTROL_TOKEN,
    openapi,
    scenarios: [badPayloadsScenario],
    admin: overrides.admin ?? true,
    seed: 'demo-seed',
    ...(docsOverrides
      ? {
          docs: {
            enabled: true,
            contentDir: DEMO_CONTENT_DIR,
            databaseFile: ':memory:',
            ...docsOverrides,
          },
        }
      : {}),
    ...(overrides.docsAuthCheck ? { docsAuthCheck: overrides.docsAuthCheck } : {}),
    ...(overrides.docsChaosOptIn ? { docsChaosOptIn: true } : {}),
    ...(adminAuthOverrides
      ? {
          adminAuth: {
            enabled: true,
            googleClientId: 'demo-client-id.apps.googleusercontent.com',
            googleClientSecret: 'demo-client-secret',
            allowedDomain: 'partnerapi.com',
            sessionSecret: DEMO_SESSION_SECRET,
            ...adminAuthOverrides,
          } as AdminAuthConfig,
        }
      : {}),
    driver: {
      baseUrl: overrides.driverBaseUrl ?? 'http://127.0.0.1:3000',
      flows: demoFlows,
      baselineRequestsPerMinute: 6,
      maxRequestsPerMinute: 30,
      seed: 'demo-driver-seed',
      jitterRatio: 0.3,
      autoStart: false,
      ...(overrides.driver ?? {}),
    },
  };

  if (overrides.noDriver) {
    delete config.driver;
  }

  return config;
}

import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';

import { AppModule } from '../examples/demo/app.module';
import {
  DEMO_CONTROL_TOKEN,
  createDemoConfig,
  type DemoConfigOverrides,
} from '../examples/demo/demo.config';
import {
  ChaosService,
  ControlService,
  DocsService,
  DriverService,
  RequestTailService,
  WebhookRecorderService,
  bootstrapSimService,
  type SimCoreConfig,
} from '../src';

export interface TestHarness {
  app: INestApplication;
  config: SimCoreConfig;
  control: ControlService;
  chaos: ChaosService;
  driver: DriverService;
  tail: RequestTailService;
  webhooks: WebhookRecorderService;
  /** Only present when the harness was created with `docs`. */
  docs: DocsService | null;
  token: string;
  close(): Promise<void>;
}

export interface HarnessOptions extends DemoConfigOverrides {
  /** Capture `req.rawBody` — needed by the webhook-receiver tests. */
  rawBody?: boolean;
}

/**
 * Bind the app's HTTP server to an ephemeral port once, up front.
 *
 * supertest otherwise calls `server.listen(0)` and `server.close()` around
 * *every single request*. Across this suite that is hundreds of bind/unbind
 * cycles, and the OS recycles ephemeral ports fast enough that a request can
 * occasionally arrive at a port that has just been rebound by a different
 * test's server — which shows up as a response that could not possibly have
 * come from the app under test (a correct control token answered with 401, a
 * 418 chaos reject answered with 401). Binding once per app and letting
 * supertest reuse the live server removes the window entirely.
 */
export async function listenOnEphemeralPort(app: INestApplication): Promise<void> {
  const server = app.getHttpServer() as Server;
  if (server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
}

export async function createHarness(
  overrides: HarnessOptions = {},
): Promise<TestHarness> {
  const { rawBody, ...configOverrides } = overrides;
  const config = createDemoConfig(configOverrides);
  const app = await bootstrapSimService(AppModule.forConfig(config), config, {
    listen: false,
    logger: false,
    ...(rawBody ? { rawBody: true } : {}),
  });
  await listenOnEphemeralPort(app);

  return {
    app,
    config,
    control: app.get(ControlService),
    chaos: app.get(ChaosService),
    driver: app.get(DriverService),
    tail: app.get(RequestTailService),
    webhooks: app.get(WebhookRecorderService),
    docs: config.docs?.enabled ? app.get(DocsService) : null,
    token: config.controlToken ?? DEMO_CONTROL_TOKEN,
    close: async () => {
      await app.close();
    },
  };
}

export const bearer = (token: string): string => `Bearer ${token}`;

/** Wait `ms` of real time (used where fake timers would fight with sockets). */
export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

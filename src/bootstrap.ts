import {
  Logger,
  type INestApplication,
  type NestApplicationOptions,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import type { SimCoreConfig } from './config';

export interface BootstrapSimServiceOptions {
  /** Overrides `config.port` / `PORT`. */
  port?: number;
  /** Bind address. Default `0.0.0.0` (Render/Docker friendly). */
  host?: string;
  /**
   * Call `app.listen()`. Set false to get an initialised-but-unstarted app —
   * this is the supported way to build an app for supertest, because
   * `ServeStaticModule` needs the HTTP adapter to exist before providers are
   * instantiated (which `Test.createTestingModule().compile()` cannot do).
   */
  listen?: boolean;
  /** Passed straight to `NestFactory.create` — `false` silences Nest logging. */
  logger?: NestApplicationOptions['logger'];
  /**
   * Capture the raw request body on `req.rawBody`.
   *
   * **Required by any service that receives platform webhooks.** Signature
   * verification runs over the exact bytes that were signed, and
   * `JSON.stringify(req.body)` is not those bytes — key order and whitespace
   * differ, so every check would fail in a way that looks like a wrong secret.
   * See `verifyPlatformWebhook` and the receiver recipe in the README.
   */
  rawBody?: boolean;
}

/**
 * Thin `NestFactory` wrapper with the settings every sim service wants:
 * shutdown hooks (so TTL timers and the driver loop are torn down), proxy
 * trust, and a startup banner listing the built-in routes.
 *
 * ```ts
 * void bootstrapSimService(AppModule, config);
 * ```
 */
export async function bootstrapSimService(
  appModule: unknown,
  config: SimCoreConfig,
  options: BootstrapSimServiceOptions = {},
): Promise<INestApplication> {
  const logger = new Logger(`sim:${config.name}`);

  const app = await NestFactory.create<NestExpressApplication>(appModule as never, {
    bufferLogs: false,
    ...(options.rawBody ? { rawBody: true } : {}),
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
  });

  app.set('trust proxy', 1);
  app.enableShutdownHooks();

  if (options.listen === false) {
    await app.init();
    return app;
  }

  const envPort = process.env.PORT ? Number(process.env.PORT) : Number.NaN;
  const port = options.port ?? config.port ?? envPort;
  const resolvedPort = Number.isFinite(port) && port > 0 ? port : 3000;
  const host = options.host ?? '0.0.0.0';

  await app.listen(resolvedPort, host);

  logger.log(
    `${config.brand?.displayName ?? config.name} listening on :${resolvedPort} — ` +
      `/health /openapi.json${config.docs?.enabled ? ' /docs' : ''} /admin /__control/state`,
  );
  if (config.driver) {
    logger.log(
      `traffic driver -> ${config.driver.baseUrl} ` +
        `(baseline ${config.driver.baselineRequestsPerMinute}/min, hard cap ${config.driver.maxRequestsPerMinute}/min)`,
    );
  }

  return app;
}

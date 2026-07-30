import {
  DynamicModule,
  Logger,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
  type Provider,
  type Type,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';

import { AdminBrandController } from './builtins/admin-brand.controller';
import { resolveAdminDist } from './builtins/admin-static';
import { HealthController } from './builtins/health.controller';
import { ACTIVE_SPEC_SOURCE, OpenApiController } from './builtins/openapi.controller';
import { ChaosInterceptor } from './chaos/chaos.interceptor';
import { ChaosService } from './chaos/chaos.service';
import { SIM_CORE_CONFIG, normalizeSimCoreConfig, type SimCoreConfig } from './config';
import { ControlController } from './control/control.controller';
import { ControlAuthGuard } from './control/control.guard';
import { ControlService } from './control/control.service';
import { DocsAuthGuard } from './docs/docs-auth.guard';
import { DocsControlController } from './docs/docs-control.controller';
import { DocsController } from './docs/docs.controller';
import { DocsService } from './docs/docs.service';
import { DriverService } from './driver/driver.service';
import { RequestTailMiddleware } from './request-tail/request-tail.middleware';
import { RequestTailService } from './request-tail/request-tail.service';
import { ScenarioRegistryService } from './scenarios/scenario-registry.service';
import { WebhookRecorderService } from './webhooks/webhook-recorder.service';

/**
 * The shared engine. One import wires health, openapi, the chaos layer, the
 * scenario registry, the traffic driver, the `/__control` plane, the request
 * tail, the webhook recorder and the admin SPA into a consumer's Nest app —
 * plus, when `docs.enabled` is set, the SQLite-backed docs engine.
 *
 * ```ts
 * @Module({ imports: [SimCoreModule.forRoot(config)], controllers: [ListingsController] })
 * export class AppModule {}
 * ```
 */
@Module({})
export class SimCoreModule implements NestModule {
  static forRoot(config: SimCoreConfig): DynamicModule {
    const normalized = normalizeSimCoreConfig(config);
    const logger = new Logger('SimCore');

    const imports: NonNullable<DynamicModule['imports']> = [];
    if (normalized.admin) {
      const adminDist = resolveAdminDist();
      if (adminDist) {
        imports.push(
          ServeStaticModule.forRoot({
            rootPath: adminDist,
            serveRoot: '/admin',
            serveStaticOptions: { index: 'index.html', fallthrough: true },
          }),
        );
      } else {
        logger.warn(
          'Admin SPA build not found (dist/public). Run `pnpm build:admin`. /admin will 404.',
        );
      }
    }

    const controllers: Type<unknown>[] = [
      HealthController,
      OpenApiController,
      AdminBrandController,
      ControlController,
    ];

    const providers: Provider[] = [
      { provide: SIM_CORE_CONFIG, useValue: normalized },
      {
        provide: ChaosService,
        useFactory: () => new ChaosService(normalized.seed),
      },
      {
        provide: DriverService,
        useFactory: () => new DriverService(normalized.driver),
      },
      {
        provide: RequestTailService,
        useFactory: () => new RequestTailService(normalized.requestTailSize),
      },
      {
        provide: WebhookRecorderService,
        useFactory: () => new WebhookRecorderService(normalized.webhookHistorySize),
      },
      {
        provide: ScenarioRegistryService,
        useFactory: () => new ScenarioRegistryService(normalized.scenarios ?? []),
      },
      ControlService,
      ControlAuthGuard,
      RequestTailMiddleware,
      { provide: APP_INTERCEPTOR, useClass: ChaosInterceptor },
    ];

    const exports: DynamicModule['exports'] = [
      SIM_CORE_CONFIG,
      ChaosService,
      DriverService,
      RequestTailService,
      WebhookRecorderService,
      ScenarioRegistryService,
      ControlService,
    ];

    // Docs are opt-in. Left off (the default), nothing below is constructed:
    // no SQLite handle, no data directory, no /docs routes — a v0.1.0 config
    // repinned to v0.2.0 gets byte-for-byte the same behaviour.
    if (normalized.docs?.enabled) {
      controllers.push(DocsController, DocsControlController);
      providers.push(
        DocsService,
        DocsAuthGuard,
        // The optional hook OpenApiController uses to serve the ACTIVE
        // published spec version instead of the static config document.
        { provide: ACTIVE_SPEC_SOURCE, useExisting: DocsService },
      );
      exports.push(DocsService);
      logger.log(
        `docs engine enabled (authMode=${normalized.docs.authMode ?? 'public'}, ` +
          `chaosOptIn=${normalized.docsChaosOptIn === true})`,
      );
    }

    return {
      module: SimCoreModule,
      global: true,
      imports,
      controllers,
      providers,
      exports,
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestTailMiddleware)
      .forRoutes({ path: '*splat', method: RequestMethod.ALL });
  }
}

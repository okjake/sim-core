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

import { AdminAuthMiddleware } from './admin-auth/admin-auth.middleware';
import { AdminAuthService } from './admin-auth/admin-auth.service';
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
      // Always provided. With `adminAuth` absent or disabled the service is
      // inert and the middleware is one boolean check on `/admin` requests, so
      // the disabled path stays byte-for-byte what v0.2.0 did.
      AdminAuthService,
      AdminAuthMiddleware,
      { provide: APP_INTERCEPTOR, useClass: ChaosInterceptor },
    ];

    const exports: DynamicModule['exports'] = [
      SIM_CORE_CONFIG,
      AdminAuthService,
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

    if (normalized.adminAuth?.enabled) {
      logger.log(
        `admin auth enabled (Google OIDC, domain=${normalized.adminAuth.allowedDomain}` +
          `${normalized.adminAuth.allowedEmails ? `, ${normalized.adminAuth.allowedEmails.length} allow-listed addresses` : ''}) ` +
          '— gates /admin; its session also authorizes /__control (CONTROL_TOKEN still works too); ' +
          '/docs, /openapi.json and /health are unaffected',
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

  /**
   * Both middlewares run for every route and filter by path themselves, rather
   * than being mounted on `/admin` — the same shape as `isChaosExempt`, and it
   * keeps the gate's path matching in one testable function instead of split
   * between a route pattern and a runtime check.
   *
   * Order matters: the request tail is first so it records the 302s and 403s
   * the gate produces.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestTailMiddleware, AdminAuthMiddleware)
      .forRoutes({ path: '*splat', method: RequestMethod.ALL });
  }
}

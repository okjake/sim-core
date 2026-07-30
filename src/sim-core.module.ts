import {
  DynamicModule,
  Logger,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';

import { AdminBrandController } from './builtins/admin-brand.controller';
import { resolveAdminDist } from './builtins/admin-static';
import { HealthController } from './builtins/health.controller';
import { OpenApiController } from './builtins/openapi.controller';
import { ChaosInterceptor } from './chaos/chaos.interceptor';
import { ChaosService } from './chaos/chaos.service';
import { SIM_CORE_CONFIG, normalizeSimCoreConfig, type SimCoreConfig } from './config';
import { ControlController } from './control/control.controller';
import { ControlAuthGuard } from './control/control.guard';
import { ControlService } from './control/control.service';
import { DriverService } from './driver/driver.service';
import { RequestTailMiddleware } from './request-tail/request-tail.middleware';
import { RequestTailService } from './request-tail/request-tail.service';
import { ScenarioRegistryService } from './scenarios/scenario-registry.service';

/**
 * The shared engine. One import wires health, openapi, the chaos layer, the
 * scenario registry, the traffic driver, the `/__control` plane, the request
 * tail and the admin SPA into a consumer's Nest app.
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

    return {
      module: SimCoreModule,
      global: true,
      imports,
      controllers: [
        HealthController,
        OpenApiController,
        AdminBrandController,
        ControlController,
      ],
      providers: [
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
          provide: ScenarioRegistryService,
          useFactory: () => new ScenarioRegistryService(normalized.scenarios ?? []),
        },
        ControlService,
        ControlAuthGuard,
        RequestTailMiddleware,
        { provide: APP_INTERCEPTOR, useClass: ChaosInterceptor },
      ],
      exports: [
        SIM_CORE_CONFIG,
        ChaosService,
        DriverService,
        RequestTailService,
        ScenarioRegistryService,
        ControlService,
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestTailMiddleware)
      .forRoutes({ path: '*splat', method: RequestMethod.ALL });
  }
}

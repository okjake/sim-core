"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var SimCoreModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimCoreModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const serve_static_1 = require("@nestjs/serve-static");
const admin_brand_controller_1 = require("./builtins/admin-brand.controller");
const admin_static_1 = require("./builtins/admin-static");
const health_controller_1 = require("./builtins/health.controller");
const openapi_controller_1 = require("./builtins/openapi.controller");
const chaos_interceptor_1 = require("./chaos/chaos.interceptor");
const chaos_service_1 = require("./chaos/chaos.service");
const config_1 = require("./config");
const control_controller_1 = require("./control/control.controller");
const control_guard_1 = require("./control/control.guard");
const control_service_1 = require("./control/control.service");
const driver_service_1 = require("./driver/driver.service");
const request_tail_middleware_1 = require("./request-tail/request-tail.middleware");
const request_tail_service_1 = require("./request-tail/request-tail.service");
const scenario_registry_service_1 = require("./scenarios/scenario-registry.service");
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
let SimCoreModule = SimCoreModule_1 = class SimCoreModule {
    static forRoot(config) {
        const normalized = (0, config_1.normalizeSimCoreConfig)(config);
        const logger = new common_1.Logger('SimCore');
        const imports = [];
        if (normalized.admin) {
            const adminDist = (0, admin_static_1.resolveAdminDist)();
            if (adminDist) {
                imports.push(serve_static_1.ServeStaticModule.forRoot({
                    rootPath: adminDist,
                    serveRoot: '/admin',
                    serveStaticOptions: { index: 'index.html', fallthrough: true },
                }));
            }
            else {
                logger.warn('Admin SPA build not found (dist/public). Run `pnpm build:admin`. /admin will 404.');
            }
        }
        return {
            module: SimCoreModule_1,
            global: true,
            imports,
            controllers: [
                health_controller_1.HealthController,
                openapi_controller_1.OpenApiController,
                admin_brand_controller_1.AdminBrandController,
                control_controller_1.ControlController,
            ],
            providers: [
                { provide: config_1.SIM_CORE_CONFIG, useValue: normalized },
                {
                    provide: chaos_service_1.ChaosService,
                    useFactory: () => new chaos_service_1.ChaosService(normalized.seed),
                },
                {
                    provide: driver_service_1.DriverService,
                    useFactory: () => new driver_service_1.DriverService(normalized.driver),
                },
                {
                    provide: request_tail_service_1.RequestTailService,
                    useFactory: () => new request_tail_service_1.RequestTailService(normalized.requestTailSize),
                },
                {
                    provide: scenario_registry_service_1.ScenarioRegistryService,
                    useFactory: () => new scenario_registry_service_1.ScenarioRegistryService(normalized.scenarios ?? []),
                },
                control_service_1.ControlService,
                control_guard_1.ControlAuthGuard,
                request_tail_middleware_1.RequestTailMiddleware,
                { provide: core_1.APP_INTERCEPTOR, useClass: chaos_interceptor_1.ChaosInterceptor },
            ],
            exports: [
                config_1.SIM_CORE_CONFIG,
                chaos_service_1.ChaosService,
                driver_service_1.DriverService,
                request_tail_service_1.RequestTailService,
                scenario_registry_service_1.ScenarioRegistryService,
                control_service_1.ControlService,
            ],
        };
    }
    configure(consumer) {
        consumer
            .apply(request_tail_middleware_1.RequestTailMiddleware)
            .forRoutes({ path: '*splat', method: common_1.RequestMethod.ALL });
    }
};
exports.SimCoreModule = SimCoreModule;
exports.SimCoreModule = SimCoreModule = SimCoreModule_1 = __decorate([
    (0, common_1.Module)({})
], SimCoreModule);

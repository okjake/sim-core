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
const admin_auth_middleware_1 = require("./admin-auth/admin-auth.middleware");
const admin_auth_service_1 = require("./admin-auth/admin-auth.service");
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
const docs_auth_guard_1 = require("./docs/docs-auth.guard");
const docs_control_controller_1 = require("./docs/docs-control.controller");
const docs_controller_1 = require("./docs/docs.controller");
const docs_service_1 = require("./docs/docs.service");
const driver_service_1 = require("./driver/driver.service");
const request_tail_middleware_1 = require("./request-tail/request-tail.middleware");
const request_tail_service_1 = require("./request-tail/request-tail.service");
const scenario_registry_service_1 = require("./scenarios/scenario-registry.service");
const webhook_recorder_service_1 = require("./webhooks/webhook-recorder.service");
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
        const controllers = [
            health_controller_1.HealthController,
            openapi_controller_1.OpenApiController,
            admin_brand_controller_1.AdminBrandController,
            control_controller_1.ControlController,
        ];
        const providers = [
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
                provide: webhook_recorder_service_1.WebhookRecorderService,
                useFactory: () => new webhook_recorder_service_1.WebhookRecorderService(normalized.webhookHistorySize),
            },
            {
                provide: scenario_registry_service_1.ScenarioRegistryService,
                useFactory: () => new scenario_registry_service_1.ScenarioRegistryService(normalized.scenarios ?? []),
            },
            control_service_1.ControlService,
            control_guard_1.ControlAuthGuard,
            request_tail_middleware_1.RequestTailMiddleware,
            // Always provided. With `adminAuth` absent or disabled the service is
            // inert and the middleware is one boolean check on `/admin` requests, so
            // the disabled path stays byte-for-byte what v0.2.0 did.
            admin_auth_service_1.AdminAuthService,
            admin_auth_middleware_1.AdminAuthMiddleware,
            { provide: core_1.APP_INTERCEPTOR, useClass: chaos_interceptor_1.ChaosInterceptor },
        ];
        const exports = [
            config_1.SIM_CORE_CONFIG,
            admin_auth_service_1.AdminAuthService,
            chaos_service_1.ChaosService,
            driver_service_1.DriverService,
            request_tail_service_1.RequestTailService,
            webhook_recorder_service_1.WebhookRecorderService,
            scenario_registry_service_1.ScenarioRegistryService,
            control_service_1.ControlService,
        ];
        // Docs are opt-in. Left off (the default), nothing below is constructed:
        // no SQLite handle, no data directory, no /docs routes — a v0.1.0 config
        // repinned to v0.2.0 gets byte-for-byte the same behaviour.
        if (normalized.docs?.enabled) {
            controllers.push(docs_controller_1.DocsController, docs_control_controller_1.DocsControlController);
            providers.push(docs_service_1.DocsService, docs_auth_guard_1.DocsAuthGuard, 
            // The optional hook OpenApiController uses to serve the ACTIVE
            // published spec version instead of the static config document.
            { provide: openapi_controller_1.ACTIVE_SPEC_SOURCE, useExisting: docs_service_1.DocsService });
            exports.push(docs_service_1.DocsService);
            logger.log(`docs engine enabled (authMode=${normalized.docs.authMode ?? 'public'}, ` +
                `chaosOptIn=${normalized.docsChaosOptIn === true})`);
        }
        if (normalized.adminAuth?.enabled) {
            logger.log(`admin auth enabled (Google OIDC, domain=${normalized.adminAuth.allowedDomain}` +
                `${normalized.adminAuth.allowedEmails ? `, ${normalized.adminAuth.allowedEmails.length} allow-listed addresses` : ''}) ` +
                '— gates /admin; its session also authorizes /__control (CONTROL_TOKEN still works too); ' +
                '/docs, /openapi.json and /health are unaffected');
        }
        return {
            module: SimCoreModule_1,
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
    configure(consumer) {
        consumer
            .apply(request_tail_middleware_1.RequestTailMiddleware, admin_auth_middleware_1.AdminAuthMiddleware)
            .forRoutes({ path: '*splat', method: common_1.RequestMethod.ALL });
    }
};
exports.SimCoreModule = SimCoreModule;
exports.SimCoreModule = SimCoreModule = SimCoreModule_1 = __decorate([
    (0, common_1.Module)({})
], SimCoreModule);

"use strict";
/**
 * sim-core — shared engine for the synthetic partner-ecosystem sim fleet.
 *
 * Everything a consumer repo (sim-staybase, sim-bookbridge, …) needs is
 * exported from here. See README.md for the full contract.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParamValidationError = exports.describeSchema = exports.p = exports.hashSeed = exports.createRng = exports.RequestTailMiddleware = exports.REQUEST_TAIL_CAPACITY = exports.RequestTailService = exports.resolveAdminDist = exports.AdminBrandController = exports.stripControlPaths = exports.OpenApiController = exports.HealthController = exports.parseDriverOverrideBody = exports.parseActivateScenarioBody = exports.TTL_MAX_SECONDS = exports.TTL_MIN_SECONDS = exports.ControlAuthGuard = exports.ControlController = exports.ControlService = exports.DriverService = exports.isChaosExempt = exports.CHAOS_EXEMPT_PREFIXES = exports.ChaosInterceptor = exports.ChaosService = exports.authFailureScenario = exports.outageScenario = exports.errorSpikeScenario = exports.latencyScenario = exports.BUILTIN_SCENARIOS = exports.ScenarioRegistryService = exports.normalizeSimCoreConfig = exports.SIM_CORE_CONFIG = exports.bootstrapSimService = exports.SimCoreModule = void 0;
// --- module + bootstrap -----------------------------------------------------
var sim_core_module_1 = require("./sim-core.module");
Object.defineProperty(exports, "SimCoreModule", { enumerable: true, get: function () { return sim_core_module_1.SimCoreModule; } });
var bootstrap_1 = require("./bootstrap");
Object.defineProperty(exports, "bootstrapSimService", { enumerable: true, get: function () { return bootstrap_1.bootstrapSimService; } });
// --- config -----------------------------------------------------------------
var config_1 = require("./config");
Object.defineProperty(exports, "SIM_CORE_CONFIG", { enumerable: true, get: function () { return config_1.SIM_CORE_CONFIG; } });
Object.defineProperty(exports, "normalizeSimCoreConfig", { enumerable: true, get: function () { return config_1.normalizeSimCoreConfig; } });
// --- scenarios --------------------------------------------------------------
var scenario_registry_service_1 = require("./scenarios/scenario-registry.service");
Object.defineProperty(exports, "ScenarioRegistryService", { enumerable: true, get: function () { return scenario_registry_service_1.ScenarioRegistryService; } });
var builtin_scenarios_1 = require("./scenarios/builtin-scenarios");
Object.defineProperty(exports, "BUILTIN_SCENARIOS", { enumerable: true, get: function () { return builtin_scenarios_1.BUILTIN_SCENARIOS; } });
Object.defineProperty(exports, "latencyScenario", { enumerable: true, get: function () { return builtin_scenarios_1.latencyScenario; } });
Object.defineProperty(exports, "errorSpikeScenario", { enumerable: true, get: function () { return builtin_scenarios_1.errorSpikeScenario; } });
Object.defineProperty(exports, "outageScenario", { enumerable: true, get: function () { return builtin_scenarios_1.outageScenario; } });
Object.defineProperty(exports, "authFailureScenario", { enumerable: true, get: function () { return builtin_scenarios_1.authFailureScenario; } });
// --- chaos ------------------------------------------------------------------
var chaos_service_1 = require("./chaos/chaos.service");
Object.defineProperty(exports, "ChaosService", { enumerable: true, get: function () { return chaos_service_1.ChaosService; } });
var chaos_interceptor_1 = require("./chaos/chaos.interceptor");
Object.defineProperty(exports, "ChaosInterceptor", { enumerable: true, get: function () { return chaos_interceptor_1.ChaosInterceptor; } });
Object.defineProperty(exports, "CHAOS_EXEMPT_PREFIXES", { enumerable: true, get: function () { return chaos_interceptor_1.CHAOS_EXEMPT_PREFIXES; } });
Object.defineProperty(exports, "isChaosExempt", { enumerable: true, get: function () { return chaos_interceptor_1.isChaosExempt; } });
// --- driver -----------------------------------------------------------------
var driver_service_1 = require("./driver/driver.service");
Object.defineProperty(exports, "DriverService", { enumerable: true, get: function () { return driver_service_1.DriverService; } });
// --- control ----------------------------------------------------------------
var control_service_1 = require("./control/control.service");
Object.defineProperty(exports, "ControlService", { enumerable: true, get: function () { return control_service_1.ControlService; } });
var control_controller_1 = require("./control/control.controller");
Object.defineProperty(exports, "ControlController", { enumerable: true, get: function () { return control_controller_1.ControlController; } });
var control_guard_1 = require("./control/control.guard");
Object.defineProperty(exports, "ControlAuthGuard", { enumerable: true, get: function () { return control_guard_1.ControlAuthGuard; } });
var control_dto_1 = require("./control/control.dto");
Object.defineProperty(exports, "TTL_MIN_SECONDS", { enumerable: true, get: function () { return control_dto_1.TTL_MIN_SECONDS; } });
Object.defineProperty(exports, "TTL_MAX_SECONDS", { enumerable: true, get: function () { return control_dto_1.TTL_MAX_SECONDS; } });
Object.defineProperty(exports, "parseActivateScenarioBody", { enumerable: true, get: function () { return control_dto_1.parseActivateScenarioBody; } });
Object.defineProperty(exports, "parseDriverOverrideBody", { enumerable: true, get: function () { return control_dto_1.parseDriverOverrideBody; } });
// --- built-in routes --------------------------------------------------------
var health_controller_1 = require("./builtins/health.controller");
Object.defineProperty(exports, "HealthController", { enumerable: true, get: function () { return health_controller_1.HealthController; } });
var openapi_controller_1 = require("./builtins/openapi.controller");
Object.defineProperty(exports, "OpenApiController", { enumerable: true, get: function () { return openapi_controller_1.OpenApiController; } });
Object.defineProperty(exports, "stripControlPaths", { enumerable: true, get: function () { return openapi_controller_1.stripControlPaths; } });
var admin_brand_controller_1 = require("./builtins/admin-brand.controller");
Object.defineProperty(exports, "AdminBrandController", { enumerable: true, get: function () { return admin_brand_controller_1.AdminBrandController; } });
var admin_static_1 = require("./builtins/admin-static");
Object.defineProperty(exports, "resolveAdminDist", { enumerable: true, get: function () { return admin_static_1.resolveAdminDist; } });
// --- request tail -----------------------------------------------------------
var request_tail_service_1 = require("./request-tail/request-tail.service");
Object.defineProperty(exports, "RequestTailService", { enumerable: true, get: function () { return request_tail_service_1.RequestTailService; } });
Object.defineProperty(exports, "REQUEST_TAIL_CAPACITY", { enumerable: true, get: function () { return request_tail_service_1.REQUEST_TAIL_CAPACITY; } });
var request_tail_middleware_1 = require("./request-tail/request-tail.middleware");
Object.defineProperty(exports, "RequestTailMiddleware", { enumerable: true, get: function () { return request_tail_middleware_1.RequestTailMiddleware; } });
// --- utilities --------------------------------------------------------------
var rng_1 = require("./rng");
Object.defineProperty(exports, "createRng", { enumerable: true, get: function () { return rng_1.createRng; } });
Object.defineProperty(exports, "hashSeed", { enumerable: true, get: function () { return rng_1.hashSeed; } });
var params_1 = require("./params");
Object.defineProperty(exports, "p", { enumerable: true, get: function () { return params_1.p; } });
Object.defineProperty(exports, "describeSchema", { enumerable: true, get: function () { return params_1.describeSchema; } });
Object.defineProperty(exports, "ParamValidationError", { enumerable: true, get: function () { return params_1.ParamValidationError; } });

"use strict";
/**
 * sim-core — shared engine for the synthetic partner-ecosystem sim fleet.
 *
 * Everything a consumer repo (sim-staybase, sim-bookbridge, …) needs is
 * exported from here. See README.md for the full contract.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorSpikeScenario = exports.latencyScenario = exports.BUILTIN_SCENARIOS = exports.ScenarioRegistryService = exports.toHttpSeconds = exports.isNotModified = exports.httpDate = exports.WEBHOOK_RECORDER_CAPACITY = exports.WEBHOOK_BODY_PREVIEW_CHARS = exports.WebhookRecorderService = exports.verifyPlatformWebhook = exports.signPlatformWebhook = exports.inspectWebhookRequest = exports.extractRawBody = exports.assertPlatformWebhook = exports.DEFAULT_WEBHOOK_SIGNATURE_HEADER = exports.parseUpdateSpecVersionBody = exports.parsePreviewBody = exports.parseGuideBody = exports.parseCreateSpecVersionBody = exports.parseChangelogBody = exports.readString = exports.readNumber = exports.readBoolean = exports.parseFrontmatter = exports.renderMarkdown = exports.renderInline = exports.escapeHtml = exports.renderNotFoundPage = exports.renderGuidePage = exports.renderDocsIndex = exports.renderChangelogPage = exports.slugify = exports.seedFromContent = exports.loadContent = exports.DOCS_MIGRATIONS = exports.DocsRepository = exports.DocsAuthGuard = exports.DocsControlController = exports.DocsController = exports.contentEtag = exports.DocsService = exports.resolveDatabaseFile = exports.resolveDataDir = exports.DEFAULT_DATA_DIR = exports.SimStorage = exports.normalizeSimCoreConfig = exports.SIM_CORE_CONFIG = exports.bootstrapSimService = exports.SimCoreModule = void 0;
exports.ParamValidationError = exports.describeSchema = exports.p = exports.hashSeed = exports.createRng = exports.RequestTailMiddleware = exports.REQUEST_TAIL_CAPACITY = exports.RequestTailService = exports.resolveAdminDist = exports.AdminBrandController = exports.stripControlPaths = exports.ACTIVE_SPEC_SOURCE = exports.OpenApiController = exports.HealthController = exports.parseDriverOverrideBody = exports.parseActivateScenarioBody = exports.TTL_MAX_SECONDS = exports.TTL_MIN_SECONDS = exports.ControlAuthGuard = exports.ControlController = exports.ControlService = exports.DriverService = exports.isChaosExempt = exports.DOCS_CHAOS_PREFIXES = exports.CHAOS_EXEMPT_PREFIXES = exports.ChaosInterceptor = exports.ChaosService = exports.authFailureScenario = exports.outageScenario = void 0;
// --- module + bootstrap -----------------------------------------------------
var sim_core_module_1 = require("./sim-core.module");
Object.defineProperty(exports, "SimCoreModule", { enumerable: true, get: function () { return sim_core_module_1.SimCoreModule; } });
var bootstrap_1 = require("./bootstrap");
Object.defineProperty(exports, "bootstrapSimService", { enumerable: true, get: function () { return bootstrap_1.bootstrapSimService; } });
// --- config -----------------------------------------------------------------
var config_1 = require("./config");
Object.defineProperty(exports, "SIM_CORE_CONFIG", { enumerable: true, get: function () { return config_1.SIM_CORE_CONFIG; } });
Object.defineProperty(exports, "normalizeSimCoreConfig", { enumerable: true, get: function () { return config_1.normalizeSimCoreConfig; } });
// --- storage (v0.2.0) -------------------------------------------------------
var storage_service_1 = require("./storage/storage.service");
Object.defineProperty(exports, "SimStorage", { enumerable: true, get: function () { return storage_service_1.SimStorage; } });
Object.defineProperty(exports, "DEFAULT_DATA_DIR", { enumerable: true, get: function () { return storage_service_1.DEFAULT_DATA_DIR; } });
Object.defineProperty(exports, "resolveDataDir", { enumerable: true, get: function () { return storage_service_1.resolveDataDir; } });
Object.defineProperty(exports, "resolveDatabaseFile", { enumerable: true, get: function () { return storage_service_1.resolveDatabaseFile; } });
// --- docs engine (v0.2.0) ---------------------------------------------------
var docs_service_1 = require("./docs/docs.service");
Object.defineProperty(exports, "DocsService", { enumerable: true, get: function () { return docs_service_1.DocsService; } });
Object.defineProperty(exports, "contentEtag", { enumerable: true, get: function () { return docs_service_1.contentEtag; } });
var docs_controller_1 = require("./docs/docs.controller");
Object.defineProperty(exports, "DocsController", { enumerable: true, get: function () { return docs_controller_1.DocsController; } });
var docs_control_controller_1 = require("./docs/docs-control.controller");
Object.defineProperty(exports, "DocsControlController", { enumerable: true, get: function () { return docs_control_controller_1.DocsControlController; } });
var docs_auth_guard_1 = require("./docs/docs-auth.guard");
Object.defineProperty(exports, "DocsAuthGuard", { enumerable: true, get: function () { return docs_auth_guard_1.DocsAuthGuard; } });
var docs_repository_1 = require("./docs/docs.repository");
Object.defineProperty(exports, "DocsRepository", { enumerable: true, get: function () { return docs_repository_1.DocsRepository; } });
Object.defineProperty(exports, "DOCS_MIGRATIONS", { enumerable: true, get: function () { return docs_repository_1.DOCS_MIGRATIONS; } });
var docs_seed_1 = require("./docs/docs.seed");
Object.defineProperty(exports, "loadContent", { enumerable: true, get: function () { return docs_seed_1.loadContent; } });
Object.defineProperty(exports, "seedFromContent", { enumerable: true, get: function () { return docs_seed_1.seedFromContent; } });
Object.defineProperty(exports, "slugify", { enumerable: true, get: function () { return docs_seed_1.slugify; } });
var docs_render_1 = require("./docs/docs.render");
Object.defineProperty(exports, "renderChangelogPage", { enumerable: true, get: function () { return docs_render_1.renderChangelogPage; } });
Object.defineProperty(exports, "renderDocsIndex", { enumerable: true, get: function () { return docs_render_1.renderDocsIndex; } });
Object.defineProperty(exports, "renderGuidePage", { enumerable: true, get: function () { return docs_render_1.renderGuidePage; } });
Object.defineProperty(exports, "renderNotFoundPage", { enumerable: true, get: function () { return docs_render_1.renderNotFoundPage; } });
var markdown_1 = require("./docs/markdown");
Object.defineProperty(exports, "escapeHtml", { enumerable: true, get: function () { return markdown_1.escapeHtml; } });
Object.defineProperty(exports, "renderInline", { enumerable: true, get: function () { return markdown_1.renderInline; } });
Object.defineProperty(exports, "renderMarkdown", { enumerable: true, get: function () { return markdown_1.renderMarkdown; } });
var frontmatter_1 = require("./docs/frontmatter");
Object.defineProperty(exports, "parseFrontmatter", { enumerable: true, get: function () { return frontmatter_1.parseFrontmatter; } });
Object.defineProperty(exports, "readBoolean", { enumerable: true, get: function () { return frontmatter_1.readBoolean; } });
Object.defineProperty(exports, "readNumber", { enumerable: true, get: function () { return frontmatter_1.readNumber; } });
Object.defineProperty(exports, "readString", { enumerable: true, get: function () { return frontmatter_1.readString; } });
var docs_dto_1 = require("./docs/docs.dto");
Object.defineProperty(exports, "parseChangelogBody", { enumerable: true, get: function () { return docs_dto_1.parseChangelogBody; } });
Object.defineProperty(exports, "parseCreateSpecVersionBody", { enumerable: true, get: function () { return docs_dto_1.parseCreateSpecVersionBody; } });
Object.defineProperty(exports, "parseGuideBody", { enumerable: true, get: function () { return docs_dto_1.parseGuideBody; } });
Object.defineProperty(exports, "parsePreviewBody", { enumerable: true, get: function () { return docs_dto_1.parsePreviewBody; } });
Object.defineProperty(exports, "parseUpdateSpecVersionBody", { enumerable: true, get: function () { return docs_dto_1.parseUpdateSpecVersionBody; } });
// --- webhooks (v0.2.0) ------------------------------------------------------
var verify_1 = require("./webhooks/verify");
Object.defineProperty(exports, "DEFAULT_WEBHOOK_SIGNATURE_HEADER", { enumerable: true, get: function () { return verify_1.DEFAULT_WEBHOOK_SIGNATURE_HEADER; } });
Object.defineProperty(exports, "assertPlatformWebhook", { enumerable: true, get: function () { return verify_1.assertPlatformWebhook; } });
Object.defineProperty(exports, "extractRawBody", { enumerable: true, get: function () { return verify_1.extractRawBody; } });
Object.defineProperty(exports, "inspectWebhookRequest", { enumerable: true, get: function () { return verify_1.inspectWebhookRequest; } });
Object.defineProperty(exports, "signPlatformWebhook", { enumerable: true, get: function () { return verify_1.signPlatformWebhook; } });
Object.defineProperty(exports, "verifyPlatformWebhook", { enumerable: true, get: function () { return verify_1.verifyPlatformWebhook; } });
var webhook_recorder_service_1 = require("./webhooks/webhook-recorder.service");
Object.defineProperty(exports, "WebhookRecorderService", { enumerable: true, get: function () { return webhook_recorder_service_1.WebhookRecorderService; } });
Object.defineProperty(exports, "WEBHOOK_BODY_PREVIEW_CHARS", { enumerable: true, get: function () { return webhook_recorder_service_1.WEBHOOK_BODY_PREVIEW_CHARS; } });
Object.defineProperty(exports, "WEBHOOK_RECORDER_CAPACITY", { enumerable: true, get: function () { return webhook_recorder_service_1.WEBHOOK_RECORDER_CAPACITY; } });
// --- conditional requests (v0.2.0) ------------------------------------------
var conditional_1 = require("./http/conditional");
Object.defineProperty(exports, "httpDate", { enumerable: true, get: function () { return conditional_1.httpDate; } });
Object.defineProperty(exports, "isNotModified", { enumerable: true, get: function () { return conditional_1.isNotModified; } });
Object.defineProperty(exports, "toHttpSeconds", { enumerable: true, get: function () { return conditional_1.toHttpSeconds; } });
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
Object.defineProperty(exports, "DOCS_CHAOS_PREFIXES", { enumerable: true, get: function () { return chaos_interceptor_1.DOCS_CHAOS_PREFIXES; } });
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
Object.defineProperty(exports, "ACTIVE_SPEC_SOURCE", { enumerable: true, get: function () { return openapi_controller_1.ACTIVE_SPEC_SOURCE; } });
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

/**
 * sim-core — shared engine for the synthetic partner-ecosystem sim fleet.
 *
 * Everything a consumer repo (sim-staybase, sim-bookbridge, …) needs is
 * exported from here. See README.md for the full contract.
 */
export { SimCoreModule } from './sim-core.module';
export { bootstrapSimService, type BootstrapSimServiceOptions } from './bootstrap';
export { SIM_CORE_CONFIG, normalizeSimCoreConfig, type SimCoreConfig, type SimBrand, type OpenApiDocument, } from './config';
export { AdminAuthService, isAdminGatedPath, parseCookieHeader, type CallbackFailure, type CallbackSuccess, } from './admin-auth/admin-auth.service';
export { AdminAuthMiddleware } from './admin-auth/admin-auth.middleware';
export { ADMIN_COOKIE_PATH, ADMIN_LOGOUT_PATH, DEFAULT_CALLBACK_PATH, DEFAULT_CLOCK_SKEW_SECONDS, DEFAULT_JWKS_CACHE_TTL_SECONDS, DEFAULT_SESSION_COOKIE_NAME, DEFAULT_SESSION_TTL_HOURS, DEFAULT_STATE_TTL_SECONDS, GOOGLE_AUTHORIZATION_ENDPOINT, GOOGLE_ISSUERS, GOOGLE_JWKS_URI, GOOGLE_TOKEN_ENDPOINT, SESSION_SECRET_MIN_LENGTH, resolveAdminAuthConfig, type ResolvedAdminAuthConfig, } from './admin-auth/admin-auth.config';
export { GoogleJwksCache, decodeJwt, verifyGoogleIdToken, type VerifyIdTokenOptions, } from './admin-auth/google-oidc';
export { renderAccessDeniedPage, renderSignedOutPage, type AdminAuthPageModel, } from './admin-auth/admin-auth.render';
export { AdminAuthError, type AdminAuthConfig, type AdminAuthFailure, type AdminAuthFetch, type AdminSession, type IdTokenClaims, } from './admin-auth/admin-auth.types';
export { SimStorage, DEFAULT_DATA_DIR, resolveDataDir, resolveDatabaseFile, } from './storage/storage.service';
export type { AppliedMigration, Migration, SqlDatabase, SqlDatabaseFactory, SqlStatement, StorageOptions, } from './storage/storage.types';
export { DocsService, contentEtag, type DocsStatus } from './docs/docs.service';
export { DocsController } from './docs/docs.controller';
export { DocsControlController } from './docs/docs-control.controller';
export { DocsAuthGuard } from './docs/docs-auth.guard';
export { DocsRepository, DOCS_MIGRATIONS, type ChangelogEntryInput, type GuideInput, type SpecVersionInput, } from './docs/docs.repository';
export { loadContent, seedFromContent, slugify, type DocsManifest, type LoadedContent, type SeedResult, } from './docs/docs.seed';
export { renderChangelogPage, renderDocsIndex, renderGuidePage, renderNotFoundPage, type DocsChangelogModel, type DocsGuideModel, type DocsIndexModel, type DocsLayoutOptions, } from './docs/docs.render';
export { escapeHtml, renderInline, renderMarkdown } from './docs/markdown';
export { parseFrontmatter, readBoolean, readNumber, readString, type FrontmatterValue, type ParsedDocument, } from './docs/frontmatter';
export { parseChangelogBody, parseCreateSpecVersionBody, parseGuideBody, parsePreviewBody, parseUpdateSpecVersionBody, type ChangelogBody, type CreateSpecVersionBody, type GuideBody, type UpdateSpecVersionBody, } from './docs/docs.dto';
export type { ChangelogEntry, DocsAuthCheck, DocsAuthMode, DocsConfig, DocsPageLink, Guide, ServedSpec, SpecVersion, SpecVersionSummary, } from './docs/docs.types';
export { DEFAULT_WEBHOOK_SIGNATURE_HEADER, assertPlatformWebhook, extractRawBody, inspectWebhookRequest, signPlatformWebhook, verifyPlatformWebhook, type WebhookVerification, type WebhookVerificationOptions, } from './webhooks/verify';
export { WebhookRecorderService, WEBHOOK_BODY_PREVIEW_CHARS, WEBHOOK_RECORDER_CAPACITY, type RecordWebhookInput, type RecordedWebhook, } from './webhooks/webhook-recorder.service';
export { httpDate, isNotModified, toHttpSeconds, type ConditionalTarget, } from './http/conditional';
export { ScenarioRegistryService } from './scenarios/scenario-registry.service';
export { BUILTIN_SCENARIOS, latencyScenario, errorSpikeScenario, outageScenario, authFailureScenario, } from './scenarios/builtin-scenarios';
export type { Scenario, ScenarioContext, ScenarioListing, ScenarioAdminMeta, ActiveScenarioState, RevertFn, } from './scenarios/scenario.types';
export { ChaosService } from './chaos/chaos.service';
export { ChaosInterceptor, CHAOS_EXEMPT_PREFIXES, DOCS_CHAOS_PREFIXES, isChaosExempt, type ChaosExemptionOptions, } from './chaos/chaos.interceptor';
export type { ChaosControl, ChaosRule, ActiveChaosRule, LatencyPrimitive, ErrorRatePrimitive, MalformedResponsePrimitive, RejectPrimitive, } from './chaos/chaos.types';
export { DriverService } from './driver/driver.service';
export type { DriverConfig, DriverControl, DriverMode, DriverStatus, DriverFlowStats, FlowDefinition, FlowStep, FlowRequest, FlowResponse, FlowState, FlowContext, RequestMutator, RhythmCurve, FetchLike, } from './driver/driver.types';
export { ControlService } from './control/control.service';
export { ControlController } from './control/control.controller';
export { ControlAuthGuard } from './control/control.guard';
export { TTL_MIN_SECONDS, TTL_MAX_SECONDS, parseActivateScenarioBody, parseDriverOverrideBody, type ActivateScenarioBody, type DriverOverrideBody, } from './control/control.dto';
export type { ControlState, DriverOverrideState } from './control/control.service';
export { validateAdminActions, type AdminAction, type AdminActionChoice, } from './control/admin-actions';
export { HealthController, type HealthPayload } from './builtins/health.controller';
export { OpenApiController, ACTIVE_SPEC_SOURCE, stripControlPaths, type ActiveSpecSource, } from './builtins/openapi.controller';
export { AdminBrandController, type AdminBrandPayload, } from './builtins/admin-brand.controller';
export { resolveAdminDist } from './builtins/admin-static';
export { RequestTailService, REQUEST_TAIL_CAPACITY, type RequestTailEntry, } from './request-tail/request-tail.service';
export { RequestTailMiddleware } from './request-tail/request-tail.middleware';
export { createRng, hashSeed, type Rng } from './rng';
export { p, describeSchema, ParamValidationError, type ParamSchema, type ParamFieldDescription, type Infer, } from './params';

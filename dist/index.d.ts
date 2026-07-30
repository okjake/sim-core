/**
 * sim-core — shared engine for the synthetic partner-ecosystem sim fleet.
 *
 * Everything a consumer repo (sim-staybase, sim-bookbridge, …) needs is
 * exported from here. See README.md for the full contract.
 */
export { SimCoreModule } from './sim-core.module';
export { bootstrapSimService, type BootstrapSimServiceOptions } from './bootstrap';
export { SIM_CORE_CONFIG, normalizeSimCoreConfig, type SimCoreConfig, type SimBrand, type OpenApiDocument, } from './config';
export { ScenarioRegistryService } from './scenarios/scenario-registry.service';
export { BUILTIN_SCENARIOS, latencyScenario, errorSpikeScenario, outageScenario, authFailureScenario, } from './scenarios/builtin-scenarios';
export type { Scenario, ScenarioContext, ScenarioListing, ActiveScenarioState, RevertFn, } from './scenarios/scenario.types';
export { ChaosService } from './chaos/chaos.service';
export { ChaosInterceptor, CHAOS_EXEMPT_PREFIXES, isChaosExempt } from './chaos/chaos.interceptor';
export type { ChaosControl, ChaosRule, ActiveChaosRule, LatencyPrimitive, ErrorRatePrimitive, MalformedResponsePrimitive, RejectPrimitive, } from './chaos/chaos.types';
export { DriverService } from './driver/driver.service';
export type { DriverConfig, DriverControl, DriverMode, DriverStatus, DriverFlowStats, FlowDefinition, FlowStep, FlowRequest, FlowResponse, FlowState, FlowContext, RequestMutator, RhythmCurve, FetchLike, } from './driver/driver.types';
export { ControlService } from './control/control.service';
export { ControlController } from './control/control.controller';
export { ControlAuthGuard } from './control/control.guard';
export { TTL_MIN_SECONDS, TTL_MAX_SECONDS, parseActivateScenarioBody, parseDriverOverrideBody, type ActivateScenarioBody, type DriverOverrideBody, } from './control/control.dto';
export type { ControlState, DriverOverrideState } from './control/control.service';
export { HealthController, type HealthPayload } from './builtins/health.controller';
export { OpenApiController, stripControlPaths } from './builtins/openapi.controller';
export { AdminBrandController, type AdminBrandPayload, } from './builtins/admin-brand.controller';
export { resolveAdminDist } from './builtins/admin-static';
export { RequestTailService, REQUEST_TAIL_CAPACITY, type RequestTailEntry, } from './request-tail/request-tail.service';
export { RequestTailMiddleware } from './request-tail/request-tail.middleware';
export { createRng, hashSeed, type Rng } from './rng';
export { p, describeSchema, ParamValidationError, type ParamSchema, type ParamFieldDescription, type Infer, } from './params';

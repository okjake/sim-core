"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlService = void 0;
const common_1 = require("@nestjs/common");
const chaos_service_1 = require("../chaos/chaos.service");
const config_1 = require("../config");
const driver_service_1 = require("../driver/driver.service");
const rng_1 = require("../rng");
const request_tail_service_1 = require("../request-tail/request-tail.service");
const scenario_registry_service_1 = require("../scenarios/scenario-registry.service");
/**
 * Owns all mutable, TTL-bounded state: the active scenario and the driver
 * override. Both auto-revert; `reset()` reverts both immediately.
 */
let ControlService = class ControlService {
    config;
    registry;
    chaos;
    driver;
    tail;
    logger = new common_1.Logger('SimControl');
    startedAt = Date.now();
    active = null;
    driverOverride = null;
    constructor(config, registry, chaos, driver, tail) {
        this.config = config;
        this.registry = registry;
        this.chaos = chaos;
        this.driver = driver;
        this.tail = tail;
    }
    onModuleDestroy() {
        if (this.active)
            clearTimeout(this.active.timer);
        if (this.driverOverride)
            clearTimeout(this.driverOverride.timer);
    }
    // ----------------------------------------------------------------- registry
    listScenarios() {
        return this.registry.list();
    }
    // ---------------------------------------------------------------- scenarios
    async activateScenario(body) {
        const scenario = this.registry.get(body.scenario);
        if (!scenario) {
            throw new common_1.NotFoundException({
                error: 'unknown_scenario',
                message: `No scenario registered with id "${body.scenario}"`,
                available: this.registry.ids(),
            });
        }
        let params = body.params ?? {};
        if (scenario.params) {
            try {
                params = scenario.params.parse(body.params ?? {});
            }
            catch (error) {
                throw new common_1.BadRequestException({
                    error: 'invalid_scenario_params',
                    message: error instanceof Error ? error.message : 'params failed validation',
                });
            }
        }
        // Activation replaces any scenario already running.
        await this.deactivateScenario('replaced');
        const ctx = {
            chaos: this.chaos,
            driver: this.driver,
            rng: (0, rng_1.createRng)(`${String(this.config.seed ?? this.config.name)}:${scenario.id}`),
            logger: new common_1.Logger(`SimScenario:${scenario.id}`),
            service: { name: this.config.name, brand: this.config.brand },
        };
        let revert;
        try {
            revert = await scenario.apply(ctx, params);
        }
        catch (error) {
            throw new common_1.BadRequestException({
                error: 'scenario_apply_failed',
                message: error instanceof Error ? error.message : String(error),
            });
        }
        if (typeof revert !== 'function') {
            throw new common_1.BadRequestException({
                error: 'scenario_contract_violation',
                message: `Scenario "${scenario.id}" did not return a revert function`,
            });
        }
        const now = Date.now();
        const timer = setTimeout(() => {
            void this.deactivateScenario('ttl-expired');
        }, body.ttlSeconds * 1000);
        if (typeof timer.unref === 'function')
            timer.unref();
        this.active = {
            id: scenario.id,
            description: scenario.description,
            params,
            activatedAt: now,
            expiresAt: now + body.ttlSeconds * 1000,
            ttlSeconds: body.ttlSeconds,
            revert,
            timer,
        };
        this.logger.log(`scenario "${scenario.id}" activated for ${body.ttlSeconds}s (auto-reverts at ${new Date(this.active.expiresAt).toISOString()})`);
        return this.state();
    }
    async deactivateScenario(reason = 'manual') {
        const current = this.active;
        if (!current)
            return;
        this.active = null;
        clearTimeout(current.timer);
        try {
            await current.revert();
        }
        catch (error) {
            this.logger.error(`revert for scenario "${current.id}" threw; forcing chaos + driver back to baseline: ${String(error)}`);
            this.chaos.clear();
            this.driver.reset();
        }
        this.logger.log(`scenario "${current.id}" deactivated (${reason})`);
    }
    activeScenario() {
        if (!this.active)
            return null;
        const remainingMs = Math.max(0, this.active.expiresAt - Date.now());
        return {
            id: this.active.id,
            description: this.active.description,
            params: this.active.params,
            activatedAt: new Date(this.active.activatedAt).toISOString(),
            expiresAt: new Date(this.active.expiresAt).toISOString(),
            ttlSeconds: this.active.ttlSeconds,
            remainingSeconds: Math.ceil(remainingMs / 1000),
        };
    }
    // ------------------------------------------------------------------- driver
    setDriverOverride(body) {
        if (!this.driver.isConfigured()) {
            throw new common_1.ConflictException({
                error: 'driver_not_configured',
                message: 'This sim service has no traffic driver configured',
            });
        }
        this.clearDriverOverride('replaced');
        this.driver.setMode(body.mode, body.multiplier);
        const now = Date.now();
        const timer = setTimeout(() => {
            this.clearDriverOverride('ttl-expired');
        }, body.ttlSeconds * 1000);
        if (typeof timer.unref === 'function')
            timer.unref();
        this.driverOverride = {
            mode: body.mode,
            multiplier: body.multiplier ?? 1,
            activatedAt: new Date(now).toISOString(),
            expiresAt: new Date(now + body.ttlSeconds * 1000).toISOString(),
            activatedAtMs: now,
            expiresAtMs: now + body.ttlSeconds * 1000,
            ttlSeconds: body.ttlSeconds,
            timer,
        };
        this.logger.log(`driver override mode=${body.mode} multiplier=${body.multiplier ?? 1} for ${body.ttlSeconds}s`);
        return this.state();
    }
    clearDriverOverride(reason = 'manual') {
        const current = this.driverOverride;
        if (!current)
            return;
        this.driverOverride = null;
        clearTimeout(current.timer);
        this.driver.resetMode();
        this.logger.log(`driver override cleared (${reason})`);
    }
    driverOverrideState() {
        if (!this.driverOverride)
            return null;
        const { activatedAt, expiresAt, ttlSeconds, mode, multiplier, expiresAtMs } = this.driverOverride;
        return {
            mode,
            multiplier,
            activatedAt,
            expiresAt,
            ttlSeconds,
            remainingSeconds: Math.ceil(Math.max(0, expiresAtMs - Date.now()) / 1000),
        };
    }
    // -------------------------------------------------------------------- reset
    /** Immediate, unconditional return to baseline. The kill switch. */
    async reset() {
        await this.deactivateScenario('reset');
        this.clearDriverOverride('reset');
        this.chaos.clear();
        this.driver.reset();
        this.logger.log('reset — chaos and driver returned to baseline');
        return this.state();
    }
    // -------------------------------------------------------------------- state
    state() {
        const chaosBaseline = this.chaos.isBaseline();
        const driverStatus = this.driver.status();
        const driverBaseline = !this.driverOverride &&
            driverStatus.mode === driverStatus.defaultMode &&
            driverStatus.multiplier === 1 &&
            driverStatus.requestMutators === 0;
        return {
            service: {
                name: this.config.name,
                brand: this.config.brand,
                version: this.config.version ?? '0.0.0',
                startedAt: new Date(this.startedAt).toISOString(),
                uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
            },
            scenario: this.activeScenario(),
            chaos: { baseline: chaosBaseline, rules: this.chaos.rules() },
            driver: { ...driverStatus, override: this.driverOverrideState() },
            baseline: {
                chaos: chaosBaseline,
                driver: driverBaseline,
                overall: chaosBaseline && driverBaseline && this.active === null,
            },
            requestTail: {
                size: this.tail.size(),
                capacity: this.config.requestTailSize ?? 200,
            },
            scenariosAvailable: this.registry.ids(),
        };
    }
};
exports.ControlService = ControlService;
exports.ControlService = ControlService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(config_1.SIM_CORE_CONFIG)),
    __metadata("design:paramtypes", [Object, scenario_registry_service_1.ScenarioRegistryService,
        chaos_service_1.ChaosService,
        driver_service_1.DriverService,
        request_tail_service_1.RequestTailService])
], ControlService);

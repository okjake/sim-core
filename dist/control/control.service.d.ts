import { OnModuleDestroy } from '@nestjs/common';
import { ChaosService } from '../chaos/chaos.service';
import type { ActiveChaosRule } from '../chaos/chaos.types';
import { type SimCoreConfig } from '../config';
import { DriverService } from '../driver/driver.service';
import type { DriverMode, DriverStatus } from '../driver/driver.types';
import { RequestTailService } from '../request-tail/request-tail.service';
import { ScenarioRegistryService } from '../scenarios/scenario-registry.service';
import type { ActiveScenarioState, ScenarioListing } from '../scenarios/scenario.types';
import type { ActivateScenarioBody, DriverOverrideBody } from './control.dto';
export interface DriverOverrideState {
    mode: DriverMode;
    multiplier: number;
    activatedAt: string;
    expiresAt: string;
    ttlSeconds: number;
    remainingSeconds: number;
}
export interface ControlState {
    service: {
        name: string;
        brand: SimCoreConfig['brand'];
        version: string;
        startedAt: string;
        uptimeSeconds: number;
    };
    /** null when running at baseline. */
    scenario: ActiveScenarioState | null;
    chaos: {
        baseline: boolean;
        rules: ActiveChaosRule[];
    };
    driver: DriverStatus & {
        override: DriverOverrideState | null;
    };
    /** Everything at baseline? The one-glance answer. */
    baseline: {
        chaos: boolean;
        driver: boolean;
        overall: boolean;
    };
    requestTail: {
        size: number;
        capacity: number;
    };
    scenariosAvailable: string[];
}
/**
 * Owns all mutable, TTL-bounded state: the active scenario and the driver
 * override. Both auto-revert; `reset()` reverts both immediately.
 */
export declare class ControlService implements OnModuleDestroy {
    private readonly config;
    private readonly registry;
    private readonly chaos;
    private readonly driver;
    private readonly tail;
    private readonly logger;
    private readonly startedAt;
    private active;
    private driverOverride;
    constructor(config: SimCoreConfig, registry: ScenarioRegistryService, chaos: ChaosService, driver: DriverService, tail: RequestTailService);
    onModuleDestroy(): void;
    listScenarios(): ScenarioListing[];
    activateScenario(body: ActivateScenarioBody): Promise<ControlState>;
    deactivateScenario(reason?: string): Promise<void>;
    activeScenario(): ActiveScenarioState | null;
    setDriverOverride(body: DriverOverrideBody): ControlState;
    clearDriverOverride(reason?: string): void;
    private driverOverrideState;
    /** Immediate, unconditional return to baseline. The kill switch. */
    reset(): Promise<ControlState>;
    state(): ControlState;
}

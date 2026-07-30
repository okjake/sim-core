import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';

import { ChaosService } from '../chaos/chaos.service';
import type { ActiveChaosRule } from '../chaos/chaos.types';
import { SIM_CORE_CONFIG, type SimCoreConfig } from '../config';
import { DriverService } from '../driver/driver.service';
import type { DriverMode, DriverStatus } from '../driver/driver.types';
import { createRng } from '../rng';
import { RequestTailService } from '../request-tail/request-tail.service';
import { ScenarioRegistryService } from '../scenarios/scenario-registry.service';
import type {
  ActiveScenarioState,
  RevertFn,
  ScenarioContext,
  ScenarioListing,
} from '../scenarios/scenario.types';
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
  driver: DriverStatus & { override: DriverOverrideState | null };
  /** Everything at baseline? The one-glance answer. */
  baseline: {
    chaos: boolean;
    driver: boolean;
    overall: boolean;
  };
  requestTail: { size: number; capacity: number };
  scenariosAvailable: string[];
}

interface ActiveScenarioRecord {
  id: string;
  description: string;
  params: unknown;
  activatedAt: number;
  expiresAt: number;
  ttlSeconds: number;
  revert: RevertFn;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Owns all mutable, TTL-bounded state: the active scenario and the driver
 * override. Both auto-revert; `reset()` reverts both immediately.
 */
@Injectable()
export class ControlService implements OnModuleDestroy {
  private readonly logger = new Logger('SimControl');
  private readonly startedAt = Date.now();

  private active: ActiveScenarioRecord | null = null;
  private driverOverride:
    | (Omit<DriverOverrideState, 'remainingSeconds'> & {
        activatedAtMs: number;
        expiresAtMs: number;
        timer: ReturnType<typeof setTimeout>;
      })
    | null = null;

  constructor(
    @Inject(SIM_CORE_CONFIG) private readonly config: SimCoreConfig,
    private readonly registry: ScenarioRegistryService,
    private readonly chaos: ChaosService,
    private readonly driver: DriverService,
    private readonly tail: RequestTailService,
  ) {}

  onModuleDestroy(): void {
    if (this.active) clearTimeout(this.active.timer);
    if (this.driverOverride) clearTimeout(this.driverOverride.timer);
  }

  // ----------------------------------------------------------------- registry

  listScenarios(): ScenarioListing[] {
    return this.registry.list();
  }

  // ---------------------------------------------------------------- scenarios

  async activateScenario(body: ActivateScenarioBody): Promise<ControlState> {
    const scenario = this.registry.get(body.scenario);
    if (!scenario) {
      throw new NotFoundException({
        error: 'unknown_scenario',
        message: `No scenario registered with id "${body.scenario}"`,
        available: this.registry.ids(),
      });
    }

    let params: unknown = body.params ?? {};
    if (scenario.params) {
      try {
        params = scenario.params.parse(body.params ?? {});
      } catch (error) {
        throw new BadRequestException({
          error: 'invalid_scenario_params',
          message: error instanceof Error ? error.message : 'params failed validation',
        });
      }
    }

    // Activation replaces any scenario already running.
    await this.deactivateScenario('replaced');

    const ctx: ScenarioContext = {
      chaos: this.chaos,
      driver: this.driver,
      rng: createRng(`${String(this.config.seed ?? this.config.name)}:${scenario.id}`),
      logger: new Logger(`SimScenario:${scenario.id}`),
      service: { name: this.config.name, brand: this.config.brand },
    };

    let revert: RevertFn;
    try {
      revert = await scenario.apply(ctx, params);
    } catch (error) {
      throw new BadRequestException({
        error: 'scenario_apply_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }

    if (typeof revert !== 'function') {
      throw new BadRequestException({
        error: 'scenario_contract_violation',
        message: `Scenario "${scenario.id}" did not return a revert function`,
      });
    }

    const now = Date.now();
    const timer = setTimeout(() => {
      void this.deactivateScenario('ttl-expired');
    }, body.ttlSeconds * 1000);
    if (typeof timer.unref === 'function') timer.unref();

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

    this.logger.log(
      `scenario "${scenario.id}" activated for ${body.ttlSeconds}s (auto-reverts at ${new Date(this.active.expiresAt).toISOString()})`,
    );

    return this.state();
  }

  async deactivateScenario(reason = 'manual'): Promise<void> {
    const current = this.active;
    if (!current) return;
    this.active = null;
    clearTimeout(current.timer);
    try {
      await current.revert();
    } catch (error) {
      this.logger.error(
        `revert for scenario "${current.id}" threw; forcing chaos + driver back to baseline: ${String(error)}`,
      );
      this.chaos.clear();
      this.driver.reset();
    }
    this.logger.log(`scenario "${current.id}" deactivated (${reason})`);
  }

  activeScenario(): ActiveScenarioState | null {
    if (!this.active) return null;
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

  setDriverOverride(body: DriverOverrideBody): ControlState {
    if (!this.driver.isConfigured()) {
      throw new ConflictException({
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
    if (typeof timer.unref === 'function') timer.unref();

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

    this.logger.log(
      `driver override mode=${body.mode} multiplier=${body.multiplier ?? 1} for ${body.ttlSeconds}s`,
    );

    return this.state();
  }

  clearDriverOverride(reason = 'manual'): void {
    const current = this.driverOverride;
    if (!current) return;
    this.driverOverride = null;
    clearTimeout(current.timer);
    this.driver.resetMode();
    this.logger.log(`driver override cleared (${reason})`);
  }

  private driverOverrideState(): DriverOverrideState | null {
    if (!this.driverOverride) return null;
    const { activatedAt, expiresAt, ttlSeconds, mode, multiplier, expiresAtMs } =
      this.driverOverride;
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
  async reset(): Promise<ControlState> {
    await this.deactivateScenario('reset');
    this.clearDriverOverride('reset');
    this.chaos.clear();
    this.driver.reset();
    this.logger.log('reset — chaos and driver returned to baseline');
    return this.state();
  }

  // -------------------------------------------------------------------- state

  state(): ControlState {
    const chaosBaseline = this.chaos.isBaseline();
    const driverStatus = this.driver.status();
    const driverBaseline =
      !this.driverOverride &&
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
}

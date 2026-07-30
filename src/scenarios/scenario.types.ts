import type { Logger } from '@nestjs/common';

import type { ChaosControl } from '../chaos/chaos.types';
import type { DriverControl } from '../driver/driver.types';
import type { ParamSchema } from '../params';
import type { Rng } from '../rng';

/** Undo everything a scenario did. May be async. Must be idempotent-safe to call once. */
export type RevertFn = () => void | Promise<void>;

export interface ScenarioContext {
  /** Install chaos primitives. */
  chaos: ChaosControl;
  /** Retune the traffic driver / install request mutators. */
  driver: DriverControl;
  /** Seeded RNG derived from the service seed + scenario id. */
  rng: Rng;
  logger: Logger;
  /** Service identity, so a scenario can behave differently per company. */
  service: { name: string; brand: { displayName: string; color: string } };
}

export interface Scenario<P = any> {
  id: string;
  description: string;
  /** Optional "zod-ish" schema. Anything with `.parse()` works; `.describe()` powers the admin form. */
  params?: ParamSchema<P>;
  apply(ctx: ScenarioContext, params: P): RevertFn | Promise<RevertFn>;
}

/** Public listing shape returned by `GET /__control/scenarios`. */
export interface ScenarioListing {
  id: string;
  description: string;
  params: unknown | null;
}

export interface ActiveScenarioState {
  id: string;
  description: string;
  params: unknown;
  activatedAt: string;
  expiresAt: string;
  ttlSeconds: number;
  remainingSeconds: number;
}

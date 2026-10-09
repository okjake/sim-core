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

/**
 * Optional presentation metadata for the admin SPA (v0.5.0).
 *
 * Purely descriptive: nothing on the server reads it, the control API's
 * contract is unchanged, and a scenario without it still lists and runs — the
 * SPA falls back to the id and `description`. It exists so the operator page
 * can say what a run is FOR (which Partner API automation it exercises) rather
 * than only what it does mechanically.
 */
export interface ScenarioAdminMeta {
  /** Human name, e.g. `Error storm`. Defaults to the id. */
  title?: string;
  /**
   * What the operator should expect to see happen in Partner API, one short
   * phrase each — e.g. `Traffic troubleshooting`. Rendered as "Triggers: …".
   */
  triggers?: string[];
  /**
   * Section the scenario is listed under. Scenarios sharing a group are shown
   * together; groups appear in first-seen order, consumer groups before the
   * built-in `Generic faults`.
   */
  group?: string;
  /**
   * The scenario's effect does NOT revert at TTL expiry (its revert is a
   * deliberate no-op), e.g. publishing a spec version. The SPA marks it
   * permanent, hides the duration picker and always asks before running it.
   */
  durable?: boolean;
  /** How to undo a durable scenario, e.g. `Reset docs (Danger zone)`. */
  undo?: string;
  /** Pre-selected duration in the SPA. Default 300. Ignored for durable scenarios. */
  defaultTtlSeconds?: number;
  /** Sort key within its group (ascending). Unset sorts after set, then by title. */
  order?: number;
}

export interface Scenario<P = any> {
  id: string;
  description: string;
  /** Optional "zod-ish" schema. Anything with `.parse()` works; `.describe()` powers the admin form. */
  params?: ParamSchema<P>;
  /** Optional admin-SPA presentation metadata. See {@link ScenarioAdminMeta}. */
  admin?: ScenarioAdminMeta;
  apply(ctx: ScenarioContext, params: P): RevertFn | Promise<RevertFn>;
}

/** Public listing shape returned by `GET /__control/scenarios`. */
export interface ScenarioListing {
  id: string;
  description: string;
  params: unknown | null;
  /** Additive in v0.5.0. `null` when the scenario declares none. */
  admin: ScenarioAdminMeta | null;
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

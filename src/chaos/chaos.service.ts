import { Injectable } from '@nestjs/common';

import { createRng, type Rng } from '../rng';
import type { ActiveChaosRule, ChaosControl, ChaosRule } from './chaos.types';

/**
 * In-memory chaos state.
 *
 * Baseline is "no rules". Rules are only ever installed by an active scenario,
 * which always carries a TTL, so the service self-heals even if nobody calls
 * `POST /__control/reset`.
 */
@Injectable()
export class ChaosService implements ChaosControl {
  private readonly ruleMap = new Map<string, ActiveChaosRule>();
  private counter = 0;
  private rng: Rng;

  constructor(seed: number | string = 'sim-core-chaos') {
    this.rng = createRng(seed);
  }

  apply(rule: ChaosRule): () => void {
    this.counter += 1;
    const id = rule.id ?? `rule-${this.counter}`;
    this.ruleMap.set(id, { ...rule, id });
    return () => {
      this.ruleMap.delete(id);
    };
  }

  clear(): void {
    this.ruleMap.clear();
  }

  rules(): ActiveChaosRule[] {
    return [...this.ruleMap.values()];
  }

  isBaseline(): boolean {
    return this.ruleMap.size === 0;
  }

  /** Reset the decision stream — used by tests wanting reproducible chaos. */
  reseed(seed: number | string): void {
    this.rng = createRng(seed);
  }

  /** Seeded coin flip. Never `Math.random()`. */
  chance(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.rng.chance(p);
  }

  jitter(baseMs: number, jitterMs: number): number {
    if (!jitterMs) return Math.max(0, Math.round(baseMs));
    const offset = this.rng.float(-jitterMs / 2, jitterMs / 2);
    return Math.max(0, Math.round(baseMs + offset));
  }

  /** Rules whose `pathPrefix` matches (or that are global). */
  rulesFor(path: string): ActiveChaosRule[] {
    return this.rules().filter(
      (rule) => !rule.pathPrefix || path.startsWith(rule.pathPrefix),
    );
  }

  /**
   * Collapse all matching rules into the effective set of primitives.
   * Later rules win per-primitive; latency accumulates.
   */
  resolve(path: string): ChaosRule {
    const matching = this.rulesFor(path);
    const resolved: ChaosRule = {};
    for (const rule of matching) {
      if (rule.latency) {
        resolved.latency = {
          baseMs: (resolved.latency?.baseMs ?? 0) + rule.latency.baseMs,
          jitterMs: (resolved.latency?.jitterMs ?? 0) + (rule.latency.jitterMs ?? 0),
        };
      }
      if (rule.errorRate) resolved.errorRate = rule.errorRate;
      if (rule.malformedResponse) resolved.malformedResponse = rule.malformedResponse;
      if (rule.reject) resolved.reject = rule.reject;
    }
    return resolved;
  }
}

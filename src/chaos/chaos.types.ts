/** `{ baseMs, jitterMs }` — delay of `baseMs ± jitterMs` before responding. */
export interface LatencyPrimitive {
  baseMs: number;
  /** Total jitter window; the applied delay is baseMs + rng(-jitterMs/2, +jitterMs/2). */
  jitterMs?: number;
}

/** Fail a fraction of matching requests with `status`. */
export interface ErrorRatePrimitive {
  /** 0..1 */
  rate: number;
  status: number;
  /** Optional body override; defaults to a sim-core error envelope. */
  message?: string;
}

/** Corrupt an otherwise-successful JSON response. */
export interface MalformedResponsePrimitive {
  mode: 'drop-fields' | 'wrong-types' | 'truncate';
  /** 0..1 — fraction of matching responses corrupted. Default 1. */
  rate?: number;
}

/** Short-circuit every matching request with `status` (e.g. 503 outage, 401 auth failure). */
export interface RejectPrimitive {
  status: number;
  message?: string;
}

/**
 * One chaos rule: primitives + the scope they apply to.
 *
 * `pathPrefix` is matched against the request path (`/v2/reservations`).
 * Omit it to apply globally. sim-core's own `/__control`, `/health` and
 * `/admin` routes are never affected — the kill switch must stay reachable.
 */
export interface ChaosRule {
  id?: string;
  pathPrefix?: string;
  latency?: LatencyPrimitive;
  errorRate?: ErrorRatePrimitive;
  malformedResponse?: MalformedResponsePrimitive;
  reject?: RejectPrimitive;
}

/** A live rule as reported by `GET /__control/state`. */
export interface ActiveChaosRule extends ChaosRule {
  id: string;
}

/** Handle handed to scenarios so they can install chaos and get a revert fn. */
export interface ChaosControl {
  /** Install a rule. The returned function removes exactly that rule. */
  apply(rule: ChaosRule): () => void;
  /** Remove every rule — baseline. */
  clear(): void;
  /** Currently installed rules. */
  rules(): ActiveChaosRule[];
}

import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, from, switchMap } from 'rxjs';

import { SIM_CORE_CONFIG, type SimCoreConfig } from '../config';
import { ChaosService } from './chaos.service';
import type { MalformedResponsePrimitive } from './chaos.types';

/**
 * Paths chaos never touches. `/__control` in particular must stay reachable —
 * an outage scenario that also broke its own kill switch would be unrecoverable.
 */
export const CHAOS_EXEMPT_PREFIXES = [
  '/__control',
  '/__admin',
  '/health',
  '/admin',
  '/openapi.json',
  '/docs',
];

/**
 * The documentation surface. Exempt by default, because a sim whose spec
 * endpoint 503s during an unrelated outage scenario looks to the platform like
 * an upstream that deleted its API. A consumer that specifically wants to
 * exercise docs-fetch failures opts in with `docsChaosOptIn: true`.
 */
export const DOCS_CHAOS_PREFIXES = ['/openapi.json', '/docs'];

export interface ChaosExemptionOptions {
  /** When true, `/docs` and `/openapi.json` become chaos-eligible. */
  docsChaosOptIn?: boolean;
}

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function isChaosExempt(path: string, options: ChaosExemptionOptions = {}): boolean {
  const exempt = options.docsChaosOptIn
    ? CHAOS_EXEMPT_PREFIXES.filter((prefix) => !DOCS_CHAOS_PREFIXES.includes(prefix))
    : CHAOS_EXEMPT_PREFIXES;
  return exempt.some((prefix) => matches(path, prefix));
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

@Injectable()
export class ChaosInterceptor implements NestInterceptor {
  private readonly docsChaosOptIn: boolean;

  constructor(
    private readonly chaos: ChaosService,
    @Optional() @Inject(SIM_CORE_CONFIG) config?: SimCoreConfig,
  ) {
    this.docsChaosOptIn = config?.docsChaosOptIn === true;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const path = req.path || (req.url ?? '').split('?')[0] || '/';

    if (isChaosExempt(path, { docsChaosOptIn: this.docsChaosOptIn })) {
      return next.handle();
    }

    const effective = this.chaos.resolve(path);
    const applied: string[] = [];

    if (effective.reject) {
      applied.push('reject');
      res.setHeader('x-sim-chaos', applied.join(','));
      throw new HttpException(
        {
          error: 'sim_chaos_reject',
          message: effective.reject.message ?? 'Rejected by an active sim scenario',
          status: effective.reject.status,
        },
        effective.reject.status,
      );
    }

    if (effective.errorRate && this.chaos.chance(effective.errorRate.rate)) {
      applied.push('error-rate');
      res.setHeader('x-sim-chaos', applied.join(','));
      throw new HttpException(
        {
          error: 'sim_chaos_error_rate',
          message:
            effective.errorRate.message ?? 'Injected failure from an active sim scenario',
          status: effective.errorRate.status,
        },
        effective.errorRate.status,
      );
    }

    const latencyMs = effective.latency
      ? this.chaos.jitter(effective.latency.baseMs, effective.latency.jitterMs ?? 0)
      : 0;

    if (latencyMs > 0) {
      applied.push('latency');
      res.setHeader('x-sim-chaos-latency-ms', String(latencyMs));
    }

    const malformed = effective.malformedResponse;

    if (applied.length === 0 && !malformed) {
      return next.handle();
    }

    return next
      .handle()
      .pipe(switchMap((value) => from(this.finish(value, latencyMs, malformed, applied, res))));
  }

  private async finish(
    value: unknown,
    latencyMs: number,
    malformed: MalformedResponsePrimitive | undefined,
    applied: string[],
    res: Response,
  ): Promise<unknown> {
    if (latencyMs > 0) {
      await sleep(latencyMs);
    }

    if (!malformed || !this.chaos.chance(malformed.rate ?? 1)) {
      if (applied.length > 0 && !res.headersSent) {
        res.setHeader('x-sim-chaos', applied.join(','));
      }
      return value;
    }

    applied.push('malformed');
    if (!res.headersSent) {
      res.setHeader('x-sim-chaos', applied.join(','));
      res.setHeader('x-sim-chaos-malformed', malformed.mode);
    }

    if (malformed.mode === 'truncate') {
      // Returned as a raw string: Nest's Express adapter sends non-object
      // bodies verbatim, so the client receives genuinely unparseable JSON
      // under an application/json content type.
      const raw = JSON.stringify(value ?? null);
      res.setHeader('content-type', 'application/json; charset=utf-8');
      return raw.slice(0, Math.max(1, Math.floor(raw.length * 0.6)));
    }

    return this.corrupt(value, malformed.mode);
  }

  private corrupt(value: unknown, mode: 'drop-fields' | 'wrong-types'): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.corrupt(item, mode));
    }
    if (value === null || typeof value !== 'object') {
      return mode === 'wrong-types' ? this.wrongType(value) : value;
    }

    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return value;
    }

    if (mode === 'drop-fields') {
      const kept = entries.filter(() => !this.chaos.chance(0.5));
      // Guarantee the corruption is observable.
      const survivors = kept.length === entries.length ? kept.slice(1) : kept;
      return Object.fromEntries(survivors);
    }

    return Object.fromEntries(
      entries.map(([key, item]) => [
        key,
        item !== null && typeof item === 'object'
          ? this.corrupt(item, mode)
          : this.wrongType(item),
      ]),
    );
  }

  private wrongType(value: unknown): unknown {
    switch (typeof value) {
      case 'number':
        return String(value);
      case 'string':
        return value.length;
      case 'boolean':
        return value ? 'yes' : 'no';
      default:
        return '__null__';
    }
  }
}

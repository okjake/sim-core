import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { type SimCoreConfig } from '../config';
import { ChaosService } from './chaos.service';
/**
 * Paths chaos never touches. `/__control` in particular must stay reachable —
 * an outage scenario that also broke its own kill switch would be unrecoverable.
 */
export declare const CHAOS_EXEMPT_PREFIXES: string[];
/**
 * The documentation surface. Exempt by default, because a sim whose spec
 * endpoint 503s during an unrelated outage scenario looks to the platform like
 * an upstream that deleted its API. A consumer that specifically wants to
 * exercise docs-fetch failures opts in with `docsChaosOptIn: true`.
 */
export declare const DOCS_CHAOS_PREFIXES: string[];
export interface ChaosExemptionOptions {
    /** When true, `/docs` and `/openapi.json` become chaos-eligible. */
    docsChaosOptIn?: boolean;
}
export declare function isChaosExempt(path: string, options?: ChaosExemptionOptions): boolean;
export declare class ChaosInterceptor implements NestInterceptor {
    private readonly chaos;
    private readonly docsChaosOptIn;
    constructor(chaos: ChaosService, config?: SimCoreConfig);
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown>;
    private finish;
    private corrupt;
    private wrongType;
}

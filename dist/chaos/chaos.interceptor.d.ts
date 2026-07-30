import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ChaosService } from './chaos.service';
/**
 * Paths chaos never touches. `/__control` in particular must stay reachable —
 * an outage scenario that also broke its own kill switch would be unrecoverable.
 */
export declare const CHAOS_EXEMPT_PREFIXES: string[];
export declare function isChaosExempt(path: string): boolean;
export declare class ChaosInterceptor implements NestInterceptor {
    private readonly chaos;
    constructor(chaos: ChaosService);
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown>;
    private finish;
    private corrupt;
    private wrongType;
}

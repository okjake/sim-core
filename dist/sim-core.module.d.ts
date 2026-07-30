import { DynamicModule, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { type SimCoreConfig } from './config';
/**
 * The shared engine. One import wires health, openapi, the chaos layer, the
 * scenario registry, the traffic driver, the `/__control` plane, the request
 * tail, the webhook recorder and the admin SPA into a consumer's Nest app —
 * plus, when `docs.enabled` is set, the SQLite-backed docs engine.
 *
 * ```ts
 * @Module({ imports: [SimCoreModule.forRoot(config)], controllers: [ListingsController] })
 * export class AppModule {}
 * ```
 */
export declare class SimCoreModule implements NestModule {
    static forRoot(config: SimCoreConfig): DynamicModule;
    /**
     * Both middlewares run for every route and filter by path themselves, rather
     * than being mounted on `/admin` — the same shape as `isChaosExempt`, and it
     * keeps the gate's path matching in one testable function instead of split
     * between a route pattern and a runtime check.
     *
     * Order matters: the request tail is first so it records the 302s and 403s
     * the gate produces.
     */
    configure(consumer: MiddlewareConsumer): void;
}

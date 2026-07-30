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
    configure(consumer: MiddlewareConsumer): void;
}

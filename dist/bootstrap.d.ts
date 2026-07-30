import { type INestApplication, type NestApplicationOptions } from '@nestjs/common';
import type { SimCoreConfig } from './config';
export interface BootstrapSimServiceOptions {
    /** Overrides `config.port` / `PORT`. */
    port?: number;
    /** Bind address. Default `0.0.0.0` (Render/Docker friendly). */
    host?: string;
    /**
     * Call `app.listen()`. Set false to get an initialised-but-unstarted app —
     * this is the supported way to build an app for supertest, because
     * `ServeStaticModule` needs the HTTP adapter to exist before providers are
     * instantiated (which `Test.createTestingModule().compile()` cannot do).
     */
    listen?: boolean;
    /** Passed straight to `NestFactory.create` — `false` silences Nest logging. */
    logger?: NestApplicationOptions['logger'];
}
/**
 * Thin `NestFactory` wrapper with the settings every sim service wants:
 * shutdown hooks (so TTL timers and the driver loop are torn down), proxy
 * trust, and a startup banner listing the built-in routes.
 *
 * ```ts
 * void bootstrapSimService(AppModule, config);
 * ```
 */
export declare function bootstrapSimService(appModule: unknown, config: SimCoreConfig, options?: BootstrapSimServiceOptions): Promise<INestApplication>;

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
    /**
     * Capture the raw request body on `req.rawBody`.
     *
     * **Required by any service that receives platform webhooks.** Signature
     * verification runs over the exact bytes that were signed, and
     * `JSON.stringify(req.body)` is not those bytes — key order and whitespace
     * differ, so every check would fail in a way that looks like a wrong secret.
     * See `verifyPlatformWebhook` and the receiver recipe in the README.
     */
    rawBody?: boolean;
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

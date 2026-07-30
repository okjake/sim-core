"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapSimService = bootstrapSimService;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
/**
 * Thin `NestFactory` wrapper with the settings every sim service wants:
 * shutdown hooks (so TTL timers and the driver loop are torn down), proxy
 * trust, and a startup banner listing the built-in routes.
 *
 * ```ts
 * void bootstrapSimService(AppModule, config);
 * ```
 */
async function bootstrapSimService(appModule, config, options = {}) {
    const logger = new common_1.Logger(`sim:${config.name}`);
    const app = await core_1.NestFactory.create(appModule, {
        bufferLogs: false,
        ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    app.set('trust proxy', 1);
    app.enableShutdownHooks();
    if (options.listen === false) {
        await app.init();
        return app;
    }
    const envPort = process.env.PORT ? Number(process.env.PORT) : Number.NaN;
    const port = options.port ?? config.port ?? envPort;
    const resolvedPort = Number.isFinite(port) && port > 0 ? port : 3000;
    const host = options.host ?? '0.0.0.0';
    await app.listen(resolvedPort, host);
    logger.log(`${config.brand?.displayName ?? config.name} listening on :${resolvedPort} — ` +
        `/health /openapi.json /admin /__control/state`);
    if (config.driver) {
        logger.log(`traffic driver -> ${config.driver.baseUrl} ` +
            `(baseline ${config.driver.baselineRequestsPerMinute}/min, hard cap ${config.driver.maxRequestsPerMinute}/min)`);
    }
    return app;
}

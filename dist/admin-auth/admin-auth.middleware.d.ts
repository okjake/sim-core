import { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { type SimCoreConfig } from '../config';
import { AdminAuthService } from './admin-auth.service';
/**
 * The gate itself.
 *
 * **Middleware, not a guard, and deliberately so.** The admin SPA is served by
 * `ServeStaticModule`, which registers plain Express middleware in
 * `onModuleInit` — after Nest has registered *its* middleware but with no
 * controller, and therefore no guard, in front of it. A `@UseGuards` on a
 * controller would protect nothing that matters: `/admin/index.html` and
 * `/admin/assets/*` would still be served. Nest's own ordering
 * (`registerRouter()` → middleware, then `callInitHook()` → serve-static) is
 * what puts this function ahead of the static handler, and
 * `test/admin-auth.spec.ts` asserts an asset 302s so the ordering cannot
 * silently regress.
 *
 * Everything outside `/admin` — the domain API, `/docs`, `/openapi.json`,
 * `/health`, webhook receivers, `/__admin/brand` and the whole bearer-authed
 * `/__control` plane — falls through untouched on the first two lines.
 */
export declare class AdminAuthMiddleware implements NestMiddleware {
    private readonly auth;
    private readonly config?;
    private readonly logger;
    constructor(auth: AdminAuthService, config?: SimCoreConfig | undefined);
    use(req: Request, res: Response, next: NextFunction): void;
    private callback;
    private logout;
    private deny;
    private send;
    private pageModel;
}

import { Inject, Injectable, Logger, NestMiddleware, Optional } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { SIM_CORE_CONFIG, type SimCoreConfig } from '../config';
import { ADMIN_LOGOUT_PATH } from './admin-auth.config';
import { AdminAuthService, isAdminGatedPath } from './admin-auth.service';
import { renderAccessDeniedPage, renderSignedOutPage } from './admin-auth.render';

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
@Injectable()
export class AdminAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger('SimCore:adminAuth');

  constructor(
    private readonly auth: AdminAuthService,
    @Optional() @Inject(SIM_CORE_CONFIG) private readonly config?: SimCoreConfig,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (!this.auth.isEnabled()) {
      next();
      return;
    }

    const path = req.path || (req.originalUrl ?? '').split('?')[0] || '/';
    if (!isAdminGatedPath(path)) {
      next();
      return;
    }

    if (path === ADMIN_LOGOUT_PATH) {
      this.logout(req, res);
      return;
    }

    if (path === this.auth.settings.callbackPath) {
      void this.callback(req, res);
      return;
    }

    if (this.auth.authenticate(req)) {
      next();
      return;
    }

    // Only a navigation can meaningfully follow a 302 to Google. Anything else
    // (an XHR, a POST) gets the same opaque 403 as a rejected sign-in.
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.setHeader('cache-control', 'no-store');
      res.redirect(302, this.auth.buildAuthorizationUrl(req));
      return;
    }
    this.deny(res);
  }

  private async callback(req: Request, res: Response): Promise<void> {
    let result: Awaited<ReturnType<AdminAuthService['handleCallback']>>;
    try {
      result = await this.auth.handleCallback(req);
    } catch (error) {
      // handleCallback is written not to throw; if it ever does, fail closed.
      this.logger.error(
        `admin callback crashed: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.deny(res);
      return;
    }

    if (!result.ok) {
      this.deny(res);
      return;
    }

    res.setHeader('set-cookie', this.auth.setCookieHeader(req, result.session));
    res.setHeader('cache-control', 'no-store');
    this.logger.log(`admin sign-in: ${result.session.email}`);
    res.redirect(302, result.returnTo);
  }

  private logout(req: Request, res: Response): void {
    res.setHeader('set-cookie', this.auth.clearCookieHeader(req));
    res.setHeader('cache-control', 'no-store');
    this.send(res, 200, renderSignedOutPage(this.pageModel()));
  }

  private deny(res: Response): void {
    this.send(res, 403, renderAccessDeniedPage(this.pageModel()));
  }

  private send(res: Response, status: number, html: string): void {
    res.status(status);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.send(html);
  }

  private pageModel(): { serviceTitle: string; accent: string; allowedDomain: string } {
    return {
      serviceTitle: this.config?.brand?.displayName ?? this.config?.name ?? 'sim',
      accent: this.config?.brand?.color ?? '#3b6ea5',
      allowedDomain: this.auth.settings.allowedDomain,
    };
  }
}

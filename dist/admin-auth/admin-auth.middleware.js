"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminAuthMiddleware = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("../config");
const admin_auth_config_1 = require("./admin-auth.config");
const admin_auth_service_1 = require("./admin-auth.service");
const admin_auth_render_1 = require("./admin-auth.render");
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
let AdminAuthMiddleware = class AdminAuthMiddleware {
    auth;
    config;
    logger = new common_1.Logger('SimCore:adminAuth');
    constructor(auth, config) {
        this.auth = auth;
        this.config = config;
    }
    use(req, res, next) {
        if (!this.auth.isEnabled()) {
            next();
            return;
        }
        const path = req.path || (req.originalUrl ?? '').split('?')[0] || '/';
        if (!(0, admin_auth_service_1.isAdminGatedPath)(path)) {
            next();
            return;
        }
        if (path === admin_auth_config_1.ADMIN_LOGOUT_PATH) {
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
    async callback(req, res) {
        let result;
        try {
            result = await this.auth.handleCallback(req);
        }
        catch (error) {
            // handleCallback is written not to throw; if it ever does, fail closed.
            this.logger.error(`admin callback crashed: ${error instanceof Error ? error.message : String(error)}`);
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
    logout(req, res) {
        res.setHeader('set-cookie', this.auth.clearCookieHeader(req));
        res.setHeader('cache-control', 'no-store');
        this.send(res, 200, (0, admin_auth_render_1.renderSignedOutPage)(this.pageModel()));
    }
    deny(res) {
        this.send(res, 403, (0, admin_auth_render_1.renderAccessDeniedPage)(this.pageModel()));
    }
    send(res, status, html) {
        res.status(status);
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        res.send(html);
    }
    pageModel() {
        return {
            serviceTitle: this.config?.brand?.displayName ?? this.config?.name ?? 'sim',
            accent: this.config?.brand?.color ?? '#3b6ea5',
            allowedDomain: this.auth.settings.allowedDomain,
        };
    }
};
exports.AdminAuthMiddleware = AdminAuthMiddleware;
exports.AdminAuthMiddleware = AdminAuthMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(1, (0, common_1.Inject)(config_1.SIM_CORE_CONFIG)),
    __metadata("design:paramtypes", [admin_auth_service_1.AdminAuthService, Object])
], AdminAuthMiddleware);

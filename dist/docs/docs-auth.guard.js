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
exports.DocsAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("../config");
const docs_service_1 = require("./docs.service");
/**
 * Gate for the public docs surface.
 *
 * `authMode: 'public'` (the default) lets everything through. `'required'`
 * hands the request to the consumer's own `docsAuthCheck` — sim-core has no
 * opinion about the credential scheme, because the whole point for
 * sim-pebblepay is that the scheme is switchable (bearer / basic / custom
 * header) and can be made to fail on demand by a `credential-expiry` scenario.
 *
 * A `'required'` mode with no `docsAuthCheck` configured fails closed. Silently
 * serving docs that were meant to be credentialed would be the worse bug.
 */
let DocsAuthGuard = class DocsAuthGuard {
    config;
    docs;
    constructor(config, docs) {
        this.config = config;
        this.docs = docs;
    }
    canActivate(context) {
        if (this.docs.config.authMode !== 'required') {
            return true;
        }
        const check = this.config.docsAuthCheck;
        if (typeof check !== 'function') {
            throw new common_1.UnauthorizedException({
                error: 'docs_auth_not_configured',
                message: "docs.authMode is 'required' but no docsAuthCheck was supplied — failing closed",
            });
        }
        const req = context.switchToHttp().getRequest();
        let allowed;
        try {
            // A consumer check that throws is a failed check, not a 500.
            allowed = check(req) === true;
        }
        catch {
            allowed = false;
        }
        if (!allowed) {
            throw new common_1.UnauthorizedException({
                error: 'docs_unauthorized',
                message: 'Valid credentials are required to read these docs',
            });
        }
        return true;
    }
};
exports.DocsAuthGuard = DocsAuthGuard;
exports.DocsAuthGuard = DocsAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(config_1.SIM_CORE_CONFIG)),
    __metadata("design:paramtypes", [Object, docs_service_1.DocsService])
], DocsAuthGuard);

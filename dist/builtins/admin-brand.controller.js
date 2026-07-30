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
exports.AdminBrandController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("../config");
/**
 * Unauthenticated, display-only metadata for the admin SPA's shell (title,
 * theme colour) — needed before a control token has been entered. Contains no
 * secrets and no runtime state.
 *
 * ## Why this stays open when `adminAuth` is enabled (audited for v0.3.0)
 *
 * The payload is five values: the service name, its version, the brand block
 * (display name, colour, tagline) and two feature booleans. Nothing here is a
 * credential, a hostname, a count, or any runtime state — and the two booleans
 * are already observable without it (`/docs` answers 200 or 404; the gate
 * announces itself with a 302). `builtins.spec.ts` asserts the exact key set,
 * so adding a field to this payload fails a test rather than quietly widening
 * an unauthenticated surface: if that ever needs to carry something real, it
 * moves behind the gate at the same time.
 */
let AdminBrandController = class AdminBrandController {
    config;
    constructor(config) {
        this.config = config;
    }
    brand() {
        return {
            name: this.config.name,
            version: this.config.version ?? '0.0.0',
            brand: this.config.brand,
            driver: Boolean(this.config.driver),
            docs: this.config.docs?.enabled === true,
            adminAuth: this.config.adminAuth?.enabled === true,
        };
    }
};
exports.AdminBrandController = AdminBrandController;
__decorate([
    (0, common_1.Get)('brand'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], AdminBrandController.prototype, "brand", null);
exports.AdminBrandController = AdminBrandController = __decorate([
    (0, common_1.Controller)('__admin'),
    __param(0, (0, common_1.Inject)(config_1.SIM_CORE_CONFIG)),
    __metadata("design:paramtypes", [Object])
], AdminBrandController);

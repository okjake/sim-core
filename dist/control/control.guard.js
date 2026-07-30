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
exports.ControlAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const config_1 = require("../config");
function safeEqual(a, b) {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
        // Still burn a comparison so length isn't leaked by timing alone.
        (0, node_crypto_1.timingSafeEqual)(bufA, bufA);
        return false;
    }
    return (0, node_crypto_1.timingSafeEqual)(bufA, bufB);
}
/** `Authorization: Bearer ${CONTROL_TOKEN}` on every `/__control/*` route. 401 otherwise. */
let ControlAuthGuard = class ControlAuthGuard {
    config;
    constructor(config) {
        this.config = config;
    }
    canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const header = req.headers.authorization ?? '';
        const [scheme, ...rest] = header.split(' ');
        const token = rest.join(' ').trim();
        if (!scheme || scheme.toLowerCase() !== 'bearer' || token.length === 0) {
            throw new common_1.UnauthorizedException('Missing control bearer token');
        }
        if (!safeEqual(token, this.config.controlToken)) {
            throw new common_1.UnauthorizedException('Invalid control bearer token');
        }
        return true;
    }
};
exports.ControlAuthGuard = ControlAuthGuard;
exports.ControlAuthGuard = ControlAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(config_1.SIM_CORE_CONFIG)),
    __metadata("design:paramtypes", [Object])
], ControlAuthGuard);

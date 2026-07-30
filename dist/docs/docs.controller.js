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
exports.DocsController = void 0;
const common_1 = require("@nestjs/common");
const docs_auth_guard_1 = require("./docs-auth.guard");
const docs_service_1 = require("./docs.service");
/**
 * The public docs surface. Registered only when `docs.enabled` is true.
 *
 * Pages are sent with `Cache-Control: no-cache` rather than a max-age: they are
 * cheap to render and the platform wants to see a publish immediately, not
 * after a TTL. `/openapi.json` is the endpoint with real validators — it lives
 * in `OpenApiController`, which delegates here when docs are on.
 */
let DocsController = class DocsController {
    docs;
    constructor(docs) {
        this.docs = docs;
    }
    send(res, html, status = 200) {
        res.status(status);
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.setHeader('cache-control', 'no-cache');
        res.send(html);
    }
    index(res) {
        this.send(res, this.docs.renderIndex());
    }
    changelog(res) {
        this.send(res, this.docs.renderChangelog());
    }
    guide(slug, res) {
        const { html, found } = this.docs.renderGuide(slug);
        this.send(res, html, found ? 200 : 404);
    }
};
exports.DocsController = DocsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "index", null);
__decorate([
    (0, common_1.Get)('changelog'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "changelog", null);
__decorate([
    (0, common_1.Get)('guides/:slug'),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "guide", null);
exports.DocsController = DocsController = __decorate([
    (0, common_1.Controller)('docs'),
    (0, common_1.UseGuards)(docs_auth_guard_1.DocsAuthGuard),
    __metadata("design:paramtypes", [docs_service_1.DocsService])
], DocsController);

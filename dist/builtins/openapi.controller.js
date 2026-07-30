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
exports.OpenApiController = exports.ACTIVE_SPEC_SOURCE = void 0;
exports.stripControlPaths = stripControlPaths;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const config_1 = require("../config");
const conditional_1 = require("../http/conditional");
/** The control plane is never part of a sim company's published contract. */
function stripControlPaths(doc) {
    if (!doc.paths)
        return doc;
    const paths = Object.fromEntries(Object.entries(doc.paths).filter(([path]) => !path.startsWith('/__control')));
    return { ...doc, paths };
}
/** DI token for the optional {@link ActiveSpecSource}. */
exports.ACTIVE_SPEC_SOURCE = 'SIM_ACTIVE_SPEC_SOURCE';
/**
 * `GET /openapi.json`.
 *
 * With docs disabled (the v0.1.0 default) this serves `config.openapi`,
 * hashed once at construction. With docs enabled it serves the ACTIVE
 * published spec version, whose ETag and `Last-Modified` move on every
 * publish. Both paths answer `If-None-Match` and `If-Modified-Since`.
 */
let OpenApiController = class OpenApiController {
    docs;
    body;
    etag;
    lastModifiedMs;
    lastModified;
    constructor(config, docs) {
        this.docs = docs;
        this.body = JSON.stringify(stripControlPaths(config.openapi));
        this.etag = `"${(0, node_crypto_1.createHash)('sha256').update(this.body).digest('hex').slice(0, 32)}"`;
        this.lastModifiedMs = Date.now();
        this.lastModified = (0, conditional_1.httpDate)(this.lastModifiedMs);
    }
    current() {
        if (this.docs)
            return this.docs.activeSpec();
        return {
            body: this.body,
            etag: this.etag,
            lastModified: this.lastModified,
            lastModifiedMs: this.lastModifiedMs,
        };
    }
    serve(req, res) {
        const spec = this.current();
        res.setHeader('etag', spec.etag);
        res.setHeader('last-modified', spec.lastModified);
        res.setHeader('cache-control', 'public, max-age=60');
        res.setHeader('content-type', 'application/json; charset=utf-8');
        if ((0, conditional_1.isNotModified)(req, { etag: spec.etag, lastModified: spec.lastModifiedMs })) {
            res.status(304).end();
            return;
        }
        res.status(200).send(spec.body);
    }
};
exports.OpenApiController = OpenApiController;
__decorate([
    (0, common_1.Get)('openapi.json'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], OpenApiController.prototype, "serve", null);
exports.OpenApiController = OpenApiController = __decorate([
    (0, common_1.Controller)(),
    __param(0, (0, common_1.Inject)(config_1.SIM_CORE_CONFIG)),
    __param(1, (0, common_1.Optional)()),
    __param(1, (0, common_1.Inject)(exports.ACTIVE_SPEC_SOURCE)),
    __metadata("design:paramtypes", [Object, Object])
], OpenApiController);

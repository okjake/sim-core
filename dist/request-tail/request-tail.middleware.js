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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestTailMiddleware = void 0;
const common_1 = require("@nestjs/common");
const request_tail_service_1 = require("./request-tail.service");
/**
 * Records every request — including 404s and requests that ended in an
 * exception filter — which is why this is middleware rather than an
 * interceptor.
 */
let RequestTailMiddleware = class RequestTailMiddleware {
    tail;
    constructor(tail) {
        this.tail = tail;
    }
    use(req, res, next) {
        const startedAt = Date.now();
        const method = req.method;
        const path = req.path || (req.originalUrl ?? '').split('?')[0] || '/';
        res.on('finish', () => {
            const chaosHeader = res.getHeader('x-sim-chaos');
            this.tail.record({
                method,
                path,
                status: res.statusCode,
                latencyMs: Date.now() - startedAt,
                chaos: typeof chaosHeader === 'string' && chaosHeader.length > 0
                    ? chaosHeader.split(',')
                    : undefined,
            });
        });
        next();
    }
};
exports.RequestTailMiddleware = RequestTailMiddleware;
exports.RequestTailMiddleware = RequestTailMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [request_tail_service_1.RequestTailService])
], RequestTailMiddleware);

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
exports.ChaosInterceptor = exports.DOCS_CHAOS_PREFIXES = exports.CHAOS_EXEMPT_PREFIXES = void 0;
exports.isChaosExempt = isChaosExempt;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const config_1 = require("../config");
const chaos_service_1 = require("./chaos.service");
/**
 * Paths chaos never touches. `/__control` in particular must stay reachable —
 * an outage scenario that also broke its own kill switch would be unrecoverable.
 */
exports.CHAOS_EXEMPT_PREFIXES = [
    '/__control',
    '/__admin',
    '/health',
    '/admin',
    '/openapi.json',
    '/docs',
];
/**
 * The documentation surface. Exempt by default, because a sim whose spec
 * endpoint 503s during an unrelated outage scenario looks to the platform like
 * an upstream that deleted its API. A consumer that specifically wants to
 * exercise docs-fetch failures opts in with `docsChaosOptIn: true`.
 */
exports.DOCS_CHAOS_PREFIXES = ['/openapi.json', '/docs'];
function matches(path, prefix) {
    return path === prefix || path.startsWith(`${prefix}/`);
}
function isChaosExempt(path, options = {}) {
    const exempt = options.docsChaosOptIn
        ? exports.CHAOS_EXEMPT_PREFIXES.filter((prefix) => !exports.DOCS_CHAOS_PREFIXES.includes(prefix))
        : exports.CHAOS_EXEMPT_PREFIXES;
    return exempt.some((prefix) => matches(path, prefix));
}
const sleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});
let ChaosInterceptor = class ChaosInterceptor {
    chaos;
    docsChaosOptIn;
    constructor(chaos, config) {
        this.chaos = chaos;
        this.docsChaosOptIn = config?.docsChaosOptIn === true;
    }
    intercept(context, next) {
        if (context.getType() !== 'http') {
            return next.handle();
        }
        const http = context.switchToHttp();
        const req = http.getRequest();
        const res = http.getResponse();
        const path = req.path || (req.url ?? '').split('?')[0] || '/';
        if (isChaosExempt(path, { docsChaosOptIn: this.docsChaosOptIn })) {
            return next.handle();
        }
        const effective = this.chaos.resolve(path);
        const applied = [];
        if (effective.reject) {
            applied.push('reject');
            res.setHeader('x-sim-chaos', applied.join(','));
            throw new common_1.HttpException({
                error: 'sim_chaos_reject',
                message: effective.reject.message ?? 'Rejected by an active sim scenario',
                status: effective.reject.status,
            }, effective.reject.status);
        }
        if (effective.errorRate && this.chaos.chance(effective.errorRate.rate)) {
            applied.push('error-rate');
            res.setHeader('x-sim-chaos', applied.join(','));
            throw new common_1.HttpException({
                error: 'sim_chaos_error_rate',
                message: effective.errorRate.message ?? 'Injected failure from an active sim scenario',
                status: effective.errorRate.status,
            }, effective.errorRate.status);
        }
        const latencyMs = effective.latency
            ? this.chaos.jitter(effective.latency.baseMs, effective.latency.jitterMs ?? 0)
            : 0;
        if (latencyMs > 0) {
            applied.push('latency');
            res.setHeader('x-sim-chaos-latency-ms', String(latencyMs));
        }
        const malformed = effective.malformedResponse;
        if (applied.length === 0 && !malformed) {
            return next.handle();
        }
        return next
            .handle()
            .pipe((0, rxjs_1.switchMap)((value) => (0, rxjs_1.from)(this.finish(value, latencyMs, malformed, applied, res))));
    }
    async finish(value, latencyMs, malformed, applied, res) {
        if (latencyMs > 0) {
            await sleep(latencyMs);
        }
        if (!malformed || !this.chaos.chance(malformed.rate ?? 1)) {
            if (applied.length > 0 && !res.headersSent) {
                res.setHeader('x-sim-chaos', applied.join(','));
            }
            return value;
        }
        applied.push('malformed');
        if (!res.headersSent) {
            res.setHeader('x-sim-chaos', applied.join(','));
            res.setHeader('x-sim-chaos-malformed', malformed.mode);
        }
        if (malformed.mode === 'truncate') {
            // Returned as a raw string: Nest's Express adapter sends non-object
            // bodies verbatim, so the client receives genuinely unparseable JSON
            // under an application/json content type.
            const raw = JSON.stringify(value ?? null);
            res.setHeader('content-type', 'application/json; charset=utf-8');
            return raw.slice(0, Math.max(1, Math.floor(raw.length * 0.6)));
        }
        return this.corrupt(value, malformed.mode);
    }
    corrupt(value, mode) {
        if (Array.isArray(value)) {
            return value.map((item) => this.corrupt(item, mode));
        }
        if (value === null || typeof value !== 'object') {
            return mode === 'wrong-types' ? this.wrongType(value) : value;
        }
        const entries = Object.entries(value);
        if (entries.length === 0) {
            return value;
        }
        if (mode === 'drop-fields') {
            const kept = entries.filter(() => !this.chaos.chance(0.5));
            // Guarantee the corruption is observable.
            const survivors = kept.length === entries.length ? kept.slice(1) : kept;
            return Object.fromEntries(survivors);
        }
        return Object.fromEntries(entries.map(([key, item]) => [
            key,
            item !== null && typeof item === 'object'
                ? this.corrupt(item, mode)
                : this.wrongType(item),
        ]));
    }
    wrongType(value) {
        switch (typeof value) {
            case 'number':
                return String(value);
            case 'string':
                return value.length;
            case 'boolean':
                return value ? 'yes' : 'no';
            default:
                return '__null__';
        }
    }
};
exports.ChaosInterceptor = ChaosInterceptor;
exports.ChaosInterceptor = ChaosInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(1, (0, common_1.Inject)(config_1.SIM_CORE_CONFIG)),
    __metadata("design:paramtypes", [chaos_service_1.ChaosService, Object])
], ChaosInterceptor);

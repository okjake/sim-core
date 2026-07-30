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
exports.ChaosService = void 0;
const common_1 = require("@nestjs/common");
const rng_1 = require("../rng");
/**
 * In-memory chaos state.
 *
 * Baseline is "no rules". Rules are only ever installed by an active scenario,
 * which always carries a TTL, so the service self-heals even if nobody calls
 * `POST /__control/reset`.
 */
let ChaosService = class ChaosService {
    ruleMap = new Map();
    counter = 0;
    rng;
    constructor(seed = 'sim-core-chaos') {
        this.rng = (0, rng_1.createRng)(seed);
    }
    apply(rule) {
        this.counter += 1;
        const id = rule.id ?? `rule-${this.counter}`;
        this.ruleMap.set(id, { ...rule, id });
        return () => {
            this.ruleMap.delete(id);
        };
    }
    clear() {
        this.ruleMap.clear();
    }
    rules() {
        return [...this.ruleMap.values()];
    }
    isBaseline() {
        return this.ruleMap.size === 0;
    }
    /** Reset the decision stream — used by tests wanting reproducible chaos. */
    reseed(seed) {
        this.rng = (0, rng_1.createRng)(seed);
    }
    /** Seeded coin flip. Never `Math.random()`. */
    chance(p) {
        if (p <= 0)
            return false;
        if (p >= 1)
            return true;
        return this.rng.chance(p);
    }
    jitter(baseMs, jitterMs) {
        if (!jitterMs)
            return Math.max(0, Math.round(baseMs));
        const offset = this.rng.float(-jitterMs / 2, jitterMs / 2);
        return Math.max(0, Math.round(baseMs + offset));
    }
    /** Rules whose `pathPrefix` matches (or that are global). */
    rulesFor(path) {
        return this.rules().filter((rule) => !rule.pathPrefix || path.startsWith(rule.pathPrefix));
    }
    /**
     * Collapse all matching rules into the effective set of primitives.
     * Later rules win per-primitive; latency accumulates.
     */
    resolve(path) {
        const matching = this.rulesFor(path);
        const resolved = {};
        for (const rule of matching) {
            if (rule.latency) {
                resolved.latency = {
                    baseMs: (resolved.latency?.baseMs ?? 0) + rule.latency.baseMs,
                    jitterMs: (resolved.latency?.jitterMs ?? 0) + (rule.latency.jitterMs ?? 0),
                };
            }
            if (rule.errorRate)
                resolved.errorRate = rule.errorRate;
            if (rule.malformedResponse)
                resolved.malformedResponse = rule.malformedResponse;
            if (rule.reject)
                resolved.reject = rule.reject;
        }
        return resolved;
    }
};
exports.ChaosService = ChaosService;
exports.ChaosService = ChaosService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [Object])
], ChaosService);

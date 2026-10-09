"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUILTIN_SCENARIOS = exports.authFailureScenario = exports.outageScenario = exports.errorSpikeScenario = exports.latencyScenario = void 0;
const params_1 = require("../params");
/** `latency` — add a fixed + jittered delay to every domain response. */
exports.latencyScenario = {
    id: 'latency',
    description: 'Adds baseMs (± jitterMs) of latency to every matching response.',
    admin: { title: 'Slow responses', group: 'Generic faults', order: 30, triggers: ['Traffic troubleshooting (latency)'] },
    params: params_1.p.object({
        baseMs: params_1.p.number({ min: 0, max: 60_000 }).default(750).describedAs('Base delay in ms'),
        jitterMs: params_1.p
            .number({ min: 0, max: 60_000 })
            .default(250)
            .describedAs('Total jitter window in ms'),
        pathPrefix: params_1.p
            .string()
            .optional()
            .describedAs('Restrict to a path prefix, e.g. /v2/reservations'),
    }),
    apply(ctx, params) {
        return ctx.chaos.apply({
            pathPrefix: params.pathPrefix,
            latency: { baseMs: params.baseMs, jitterMs: params.jitterMs },
        });
    },
};
/** `error-spike` — fail a fraction of requests. */
exports.errorSpikeScenario = {
    id: 'error-spike',
    description: 'Fails a fraction of matching requests with the given status code.',
    admin: { title: 'Error storm', group: 'Generic faults', order: 10, triggers: ['Traffic troubleshooting'] },
    params: params_1.p.object({
        rate: params_1.p.number({ min: 0, max: 1 }).default(0.25).describedAs('Failure rate, 0..1'),
        status: params_1.p.number({ min: 400, max: 599 }).default(500).describedAs('HTTP status'),
        pathPrefix: params_1.p.string().optional().describedAs('Restrict to a path prefix'),
    }),
    apply(ctx, params) {
        return ctx.chaos.apply({
            pathPrefix: params.pathPrefix,
            errorRate: { rate: params.rate, status: params.status },
        });
    },
};
/** `outage` — reject everything with 503. */
exports.outageScenario = {
    id: 'outage',
    description: 'Hard outage — rejects every matching request with 503.',
    admin: {
        title: 'Full outage',
        group: 'Generic faults',
        order: 20,
        // Incident-shaped, but nothing on the platform opens an incident record from it.
        triggers: ['Traffic troubleshooting'],
    },
    params: params_1.p.object({
        status: params_1.p.number({ min: 400, max: 599 }).default(503).describedAs('HTTP status'),
        pathPrefix: params_1.p.string().optional().describedAs('Restrict to a path prefix'),
    }),
    apply(ctx, params) {
        return ctx.chaos.apply({
            pathPrefix: params.pathPrefix,
            reject: { status: params.status, message: 'Service temporarily unavailable' },
        });
    },
};
/** `auth-failure` — reject everything with 401. */
exports.authFailureScenario = {
    id: 'auth-failure',
    description: 'Rejects every matching request with 401, as if credentials had expired.',
    admin: { title: 'Reject all credentials', group: 'Generic faults', order: 40, triggers: ['Traffic troubleshooting (401s)'] },
    params: params_1.p.object({
        status: params_1.p.number({ min: 400, max: 599 }).default(401).describedAs('HTTP status'),
        pathPrefix: params_1.p.string().optional().describedAs('Restrict to a path prefix'),
    }),
    apply(ctx, params) {
        return ctx.chaos.apply({
            pathPrefix: params.pathPrefix,
            reject: { status: params.status, message: 'Invalid or expired credentials' },
        });
    },
};
/**
 * Generic scenarios every sim service gets for free. Consumers append their
 * own via `SimCoreConfig.scenarios`; same-id entries override these.
 */
exports.BUILTIN_SCENARIOS = [
    exports.latencyScenario,
    exports.errorSpikeScenario,
    exports.outageScenario,
    exports.authFailureScenario,
];

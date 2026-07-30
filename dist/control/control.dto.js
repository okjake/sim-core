"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TTL_MAX_SECONDS = exports.TTL_MIN_SECONDS = void 0;
exports.parseTtlSeconds = parseTtlSeconds;
exports.parseActivateScenarioBody = parseActivateScenarioBody;
exports.parseDriverOverrideBody = parseDriverOverrideBody;
const common_1 = require("@nestjs/common");
exports.TTL_MIN_SECONDS = 1;
exports.TTL_MAX_SECONDS = 86_400;
const DRIVER_MODES = ['baseline', 'burst', 'paused'];
function fail(errors) {
    throw new common_1.BadRequestException({
        error: 'validation_failed',
        message: 'Request body failed validation',
        errors,
    });
}
/**
 * TTL is MANDATORY on every activation. A sim service that can be left broken
 * forever is worse than no sim service, so there is no "until I say stop" mode.
 */
function parseTtlSeconds(value, errors) {
    if (value === undefined || value === null || value === '') {
        errors.ttlSeconds = 'is required';
        return 0;
    }
    const ttl = typeof value === 'string' ? Number(value) : value;
    if (typeof ttl !== 'number' || !Number.isFinite(ttl) || !Number.isInteger(ttl)) {
        errors.ttlSeconds = 'must be an integer number of seconds';
        return 0;
    }
    if (ttl < exports.TTL_MIN_SECONDS || ttl > exports.TTL_MAX_SECONDS) {
        errors.ttlSeconds = `must be between ${exports.TTL_MIN_SECONDS} and ${exports.TTL_MAX_SECONDS}`;
        return 0;
    }
    return ttl;
}
function parseActivateScenarioBody(body) {
    const errors = {};
    const source = (body ?? {});
    const scenario = source.scenario;
    if (typeof scenario !== 'string' || scenario.trim().length === 0) {
        errors.scenario = 'is required';
    }
    const ttlSeconds = parseTtlSeconds(source.ttlSeconds, errors);
    if (Object.keys(errors).length > 0) {
        fail(errors);
    }
    return { scenario: scenario.trim(), params: source.params, ttlSeconds };
}
function parseDriverOverrideBody(body) {
    const errors = {};
    const source = (body ?? {});
    const mode = source.mode;
    if (typeof mode !== 'string' || !DRIVER_MODES.includes(mode)) {
        errors.mode = `must be one of: ${DRIVER_MODES.join(', ')}`;
    }
    let multiplier = 1;
    if (source.multiplier !== undefined && source.multiplier !== null) {
        const raw = typeof source.multiplier === 'string' ? Number(source.multiplier) : source.multiplier;
        if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1 || raw > 100) {
            errors.multiplier = 'must be a number between 1 and 100';
        }
        else {
            multiplier = raw;
        }
    }
    const ttlSeconds = parseTtlSeconds(source.ttlSeconds, errors);
    if (Object.keys(errors).length > 0) {
        fail(errors);
    }
    return { mode: mode, multiplier, ttlSeconds };
}

"use strict";
/**
 * A deliberately tiny "zod-ish" schema layer.
 *
 * sim-core does not depend on zod — a scenario's `params` only has to satisfy
 * {@link ParamSchema}, so a real zod schema (which has `.parse`) is accepted
 * too. Schemas built with the {@link p} helpers additionally expose
 * `describe()`, which is what `GET /__control/scenarios` publishes so the admin
 * SPA can render a form.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.p = exports.ParamValidationError = void 0;
exports.describeSchema = describeSchema;
class ParamValidationError extends Error {
    path;
    constructor(message, path = []) {
        super(message);
        this.path = path;
        this.name = 'ParamValidationError';
    }
}
exports.ParamValidationError = ParamValidationError;
function makeBuilder(base, check) {
    const meta = { ...base };
    const builder = {
        parse(input) {
            if (input === undefined || input === null) {
                if (meta.default !== undefined) {
                    return meta.default;
                }
                if (!meta.required) {
                    return undefined;
                }
                throw new ParamValidationError('is required');
            }
            return check(input, []);
        },
        describe: () => ({ ...meta }),
        optional: () => makeBuilder({ ...meta, required: false }, check),
        default: (value) => makeBuilder({ ...meta, required: false, default: value }, check),
        describedAs: (text) => makeBuilder({ ...meta, description: text }, check),
    };
    return builder;
}
function numberSchema(opts = {}) {
    return makeBuilder({ type: 'number', required: true, min: opts.min, max: opts.max }, (input) => {
        const value = typeof input === 'string' ? Number(input) : input;
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new ParamValidationError('must be a finite number');
        }
        if (opts.min !== undefined && value < opts.min) {
            throw new ParamValidationError(`must be >= ${opts.min}`);
        }
        if (opts.max !== undefined && value > opts.max) {
            throw new ParamValidationError(`must be <= ${opts.max}`);
        }
        return value;
    });
}
function stringSchema() {
    return makeBuilder({ type: 'string', required: true }, (input) => {
        if (typeof input !== 'string') {
            throw new ParamValidationError('must be a string');
        }
        return input;
    });
}
function booleanSchema() {
    return makeBuilder({ type: 'boolean', required: true }, (input) => {
        if (typeof input === 'boolean')
            return input;
        if (input === 'true')
            return true;
        if (input === 'false')
            return false;
        throw new ParamValidationError('must be a boolean');
    });
}
function enumSchema(values) {
    return makeBuilder({ type: 'enum', required: true, values }, (input) => {
        if (typeof input !== 'string' || !values.includes(input)) {
            throw new ParamValidationError(`must be one of: ${values.join(', ')}`);
        }
        return input;
    });
}
function objectSchema(shape) {
    const fields = {};
    for (const [key, schema] of Object.entries(shape)) {
        fields[key] = schema.describe?.() ?? { type: 'string', required: true };
    }
    return makeBuilder({ type: 'object', required: true, fields }, (input) => {
        if (typeof input !== 'object' || input === null || Array.isArray(input)) {
            throw new ParamValidationError('must be an object');
        }
        const source = input;
        const out = {};
        for (const [key, schema] of Object.entries(shape)) {
            try {
                const value = schema.parse(source[key]);
                if (value !== undefined) {
                    out[key] = value;
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'is invalid';
                throw new ParamValidationError(`${key} ${message}`, [key]);
            }
        }
        return out;
    });
}
/** Schema builders. `p.object({ ms: p.number({ min: 0 }).default(250) })`. */
exports.p = {
    number: numberSchema,
    string: stringSchema,
    boolean: booleanSchema,
    enum: enumSchema,
    object: objectSchema,
};
/** Safe `describe()` access for arbitrary (possibly zod) schemas. */
function describeSchema(schema) {
    if (!schema || typeof schema.describe !== 'function') {
        return null;
    }
    try {
        // zod also has a `.describe()`, but it takes a string and returns a schema.
        // Only accept results that look like a ParamFieldDescription.
        const described = schema.describe();
        const kinds = ['string', 'number', 'boolean', 'enum', 'object'];
        if (described &&
            typeof described === 'object' &&
            kinds.includes(described.type)) {
            return described;
        }
        return null;
    }
    catch {
        return null;
    }
}

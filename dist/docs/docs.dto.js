"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCreateSpecVersionBody = parseCreateSpecVersionBody;
exports.parseUpdateSpecVersionBody = parseUpdateSpecVersionBody;
exports.parseGuideBody = parseGuideBody;
exports.parseChangelogBody = parseChangelogBody;
exports.parsePreviewBody = parsePreviewBody;
const common_1 = require("@nestjs/common");
function fail(errors) {
    throw new common_1.BadRequestException({
        error: 'validation_failed',
        message: 'Request body failed validation',
        errors,
    });
}
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function asRecord(body) {
    return (body ?? {});
}
/**
 * Parse a spec payload. The admin SPA sends the JSON the operator typed into a
 * textarea, so this accepts either a parsed object or a raw string and reports
 * the parse error rather than 500-ing — "line 14: unexpected token" is the
 * whole value of the editor.
 */
function parseSpec(value, errors) {
    let candidate = value;
    if (typeof candidate === 'string') {
        try {
            candidate = JSON.parse(candidate);
        }
        catch (error) {
            errors.spec = `is not valid JSON (${error instanceof Error ? error.message : 'parse failed'})`;
            return undefined;
        }
    }
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
        errors.spec = 'must be a JSON object';
        return undefined;
    }
    const doc = candidate;
    if (typeof doc.openapi !== 'string' || !doc.openapi) {
        errors.spec = 'must have a string `openapi` version field';
        return undefined;
    }
    if (typeof doc.info !== 'object' || doc.info === null) {
        errors.spec = 'must have an `info` object';
        return undefined;
    }
    return candidate;
}
function parseCreateSpecVersionBody(body) {
    const errors = {};
    const source = asRecord(body);
    const label = typeof source.label === 'string' ? source.label.trim() : '';
    if (!LABEL.test(label)) {
        errors.label =
            'is required and must be 1-64 chars of letters, digits, dot, dash or underscore';
    }
    const fromActive = source.fromActive === true || source.spec === undefined;
    const spec = fromActive ? undefined : parseSpec(source.spec, errors);
    if (Object.keys(errors).length > 0)
        fail(errors);
    return { label, spec, fromActive, publish: source.publish === true };
}
function parseUpdateSpecVersionBody(body) {
    const errors = {};
    const source = asRecord(body);
    const patch = {};
    if (source.label !== undefined) {
        const label = typeof source.label === 'string' ? source.label.trim() : '';
        if (!LABEL.test(label)) {
            errors.label = 'must be 1-64 chars of letters, digits, dot, dash or underscore';
        }
        else {
            patch.label = label;
        }
    }
    if (source.spec !== undefined) {
        patch.spec = parseSpec(source.spec, errors);
    }
    if (patch.label === undefined && patch.spec === undefined && !errors.label && !errors.spec) {
        errors.body = 'must contain at least one of `label` or `spec`';
    }
    if (Object.keys(errors).length > 0)
        fail(errors);
    return patch;
}
function parseGuideBody(body, slugFromPath) {
    const errors = {};
    const source = asRecord(body);
    const slug = (slugFromPath ?? (typeof source.slug === 'string' ? source.slug : '')).trim();
    if (!SLUG.test(slug)) {
        errors.slug = 'is required and must be lowercase letters, digits and dashes';
    }
    const title = typeof source.title === 'string' ? source.title.trim() : '';
    if (!title)
        errors.title = 'is required';
    const markdown = typeof source.markdown === 'string' ? source.markdown : '';
    if (typeof source.markdown !== 'string')
        errors.markdown = 'is required';
    let order;
    if (source.order !== undefined && source.order !== null && source.order !== '') {
        const raw = typeof source.order === 'string' ? Number(source.order) : source.order;
        if (typeof raw !== 'number' || !Number.isFinite(raw)) {
            errors.order = 'must be a number';
        }
        else {
            order = Math.floor(raw);
        }
    }
    if (Object.keys(errors).length > 0)
        fail(errors);
    return { slug, title, markdown, published: source.published === true, order };
}
function parseChangelogBody(body, idFromPath) {
    const errors = {};
    const source = asRecord(body);
    const date = typeof source.date === 'string' ? source.date.trim() : '';
    if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(date))) {
        errors.date = 'is required and must be an ISO date (YYYY-MM-DD)';
    }
    const title = typeof source.title === 'string' ? source.title.trim() : '';
    if (!title)
        errors.title = 'is required';
    if (typeof source.markdown !== 'string')
        errors.markdown = 'is required';
    const id = (idFromPath ?? (typeof source.id === 'string' ? source.id : '')).trim();
    if (id && !SLUG.test(id) && !/^[A-Za-z0-9._-]{1,64}$/.test(id)) {
        errors.id = 'must be 1-64 chars of letters, digits, dot, dash or underscore';
    }
    if (Object.keys(errors).length > 0)
        fail(errors);
    return {
        id: id || undefined,
        date,
        title,
        markdown: source.markdown,
        published: source.published === true,
    };
}
function parsePreviewBody(body) {
    const source = asRecord(body);
    if (typeof source.markdown !== 'string') {
        fail({ markdown: 'is required' });
    }
    return source.markdown;
}

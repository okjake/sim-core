"use strict";
/**
 * A YAML-subset frontmatter parser: `key: value` pairs between `---` fences.
 *
 * Values are scalars only — quoted or bare strings, integers/floats, and
 * `true`/`false`. No nesting, no lists, no anchors, no multi-line scalars. This
 * is enough for `title` / `slug` / `date` / `published` / `order` and keeps the
 * seeding format something a human can eyeball without reaching for a YAML
 * spec. Anything richer belongs in the spec JSON, not in a guide header.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFrontmatter = parseFrontmatter;
exports.readString = readString;
exports.readBoolean = readBoolean;
exports.readNumber = readNumber;
function coerce(raw) {
    const value = raw.trim();
    if ((value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
        (value.startsWith("'") && value.endsWith("'") && value.length >= 2)) {
        return value.slice(1, -1);
    }
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    if (value !== '' && /^-?\d+(\.\d+)?$/.test(value))
        return Number(value);
    return value;
}
function parseFrontmatter(source) {
    const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
    if (!match) {
        return { data: {}, body: text.replace(/^\n+/, '') };
    }
    const data = {};
    for (const line of (match[1] ?? '').split('\n')) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#'))
            continue;
        const separator = trimmed.indexOf(':');
        if (separator <= 0)
            continue;
        data[trimmed.slice(0, separator).trim()] = coerce(trimmed.slice(separator + 1));
    }
    return { data, body: text.slice(match[0].length).replace(/^\n+/, '') };
}
function readString(data, key) {
    const value = data[key];
    return value === undefined ? undefined : String(value);
}
function readBoolean(data, key, fallback) {
    const value = data[key];
    if (typeof value === 'boolean')
        return value;
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    return fallback;
}
function readNumber(data, key, fallback) {
    const value = data[key];
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    const parsed = typeof value === 'string' ? Number(value) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * A YAML-subset frontmatter parser: `key: value` pairs between `---` fences.
 *
 * Values are scalars only — quoted or bare strings, integers/floats, and
 * `true`/`false`. No nesting, no lists, no anchors, no multi-line scalars. This
 * is enough for `title` / `slug` / `date` / `published` / `order` and keeps the
 * seeding format something a human can eyeball without reaching for a YAML
 * spec. Anything richer belongs in the spec JSON, not in a guide header.
 */

export type FrontmatterValue = string | number | boolean;

export interface ParsedDocument {
  data: Record<string, FrontmatterValue>;
  /** Everything after the closing fence, with one leading blank line trimmed. */
  body: string;
}

function coerce(raw: string): FrontmatterValue {
  const value = raw.trim();

  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    return value.slice(1, -1);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value !== '' && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

export function parseFrontmatter(source: string): ParsedDocument {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);

  if (!match) {
    return { data: {}, body: text.replace(/^\n+/, '') };
  }

  const data: Record<string, FrontmatterValue> = {};
  for (const line of (match[1] ?? '').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf(':');
    if (separator <= 0) continue;
    data[trimmed.slice(0, separator).trim()] = coerce(trimmed.slice(separator + 1));
  }

  return { data, body: text.slice(match[0].length).replace(/^\n+/, '') };
}

export function readString(
  data: Record<string, FrontmatterValue>,
  key: string,
): string | undefined {
  const value = data[key];
  return value === undefined ? undefined : String(value);
}

export function readBoolean(
  data: Record<string, FrontmatterValue>,
  key: string,
  fallback: boolean,
): boolean {
  const value = data[key];
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export function readNumber(
  data: Record<string, FrontmatterValue>,
  key: string,
  fallback: number,
): number {
  const value = data[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

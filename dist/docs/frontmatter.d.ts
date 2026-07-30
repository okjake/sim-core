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
export declare function parseFrontmatter(source: string): ParsedDocument;
export declare function readString(data: Record<string, FrontmatterValue>, key: string): string | undefined;
export declare function readBoolean(data: Record<string, FrontmatterValue>, key: string, fallback: boolean): boolean;
export declare function readNumber(data: Record<string, FrontmatterValue>, key: string, fallback: number): number;

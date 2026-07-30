/**
 * A tiny, deterministic Markdown → HTML renderer.
 *
 * sim-core hand-rolls this for the same reason it hand-rolls `params.ts`
 * instead of depending on zod: the requirement is narrow and the guarantee
 * matters more than the feature set.
 *
 * The guarantee: **identical input produces byte-identical output**, forever.
 * No timestamps, no generated ids, no hashes, no random slug suffixes, no
 * dependency whose next minor release quietly reflows whitespace. The platform
 * diffs published docs pages by normalising to text and hashing, so cosmetic
 * churn here would show up as a phantom upstream documentation change.
 *
 * Supported: ATX headings, paragraphs, fenced and indented code, blockquotes,
 * ordered/unordered lists (nested), horizontal rules, pipe tables, and the
 * inline set `code`, `**bold**`, `*italic*`, `[link](href)`, `![img](src)`,
 * autolinked `<https://…>`. Raw HTML in the source is escaped, never passed
 * through — sim content is authored by us, but the editor is exposed over the
 * control plane and this is one less thing to think about.
 */
export declare function escapeHtml(input: string): string;
/**
 * Inline rendering runs on escaped text, with code spans lifted out first so
 * emphasis/link syntax inside backticks stays literal. Placeholders use a
 * private-use codepoint that cannot appear in escaped HTML.
 */
export declare function renderInline(source: string): string;
/**
 * Render a Markdown document to an HTML fragment.
 *
 * Output is a newline-joined list of block elements with no trailing newline —
 * stable regardless of how the input was line-terminated or indented.
 */
export declare function renderMarkdown(source: string): string;

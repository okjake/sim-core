import type { ChangelogEntry, DocsPageLink, Guide } from './docs.types';
/**
 * Server-rendered docs pages.
 *
 * ## Determinism contract
 *
 * Identical content MUST produce byte-identical HTML — on every request, in
 * every process, forever. The platform's upstream-documentation pipeline diffs
 * these pages by normalising to text and hashing; anything that varies per
 * render (a timestamp, a build hash, a cache-buster, a randomised id, an
 * iteration order that depends on a Map's insertion history) registers as a
 * documentation change and can page a human.
 *
 * So: nothing in this file may read the clock, the environment, a random
 * source, or a database id. Every value interpolated below comes from content
 * or from static service config. `docs.spec.ts` renders each page twice and
 * compares bytes; treat a failure there as a real bug, not a flaky test.
 */
export interface DocsLayoutOptions {
    /** Site title, from `docs.title` or the brand display name. */
    siteTitle: string;
    /** Brand colour — static config, so constant across renders. */
    accent: string;
    /** Page `<title>` suffix and `<h1>` on the page itself. */
    pageTitle: string;
    /** Rendered breadcrumb / nav links. */
    nav: DocsPageLink[];
    /** Pre-rendered HTML body fragment. */
    content: string;
}
export interface DocsIndexModel {
    siteTitle: string;
    accent: string;
    intro?: string;
    /** Label of the active published spec version, if any. */
    activeSpecLabel: string | null;
    guides: Guide[];
    hasChangelog: boolean;
}
export declare function renderDocsIndex(model: DocsIndexModel): string;
export interface DocsGuideModel {
    siteTitle: string;
    accent: string;
    guide: Guide;
}
export declare function renderGuidePage(model: DocsGuideModel): string;
export interface DocsChangelogModel {
    siteTitle: string;
    accent: string;
    entries: ChangelogEntry[];
}
export declare function renderChangelogPage(model: DocsChangelogModel): string;
export declare function renderNotFoundPage(siteTitle: string, accent: string, what: string): string;
